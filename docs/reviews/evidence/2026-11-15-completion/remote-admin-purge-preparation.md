# Préparation de la purge administrative distante

État initial au 15 novembre 2026 : contrôle bloqué avant toute création de fixture. La connexion administrative a ensuite été renseignée et le contrôle a réussi, voir [résultat structuré](remote-admin-purge-result.json) et [rapport de vérification](remote-admin-purge-report.md).

La commande du dépôt est `pnpm admin purge <uuid>`. Elle lance `scripts/admin.ts`, qui lit `MIGRATION_DATABASE_URL`, refuse `APP_ENV=production`, recherche un candidat SQL, supprime d'abord l'objet R2 puis appelle `foundation_private.purge_job`. Cette fonction supprime le message éventuel de la file et de son archive, puis la ligne `foundation_jobs`. La limite est stricte : `completed_at < now() - interval '7 days'`.

`.env.admin.validation` a été créé avec les paramètres de validation et le jeu R2 Worker déjà présent dans `.env.worker.validation`. `MIGRATION_DATABASE_URL` était initialement vide, puis a été renseigné sans être affiché. Le fichier est ignoré par Git et a les droits `600`. `.env.admin` reste inchangé et continue de cibler la base locale.

Recherche initiale de connexion administrative : aucun `MIGRATION_DATABASE_URL` distant n'était présent dans les fichiers d'environnement locaux, ni dans les variables du processus. Le fichier `supabase/.temp/pooler-url` contenait l'adresse et le rôle administrateur du projet lié `vheammupwxowyttjqxcr`, mais aucun mot de passe. La CLI Supabase pouvait exécuter des requêtes administratives via son accès au projet ; cet accès ne fournissait pas de chaîne PostgreSQL directement utilisable par `scripts/admin.ts`. La connexion limitée du Worker n'a pas été utilisée.

Procédure exécutée après ajout de la connexion : vérification de la cible, du rôle SQL et de TLS `verify-full` ; génération d'un UUID dédié ; écriture de l'objet synthétique dans `cv-update-validation` ; création de sa ligne terminale âgée de huit jours et de son message archivé ; deux appels à `pnpm admin purge <uuid>` avec la configuration de validation déjà chargée. Aucune ligne préexistante n'a été vieillie ou supprimée.

La révocation de l'ancien jeton R2 est une recommandation reportée et ne fait pas partie des critères AC. Le décalage entre le checkout local déployé sur Railway et la source GitHub du Worker est indépendant de la purge ; il reste à publier la modification du Worker dans Git pour qu'un futur déploiement GitHub ne remette pas l'ancienne version.
