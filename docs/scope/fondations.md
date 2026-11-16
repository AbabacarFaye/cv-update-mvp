# Fondations

Le [périmètre général](index.md) définit l’ordre, les choix produit et le niveau GA commun.

### 1. Architecture et socle exécutable · done

Construire le socle retenu : Next.js et un processus de traitement sur Railway, Supabase pour PostgreSQL, Auth et Queues, et R2 pour les fichiers privés. Une tâche technique démontre le circuit complet avant les fonctionnalités CV.

**Spec:** [0001. Architecture et socle exécutable](../specs/0001-architecture-socle-executable/index.md), contenu validé le 2026-11-04 après relecture indépendante et corrections.

**Done when:** une décision documente les composants et leurs responsabilités, le socle démarre et sa construction réussit, les environnements et secrets sont séparés.

- [x] Concevoir le socle (spec) : `/architect architecture et socle exécutable`
- [x] Construire le socle depuis la décision : `/develop architecture et socle exécutable`
  - [x] Initialiser le workspace et compiler le web et le worker, avec contrôle TypeScript et lint
  - [x] Implémenter les routes, l’écran technique, le worker et les procédures d’administration ; contrôler les refus HTTP anonymes
  - [x] Appliquer et inspecter la migration sur Supabase, puis générer les types depuis la base
  - [x] Configurer les ressources de validation isolées et valider le circuit nominal sur Railway, Supabase et R2
- [x] Vérifier dans l’application : `/check verify architecture et socle exécutable`
- [x] Tester : `/test architecture et socle exécutable`
  - 2026-11-15 : 23 tests permanents sur la configuration et la pause du worker, puis 4 tests des scripts de revue avec CLI simulée, réussis via `node --import tsx --test tests/*.test.ts`. Couverture partielle détaillée dans [tests/README.md](../../tests/README.md) ; la phase test est close sur décision du porteur du projet, les autres critères étant vérifiés par `/check verify`.
- [x] Revue indépendante : `/check review architecture et socle exécutable`
- [x] Documenter : `/document architecture et socle exécutable` (description de PR rédigée le 2026-11-15)

**Code :** [web](../../apps/web/src/), [worker](../../apps/worker/src/), [migrations](../../supabase/migrations/), [configuration et exploitation](../../README.md).

**État au 2026-11-16 :** les critères AC-1 à AC-7 et la [vérification détaillée](../specs/0001-architecture-socle-executable/verify.md) sont validés sur les environnements local et de validation. La coupure du Worker après écriture R2, les trois refus R2 distants, l'isolation de deux comptes, la comparaison des secrets déployés et la purge administrative complète ont été observés. `/test`, la revue indépendante et la description de PR sont terminés ; la couverture permanente partielle est acceptée. La révocation de l'ancien jeton R2 partagé reste une recommandation reportée, hors critères AC. Le correctif du runtime Web a été intégré à `main` ; Railway a construit ce commit et `/api/health/live` a répondu HTTP 200.

### 2. Conventions et outils de qualité · in-progress

Capturer les conventions à partir du socle réel, puis mettre en place les contrôles communs avant de multiplier les fonctionnalités.

**Done when:** les conventions reflètent le projet réel et les contrôles de format, qualité et validation automatique fonctionnent.

- [x] Capturer les conventions du socle : `/audit` (fichiers `AGENTS.md` à la racine et dans les quatre workspaces)

**Reste à faire :** ajouter Prettier sans conflit avec ESLint ni reformatage global, automatiser lint, format et types avant commit, puis configurer la CI GitHub avec lint, format, types et tests, suivie de tests d’intégration ciblés. Aucune de ces validations automatiques n’est encore configurée.

### 3. Modèle de données · planned · needs a decision

Définir les relations entre comptes, documents, versions, analyses, traitements, modèles, crédits, packs et transactions. Prévoir les candidatures futures sans les réaliser maintenant.

**Done when:** les données sont isolées par utilisateur, les mouvements de crédits sont traçables, un paiement ou traitement répété ne crée pas de doublon, les règles de suppression sont représentables.

- [ ] Concevoir les données (spec) : `/architect modèle de données`

### 4. Fondations visuelles et bilingues · planned · needs a decision

Définir les composants, la navigation et les états communs en français et en anglais, sur téléphone et ordinateur.

**Done when:** les écrans disposent de composants cohérents, les textes sont traduisibles, les états de chargement et d’erreur sont prévus, le clavier, le focus et les contrastes répondent à l’objectif WCAG 2.2 AA.

- [ ] Concevoir l’interface commune (spec) : `/architect fondations visuelles et bilingues`
