"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { checkOrigin } from "@/lib/http";
import { webConfig } from "@cv/server/config";
import { errorLabel } from "@cv/contracts/foundation";
export async function login(_state: { error: string }, form: FormData) {
  try {
    if (!webConfig().enabled) return { error: errorLabel("forbidden") };
    checkOrigin((await headers()).get("origin"));
    const email = form.get("email"); const password = form.get("password");
    if (typeof email !== "string" || typeof password !== "string" || email.length > 320 || password.length > 1024) return { error: errorLabel("invalid_credentials") };
    const client = await supabase();
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) return { error: errorLabel("invalid_credentials") };
    const { data, error: accessError } = await client.rpc("foundation_is_allowed");
    if (accessError || !data) { await client.auth.signOut(); return { error: errorLabel(accessError ? "unavailable" : "forbidden") }; }
  } catch { return { error: errorLabel("unavailable") }; }
  redirect("/foundation");
}
export async function logout() {
  checkOrigin((await headers()).get("origin"));
  const client = await supabase();
  await client.auth.signOut();
  redirect("/foundation");
}
