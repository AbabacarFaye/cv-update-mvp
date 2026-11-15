# Tests du socle

Exécution depuis la racine, sans fichier de secrets :

```sh
node --import tsx --test tests/*.test.ts
```

Les préférences sont conservées dans `test-preferences.json`. Aucun paquet supplémentaire n'est nécessaire. Les tests utilisent les dépendances du workspace installées.

La suite couvre les changements non commités du worker et de sa configuration. Les titres portent les critères concernés, sans prétendre couvrir chaque critère en totalité.

| Critère | Couverture permanente de cette suite | Complément |
| --- | --- | --- |
| AC-1 | Refus du démarrage du worker mal configuré | Construction et démarrage web dans les validations existantes |
| AC-2 | Aucune, parcours hors des sources modifiées | `/check verify`, compte et services nécessaires |
| AC-3 | Aucune, idempotence SQL hors des sources modifiées | `/check verify`, base et file nécessaires |
| AC-4 | Pause ciblée, continuation des autres tâches, interruption SIGKILL avec marqueurs synthétiques | Reprise SQL/R2, épuisement et réconciliation dans `/check verify` |
| AC-5 | Rôle SQL dédié exigé par la configuration | Autorisations effectives, sessions et signatures dans `/check verify` |
| AC-6 | Variables requises, TLS, pause limitée à validation, démo interdite en production, erreur de démarrage sans secret | Bundles publics via `validate:offline` après construction ; séparation réelle des secrets dans `/check verify` |
| AC-7 | Aucune simulation des services distants | `/check verify` sur Railway, Supabase et R2 |

Le test de processus réutilise `scripts/validate-worker-pause.mjs`. Il ne prouve pas à lui seul que le worker réel appelle la pause au bon endroit entre PUT et confirmation SQL. Cette observation figure dans les preuves distantes référencées par `docs/specs/0001-architecture-socle-executable/verify.md`.

Résultat du 15 novembre 2026 : 27 tests réussis, dont les 23 tests initiaux et 4 tests des chemins d'échec des scripts de revue avec CLI simulée. La couverture permanente du socle reste partielle.
