// Read deployed Railway variables in memory. Never print a variable value.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { parseEnv } from "node:util";
import { createRequire } from "node:module";

const root = new URL("../../../../", import.meta.url);
const require = createRequire(new URL("../../../../packages/server/package.json", import.meta.url));
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const project = "e0e8a716-5eec-4ece-b0f1-11b081a0ba9f";
const keys = ["R2_ENDPOINT", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"];

async function deployed(service) {
  const child = spawn("npx", ["@railway/cli", "variable", "list", "--service", service, "--project", project, "--environment", "production", "--json"],
    { cwd: root.pathname, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  child.stdout.on("data", chunk => { out += chunk.toString(); });
  child.stderr.resume();
  const exit = await new Promise(resolve => child.once("exit", resolve));
  if (exit !== 0) throw new Error(`railway_variables_${service}_exit_${exit}`);
  const data = JSON.parse(out);
  assert.equal(data && typeof data === "object" && !Array.isArray(data), true);
  return data;
}

const result = { projectMatches: true, serviceValues: {}, comparison: {}, permissions: {}, cleanup: {}, verdict: "BLOCKED" };
let workerClient;
let webClient;
let objectKeys = [];
try {
  const localWeb = parseEnv(readFileSync(new URL(".env.web.validation", root), "utf8"));
  const localWorker = parseEnv(readFileSync(new URL(".env.worker.validation", root), "utf8"));
  const web = await deployed("web");
  const worker = await deployed("worker");
  for (const [name, remote, local] of [["web", web, localWeb], ["worker", worker, localWorker]]) {
    result.serviceValues[name] = Object.fromEntries(keys.map(key => [key, typeof remote[key] === "string" && remote[key].length > 0]));
    result.comparison[name] = Object.fromEntries(keys.map(key => [key, typeof remote[key] === "string" && remote[key] === local[key]]));
  }
  result.comparison.distinctKeys = web.R2_ACCESS_KEY_ID !== worker.R2_ACCESS_KEY_ID && web.R2_SECRET_ACCESS_KEY !== worker.R2_SECRET_ACCESS_KEY;
  result.comparison.validationBucket = web.R2_BUCKET === "cv-update-validation" && worker.R2_BUCKET === "cv-update-validation";
  assert.equal(Object.values(result.serviceValues).every(service => Object.values(service).every(Boolean)), true, "missing_deployed_value");
  assert.equal(result.comparison.validationBucket, true, "wrong_bucket");
  assert.equal(result.comparison.distinctKeys, true, "shared_keys");
  const client = config => new S3Client({ endpoint: config.R2_ENDPOINT, region: "auto", credentials: { accessKeyId: config.R2_ACCESS_KEY_ID, secretAccessKey: config.R2_SECRET_ACCESS_KEY }, maxAttempts: 1 });
  webClient = client(web); workerClient = client(worker);
  const prefix = `validation-probe/railway-${randomUUID()}`;
  const body = `Synthetic railway validation ${randomUUID()}\n`;
  objectKeys = ["worker.txt", "web-direct.txt", "web-signed.txt"].map(name => `${prefix}/${name}`);
  const [workerKey, directKey, signedKey] = objectKeys;
  const put = await workerClient.send(new PutObjectCommand({ Bucket: "cv-update-validation", Key: workerKey, Body: body }), { abortSignal: AbortSignal.timeout(15000) });
  result.permissions.workerWrite = put.$metadata.httpStatusCode === 200;
  const get = await webClient.send(new GetObjectCommand({ Bucket: "cv-update-validation", Key: workerKey }), { abortSignal: AbortSignal.timeout(15000) });
  result.permissions.webRead = get.$metadata.httpStatusCode === 200 && (await get.Body.transformToString()) === body;
  const getUrl = await getSignedUrl(webClient, new GetObjectCommand({ Bucket: "cv-update-validation", Key: workerKey }), { expiresIn: 60 });
  const signedGet = await fetch(getUrl, { signal: AbortSignal.timeout(15000) });
  result.permissions.webSignedRead = signedGet.status === 200 && (await signedGet.text()) === body;
  try { await webClient.send(new PutObjectCommand({ Bucket: "cv-update-validation", Key: directKey, Body: body }), { abortSignal: AbortSignal.timeout(15000) }); result.permissions.webDirectWriteDenied = false; }
  catch (error) { result.permissions.webDirectWriteDenied = error?.$metadata?.httpStatusCode === 403; }
  const putUrl = await getSignedUrl(webClient, new PutObjectCommand({ Bucket: "cv-update-validation", Key: signedKey, Body: body }), { expiresIn: 60 });
  const signedPut = await fetch(putUrl, { method: "PUT", body, signal: AbortSignal.timeout(15000) });
  await signedPut.arrayBuffer();
  result.permissions.webSignedWriteDenied = signedPut.status === 403;
  result.verdict = Object.values(result.comparison.web).every(Boolean) && Object.values(result.comparison.worker).every(Boolean) &&
    Object.values(result.permissions).every(Boolean) ? "PASS" : "FAIL";
} catch (error) {
  result.errorKind = String(error?.name ?? "unknown").slice(0, 50);
} finally {
  if (workerClient) {
    for (const key of objectKeys) {
      try { await workerClient.send(new DeleteObjectCommand({ Bucket: "cv-update-validation", Key: key }), { abortSignal: AbortSignal.timeout(15000) }); }
      catch { result.cleanup.deleteFailed = true; }
    }
    if (webClient) {
      result.cleanup.objectsAbsent = true;
      for (const key of objectKeys) {
        try { await webClient.send(new GetObjectCommand({ Bucket: "cv-update-validation", Key: key }), { abortSignal: AbortSignal.timeout(15000) }); result.cleanup.objectsAbsent = false; }
        catch (error) { if (error?.$metadata?.httpStatusCode !== 404) result.cleanup.objectsAbsent = false; }
      }
    }
  }
  webClient?.destroy(); workerClient?.destroy();
  console.log(JSON.stringify(result, null, 2));
}
