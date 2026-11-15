# Préparation de la coupure après R2

Ce document décrit la préparation avant déploiement. Le contrôle a ensuite été exécuté ; voir le [rapport de coupure distante](worker-pause-remote-result.md) et la case désormais cochée dans `verify.md`.

## Mécanismes existants et ajout

Le worker appelle déjà `storage.write`, puis `foundation_private.complete_job`. Le bail SQL dure 60 secondes, la file rend le message invisible pendant 60 secondes, et une nouvelle prise réutilise la clé `foundation/{owner_id}/{job_id}/result.txt`. Le script local `local-resilience.mjs` vérifie une reprise, mais ne pouvait pas placer la coupure entre ces deux appels sur Railway.

La variable facultative `FOUNDATION_PAUSE_AFTER_R2_JOB_ID` contient l'UUID exact d'une seule tâche synthétique. Elle est absente par défaut. Le démarrage refuse cette variable si `APP_ENV` n'est pas `validation` ou si la valeur n'est pas un UUID. Après le PUT R2 réussi et le contrôle de délai, le worker journalise `paused_after_r2` avec `jobId`, `requestId` et numéro d'essai, puis reste en attente. Il n'appelle pas `complete_job`. Aucun endpoint ni bail n'est exposé.

## Vérification locale effectuée

| Commande | Résultat |
| --- | --- |
| `pnpm typecheck` | Code de sortie 0. |
| `pnpm --filter @cv/worker build` | Code de sortie 0. |
| `pnpm validate:offline` | Code de sortie 0 ; variable absente par défaut, UUID accepté en validation, local, production et valeur mal formée refusés. |
| `pnpm validate:worker-pause` | Code de sortie 0 ; un fichier synthétique existe au moment de la pause, la confirmation simulée est absente, le processus meurt par `SIGKILL`, la confirmation reste absente, un autre UUID continue. |
| `git diff --check` | Code de sortie 0. |

Le test local utilise des marqueurs de stockage et de SQL, sans appel R2 ni PostgreSQL. Il vérifie le placement et la coupure du point de pause. Le contrôle distant ci dessous doit encore prouver l'objet R2 réel et la ligne SQL réelle.

## Procédure distante après autorisation du déploiement

Cible fixe : projet Railway `e0e8a716-5eec-4ece-b0f1-11b081a0ba9f`, environnement `production` du projet **cv-update-validation**, service `worker` uniquement ; Supabase `vheammupwxowyttjqxcr` ; bucket `cv-update-validation`. Le nom `production` est celui de l'environnement Railway de validation, tandis que `APP_ENV` dans le worker doit rester `validation`.

1. Déployer la modification du worker seule. Vérifier une seule instance active du worker, `APP_ENV=validation`, l'absence de la variable de pause, zéro tâche active et zéro message en file. Générer deux UUID neufs, `JOB_ID` et `NEUTRAL_ID`, distincts. Ne prendre aucun UUID d'une tâche existante.
2. Installer `FOUNDATION_PAUSE_AFTER_R2_JOB_ID=JOB_ID` sur le seul worker avec `npx @railway/cli variable set FOUNDATION_PAUSE_AFTER_R2_JOB_ID=<JOB_ID> --service worker --project e0e8a716-5eec-4ece-b0f1-11b081a0ba9f --environment production`. Attendre que `npx @railway/cli service status --service worker --project e0e8a716-5eec-4ece-b0f1-11b081a0ba9f --environment production --json` indique le nouveau déploiement `SUCCESS`.
3. Lancer `node docs/reviews/evidence/2026-11-15-completion/remote-pause-fixture.mjs <JOB_ID>`. Ce script exige une file vide, utilise le compte Auth synthétique autorisé du fichier local ignoré par Git, et insère une seule tâche avec son message. Attendre dans les journaux du worker `claimed` puis `paused_after_r2` pour cet UUID. Conserver uniquement le nom des événements, l'UUID et le numéro d'essai.
4. Avant la fin du bail, lancer `node docs/reviews/evidence/2026-11-15-completion/remote-pause-observe.mjs paused <JOB_ID>`. Le résultat attendu est un GET R2 de contenu exact, `running`, essai 1, `object_key` et `completed_at` absents, bail actif et aucune archive. Le script ne produit ni secret, ni bail, ni URL signée. Si cette observation échoue, arrêter le scénario et restaurer la variable.
5. Préparer la restauration sans redémarrer le processus en pause : `npx @railway/cli variable set FOUNDATION_PAUSE_AFTER_R2_JOB_ID=<NEUTRAL_ID> --skip-deploys --service worker --project e0e8a716-5eec-4ece-b0f1-11b081a0ba9f --environment production`. Vérifier par `npx @railway/cli ssh --service worker --project e0e8a716-5eec-4ece-b0f1-11b081a0ba9f --environment production cat /proc/1/comm` que PID 1 est `node`. Si ce n'est pas le cas, ne pas lancer la commande suivante.
6. Tuer le vrai processus en pause avec `npx @railway/cli ssh --service worker --project e0e8a716-5eec-4ece-b0f1-11b081a0ba9f --environment production kill -KILL 1`. La session SSH peut se fermer avec une erreur réseau du fait de la coupure. Constater la fin de l'instance et l'absence de journal `stopped`, puis lancer `npx @railway/cli redeploy --service worker --project e0e8a716-5eec-4ece-b0f1-11b081a0ba9f --environment production --yes`. Attendre `SUCCESS` avec un nouvel identifiant de déploiement. Le nouvel UUID neutre empêche la pause sur `JOB_ID` pendant la reprise.
7. Attendre l'expiration du bail et de l'invisibilité, sans avancer artificiellement les dates de cette tâche. Exécuter `node docs/reviews/evidence/2026-11-15-completion/remote-pause-observe.mjs recovered <JOB_ID>`. Attendu : même identifiant et même clé R2, objet exact, `succeeded`, deux ou trois prises au maximum, un message archivé. Une prise supplémentaire éventuelle doit être expliquée par les journaux.
8. Supprimer `FOUNDATION_PAUSE_AFTER_R2_JOB_ID` avec `npx @railway/cli variable delete FOUNDATION_PAUSE_AFTER_R2_JOB_ID --service worker --project e0e8a716-5eec-4ece-b0f1-11b081a0ba9f --environment production`. Attendre le déploiement `SUCCESS`, confirmer l'absence de la variable par lecture en mémoire de la liste Railway, puis créer une nouvelle tâche synthétique et confirmer sa réussite. La tâche et son objet de preuve peuvent rester jusqu'à la purge prévue après sept jours ; ne pas vieillir de données existantes.

En cas d'échec après l'étape 2, supprimer la variable du seul worker, attendre un déploiement `SUCCESS` et contrôler une nouvelle tâche avant de conclure. Si la coupure ou le moment R2/SQL ne peut pas être prouvé, garder la case de `verify.md` ouverte. Ne jamais révoquer l'ancien jeton R2 pendant ce parcours.
