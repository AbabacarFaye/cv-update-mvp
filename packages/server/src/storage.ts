import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { DEMO_CONTENT, DOWNLOAD_TTL_SECONDS } from "@cv/contracts/foundation";
import type { storageConfig } from "./config.ts";
export function storage(config: ReturnType<typeof storageConfig>) {
  const client = new S3Client({ endpoint: config.endpoint, region: "auto", credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }, maxAttempts: 1 });
  return {
    write: (key: string, signal: AbortSignal) => client.send(new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: DEMO_CONTENT, ContentType: "text/plain; charset=utf-8", ContentDisposition: 'attachment; filename="socle.txt"', CacheControl: "private, no-store" }), { abortSignal: signal }),
    async download(key: string) {
      const signingDate = new Date();
      const url = await getSignedUrl(client, new GetObjectCommand({ Bucket: config.bucket, Key: key }), { expiresIn: DOWNLOAD_TTL_SECONDS, signingDate });
      return { url, expiresAt: new Date(Math.floor(signingDate.getTime()/1000)*1000 + DOWNLOAD_TTL_SECONDS*1000).toISOString() };
    },
    remove: (key: string) => client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key })),
    close: () => client.destroy(),
  };
}
