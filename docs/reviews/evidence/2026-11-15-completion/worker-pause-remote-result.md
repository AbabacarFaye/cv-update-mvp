# Coupure distante après PUT R2, 15 novembre 2026

Périmètre : seul service Railway `worker` du projet `cv-update-validation`, Supabase `vheammupwxowyttjqxcr`, bucket privé `cv-update-validation`, compte et tâches synthétiques. Aucune valeur secrète, aucun bail et aucune URL signée ne sont conservés ici.

## Préconditions

La CLI Railway a confirmé le projet lié, le service `worker` en ligne avec une réplique et une politique `ON_FAILURE` à cinq redémarrages au maximum. La liste des variables, filtrée en mémoire, a donné `APP_ENV=validation`, démonstration activée et variable de pause absente. La requête SQL de lecture a donné zéro tâche `queued/running` et zéro message en file. Un UUID neutre distinct a été préparé avant SIGKILL afin que le déploiement suivant ne cible pas à nouveau la tâche interrompue.

Le premier essai avec la tâche `c92d03dc-0f0d-406e-bda3-518747bd379b` n'a **pas** validé la coupure : le changement de variable Railway avait redéployé le commit GitHub, sans le code local de pause. L'objet R2 était exact, mais SQL indiquait déjà `succeeded`, un essai et un message archivé. La variable a été retirée. L'essai suivant a installé la variable avec `--skip-deploys`, puis téléversé le code local avec `railway up --service worker`. La présence de `paused_after_r2` dans `/app/dist/index.js`, `APP_ENV=validation` et l'UUID ciblé ont été vérifiés dans le conteneur avant de créer la seconde tâche.

## Observation de la coupure et de la reprise

| Contrôle | Attendu | Observé |
| --- | --- | --- |
| Tâche dédiée | Un UUID, une clé R2 déterministe | `d7a607f6-c12f-4cfb-8d2a-17ab8c95e9d8` ; `foundation/64a3b2f5-b36b-4392-8f34-43f5cdb16001/d7a607f6-c12f-4cfb-8d2a-17ab8c95e9d8/result.txt`. |
| Journaux avant coupure | PUT terminé puis pause, sans succès SQL | `claimed` à `15:09:07.273Z`, essai 1 ; `paused_after_r2` à `15:09:08.000Z`, essai 1. Aucun `succeeded` ni `stopped` sur ce déploiement. |
| R2 pendant pause | Objet présent et octets exacts | GET avec identifiants Web de validation : contenu exact `CV a jour : socle operationnel.\n`. |
| SQL pendant pause | Pas de confirmation | `running`, un essai, `object_key` et `completed_at` nuls, bail encore actif, zéro message archivé. Script `remote-pause-observe.mjs paused` : `PASS`. |
| PID 1 et coupure | Processus Node, SIGKILL réel | `/proc/1/cmdline` : `node dist/index.js`. `/proc/1/comm` indiquait `MainThread`, donc la ligne de commande a été utilisée pour lever l'ambiguïté. `kill -KILL 1` via SSH : code de sortie 0 ; aucun arrêt gracieux journalisé. |
| Reprise | Même UUID et clé, essai supplémentaire, succès | Déploiement local avec UUID neutre `89eb8b2c-7e3b-4449-9c98-d4c85f788b3d` en `SUCCESS`. `claimed` à `15:12:56.231Z`, essai 2 ; `succeeded` à `15:12:57.534Z`, essai 2. SQL : même clé R2, `succeeded`, deux essais, un message archivé. GET R2 avec identifiants Web : octets exacts. Script `remote-pause-observe.mjs recovered` : `PASS`. |
| Restauration | Pause absente, Worker opérationnel | Variable temporaire supprimée et absence confirmée par lecture filtrée. Worker `SUCCESS`, en ligne. Première tâche de contrôle `682553bc-6d71-4101-8996-1ff398715c1c` : `succeeded` en un essai, objet exact et message archivé. Un déploiement final du code local, avec variable absente, a atteint `SUCCESS` sous `a47b4ce2-388a-4f26-b13c-b99aac1615a0`. Nouvelle tâche sur ce déploiement, `1c132f48-8253-43de-b5d5-3b259b849339` : `succeeded` en un essai, objet exact et message archivé. Les deux appels `remote-pause-observe.mjs fresh` ont donné `PASS`. La dernière requête de file a donné zéro tâche active et zéro message en attente. |
| Nettoyage | Uniquement les objets du contrôle | Les quatre objets des UUID ci dessus existaient, ont reçu `DELETE 204`, puis `HEAD 404`. La clé SSH temporaire a été retirée de Railway ; la liste finale ne contient aucune clé. Les fichiers de clé locaux temporaires ont été supprimés. |

Entre la pause à `15:09:08Z` et la seconde prise à `15:12:56Z`, plus de 60 secondes se sont écoulées, sans modification artificielle du bail ni de la visibilité du message. Le redéploiement avec UUID neutre a empêché le redémarrage automatique de replacer cette tâche en pause. Le dernier déploiement, après suppression de la variable, restaure également la configuration en mémoire. Les lignes SQL terminales synthétiques restent disponibles pour l'audit ; seuls les objets R2 de ce contrôle ont été supprimés. Aucun autre service, bucket, jeton R2 ou tâche existante n'a été modifié.

Le téléchargement vérifié pour la tâche reprise était un GET R2 authentifié avec les identifiants Web de validation, sans URL signée. Le parcours de lien signé sur Railway a été vérifié séparément dans les preuves précédentes ; cette séquence ne l'a pas rejoué pour cet UUID. Le dernier déploiement provient du checkout local via `railway up` ; une future opération Railway qui reconstruit depuis le dépôt GitHub reprendra le code du commit GitHub tant que ces changements ne seront pas intégrés.

Verdict de la coupure et reprise : **PASS**. La purge administrative distante a été vérifiée séparément ensuite, voir [rapport](remote-admin-purge-report.md).
