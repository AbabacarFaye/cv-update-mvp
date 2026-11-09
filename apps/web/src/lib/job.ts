import "server-only";
import { UUID_PATTERN } from "@cv/contracts/foundation";
import { authorized, HttpError } from "./http";
export async function ownJob(id: string) {
  const { client, user } = await authorized();
  if (!UUID_PATTERN.test(id)) throw new HttpError(404, "not_found");
  const { data, error } = await client.from("foundation_jobs").select("*").eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (error) throw new HttpError(503, "unavailable");
  if (!data) throw new HttpError(404, "not_found");
  return data;
}
