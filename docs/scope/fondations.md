# Fondations

Le [périmètre général](index.md) définit l’ordre, les choix produit et le niveau GA commun.

### 1. Architecture et socle exécutable · in-progress

Construire le socle retenu : Next.js et un processus de traitement sur Railway, Supabase pour PostgreSQL, Auth et Queues, et R2 pour les fichiers privés. Une tâche technique démontre le circuit complet avant les fonctionnalités CV.

**Spec:** [0001. Architecture et socle exécutable](../specs/0001-architecture-socle-executable/index.md), contenu validé le 2026-11-04 après relecture indépendante et corrections.

**Done when:** une décision documente les composants et leurs responsabilités, le socle démarre et sa construction réussit, les environnements et secrets sont séparés.

- [x] Concevoir le socle (spec) : `/architect architecture et socle exécutable`
- [ ] Construire le socle depuis la décision : `/develop architecture et socle exécutable`
  - [x] Initialiser le workspace et compiler le web et le worker, avec contrôle TypeScript et lint
  - [x] Implémenter les routes, l’écran technique, le worker et les procédures d’administration ; contrôler les refus HTTP anonymes
  - [ ] Appliquer et inspecter la migration sur Supabase, puis générer les types depuis la base
  - [ ] Configurer les ressources isolées et valider le circuit complet sur Railway, Supabase et R2
- [ ] Vérifier dans l’application : `/check verify architecture et socle exécutable`
- [ ] Tester : `/test architecture et socle exécutable`
- [ ] Revue indépendante : `/check review architecture et socle exécutable`
- [ ] Documenter : `/document architecture et socle exécutable`

**Code :** [web](../../apps/web/src/), [worker](../../apps/worker/src/), [migrations](../../supabase/migrations/), [configuration et exploitation](../../README.md).

**Reprise du 2026-11-09 :** construction, TypeScript, lint, contrôles hors ligne et HTTP local réussis ; [étapes de vérification](../specs/0001-architecture-socle-executable/verify.md) enregistrées. Docker absent, services distants non configurés et navigateur de vérification indisponible. La migration, les types générés, les reprises SQL, le stockage réel et les images Docker restent à vérifier. Les types présents sont provisoires.

### 2. Conventions et outils de qualité · planned

Capturer les conventions à partir du socle réel, puis mettre en place les contrôles communs avant de multiplier les fonctionnalités.

**Done when:** les conventions reflètent le projet réel et les contrôles de format, qualité et validation automatique fonctionnent.

- [ ] Capturer les conventions du socle : `/audit`

### 3. Modèle de données · planned · needs a decision

Définir les relations entre comptes, documents, versions, analyses, traitements, modèles, crédits, packs et transactions. Prévoir les candidatures futures sans les réaliser maintenant.

**Done when:** les données sont isolées par utilisateur, les mouvements de crédits sont traçables, un paiement ou traitement répété ne crée pas de doublon, les règles de suppression sont représentables.

- [ ] Concevoir les données (spec) : `/architect modèle de données`

### 4. Fondations visuelles et bilingues · planned · needs a decision

Définir les composants, la navigation et les états communs en français et en anglais, sur téléphone et ordinateur.

**Done when:** les écrans disposent de composants cohérents, les textes sont traduisibles, les états de chargement et d’erreur sont prévus, le clavier, le focus et les contrastes répondent à l’objectif WCAG 2.2 AA.

- [ ] Concevoir l’interface commune (spec) : `/architect fondations visuelles et bilingues`
