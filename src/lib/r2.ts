import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const PART_SIZE = 100 * 1024 * 1024; // 100 MB
const BUCKET = "flamingo-r2";

export function getS3Client(env: Env): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
}

export function backupKey(serverUuid: string, backupUuid: string): string {
  return `backups/${serverUuid}/${backupUuid}.tar.gz`;
}

export async function createMultipartUpload(
  client: S3Client,
  key: string
): Promise<string> {
  const res = await client.send(
    new CreateMultipartUploadCommand({ Bucket: BUCKET, Key: key })
  );
  if (!res.UploadId) {
    throw new Error("R2 CreateMultipartUpload did not return an UploadId");
  }
  return res.UploadId;
}

export async function getPresignedUploadUrls(
  client: S3Client,
  key: string,
  uploadId: string,
  size: number
): Promise<{ parts: string[]; part_size: number }> {
  const partCount = Math.ceil(size / PART_SIZE);
  const parts: string[] = [];

  for (let i = 1; i <= partCount; i++) {
    const url = await getSignedUrl(
      client,
      new UploadPartCommand({
        Bucket: BUCKET,
        Key: key,
        UploadId: uploadId,
        PartNumber: i,
      }),
      { expiresIn: 3600 }
    );
    parts.push(url);
  }

  return { parts, part_size: PART_SIZE };
}

export async function completeMultipartUpload(
  client: S3Client,
  key: string,
  uploadId: string,
  parts: Array<{ etag: string; part_number: number }>
): Promise<void> {
  await client.send(
    new CompleteMultipartUploadCommand({
      Bucket: BUCKET,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts.map((p) => ({
          ETag: p.etag,
          PartNumber: p.part_number,
        })),
      },
    })
  );
}

export async function abortMultipartUpload(
  client: S3Client,
  key: string,
  uploadId: string
): Promise<void> {
  await client.send(
    new AbortMultipartUploadCommand({
      Bucket: BUCKET,
      Key: key,
      UploadId: uploadId,
    })
  );
}

export function getPresignedDownloadUrl(
  client: S3Client,
  key: string,
  expiresIn = 300
): Promise<string> {
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn }
  );
}
