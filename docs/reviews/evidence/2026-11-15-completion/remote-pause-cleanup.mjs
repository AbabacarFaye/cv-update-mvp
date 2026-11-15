// Delete only explicitly designated R2 objects created by the targeted pause control.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { parseEnv } from "node:util";

const root = new URL("../../../../", import.meta.url);
const require = createRequire(new URL("../../../../packages/server/package.json", import.meta.url));
const { S3Client, HeadObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const users = JSON.parse(readFileSync(new URL(".env.validation.auth.json", root), "utf8"));
const owner = users.find(user => user.kind === "allowed")?.id;
assert.match(owner ?? "", /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i);
const worker = parseEnv(readFileSync(new URL(".env.worker.validation", root), "utf8"));
assert.equal(worker.R2_BUCKET, "cv-update-validation");
const allowedIds = [
  "c92d03dc-0f0d-406e-bda3-518747bd379b",
  "d7a607f6-c12f-4cfb-8d2a-17ab8c95e9d8",
  "682553bc-6d71-4101-8996-1ff398715c1c",
  "1c132f48-8253-43de-b5d5-3b259b849339",
];
const ids = process.argv.slice(2);
assert.ok(ids.length > 0 && ids.every(id => allowedIds.includes(id)), "only_dedicated_fixture_ids_allowed");
const client = new S3Client({ endpoint: worker.R2_ENDPOINT, region: "auto", credentials: { accessKeyId: worker.R2_ACCESS_KEY_ID, secretAccessKey: worker.R2_SECRET_ACCESS_KEY }, maxAttempts: 1 });
try {
  for (const id of ids) {
    const Key = `foundation/${owner}/${id}/result.txt`;
    const input = { Bucket: "cv-update-validation", Key };
    const before = await client.send(new HeadObjectCommand(input));
    assert.equal(before.$metadata.httpStatusCode, 200);
    const deletion = await client.send(new DeleteObjectCommand(input));
    assert.equal(deletion.$metadata.httpStatusCode, 204);
    let absent = false;
    try { await client.send(new HeadObjectCommand(input)); }
    catch (error) { absent = error.$metadata?.httpStatusCode === 404; }
    assert.ok(absent, "object_still_present");
    console.log(JSON.stringify({ id, existed: true, deleted: true, absent: true }));
  }
} finally { client.destroy(); }
