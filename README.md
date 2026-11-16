# CV à jour

Socle technique Next.js et worker Node, Supabase PostgreSQL/Auth/Queues et stockage privé Cloudflare R2. La [spécification](docs/specs/0001-architecture-socle-executable/index.md) définit le contrat. Aucun parcours CV commercial n’est implémenté.

## Prérequis

Node **24.21.0** et pnpm **12.18.0** suffisent pour construire et vérifier le code sans secret. Docker Desktop ou Podman est nécessaire ensuite pour Supabase local ; le bucket R2 privé de développement demande un accès Internet. La CLI Supabase est une dépendance locale du dépôt et s'exécute via `pnpm`. Les versions sont figées dans les manifestes et `pnpm-lock.yaml`.

```sh
npm install --global pnpm@12.18.0
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
pnpm validate:offline
pnpm validate:http
```

`validate:http` lance puis arrête un serveur local avec des **valeurs fictives**. Il vérifie la santé, la page de connexion et les refus anonymes. Il n'utilise ni compte Auth, ni bucket R2, ni base de données. Aucun secret réel ne doit être fourni pour ces commandes. Le [checklist complet](docs/specs/0001-architecture-socle-executable/verify.md) distingue ces contrôles des validations ultérieures.

L’installation active le hook Git `.githooks/pre-commit` dans ce dépôt. Chaque commit vérifie ESLint, le format Prettier du contenu indexé et les types. `pnpm format:check` vérifie les fichiers de code et de configuration ajoutés ou modifiés dans le répertoire de travail ; `pnpm format <fichiers>` formate seulement les chemins indiqués. La documentation existante et les fichiers générés sont exclus du formatage. La CI GitHub vérifie les fichiers modifiés par chaque PR ou push, puis exécute les tests, le build et les validations locales `validate:offline` et `validate:http`, sans secret.

### Ressources à préparer ensuite

| Pour le développement local | Pour la validation distante, après autorisation |
| --- | --- |
| Docker Desktop ou Podman, pour lancer PostgreSQL, Auth et Queues avec la CLI Supabase | Un projet Supabase **de validation** avec PostgreSQL, Auth et l'extension `pgmq` disponible |
| Un bucket Cloudflare R2 **de développement** privé et un jeton limité à ce bucket | Un bucket R2 **de validation** privé, distinct du développement, avec credentials séparés en lecture web, écriture worker et suppression administrative |
| Un compte Auth technique créé dans le Supabase local, puis explicitement autorisé en base | Un compte Auth technique distinct, créé et autorisé dans le projet Supabase de validation |
| Aucun service Railway nécessaire | Deux services Railway dans un environnement de validation : web public sur HTTPS, worker sans domaine public |

La production aura des ressources séparées et une démonstration désactivée. Ce dépôt ne crée ni projet cloud, ni bucket, ni service Railway. La configuration et les étapes de déploiement restent à appliquer après votre autorisation.

### Quand Docker est disponible

```sh
pnpm db:start
pnpm db:reset
pnpm validate:db
pnpm db:types
pnpm typecheck
```

`db:reset` efface les données **locales** avant de rejouer les migrations. `validate:db` lit le schéma et les privilèges sans les modifier. Il requiert `.env.admin` avec la connexion administrative à la base visée ; vérifiez cet hôte avant de l'exécuter. Il refuse `APP_ENV=production`.

Le dépôt fournit `supabase/config.toml` avec PostgreSQL 17 et inscription publique désactivée. Aucun compte ni secret n’est créé par les migrations. `pnpm db:reset` réinitialise uniquement la base **locale** et applique les migrations, en effaçant ses données. Après application et inspection de la base, `pnpm db:types` remplace les types provisoires par les types générés. Une génération échouée conserve le fichier existant.

Le premier démarrage doit confirmer que l’extension `pgmq` est disponible. La migration crée la file durable `foundation_demo`, les tables techniques, leurs contraintes et les fonctions autorisées. Elle révoque les accès génériques aux schémas `pgmq` et `pgmq_public` pour les rôles applicatifs, car ce projet isolé ne contient aucune autre file.

## Configuration locale

Copiez les exemples, puis renseignez leurs valeurs dans les fichiers ignorés par Git :

```sh
cp apps/web/.env.local.example apps/web/.env.local
cp .env.worker.example .env.worker
cp .env.admin.example .env.admin
```

Le web charge `apps/web/.env.local`. Le worker charge `.env.worker` à la racine. Les opérations d’administration et `validate:db` chargent `.env.admin` et ne sont jamais exécutées par les services web ou worker. Les exemples Railway propres aux deux services sont [`web.env.example`](deploy/web.env.example) et [`worker.env.example`](deploy/worker.env.example). Ils n'ajoutent aucun secret au dépôt.

| Variable | Origine et portée |
| --- | --- |
| `APP_ENV` | `local`, `validation` ou `production` |
| `APP_ORIGIN` | Origine exacte du web, sans slash final ; `http://localhost:3000` en local |
| `FOUNDATION_DEMO_ENABLED` | `true` pour la validation, obligatoirement `false` en production |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Statut du projet Supabase local ou paramètres du projet de validation ; web seulement |
| `WORKER_DATABASE_URL` | Connexion du rôle `foundation_worker`, mot de passe propre ; worker seulement |
| `MIGRATION_DATABASE_URL` | Connexion d’administration ; absente des deux services |
| `R2_ENDPOINT` | Endpoint S3 HTTPS du compte R2 |
| `R2_BUCKET` | Bucket privé propre à cet environnement |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Jeton limité au bucket : lecture pour le web, écriture pour le worker, suppression pour la purge administrative |

Matrice des variables à renseigner :

| Destination | Variables |
| --- | --- |
| Web local ou Railway | `APP_ENV`, `APP_ORIGIN`, `FOUNDATION_DEMO_ENABLED`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` avec droits de lecture |
| Worker local ou Railway | `APP_ENV`, `APP_ORIGIN`, `FOUNDATION_DEMO_ENABLED`, `WORKER_DATABASE_URL`, `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` avec droits d'écriture |
| Administration locale | `APP_ENV`, `APP_ORIGIN`, `FOUNDATION_DEMO_ENABLED`, `MIGRATION_DATABASE_URL` ; ajouter `R2_*` avec droits de suppression pour `pnpm admin purge` |

Chaque fichier contient les **noms** des variables. Remplissez leurs valeurs sur la machine ou dans les secrets du service concerné. Le web et le worker ne reçoivent jamais `MIGRATION_DATABASE_URL`.

Les connexions SQL distantes vérifient le certificat TLS. Utilisez la connexion directe ou le pooler **session** Supabase, avec le nom du rôle dédié (le pooler peut demander `foundation_worker.<project-ref>`). Le port local est 54322. Les secrets de connexion doivent être encodés dans l’URL, jamais affichés dans les logs.

Après migration, attribuez un mot de passe au rôle `foundation_worker` avec `\password foundation_worker` depuis une session `psql` administrative. Cette commande invite à saisir le mot de passe sans l’inscrire dans l’historique SQL. Ne fournissez jamais de connexion postgres ou service role au worker.

Dans Supabase Studio, créez un utilisateur Auth email/mot de passe, avec email confirmé. Ajoutez son UUID à la liste autorisée, depuis l’éditeur SQL administratif :

```sql
insert into public.foundation_allowed_users(user_id) values ('UUID_AUTH_DU_COMPTE');
```

Ne placez pas ces identifiants dans le dépôt. Vérifiez que les inscriptions publiques restent désactivées et que les limites de connexion Auth sont actives sur le projet distant. Auth gère le contrôle des tentatives de connexion ; le quota SQL gère les lancements de tâches.

```sh
pnpm dev
```

Ouvrez `http://localhost:3000/foundation`. Connectez vous, lancez la tâche, suivez son état puis demandez le lien privé. Le fichier contient exactement `CV a jour : socle operationnel.` suivi d’un retour à la ligne. La clé de requête et l’identifiant de tâche sont conservés dans le navigateur, par compte, pour les reprises. Le contenu et le lien signé ne sont pas conservés dans le stockage local.

## Contrôles de construction

```sh
pnpm typecheck
pnpm lint
pnpm build
pnpm validate:offline
pnpm validate:http
```

La construction ne demande aucun secret. Les scripts de lancement et les images refusent une configuration incomplète. Les imports de `@cv/server` sont interdits dans les bundles navigateur. Les images s’exécutent avec un utilisateur non privilégié.

## Validation sur Railway

Les deux services utilisent la **racine du dépôt** comme contexte de construction. Ne fixez pas `apps/web` ou `apps/worker` comme racine Railway, car les packages communs doivent rester accessibles. Aucun déploiement n'est entrepris sans votre autorisation.

| Service | Fichier de configuration Railway | Image | Exposition |
| --- | --- | --- | --- |
| Web | `/deploy/web.railway.json` | `Dockerfile.web` | Domaine HTTPS, contrôle `/api/health/live` |
| Worker | `/deploy/worker.railway.json` | `Dockerfile.worker` | Aucun domaine public |

Créez un projet Supabase de validation et un bucket R2 de validation distincts du développement. Consignez les régions Railway et Supabase réellement choisies dans le compte rendu de déploiement. Préférez des régions proches ; une indication de localisation R2 n’est pas une garantie de résidence.

Appliquez la migration au projet de validation après avoir vérifié son identifiant. Pour la CLI, utilisez `supabase link --project-ref <validation>` puis `supabase db push --linked`. Contrôlez ensuite les tables, contraintes, droits et fonctions sur la base distante. Créez le compte et les credentials comme en local. Configurez `APP_ENV=validation` et l’origine HTTPS réelle sur les deux services.

Désactivez l’accès public du bucket R2 (y compris `r2.dev`). N’activez aucun domaine public pour ce bucket. Le téléchargement est une navigation directe vers un lien signé ; aucun CORS navigateur n’est nécessaire pour ce parcours. Toute personne possédant le lien peut l’utiliser pendant 60 secondes, sans session applicative. Ne collez pas ce lien dans les journaux ou tickets.

Configurez uniquement les variables propres au rôle de chaque service. Les credentials R2 administratifs et `MIGRATION_DATABASE_URL` n’appartiennent à aucun service Railway. Déployez puis vérifiez le circuit complet, les refus d’accès et les reprises. Le contrôle HTTP de vie seul ne prouve pas l’accès à Supabase ou R2.

Pour construire localement les images :

```sh
docker build -f Dockerfile.web -t cv-web .
docker build -f Dockerfile.worker -t cv-worker .
```

La production n’est pas provisionnée par ce socle. Elle aura ses propres ressources et secrets. Désactivez la démonstration sur les deux processus après validation si elle n’est plus utile.

## Exploitation

Le worker lit une tâche à la fois. Invisibilité et bail durent 60 secondes, traitement limité à 20 secondes, trois prises au maximum. Il écrit toujours les mêmes octets à la même clé R2. La confirmation vérifie le jeton et la validité du bail, puis le message est archivé. Un arrêt forcé laisse le message réapparaître et permet une nouvelle prise.

Les logs JSON portent les identifiants de requête et de tâche, les événements et des codes d’erreur stables. Ils excluent identifiants de connexion, contenu des messages, jetons et URLs signées. Un événement `startup_failed` demande une vérification des noms et valeurs de configuration, sans les publier dans les logs.

Pour les tâches orphelines, examinez d’abord les candidats, puis sélectionnez explicitement les identifiants à terminer. Chaque candidat est revérifié sous verrou ; les messages invisibles et les baux valides protègent la tâche.

```sh
pnpm admin orphans
pnpm admin reconcile <uuid> <uuid>
```

Pour la purge, examinez les tâches terminales de plus de sept jours, puis sélectionnez les identifiants. La suppression R2 précède celle des lignes et archives SQL. Une erreur interrompt la commande ; elle peut être relancée. Même une tâche en échec peut avoir laissé un fichier après une interruption du worker.

```sh
pnpm admin purge-list
pnpm admin purge <uuid> <uuid>
```

Ces commandes refusent `APP_ENV=production` et requièrent les credentials administratifs. Aucun cron de suppression n’est activé.

## État de validation

Le 2026-11-09, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm validate:offline` et `pnpm validate:http` réussissent. Le paquet worker isolé produit par `pnpm deploy --prod --legacy` charge ses dépendances. Les deux points d’entrée refusent la configuration absente. Les contrôles de configuration couvrent aussi le rôle SQL dédié, TLS distant et l’interdiction d’activer la démonstration en production.

Avec des valeurs fictives, le serveur compilé répond : santé `200`, page de connexion `200` sans cache, lecture et lancement anonymes `401`, lancement depuis une origine étrangère `403`. Aucun parcours authentifié ni accès R2 n’est validé par ces contrôles. Les noms des secrets R2 et des connexions SQL ne sont pas présents dans les fichiers JavaScript publics construits.

Docker et Podman sont absents sur la machine de construction ; Supabase local ne démarre donc pas et les images Docker ne sont pas construites. Aucun accès aux services distants n’a été fourni. L’outil de navigateur est indisponible : la réponse HTML est contrôlée, mais le rendu visuel et les interactions au clavier restent à inspecter.

La fonctionnalité reste en construction jusqu’à application et inspection de la migration, génération réelle des types et validation sur les services. Le fichier `packages/contracts/src/database.types.ts` est actuellement une description provisoire correspondant à la migration, pas une introspection de base réelle. Aucun déploiement, compte, bucket ou projet distant n’est créé par l’installation du dépôt.

Les compétences de fournisseur ont été examinées comme candidates. Supabase est la plus pertinente pour une future inspection approfondie des règles PostgreSQL/Auth. La compétence Cloudflare dédiée à Next sur Workers ne correspond pas à l’hébergement Railway retenu. Aucune compétence ni connexion MCP n’a été installée. Supabase MCP reste prévu en lecture seule sur la validation ; Railway et Cloudflare MCP sont différés.
