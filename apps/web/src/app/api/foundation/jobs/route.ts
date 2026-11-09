import { UUID_PATTERN } from "@cv/contracts/foundation";
import { log } from "@cv/server/log";
import { authorized, checkOrigin, endpoint, HttpError, json, smallJson } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return endpoint(async (requestId) => {
    checkOrigin(request.headers.get("origin"));
    const { client } = await authorized();
    const input = await smallJson(request);
    if (!input || typeof input !== "object" || !("requestKey" in input) || typeof input.requestKey !== "string" || !UUID_PATTERN.test(input.requestKey)) throw new HttpError(400, "invalid_request");
    const result = await client.rpc("foundation_create_job", { p_request_key: input.requestKey });
    if (result.error) {
      if (result.error.code === "P0001" && result.error.message === "quota_exceeded") throw new HttpError(429, "quota_exceeded");
      if (result.error.code === "42501") throw new HttpError(403, "forbidden");
      throw new HttpError(503, "unavailable");
    }
    const job = result.data?.[0];
    if (!job) throw new HttpError(503, "unavailable");
    log("web", job.created ? "job_created" : "job_reused", { requestId, jobId: job.id });
    return json({ id: job.id, status: job.status }, job.created ? 202 : 200);
  });
}
