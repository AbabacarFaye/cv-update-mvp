# Parcours CV

Le [périmètre général](index.md) définit les choix communs. Chaque tranche enrichit un parcours déjà réel.

## Tranche 1 : premier parcours réel

### 5. Premier CV amélioré de bout en bout · planned · needs a decision

Permettre à un utilisateur de créer son compte, recevoir 20 crédits, importer un CV dans un format textuel retenu, lancer une analyse puis une amélioration IA, valider le résultat et exporter un PDF avec un modèle initial.

**Done when:** le document sauvegardé reste accessible après reconnexion, l’analyse et l’amélioration débitent chacune le tarif annoncé une seule fois, un échec ne laisse pas de débit définitif, l’export est inclus et chaque utilisateur ne voit que ses données.

- [ ] Concevoir le premier parcours (spec) : `/architect premier CV amélioré de bout en bout`

## Tranche 2 : enrichir le parcours

### 6. Imports et analyses ATS élargis · planned · needs a decision

Étendre les formats acceptés et rendre l’analyse compréhensible, avec les problèmes détectés et les pistes de correction. Les fichiers illisibles ou non pris en charge donnent une explication exploitable.

**Done when:** les formats et limites acceptés sont annoncés, le contenu extrait peut être vérifié, le score explique ses critères et limites, les traitements affichent leur état et reprennent sans double consommation.

- [ ] Concevoir les imports et analyses (spec) : `/architect imports et analyses ATS élargis`

### 7. Révision et adaptation à une offre · planned · needs a decision

Permettre de relire et modifier les propositions IA, puis d’adapter une version du CV à une offre saisie ou collée. L’IA ne doit pas inventer des expériences, compétences ou diplômes.

**Done when:** les modifications sont visibles et validables, une version précédente reste récupérable, l’adaptation utilise le texte de l’offre, le coût est connu avant traitement et les faits non fournis ne sont pas ajoutés comme acquis.

- [ ] Concevoir la révision (spec) : `/architect révision et adaptation à une offre`

### 8. Modèles, prévisualisation et exports · planned · needs a decision

Proposer plusieurs modèles professionnels personnalisables et une prévisualisation avant export PDF ou Word.

**Done when:** changer de modèle conserve le contenu, les réglages autorisés sont applicables, les documents longs restent lisibles sans contenu coupé et les exports PDF et Word restent inclus sans débit supplémentaire.

- [ ] Concevoir les modèles et exports (spec) : `/architect modèles prévisualisation et exports`

### 9. Espace personnel et cycle de vie du compte · planned · needs a decision

Retrouver, renommer, reprendre et supprimer ses CV et leurs versions. Compléter la gestion du compte et sa récupération.

**Done when:** l’utilisateur peut reprendre un document sauvegardé, retrouver son solde, récupérer son accès, supprimer un document ou son compte selon les règles annoncées et comprendre les états vides ou les erreurs.

- [ ] Concevoir l’espace personnel (spec) : `/architect espace personnel et cycle de vie du compte`
