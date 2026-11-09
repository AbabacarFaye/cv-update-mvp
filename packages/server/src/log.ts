type Fields = { requestId?: string; jobId?: string; attempt?: number; durationMs?: number; errorCode?: string; messageId?: string };
export function log(service: "web" | "worker" | "admin", event: string, fields: Fields = {}, level: "info" | "error" = "info") {
  // Call sites pass known codes, never provider errors or payloads.
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), level, service, appEnv: process.env.APP_ENV, event, ...fields }));
}
