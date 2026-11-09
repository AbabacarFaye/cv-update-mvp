import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { webConfig } from "@cv/server/config";
export async function proxy(request: NextRequest) {
  const config = webConfig();
  let response = NextResponse.next({ request });
  if (config.enabled) {
    const client = createServerClient(config.supabaseUrl, config.publishableKey, { cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    } });
    await client.auth.getUser();
  }
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Vary", "Cookie");
  return response;
}
export const config = { matcher: ["/foundation/:path*", "/api/foundation/:path*"] };
