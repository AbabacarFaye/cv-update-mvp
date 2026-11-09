import { endpoint, json } from "@/lib/http";
import { ownJob } from "@/lib/job";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    const job = await ownJob((await params).id);
    return json({ id: job.id, status: job.status, attemptCount: job.attempt_count, createdAt: job.created_at, completedAt: job.completed_at, errorCode: job.error_code });
  });
}
