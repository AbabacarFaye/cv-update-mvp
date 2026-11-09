export async function register() {
  // Build is independent of runtime secrets. The production server validates on boot.
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { webConfig } = await import("@cv/server/config");
    webConfig();
  }
}
