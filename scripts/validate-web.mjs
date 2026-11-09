import { webConfig } from "../packages/server/src/config.ts";
try { webConfig(); }
catch { console.error(JSON.stringify({ service: "web", event: "startup_failed", errorCode: "invalid_configuration" })); process.exit(1); }
