export function resolveEditorialMediaUrl(key: string, fallbackUrl: string) {
  const customBaseUrl = process.env.AWS_S3_PUBLIC_BASE_URL || process.env.S3_PUBLIC_BASE_URL;
  if (customBaseUrl) {
    return `${customBaseUrl.replace(/\/$/, "")}/${key}`;
  }

  const bucket = process.env.AWS_S3_BUCKET_NAME || process.env.S3_BUCKET_NAME;
  if (!bucket) {
    return fallbackUrl;
  }

  const region = process.env.AWS_REGION || "us-east-1";
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

