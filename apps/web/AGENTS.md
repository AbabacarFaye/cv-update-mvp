<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Repères du projet

`@cv/web` utilise Next.js App Router et une sortie standalone. La configuration Web est validée au démarrage par `scripts/validate-web.mjs`.

Les routes sous `/foundation` et `/api/foundation` utilisent la session Supabase par cookies. Le point `/api/health/live` répond sans dépendre de Supabase ni de R2.

L’image finale `Dockerfile.web` doit rendre `@cv/contracts` résoluble depuis `packages/server/src/config.ts`, y compris par le lien workspace sous `packages/server/node_modules`.
