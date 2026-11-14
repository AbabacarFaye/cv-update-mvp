import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { parseEnv } from "node:util";

const require = createRequire(new URL("../packages/server/package.json", import.meta.url));
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const env = (path) => parseEnv(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const web = env(".env.web.validation");
const worker = env(".env.worker.validation");
const result = {
  bucket: "cv-update-validation",
  distinctCredentials: false,
  endpointSource: null,
  workerWrite: null,
  webRead: null,
  webSignedDownload: null,
  webDirectWriteDenied: null,
  webSignedWriteDenied: null,
  cleanup: null,
};
const status = (error) => error?.$metadata?.httpStatusCode ?? null;
const failure = (error) => ({ status: status(error), code: String(error?.name ?? "unknown").slice(0, 80) });
const safe = async (fn) => {
  try { return { ok: true, value: await fn() }; }
  catch (error) { return { ok: false, error: failure(error) }; }
};
const required = ["R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"];
let webClient;
let workerClient;
let keys = [];
try {
  if (required.some((key) => !web[key] || !worker[key])) throw new Error("validation_credentials_missing");
  if (web.R2_BUCKET !== result.bucket || worker.R2_BUCKET !== result.bucket) throw new Error("wrong_validation_bucket");
  result.distinctCredentials = web.R2_ACCESS_KEY_ID !== worker.R2_ACCESS_KEY_ID && web.R2_SECRET_ACCESS_KEY !== worker.R2_SECRET_ACCESS_KEY;
  if (!result.distinctCredentials) throw new Error("credentials_not_distinct");

  const endpoint = web.R2_ENDPOINT;
  if (!endpoint || !worker.R2_ENDPOINT || endpoint !== worker.R2_ENDPOINT) throw new Error("endpoint_missing_or_mismatched");
  const parsedEndpoint = new URL(endpoint);
  if (parsedEndpoint.protocol !== "https:" || !parsedEndpoint.hostname.endsWith(".r2.cloudflarestorage.com") || parsedEndpoint.username || parsedEndpoint.password || parsedEndpoint.search) throw new Error("invalid_endpoint");
  result.endpointSource = "validation_files";

  const client = (config) => new S3Client({ endpoint: parsedEndpoint.origin, region: "auto", credentials: { accessKeyId: config.R2_ACCESS_KEY_ID, secretAccessKey: config.R2_SECRET_ACCESS_KEY }, maxAttempts: 1 });
  webClient = client(web);
  workerClient = client(worker);
  const prefix = `validation-probe/${randomUUID()}`;
  const body = `Synthetic CV Update validation probe ${randomUUID()}\n`;
  const [workerKey, directKey, signedKey] = ["worker.txt", "web-direct.txt", "web-signed.txt"].map((name) => `${prefix}/${name}`);
  keys = [workerKey, directKey, signedKey];

  const put = await safe(() => workerClient.send(new PutObjectCommand({ Bucket: result.bucket, Key: workerKey, Body: body, ContentType: "text/plain" }), { abortSignal: AbortSignal.timeout(15000) }));
  result.workerWrite = put.ok ? { ok: true, status: put.value.$metadata.httpStatusCode } : { ok: false, ...put.error };
  if (put.ok) {
    const get = await safe(async () => {
      const response = await webClient.send(new GetObjectCommand({ Bucket: result.bucket, Key: workerKey }), { abortSignal: AbortSignal.timeout(15000) });
      return { status: response.$metadata.httpStatusCode, exactContent: (await response.Body.transformToString()) === body };
    });
    result.webRead = get.ok ? { ok: get.value.exactContent, status: get.value.status, exactContent: get.value.exactContent } : { ok: false, ...get.error };

    const signed = await safe(async () => {
      const url = await getSignedUrl(webClient, new GetObjectCommand({ Bucket: result.bucket, Key: workerKey }), { expiresIn: 60 });
      const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
      return { status: response.status, exactContent: (await response.text()) === body };
    });
    result.webSignedDownload = signed.ok ? { ok: signed.value.status === 200 && signed.value.exactContent, ...signed.value } : { ok: false, ...signed.error };
  }

  const direct = await safe(() => webClient.send(new PutObjectCommand({ Bucket: result.bucket, Key: directKey, Body: body }), { abortSignal: AbortSignal.timeout(15000) }));
  result.webDirectWriteDenied = direct.ok ? { ok: false, status: direct.value.$metadata.httpStatusCode } : { ok: direct.error.status === 403, ...direct.error };

  const signedWrite = await safe(async () => {
    const url = await getSignedUrl(webClient, new PutObjectCommand({ Bucket: result.bucket, Key: signedKey, Body: body }), { expiresIn: 60 });
    const response = await fetch(url, { method: "PUT", body, signal: AbortSignal.timeout(15000) });
    await response.arrayBuffer();
    return response.status;
  });
  result.webSignedWriteDenied = signedWrite.ok ? { ok: signedWrite.value === 403, status: signedWrite.value } : { ok: false, ...signedWrite.error };
} catch (error) {
  result.setupError = String(error?.message ?? "unknown").slice(0, 80);
} finally {
  if (workerClient && keys.length) {
    const removed = [];
    for (const key of keys) {
      const response = await safe(() => workerClient.send(new DeleteObjectCommand({ Bucket: result.bucket, Key: key }), { abortSignal: AbortSignal.timeout(15000) }));
      removed.push(response.ok ? { ok: true, status: response.value.$metadata.httpStatusCode } : { ok: false, ...response.error });
    }
    result.cleanup = { attempted: keys.length, allDeletesAccepted: removed.every((item) => item.ok), results: removed };
    if (webClient && removed.every((item) => item.ok)) {
      const absent = [];
      for (const key of keys) {
        const get = await safe(() => webClient.send(new GetObjectCommand({ Bucket: result.bucket, Key: key }), { abortSignal: AbortSignal.timeout(15000) }));
        absent.push(!get.ok && get.error.status === 404);
      }
      result.cleanup.allObjectsAbsentAfterDelete = absent.every(Boolean);
    }
  }
  webClient?.destroy();
  workerClient?.destroy();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
