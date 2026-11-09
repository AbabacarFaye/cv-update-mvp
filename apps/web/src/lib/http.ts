import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { webConfig } from "@cv/server/config";
import { log } from "@cv/server/log";
import { supabase } from "./supabase";
export class HttpError extends Error { constructor(public status: number, public code: string) { super(code); } }
export const privateHeaders = { "Cache-Control": "private, no-store, max-age=0", "Vary": "Cookie" };
export function json(body: unknown, status = 200) { return NextResponse.json(body, { status, headers: privateHeaders }); }
export function checkOrigin(origin: string | null) { if (origin !== webConfig().origin) throw new HttpError(403, "forbidden"); }
export async function authorized() {
  if (!webConfig().enabled) throw new HttpError(404, "not_found");
  const client = await supabase();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new HttpError(401, "unauthorized");
  const allowed = await client.rpc("foundation_is_allowed");
  if (allowed.error) throw new HttpError(503, "unavailable");
  if (!allowed.data) throw new HttpError(403, "forbidden");
  return { client, user: data.user };
}
export async function endpoint(run: (requestId: string) => Promise<Response>) {
  const requestId = randomUUID();
  try { return await run(requestId); } catch (error) {
    const failure = error instanceof HttpError ? error : new HttpError(503, "unavailable");
    log("web", "request_failed", { requestId, errorCode: failure.code }, failure.status >= 500 ? "error" : "info");
    return json({ code: failure.code, requestId }, failure.status);
  }
}

export async function smallJson(request: Request): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > 1024 || !request.body) throw new HttpError(400, "invalid_request");
  const reader = request.body.getReader();
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 1024) { await reader.cancel(); throw new HttpError(400, "invalid_request"); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch { throw new HttpError(400, "invalid_request"); }
  finally { reader.releaseLock(); }
}
