# Contrôles locaux du 14 novembre 2026

Résultat : contrôles exercés réussis, purge complète bloquée. AC-6 et AC-7 distants restent ouverts. Aucun défaut applicatif observé nécessitant une correction. Aucun code applicatif, secret ou précision temporelle modifié.

## Périmètre et exécution

Supabase local, frontend sur `http://localhost:3000/foundation`, worker Node réel et comptes synthétiques existants. Les fixtures créées pour cette session sont synthétiques. La tâche `051c19bf-ceb1-4898-9ddd-435c0e26e322` reste disponible pour revoir son écran ; ses dates ont ensuite été fixées à des valeurs synthétiques pour éprouver fuseau et microsecondes.

Commandes du dépôt : `pnpm admin orphans`, `pnpm admin reconcile <uuid>`, `pnpm admin purge-list`, `pnpm admin purge <uuid>`. Le harnais exécute leur véritable cible `scripts/admin.ts` via `node --import ./node_modules/tsx/dist/loader.mjs`, avec les variables locales injectées au processus. Il ne remplace aucune fonction administrative. Le frontend est lancé par `pnpm --filter @cv/web dev` ; le worker utilise son point d’entrée `apps/worker/src/index.ts` via tsx.

Les processus utilisent des valeurs R2 fictives. Une garde de test bloque les requêtes HTTPS et les appels HTTP hors loopback. Aucune opération vers R2, Railway ou Supabase distant. Aucun usage de l’ancien jeton. La signature est calculée localement sans requête vers R2.

## Résultats attendus et observés

| Contrôle | Attendu | Observé | Preuve |
| --- | --- | --- | --- |
| `orphans` | Proposer uniquement les tâches privées de message et de bail valide | Orphelin présent ; message invisible exclu | [functional.json](functional.json), `admin_orphans` |
| `reconcile` | Échec `orphaned_message`, puis absence d’effet en répétition | Sortie 0, réconciliation puis `orphan_skipped` ; identifiant absent et bail valide protégés | [functional.json](functional.json), `admin_reconcile`, `admin_reconcile_noop`, `admin_valid_lease` |
| Arguments invalides | Refus sans détails sensibles | Six cas, sortie 1, `admin_failure` | [functional.json](functional.json), `admin_invalid_args` |
| Permissions worker | Refuser les quatre opérations administratives | Quatre sorties 1 ; quatre refus SQL `42501` | [functional.json](functional.json), [sql.json](sql.json) |
| `purge-list` | Uniquement tâches terminales de plus de sept jours | Ancienne tâche proposée ; récente et active exclues | [functional.json](functional.json), `admin_purge_list` |
| Limite temporelle et purge SQL | Sept jours exactement protégés ; une microseconde de plus admissible ; effacement ligne et archive, répétition sans effet | Toutes assertions réussies en transaction sur fixtures dédiées | [sql.json](sql.json) |
| `purge`, protections | Ignorer récente et active ; conserver la ligne si suppression du fichier impossible | `purge_skipped`, puis sortie 1 et ligne conservée quand le réseau distant est bloqué | [functional.json](functional.json), `admin_purge_skip`, `admin_purge_remote_blocked` |
| Purge complète du fichier et de la ligne | Supprimer le fichier avant la ligne | BLOQUÉ : le stockage configuré impose R2 distant ; pas de réussite déclarée | [functional.json](functional.json), `admin_purge_remote_blocked` |
| Worker, version inconnue | Terminer avec `unsupported_contract` et archiver, sans écriture R2 | Worker réel, tâche failed, zéro essai, message archivé ; API 200 avec code attendu | [functional.json](functional.json), `unsupported_worker`, [worker.json](worker.json) |
| Interface, version inconnue | Afficher le message associé au code | « Le format du message n’est pas pris en charge. » sur ordinateur et téléphone | [ui.json](ui.json), [ordinateur](unsupported-desktop.png), [téléphone](unsupported-mobile.png) |
| PostgreSQL et API | Mêmes instants UTC, sans perte de précision | Comparaison entière en microsecondes exacte pour les dates réelles et fixes | [functional.json](functional.json), `exact_dates`, `fixed_dates` |
| API et DOM | Identifiant, état, essais et dates identiques ; rendu UTC | Attributs datetime identiques aux chaînes API, six décimales conservées ; affichage UTC même avec navigateur Honolulu | [ui.json](ui.json) |
| Expiration signée | `expiresAt = X-Amz-Date + 60 secondes` exactement | Égalité exacte dans la fonction et via l’API locale, sans téléchargement distant | [signing.json](signing.json), [api-signing.json](api-signing.json) |

La spécification exige UTC et des dates produites par PostgreSQL. PostgreSQL conserve ici six décimales. Les comparaisons API utilisent des entiers BigInt en microsecondes, sans passage réducteur par JavaScript Date pour la fraction. Le texte visible reste à la seconde selon le rendu existant ; l’attribut HTML datetime conserve la valeur intégrale. Aucune modification de la précision en base, dans l’API ou dans l’interface n’a été faite pour obtenir ce résultat. La signature S3 exprime sa date à la seconde ; son expiration ISO correspond exactement à cette date plus 60 secondes.

## Preuves antérieures et limites

[previous-functional.json](previous-functional.json), [previous-ui.json](previous-ui.json) et [previous-r2.json](previous-r2.json) sont des résultats antérieurs conservés ici, pas des tests distants rejoués pendant cette session. Les captures [échec ordinateur](previous-cv-desktop-failure.png) et [échec téléphone](previous-cv-mobile-failure.png) montrent `attempts_exhausted`. Les chemins temporaires cités dans les anciens JSON sont historiques.

Les assertions de lecture R2 avant et après expiration proviennent exclusivement de ces preuves antérieures. Le nouveau contrôle exact d’expiration utilise des identifiants fictifs et ne prouve pas à lui seul l’acceptation d’un lien par R2.

La nouvelle installation sans secrets, la remise à zéro locale et l’ancien cas précis de bail périmé sur une tâche `attempts_exhausted` ne sont pas rejoués ici. Leurs cases composites restent ouvertes. La remise à zéro n’est pas nécessaire aux contrôles ciblés et effacerait les fixtures utiles. La purge complète reste bloquée. Aucun résultat global PASS et aucune validation distante ne sont déclarés.

Deux erreurs du harnais ont été corrigées puis les contrôles concernés ont réussi : extension `.mts` pour autoriser le await de premier niveau, et conversion explicite `bigint` dans l’appel de test à `pgmq.archive`. Ces erreurs ne concernaient pas le code applicatif.
