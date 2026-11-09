import { endpoint, HttpError, json } from "@/lib/http";
import { ownJob } from "@/lib/job";
import { webConfig } from "@cv/server/config";
import { storage } from "@cv/server/storage";
import { log } from "@cv/server/log";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return endpoint(async (requestId) => {
    const job = await ownJob((await params).id);
    if (job.status !== "succeeded" || !job.object_key) throw new HttpError(409, "not_ready");
    const files = storage(webConfig().storage);
    try {
      const signed = await files.download(job.object_key);
      log("web", "download_issued", { requestId, jobId: job.id });
      return json(signed);
    } finally { files.close(); }
  });
}
