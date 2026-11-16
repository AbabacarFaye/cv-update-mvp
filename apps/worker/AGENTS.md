# Worker

## Overview

`@cv/worker` est le processus Node de traitement du socle. Vous pouvez vous appuyer sur les conventions communes de [la racine](../../AGENTS.md).

## Stack

TypeScript, modules ESM, `postgres`, AWS SDK S3, `@cv/contracts` et `@cv/server`. `tsx` exécute le développement et esbuild produit `dist/index.js`.

## Commands

Depuis la racine : `pnpm --filter @cv/worker dev`, `pnpm --filter @cv/worker typecheck`, `pnpm --filter @cv/worker build`, puis `pnpm --filter @cv/worker start`.

## Conventions

Le développement charge `.env.worker` à la racine. Le processus reçoit un rôle PostgreSQL dédié, sans connexion administrative. Le runtime de déploiement fournit ses variables. Il n’expose pas d’API métier publique.

## Related specs

[Socle exécutable](../../docs/specs/0001-architecture-socle-executable/index.md).

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
