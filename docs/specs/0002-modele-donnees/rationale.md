# Raisons du modèle de données

## Context

Le socle technique existe mais n’a que des tables de démonstration. Le lancement doit permettre plusieurs CV par compte, des variantes indépendantes, des analyses et améliorations facturées en crédits, ainsi que l’achat de packs. Les traitements et paiements sont asynchrones ; leurs répétitions ne doivent jamais provoquer de double débit ou crédit. Le modèle doit aussi permettre une suppression sans confondre contenu personnel et traces financières.

La décision concerne tout le monorepo. Elle reprend PostgreSQL, Auth, Queues, R2, les fonctions SQL et les types générés déjà choisis. Elle ne remplace pas les spécifications futures des fournisseurs et du parcours commercial (basis: [socle](../0001-architecture-socle-executable/index.md), [périmètre](../../scope/index.md)).

## Options considered

| Option | Intérêt | Coût ou limite |
|---|---|---|
| CV mutable et solde stocké directement | Peu de tables, parcours initial rapide | L’historique, les conflits et les remboursements doivent être reconstruits ; les invariants retenus deviennent difficiles à vérifier (basis: exigences de [Fondations](../../scope/fondations.md)) |
| Relations SQL, versions de contenu JSON et registre des crédits | Contraintes explicites pour propriété et finances, rubriques souples, présentation indépendante | Validateur JSON à maintenir et opérations transactionnelles plus nombreuses (basis: réponses de conception et socle PostgreSQL) |
| Chaque rubrique normalisée en tables SQL | Requêtes détaillées sur les éléments de CV et types SQL précis | Multiplication des tables et copies pour chaque version, sans besoin actuel de recherche transversale (basis: périmètre du parcours CV) |

## Rationale

La deuxième option conserve les données qui exigent une forte cohérence dans les relations SQL, tout en traitant le contenu d’une version comme une unité immuable. La variante est nécessaire parce qu’une adaptation à une offre et une traduction doivent conserver leur propre historique. La présentation attachée à la version permet de reproduire les exports malgré une évolution du catalogue.

La réservation évite de présenter un débit puis un remboursement pour chaque échec technique. Les allocations de lots conservent la provenance exacte des crédits consommés ; elles justifient la complexité supplémentaire choisie pour les remboursements. Un verrou du portefeuille entoure le contrôle et l’écriture, afin que deux transactions ne dépensent pas le même disponible (basis: [PostgreSQL, verrouillage explicite](https://www.postgresql.org/docs/16/explicit-locking.html)).

La file organise la livraison et la visibilité des messages ; l’unicité du résultat et du débit vient des transactions du modèle, pas d’une promesse d’appel externe unique (basis: [Supabase Queues API](https://supabase.com/docs/guides/queues/api)). Les limites de chaque service sont figées au lancement et un réconciliateur permet de sortir des tâches bloquées sans intervention manuelle systématique.

Les droits SQL et RLS sont complémentaires. Les fonctions privilégiées restent limitées et contrôlent les propriétaires, même lorsque leur rôle contourne RLS (basis: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Database Functions](https://supabase.com/docs/guides/database/functions)). Vérifier l’état du profil en base retire l’accès même avec un jeton déjà émis après demande de suppression (basis: [Managing User Data](https://supabase.com/docs/guides/auth/managing-user-data?language=js&queryGroups=language)). La purge R2 reste explicite car les cascades SQL ne suppriment pas un objet distant.

### Choix confirmés pendant la conception

1. Plusieurs CV indépendants par compte ; adaptations et langues en variantes autonomes.
2. Restaurer crée une nouvelle version ; brouillon sauvegardé automatiquement, publication explicite.
3. Résultat IA disponible facturé, même refusé ; proposition refusée conservée et restaurable.
4. Contenu structuré comprenant coordonnées, titre, profil, expériences, formations, compétences, langues, certifications, projets et rubriques libres.
5. Original conservé jusqu’à suppression ; modèles conservés dans leur révision choisie.
6. Bonus de 20 crédits après vérification email, une fois par compte ; aucune expiration.
7. Réservation au lancement, débit au succès, libération à l’échec ; tarif figé et nouvelle demande au tarif courant après échec définitif.
8. Lots offerts consommés avant les achats, puis ordre d’ancienneté ; remboursement sans solde négatif et incident bloquant si consommation antérieure.
9. Aucun contenu CV accessible aux administrateurs applicatifs ; conflits de brouillon explicites.
10. Suppression sans corbeille, refusée pendant tout traitement actif. Ce choix remplace la proposition initiale d’annuler un traitement lors de la suppression.
11. Proposition IA tardive rattachée à sa source, validation explicite avant remplacement ; échéance par service et échec automatique des traitements bloqués.
12. Traces financières séparées du contenu ; conservation à valider avant ouverture commerciale ; références officielles demandées.

### Recommandations techniques ajoutées à ratifier avec la spécification

Les noms de tables et fonctions, types, clés composites, contenu JSON V1, limite de 1 Mio, identifiants de révision, ordre des verrous, absence de cache du solde, pagination et intervalle de réconciliation sont des recommandations d’implémentation. Elles traduisent les décisions produit sans choisir de nouveau fournisseur. Les valeurs de validation des traitements servent seulement aux données synthétiques ; elles ne deviennent pas des engagements commerciaux.

L’offre devient immuable après son premier traitement pour préserver le contexte. Les remboursements affectant des crédits réservés attendent leur résolution et bloquent provisoirement les nouveaux traitements payants. Les confirmations tardives après suppression restent rattachées au portefeuille clôturé et créent un incident. Ces précisions rendent les transitions explicites ; elles font partie de la proposition soumise à ratification.

### Relecture indépendante et corrections approuvées

Une relecture en lecture seule par un autre modèle a relevé six lacunes de contrat. Le porteur du projet a approuvé les six corrections suivantes, puis validé la spécification complète corrigée le 2026-11-16.

| Point relevé | Correction retenue |
|---|---|
| Rembourser un paiement excédentaire pouvait retirer les crédits du premier | Le lot référence son paiement créditant ; le remboursement d’un paiement excédentaire ne reprend aucun crédit et l’incident référence les deux paiements |
| La présentation du résultat importé n’avait pas de source définie | Révision de modèle publiée et réglages validés obligatoires au lancement, figés dans la tâche ; révision synthétique pour la validation de fondation |
| Aucun contrat ne créait le lien initial paiement/achat | `register_payment_attempt` rattache une tentative par l’adaptateur habilité ; l’enregistrement puis la réconciliation reprennent les événements reçus avant ce rattachement |
| Le succès d’import pouvait remplacer un brouillon modifié | Adoption automatique seulement si compteur et version courante sont inchangés ; sinon résultat conservé et adoption explicite avec contrôle de concurrence |
| Une création répétée après purge pouvait recréer un CV | Trace minimale de la clé de création, sans contenu, jusqu’à suppression du compte ; réponse stable `resource_deleted` |
| Auteur et motif de remboursement n’étaient pas garantis | Audit obligatoire, attribué à l’administrateur ou au service de confiance ; répétition sans duplication de l’audit initial |

La relecture n’a pas réévalué les fournisseurs ni les décisions commerciales explicitement différées. Les scénarios critiques de la spécification couvrent les six corrections. L’approbation de ces corrections ne vaut pas déclaration de réalisation ou de validation de l’application.

## References

### Sources du projet

1. [AGENTS.md](../../../AGENTS.md) : conventions, structure et séparation des rôles.
2. [Socle exécutable](../0001-architecture-socle-executable/index.md) : fournisseurs, sessions, file, baux, stockage et droits.
3. [Périmètre général](../../scope/index.md), [Fondations](../../scope/fondations.md), [Parcours CV](../../scope/parcours-cv.md) et [Commerce](../../scope/commerce.md) : attentes et limites du lancement.
4. Réponses du porteur du projet pendant la conception du 2026-11-16, synthétisées ci dessus.

### Documentation officielle vérifiée le 2026-11-16

1. [PostgreSQL Explicit Locking](https://www.postgresql.org/docs/16/explicit-locking.html) : verrouillage des lignes jusqu’à fin de transaction. Source consultée pour le mécanisme, sans imposer PostgreSQL 16 au projet.
2. [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) : politiques, droits et identité.
3. [Supabase Database Functions](https://supabase.com/docs/guides/database/functions) : droits d’exécution et fonctions privilégiées.
4. [Supabase Managing User Data](https://supabase.com/docs/guides/auth/managing-user-data?language=js&queryGroups=language) : identité Auth et limites de la suppression vis à vis des jetons émis.
5. [Supabase Queues API](https://supabase.com/docs/guides/queues/api) : lecture, visibilité et archivage des messages.

La recherche a été limitée aux garanties des outils déjà retenus. Aucun connecteur ni compétence supplémentaire n’a été installé. Ces liens servent à la lecture humaine ; leur contenu vérifié est synthétisé ici et ne nécessite pas une nouvelle recherche lors du développement.
