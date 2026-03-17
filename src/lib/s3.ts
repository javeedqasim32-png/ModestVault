import { S3Client } from "@aws-sdk/client-s3";

const region = process.env.AWS_REGION || "us-east-1";
const hasCredentials = Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);

export const s3 = new S3Client({
  region,
  ...(hasCredentials
    ? {
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
        },
      }
    : {}),
});

export function getS3BucketName() {
  return process.env.AWS_S3_BUCKET_NAME || process.env.S3_BUCKET_NAME || "";
}

export function buildS3ImageUrl(key: string, bucket: string) {
  const customBaseUrl = process.env.AWS_S3_PUBLIC_BASE_URL || process.env.S3_PUBLIC_BASE_URL;
  if (customBaseUrl) {
    return `${customBaseUrl.replace(/\/$/, "")}/${key}`;
  }

  const awsRegion = process.env.AWS_REGION || "us-east-1";
  return `https://${bucket}.s3.${awsRegion}.amazonaws.com/${key}`;
}
