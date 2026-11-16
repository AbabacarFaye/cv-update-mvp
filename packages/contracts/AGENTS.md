# Contrats partagés

## Overview

`@cv/contracts` porte les contrats techniques du socle et les types de la base. Vous pouvez vous appuyer sur les conventions communes de [la racine](../../AGENTS.md).

## Stack

TypeScript et modules ESM. Le manifeste exporte directement `src/*.ts` et ne déclare aucune dépendance de runtime.

## Commands

Depuis la racine : `pnpm --filter @cv/contracts typecheck`. `pnpm db:types` régénère les types de base avec les prérequis décrits dans [README.md](../../README.md).

## Key files

`src/foundation.ts` contient les contrats du socle. `src/database.types.ts` contient les types de base générés.

## Related specs

[Socle exécutable](../../docs/specs/0001-architecture-socle-executable/index.md).

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
