# Préparation du projet de validation Supabase

Projet : `vheammupwxowyttjqxcr`. Contrôles du 14 novembre 2026. Aucun identifiant, mot de passe, jeton ou URL signée ne figure ici.

| Contrôle | Attendu | Observé | Preuve |
| --- | --- | --- | --- |
| Migration | Migration de fondation appliquée | Historique `202611090001_foundation`, schéma et droits inspectés précédemment | Requête MCP `list_migrations` et inventaire SQL du contrôle précédent |
| Rôle worker | Connexion dédiée, fonctions worker accordées, écriture directe refusée | Connexion PostgreSQL sous `foundation_worker` par le pooler session avec vérification TLS ; `read_message()` exécutable ; `INSERT` sur `foundation_jobs` refusé par les privilèges | Requête PostgreSQL `current_user`, `has_function_privilege`, `has_table_privilege` ; résultat `foundation_worker`, `true`, `false` |
| Certificat TLS | Vérification complète de la chaîne et du nom | Sans CA, `SELF_SIGNED_CERT_IN_CHAIN` ; avec la racine Supabase, connexion réussie en mode `verify-full` | Tests de connexion Node `postgres` ; certificat public [deploy/supabase-ca.crt](../../../../deploy/supabase-ca.crt), empreinte SHA-256 `807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa` |
| Image worker | Certificat présent à l’exécution | `docker build -f Dockerfile.worker` réussi ; fichier CA lisible par le processus Node dans l’image | Construction et `docker run` local, résultat `caReadable: true` |
| Auth | Un compte autorisé et un second refusé | Deux comptes synthétiques confirmés ; deux connexions Auth réussies ; RPC `foundation_is_allowed()` renvoie `true` puis `false` ; table autorisée avec une seule ligne | Lecture MCP : `auth_count=2`, `confirmed_count=2`, `allowed_count=1`, `valid_allowed_refs=1` ; appels Auth et RPC sans journaliser de jeton |
| Configuration | Variables propres à chaque service | Fichiers `.env.web.validation`, `.env.worker.validation` et `.env.validation.auth.json` ignorés par Git, mode `600` | `git check-ignore` et `stat` locaux |

Le mot de passe du worker a été créé aléatoirement et n’est conservé que dans `.env.worker.validation`. Le rôle worker a été testé avec cette connexion. Les deux comptes de test sont dans `.env.validation.auth.json`, ignoré par Git.

## Contrôle R2 du bucket de validation

Les deux fichiers de validation sont ignorés par Git, absents de l’index et en mode `600` avec `Apple` comme propriétaire. Les identifiants Web et Worker sont présents, distincts, et pointent tous deux sur `cv-update-validation`. Leurs variables `R2_ENDPOINT` sont renseignées, identiques et conformes au format HTTPS R2 attendu. Le contrôle final utilise exclusivement ces deux fichiers de validation. Il n’accède à aucun fichier ni bucket de développement.

| Contrôle | Attendu | Observé | Preuve |
| --- | --- | --- | --- |
| Écriture Worker | Un objet synthétique peut être écrit | HTTP `200` | [Résultat R2](r2-validation.json), `workerWrite` |
| Lecture Web | Le contenu téléchargé correspond exactement à l’objet écrit | HTTP `200`, octets identiques | `webRead` |
| Téléchargement signé Web | Une URL GET signée permet réellement le téléchargement | HTTP `200`, octets identiques | `webSignedDownload` |
| Écriture Web directe | Refus | HTTP `403`, `AccessDenied` | `webDirectWriteDenied` |
| Écriture Web par URL signée | Refus | HTTP `403` | `webSignedWriteDenied` |
| Nettoyage | Seuls les trois objets synthétiques du test sont supprimés et absents | Trois suppressions HTTP `204`, puis trois lectures HTTP `404` | `cleanup` |

Script reproductible : [scripts/validate-r2-roles.mjs](../../../../scripts/validate-r2-roles.mjs). Il génère des clés uniques, ne journalise ni identifiants ni URL signées, et tente la suppression des trois clés dans un bloc `finally`.

`APP_ORIGIN` reste à renseigner après attribution du domaine HTTPS Railway. Aucun parcours Railway ni contrôle des logs n’a été exécuté. AC-6 et AC-7 restent ouverts ; aucune révocation de l’ancien jeton n’a été effectuée.
