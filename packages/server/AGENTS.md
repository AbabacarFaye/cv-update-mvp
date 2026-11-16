# Utilitaires serveur

## Overview

`@cv/server` regroupe configuration, journaux et accès au stockage pour les processus serveur. Vous pouvez vous appuyer sur les conventions communes de [la racine](../../AGENTS.md).

## Stack

TypeScript, modules ESM, AWS SDK S3 et `@cv/contracts`. Le manifeste exporte `src/*.ts` et bloque leur résolution navigateur avec la condition `browser: null`.

## Commands

Depuis la racine : `pnpm --filter @cv/server typecheck`.

## Conventions

Conserver la frontière serveur lors des imports depuis le web. Les fichiers `src/config.ts`, `src/log.ts` et `src/storage.ts` portent respectivement la configuration, les journaux et le stockage.

## Related specs

[Socle exécutable](../../docs/specs/0001-architecture-socle-executable/index.md).

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
