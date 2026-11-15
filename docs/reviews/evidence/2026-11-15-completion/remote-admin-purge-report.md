# Purge administrative distante, 15 novembre 2026

Périmètre : projet Supabase `vheammupwxowyttjqxcr`, bucket privé `cv-update-validation`, une seule fixture synthétique `8a3dad33-5387-4e5c-a1b6-bed12da6bb42`. Aucun autre environnement, compte, tâche ou objet n'a été modifié. Aucun secret, cookie, chaîne de connexion ou URL signée n'est conservé dans cette preuve.

La configuration `.env.admin.validation` est ignorée par Git et protégée par les droits `600`. `.env.admin` local est inchangé. Le rôle PostgreSQL `postgres` et la migration `202611090001` ont été confirmés. La connexion du script utilise `ssl: "verify-full"` avec la racine publique [Supabase](../../../../deploy/supabase-ca.crt). Le pooler accepte une négociation TLS validée contre cette racine. `pg_stat_ssl` sur le backend du pooler indique `false`, car cette vue observe le lien pooler vers PostgreSQL, pas le lien TLS du client vers le pooler.

| Contrôle | Attendu | Observé |
| --- | --- | --- |
| Avant purge | Objet exact, ligne terminale âgée de huit jours, un message archivé, aucun message en file | Objet lu avec ses octets exacts ; ligne, candidat SQL et archive présents chacun une fois ; zéro message en file. |
| Ordre des suppressions | R2 supprimé avant SQL | La ligne de la fixture a été verrouillée pendant la vraie commande `pnpm admin purge <uuid>`. L'objet R2 renvoyait `404` alors que la ligne et l'archive existaient encore. |
| Premier appel | Suppression complète | Code de sortie `0`, événement `purged`. Après libération du verrou : objet, ligne, archive et message en file absents. |
| Second appel | Aucun effet | Code de sortie `0`, événement `purge_skipped`. Objet, ligne, archive et file toujours absents. |

Le contrôle a été exécuté par [remote-admin-purge.mjs](remote-admin-purge.mjs), qui lance le vrai script du dépôt via `pnpm admin purge`, avec les variables de validation déjà chargées. Les booléens et codes de sortie sont conservés dans [remote-admin-purge-result.json](remote-admin-purge-result.json). Le script a été vérifié avec `node --check` avant exécution. Résultat : **PASS**.

Une tentative initiale sans la racine CA a échoué avec `SELF_SIGNED_CERT_IN_CHAIN`, puis deux tentatives courtes avec la racine ont expiré. La négociation TLS du pooler et une requête CLI ont répondu ; un essai ultérieur avec `verify-full` a établi la connexion administrative. Aucun objet ni fixture n'avait été créé pendant ces diagnostics.

Le décalage de déploiement GitHub/Railway est indépendant : la modification de pause du Worker est dans le checkout local déployé manuellement et doit encore être publiée dans Git pour survivre à un futur redéploiement depuis GitHub. La révocation de l'ancien jeton R2 partagé n'a pas été faite ; elle est reportée comme recommandation distincte, hors critères AC.
