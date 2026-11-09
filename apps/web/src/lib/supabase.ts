import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { webConfig } from "@cv/server/config";
import type { Database } from "@cv/contracts/database.types";
export async function supabase() {
  const config = webConfig();
  const jar = await cookies();
  return createServerClient<Database>(config.supabaseUrl, config.publishableKey, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll(values) { try { values.forEach(({ name, value, options }) => jar.set(name, value, options)); } catch { /* Server Components rely on proxy refresh. */ } },
    },
  });
}
