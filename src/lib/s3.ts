import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "fs/promises";
import path from "path";

const region = process.env.AWS_REGION || "us-east-1";

export const s3 = new S3Client({
  region,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

export const isLocalEnvironment = process.env.NODE_ENV === "development";

export function getS3BucketName() {
  return process.env.AWS_S3_BUCKET_NAME || process.env.S3_BUCKET_NAME || "";
}

export function buildS3ImageUrl(key: string, bucket: string) {
  if (isLocalEnvironment) {
    return `/${key}`;
  }

  const customBaseUrl = process.env.AWS_S3_PUBLIC_BASE_URL || process.env.S3_PUBLIC_BASE_URL;
  if (customBaseUrl) {
    return `${customBaseUrl.replace(/\/$/, "")}/${key}`;
  }

  const awsRegion = process.env.AWS_REGION || "us-east-1";
  return `https://${bucket}.s3.${awsRegion}.amazonaws.com/${key}`;
}

export async function uploadFile(buffer: Buffer, key: string, contentType: string, bucket: string) {
  if (isLocalEnvironment) {
    // Save locally
    const filePath = path.join(process.cwd(), "public", key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, buffer);
    return;
  }

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    })
  );
}

/**
 * Read a file by key. Mirrors uploadFile's local-mode behavior: in dev,
 * reads from the same `public/<key>` path uploadFile wrote to. In prod,
 * fetches from S3. Returns null when the file isn't found in either mode.
 */
export async function downloadFile(key: string, bucket: string): Promise<Buffer | null> {
  if (isLocalEnvironment) {
    try {
      const filePath = path.join(process.cwd(), "public", key);
      return await fs.readFile(filePath);
    } catch {
      return null;
    }
  }

  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!res.Body) return null;
    const bytes = await res.Body.transformToByteArray();
    return Buffer.from(bytes);
  } catch {
    return null;
  }
}

/**
 * Issue a short-lived presigned PUT URL the mobile (or any) client can upload
 * to directly. Avoids the round-trip-through-Next.js cost for large reference
 * photos on cellular.
 *
 * In dev mode we return a relative `/api/uploads-dev/<key>` path that the
 * /api/uploads-dev route handles by writing to the local `public/<key>` —
 * same surface as `uploadFile`'s local branch — so the flow works without
 * real AWS credentials on a laptop.
 */
export async function getPresignedPutUrl(
  key: string,
  contentType: string,
  bucket: string,
  expiresInSeconds: number = 15 * 60,
): Promise<{ uploadUrl: string; expiresAt: Date }> {
  if (isLocalEnvironment) {
    // Local-dev shim: the /api/uploads-dev route accepts a PUT and writes to
    // public/<key>. Callers don't need to know which branch they hit — the
    // shape (PUT to URL, body is the bytes) is identical.
    return {
      uploadUrl: `/api/uploads-dev/${key}`,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
    };
  }
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
    CacheControl: "public, max-age=31536000, immutable",
  });
  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
  return {
    uploadUrl,
    expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
  };
}

export async function deleteS3Directory(prefix: string, bucket: string) {
  if (isLocalEnvironment) {
    const dirPath = path.join(process.cwd(), "public", prefix);
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
    } catch {
      // Ignored
    }
    return;
  }

  let continuationToken: string | undefined;
  do {
    const listed = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );

    const keys = (listed.Contents ?? [])
      .map((obj) => obj.Key)
      .filter((key): key is string => Boolean(key));

    if (keys.length > 0) {
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: keys.map((key) => ({ Key: key })),
            Quiet: true,
          },
        })
      );
    }
    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (continuationToken);
}
