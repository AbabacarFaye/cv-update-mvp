# Reprise des contrôles du 15 novembre 2026

Périmètre : checkout temporaire de `HEAD`, Supabase local et bucket privé `cv-update-validation`. Aucun secret, cookie, chaîne de connexion ou lien signé ne figure dans ce dossier. Les opérations distantes non exercées restent ouvertes dans `verify.md`.

## Installation propre sans secrets

Un `git archive HEAD` a créé `/private/tmp/cv-update-verify-20261115` sans les fichiers `.env*` locaux. Les seules valeurs de configuration passées au build étaient fictives (`localhost`, `example`). Les commandes ont été exécutées dans cet ordre.

| Commande | Code de sortie | Observation |
| --- | ---: | --- |
| `pnpm install --frozen-lockfile` | 0 | Lockfile à jour ; 393 paquets installés depuis le magasin local après autorisation de l’accès requis. |
| `pnpm typecheck` | 0 | Contrats, serveur, web, worker et scripts validés. |
| `pnpm lint` | 0 | ESLint du web terminé sans erreur. |
| `pnpm build` | 0 | Worker compilé ; Next.js a construit les routes `/foundation`, les trois API de tâches et la santé. |
| `pnpm validate:offline` | 0 | Configuration, rôle worker, TLS et bundles publics vérifiés. |

Le premier essai de `pnpm typecheck` a échoué car `pnpm` n’était pas sur `PATH` dans ce shell ; un shim Corepack placé dans le checkout temporaire a permis le passage complet ci-dessus. Le premier essai d’installation a rencontré la restriction réseau du bac à sable ; l’installation autorisée a ensuite réussi.

## Reconstruction Supabase local

Avant `pnpm db:reset`, l’analyse de `.env.admin` a produit uniquement ces propriétés : `APP_ENV=local`, hôte de `MIGRATION_DATABASE_URL` sur loopback, port `54322`, base `/postgres`. Cette vérification exclut la cible distante. Le premier lancement de `pnpm db:start` a été refusé par le bac à sable lorsqu’il voulait écrire sa télémétrie ; le lancement autorisé a réussi.

| Commande | Code de sortie | Observation |
| --- | ---: | --- |
| `pnpm db:start` | 0 | Supabase local démarré. |
| `pnpm db:reset` | 0 | Sortie CLI : `Reset local database`, cible `local`, `127.0.0.1:54322`, migration `202611090001_foundation.sql` appliquée. |
| `pnpm validate:db` | 0 | Extension, file, colonnes, contraintes et privilèges vérifiés. |
| `pnpm db:types` | 0 | Types regénérés depuis la base locale ; aucun diff dans `database.types.ts`. |
| `pnpm typecheck` | 0 | Contrats, serveur, web, worker et scripts validés après génération. |

Le mot de passe du rôle `foundation_worker` local a été rétabli depuis `.env.worker`, car le reset recrée le rôle sans son ancien mot de passe. Aucune valeur n’a été affichée. La connexion sous ce rôle est requise pour le scénario worker suivant. Le premier `validate:db` a été refusé par le bac à sable sur la connexion loopback ; le contrôle autorisé a réussi. Le premier `db:types` a été bloqué par la télémétrie CLI ; le contrôle autorisé a réussi.

## Épuisement local et ancien bail

Script reproductible : [local-resilience.mjs](local-resilience.mjs). Il utilise un compte Auth synthétique créé après reset, le worker compilé réel et uniquement le bucket R2 de validation. Il force trois refus R2 en fournissant au processus worker des identifiants fictifs, sans modifier de fichier secret. Le délai de visibilité des seuls messages synthétiques locaux est avancé entre les essais.

| Attendu | Observé |
| --- | --- |
| Trois échecs R2, puis `failed/attempts_exhausted` à la prise suivante | Trois événements `attempt_failed`, essais 1, 2, 3 ; message résolu ensuite, `failed`, code `attempts_exhausted`, compteur 3. |
| Ancien bail sans effet | Jeton capturé pendant `running` ; `complete_job` et `fail_attempt` renvoient `false` après épuisement ; état et code conservés. |
| Nouvelle tâche réussie | Worker avec identifiants de validation valides : `succeeded` en une prise, clé conforme ; son seul objet R2 supprimé avec 204 puis confirmé absent. |

Résultats structurés : [results.json](results.json), `localExhaustion`. Le script ne journalise ni identifiants R2 ni clé de bail.

## Droits R2 de validation rejoués

Commande réelle : `node scripts/validate-r2-roles.mjs`. Le script a généré trois noms d’objets uniques et les a supprimés dans son bloc `finally`. Aucune ressource de développement n’a été utilisée.

| Opération | Attendu | Observé |
| --- | --- | --- |
| Identifiants locaux distincts, bucket de validation | `true` | `true` |
| Écriture worker | 200 | 200 |
| Lecture web et octets exacts | 200, identiques | 200, identiques |
| Téléchargement signé web et octets exacts | 200, identiques | 200, identiques |
| Écriture web directe | 403 | 403, `AccessDenied` |
| Écriture web signée | 403 | 403 |
| Suppression des trois objets, puis absence | 204 puis 404 pour chacun | Trois 204 ; absence confirmée pour les trois |

Ces résultats portent sur les identifiants des fichiers locaux de validation. Ils ne prouvent pas les valeurs installées dans Railway.

## Isolation de deux comptes autorisés sur Railway

Script reproductible : [remote-isolation.mjs](remote-isolation.mjs). La CLI Supabase a confirmé deux comptes Auth synthétiques déjà présents et confirmés ; un seul était autorisé au départ. Le script a accordé temporairement l’accès au second, connecté chacun des comptes, puis révoqué cet accès dans son bloc `finally`.

| Attendu | Observé |
| --- | --- |
| Chaque compte crée et consulte sa tâche | Deux créations 202, deux lectures 200, deux états `succeeded`. |
| Chaque compte peut demander son lien | Deux réponses 200 ; les URL reçues n’ont été ni enregistrées ni requêtées. |
| Accès croisés masqués | Lecture A vers B et B vers A : 404 ; émission de lien A vers B et B vers A : 404. |
| Autorisation restaurée | Second compte retiré ; contrôle final SQL : zéro ligne d’autorisation pour lui. |

## Résilience distante partielle

[remote-recovery.mjs](remote-recovery.mjs) a créé des fixtures distinctes, sans agir sur les tâches antérieures. Le worker Railway a traité un message de version 999 sans bail : état `failed`, code `unsupported_contract`, compteur 0, message archivé. Avec un bail valide, la lecture du worker a rendu le message invisible sans changer le bail ni l’état `running`. Après expiration de ce bail synthétique et remise à disposition du message, le worker a fixé `unsupported_contract` et archivé le message.

Une première lecture de `orphan_candidates()` sous `supabase_read_only_user` a reçu SQLSTATE `42501`, car ce rôle n’a pas `EXECUTE`. L’appel administratif sous `postgres` a proposé la seule fixture orpheline créée pour ce test. `reconcile_orphan()` a renvoyé `true`, puis `false` au second appel ; l’état final est `failed/orphaned_message` avec zéro essai. Ce contrôle a été fait par les fonctions SQL du dépôt, pas par `pnpm admin`, faute de chaîne de connexion administrative distante dans un fichier local.

[remote-exhausted-claim.mjs](remote-exhausted-claim.mjs) a préparé une fixture déjà à trois essais. Le worker l’a marquée `failed/attempts_exhausted` et a archivé son message. Une nouvelle tâche synthétique a ensuite réussi en une prise ; son objet R2 a été supprimé avec 204 et confirmé absent. **Ce test ne provoque pas trois échecs R2 distants.** Il ne remplace pas l’interruption du worker après écriture R2 et avant confirmation SQL. Le contrôle AC-4 distant reste ouvert.

Le dernier relevé SQL distant montrait zéro message actif, zéro tâche active et le second compte non autorisé. Les lignes terminales synthétiques de ces vérifications restent disponibles pour l’audit ; aucune tâche préexistante n’a été modifiée.

## Contrôles Railway du 15 novembre, CLI authentifiée

`npx @railway/cli whoami` et `npx @railway/cli status` ont réussi. Le statut a identifié le projet `cv-update-validation` (`e0e8a716-5eec-4ece-b0f1-11b081a0ba9f`), l'environnement `production`, les services `web` et `worker` en ligne. Le premier essai dans le bac à sable était bloqué par le réseau ; les commandes autorisées ont réussi.

[railway-deployed-r2.mjs](railway-deployed-r2.mjs) a lu les variables des deux services en mémoire, sans afficher les valeurs. Les quatre paramètres R2 de chacun correspondent aux fichiers locaux de validation. Les jeux Web et Worker sont distincts et ciblent `cv-update-validation`. Avec les valeurs effectivement déployées, l'écriture Worker, la lecture Web et le téléchargement GET signé ont réussi. Les écritures Web directe et par PUT signé ont reçu `403`. Les trois objets synthétiques de ce test ont été supprimés et leur absence confirmée. Le détail booléen figure dans [results.json](results.json), section `railwayDeployedR2`.

[railway-r2-exhaustion.mjs](railway-r2-exhaustion.mjs) a vérifié l'absence initiale de tâche active et de message en file. Il a placé temporairement une clé d'accès R2 fictive sur le seul service `worker`, en utilisant l'entrée standard de la CLI, puis attendu le nouveau déploiement. Une tâche synthétique dédiée a produit trois vrais événements d'échec R2. Les journaux de ce déploiement montrent `claimed` puis `attempt_failed/dependency_failure` pour les essais 1, 2 et 3, puis `message_resolved/attempts_exhausted`. Après chaque essai, la tâche était `queued` et son message restait en file ; seule la visibilité de ce message dédié a été avancée pour accélérer l'essai suivant. À la prise suivante, elle est devenue `failed/attempts_exhausted`, avec trois essais et un message archivé. Le script a restauré la clé initiale, vérifié le nouveau déploiement en ligne et l'égalité avec le fichier local. Une nouvelle tâche synthétique a réussi en un essai ; son objet R2 a été supprimé et confirmé absent. Le relevé SQL final comptait zéro tâche active et zéro message en file. Aucun objet de développement ni aucune tâche antérieure n'a été modifié.

L'interruption précisément située après le PUT R2 du worker Railway et avant `complete_job` SQL a ensuite été exécutée avec un point de pause ciblé. Le PUT, l'absence de confirmation SQL, le SIGKILL sur PID 1 Node, puis la reprise sous le même UUID et la même clé avec deux essais sont documentés dans le [rapport de coupure distante](worker-pause-remote-result.md). La variable de pause a été retirée, un dernier déploiement sans pause et une nouvelle tâche ont réussi, puis les quatre objets R2 propres à ce contrôle ont été supprimés.

La purge distante par la vraie commande `pnpm admin purge` a été exécutée après préparation de `.env.admin.validation`, sans modifier `.env.admin` local ni ajouter de secret à Railway. Une fixture synthétique âgée de huit jours a été créée dans Supabase de validation avec son objet R2 et son message archivé. L'objet a disparu pendant que sa ligne SQL et son archive étaient encore verrouillées et présentes ; après libération, la ligne et l'archive ont été supprimées. Le second appel a produit `purge_skipped`. Voir [rapport](remote-admin-purge-report.md), [script de preuve](remote-admin-purge.mjs) et [résultat structuré](remote-admin-purge-result.json).

## Historique du blocage d'accès

Le MCP Supabase a répondu `OAuth token refresh failed: Failed to parse server response` à deux requêtes de lecture. La CLI Supabase a permis les contrôles SQL ciblés ci-dessus. Lors du premier passage, l’inventaire du navigateur a répondu `The browser access host is unavailable` ; l’onglet Railway aperçu ensuite dans Chrome n’a rendu qu’une page vide. La CLI Railway authentifiée est devenue disponible lors du passage décrit ci-dessus et a levé le blocage de comparaison des valeurs déployées. Elle ne fournit pas le point de pause nécessaire à l'interruption précise.

La spécification exige des ressources et secrets distincts et des droits R2 limités. Elle ne prescrit pas la révocation de l’ancien jeton partagé comme critère AC. Cette révocation est une recommandation de sécurité distincte, reportée selon la décision de l’utilisateur. Aucune révocation n’a été faite.
