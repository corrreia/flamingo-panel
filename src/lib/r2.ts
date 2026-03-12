import { AwsClient } from "aws4fetch";

const PART_SIZE = 100 * 1024 * 1024;
const UPLOAD_ID_RE = /<UploadId>(.+?)<\/UploadId>/;

export interface R2Client {
  bucket: string;
  client: AwsClient;
  endpoint: string;
}

function getObjectUrl(r2: R2Client, key: string): URL {
  return new URL(`${r2.endpoint}/${r2.bucket}/${key}`);
}

async function sendRequest(
  r2: R2Client,
  request: Request,
  init?: Parameters<AwsClient["fetch"]>[1]
): Promise<Response> {
  const response = await r2.client.fetch(request, init);

  if (!response.ok) {
    throw new Error(
      `R2 request failed (${response.status}): ${await response.text()}`
    );
  }

  return response;
}

export function getR2Client(env: Env): R2Client {
  return {
    client: new AwsClient({
      accessKeyId: env.R2_ACCESS_KEY_ID,
      region: "auto",
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      service: "s3",
    }),
    bucket: env.R2_BUCKET_NAME || "flamingo-r2",
    endpoint: `https://${env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  };
}

export function backupKey(serverUuid: string, backupUuid: string): string {
  return `backups/${serverUuid}/${backupUuid}.tar.gz`;
}

export async function createMultipartUpload(
  r2: R2Client,
  key: string
): Promise<string> {
  const url = getObjectUrl(r2, key);
  url.searchParams.set("uploads", "");

  const response = await sendRequest(r2, new Request(url, { method: "POST" }));
  const text = await response.text();
  const uploadId = text.match(UPLOAD_ID_RE)?.[1];

  if (!uploadId) {
    throw new Error("R2 CreateMultipartUpload did not return an UploadId");
  }

  return uploadId;
}

export async function getPresignedUploadUrls(
  r2: R2Client,
  key: string,
  uploadId: string,
  size: number
): Promise<{ parts: string[]; part_size: number }> {
  const partCount = Math.ceil(size / PART_SIZE);
  const parts = await Promise.all(
    Array.from({ length: partCount }, async (_, index) => {
      const url = getObjectUrl(r2, key);
      url.searchParams.set("X-Amz-Expires", "3600");
      url.searchParams.set("partNumber", String(index + 1));
      url.searchParams.set("uploadId", uploadId);

      const signed = await r2.client.sign(new Request(url, { method: "PUT" }), {
        aws: { signQuery: true },
      });

      return signed.url;
    })
  );

  return { part_size: PART_SIZE, parts };
}

export async function completeMultipartUpload(
  r2: R2Client,
  key: string,
  uploadId: string,
  parts: Array<{ etag: string; part_number: number }>
): Promise<void> {
  const url = getObjectUrl(r2, key);
  url.searchParams.set("uploadId", uploadId);

  const sortedParts = [...parts].sort(
    (left, right) => left.part_number - right.part_number
  );
  const body = [
    "<CompleteMultipartUpload>",
    ...sortedParts.map(
      (part) =>
        `<Part><PartNumber>${part.part_number}</PartNumber><ETag>${part.etag}</ETag></Part>`
    ),
    "</CompleteMultipartUpload>",
  ].join("");

  await sendRequest(
    r2,
    new Request(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/xml",
      },
      body,
    })
  );
}

export async function abortMultipartUpload(
  r2: R2Client,
  key: string,
  uploadId: string
): Promise<void> {
  const url = getObjectUrl(r2, key);
  url.searchParams.set("uploadId", uploadId);

  await sendRequest(
    r2,
    new Request(url, {
      method: "DELETE",
    })
  );
}

export async function getPresignedDownloadUrl(
  r2: R2Client,
  key: string,
  expiresIn = 300
): Promise<string> {
  const url = getObjectUrl(r2, key);
  url.searchParams.set("X-Amz-Expires", String(expiresIn));

  const signed = await r2.client.sign(new Request(url, { method: "GET" }), {
    aws: { signQuery: true },
  });

  return signed.url;
}
