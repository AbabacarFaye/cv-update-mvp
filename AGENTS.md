# CV à jour

## Stack

Monorepo TypeScript strict, Node `24.21.x`, pnpm `12.18.0`, workspaces `apps/*` et `packages/*`. La [spécification du socle](docs/specs/0001-architecture-socle-executable/index.md) définit deux processus Railway, Supabase PostgreSQL, Auth et Queues, et un stockage privé Cloudflare R2. Les dépendances propres aux workspaces restent dans leurs manifestes.

## Build approach

Tracer Bullet (faire fonctionner un parcours réel et limité de bout en bout, puis enrichir chaque partie).
Source : [périmètre](docs/scope/index.md). Le socle technique ne constitue pas encore un parcours CV commercial.

## Commands

Depuis la racine :

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
pnpm validate:offline
pnpm validate:http
```

Les deux dernières validations suivent la construction. Les tests permanents couvrent une partie du socle, voir [tests/README.md](tests/README.md). Les validations de base et des services réels ont leurs prérequis dans [README.md](README.md). `pnpm db:reset` efface les données locales.

## Rules

Approche fonctionnelle avec fonctions simples et modules, adaptée au monorepo Next.js/Node.js. Séparer les règles métier des accès PostgreSQL, R2 et API externes. Éviter les couches et abstractions sans besoin concret.

Conserver TypeScript strict. Préférer les fonctions pures pour les calculs métier et rendre les effets externes explicites. Préserver les contrats SQL et HTTP définis par la spécification.

Conserver la structure actuelle, les erreurs explicites, la validation de configuration au démarrage et l’objectif WCAG 2.2 AA. Aucune nouvelle règle de nommage ni convention de messages de commit n’est ajoutée.

Conserver la séparation des environnements et des secrets web, worker et administration. Les journaux excluent secrets, contenu de CV et URL signées. La démonstration reste désactivée en production.

## Tooling

Conserver ESLint et `node:test` avec `tsx`. Prettier est installé avec `eslint-config-prettier`. Le contrôle de format porte sur les fichiers de code et de configuration ajoutés ou modifiés ; la documentation existante et les fichiers générés sont ignorés. Ne pas reformater tout le dépôt.

Le hook `.githooks/pre-commit`, installé par `pnpm install`, exécute lint, format des fichiers indexés et contrôle des types. La CI GitHub exécute ces contrôles, `pnpm test`, le build et les validations ciblées `validate:offline` et `validate:http`. Les validations sur les services réels restent complémentaires.

## Agent skills

Recherche autorisée pour Railway, Supabase, Cloudflare R2 et GitHub. Candidats présentés : compétences `supabase/agent-skills` et `cloudflare/skills`, connecteurs officiels Supabase, Railway et GitHub. Leur installation ou connexion reste soumise au choix explicite du porteur du projet. Aucun de ces candidats n’a été installé ou connecté par cet audit.

## Git

- integration: on
- branch prefix: feat/
- commit: per-milestone

Préparer les branches et commits par jalon après les vérifications adaptées. Demander confirmation avant push ou PR. Ne pas mélanger des changements sans rapport dans un même commit.

## Specs

Les décisions sont dans `docs/specs/<numéro>-<nom>/index.md`, le périmètre dans `docs/scope/`, les vérifications et revues dans `docs/reviews/` et les fichiers `verify.md` des spécifications.

## Context files

- [apps/web/AGENTS.md](apps/web/AGENTS.md) (Consignes Next.js et repères du runtime Web.)
- [apps/worker/AGENTS.md](apps/worker/AGENTS.md) (Processus Node de traitement.)
- [packages/contracts/AGENTS.md](packages/contracts/AGENTS.md) (Contrats partagés et types de base.)
- [packages/server/AGENTS.md](packages/server/AGENTS.md) (Utilitaires réservés au serveur.)

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
