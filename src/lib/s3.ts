import { S3Client, PutObjectCommand, DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
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
