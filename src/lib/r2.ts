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

export interface R2Client {
  bucket: string;
  s3: S3Client;
}

/**
 * Create an R2Client configured to use a Cloudflare R2 account from environment values.
 *
 * @param env - Environment object providing `CF_ACCOUNT_ID` (used to build the R2 endpoint), `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and optional `R2_BUCKET_NAME`
 * @returns An R2Client with an S3Client instance and bucket name
 */
export function getR2Client(env: Env): R2Client {
  return {
    s3: new S3Client({
      region: "auto",
      endpoint: `https://${env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    }),
    bucket: env.R2_BUCKET_NAME || "flamingo-r2",
  };
}

/**
 * Builds the storage object key for a server backup.
 *
 * @param serverUuid - The server's UUID to include in the path
 * @param backupUuid - The backup's UUID to use as the filename (without extension)
 * @returns The object key in the form `backups/{serverUuid}/{backupUuid}.tar.gz`
 */
export function backupKey(serverUuid: string, backupUuid: string): string {
  return `backups/${serverUuid}/${backupUuid}.tar.gz`;
}

/**
 * Initiates a multipart upload for the specified object key and returns its upload ID.
 *
 * @param key - The object key (path) to create the multipart upload for
 * @returns The multipart upload `UploadId`
 * @throws If the CreateMultipartUpload response does not contain an `UploadId`
 */
export async function createMultipartUpload(
  r2: R2Client,
  key: string
): Promise<string> {
  const res = await r2.s3.send(
    new CreateMultipartUploadCommand({ Bucket: r2.bucket, Key: key })
  );
  if (!res.UploadId) {
    throw new Error("R2 CreateMultipartUpload did not return an UploadId");
  }
  return res.UploadId;
}

/**
 * Generate presigned URLs for uploading each part of a multipart object.
 *
 * @param key - Object key (path) in the bucket.
 * @param uploadId - Multipart upload session identifier.
 * @param size - Total size of the object to be uploaded, in bytes.
 * @returns An object with `parts`: an array of presigned upload URLs ordered by part number, and `part_size`: the byte size used for each part.
 */
export async function getPresignedUploadUrls(
  r2: R2Client,
  key: string,
  uploadId: string,
  size: number
): Promise<{ parts: string[]; part_size: number }> {
  const partCount = Math.ceil(size / PART_SIZE);
  const parts: string[] = [];

  for (let i = 1; i <= partCount; i++) {
    const url = await getSignedUrl(
      r2.s3,
      new UploadPartCommand({
        Bucket: r2.bucket,
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

/**
 * Finalizes a multipart upload for the specified object by assembling uploaded parts into the final object.
 *
 * @param key - The object key (path) in the configured bucket.
 * @param uploadId - The multipart upload identifier returned when the upload was created.
 * @param parts - Array of uploaded parts where each entry provides the part's `etag` and its `part_number`; parts will be submitted in this form to complete the upload.
 */
export async function completeMultipartUpload(
  r2: R2Client,
  key: string,
  uploadId: string,
  parts: Array<{ etag: string; part_number: number }>
): Promise<void> {
  // Sort by part number ascending to avoid InvalidPartOrder errors
  const sorted = [...parts].sort((a, b) => a.part_number - b.part_number);

  await r2.s3.send(
    new CompleteMultipartUploadCommand({
      Bucket: r2.bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: sorted.map((p) => ({
          ETag: p.etag,
          PartNumber: p.part_number,
        })),
      },
    })
  );
}

/**
 * Aborts an in-progress multipart upload for the object identified by `key`.
 *
 * @param key - The object key in the R2 bucket to abort the multipart upload for
 * @param uploadId - The multipart upload identifier returned when the upload was created
 */
export async function abortMultipartUpload(
  r2: R2Client,
  key: string,
  uploadId: string
): Promise<void> {
  await r2.s3.send(
    new AbortMultipartUploadCommand({
      Bucket: r2.bucket,
      Key: key,
      UploadId: uploadId,
    })
  );
}

/**
 * Generates a presigned URL to download an object from the configured R2 bucket.
 *
 * @param key - Object key within the bucket
 * @param expiresIn - Expiration time in seconds for the URL (default: 300)
 * @returns A URL that can be used to perform a GET request for the object
 */
export function getPresignedDownloadUrl(
  r2: R2Client,
  key: string,
  expiresIn = 300
): Promise<string> {
  return getSignedUrl(
    r2.s3,
    new GetObjectCommand({ Bucket: r2.bucket, Key: key }),
    { expiresIn }
  );
}
