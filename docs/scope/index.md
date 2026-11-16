# Périmètre : CV à jour

CV à jour vous permet d’améliorer un CV existant à partir d’une analyse de compatibilité ATS, puis de l’adapter à une offre et de l’exporter. Le premier lancement public payant vise le Sénégal, la Côte d’Ivoire et le Burkina Faso, avec une interface en français et en anglais.

**Build approach:** Tracer Bullet (faire fonctionner un parcours réel et limité de bout en bout, puis enrichir chaque partie).
**Workflow:** GA (après `/develop`, vérification dans l’application avec `/check verify`, tests avec `/test`, revue indépendante avec `/check review`, puis `/document`). Chaque fonctionnalité hérite de ce niveau.

Ces étapes sont des recommandations pour organiser votre réalisation. Vous pouvez les adapter. Les décisions techniques et les estimations détaillées appartiennent aux futures spécifications.

## Décisions retenues

Chaque nouvel utilisateur reçoit 20 crédits après vérification de son adresse email, une seule fois par compte. Les crédits n’expirent pas. Chaque analyse ATS et chaque amélioration IA consomme des crédits, réservés au lancement puis débités lorsque le résultat est disponible ; un échec définitif libère la réservation. Les exports sont inclus. Des packs permettent de recharger le solde. Le paiement mobile, dont Orange Money et Wave selon les pays couverts, et le paiement par carte sont essentiels.

Le lancement comprend les comptes, les CV sauvegardés, plusieurs modèles personnalisables, la prévisualisation, les exports PDF et Word et une administration essentielle. La création depuis zéro, les lettres et le suivi des candidatures sont conservés dans les phases ultérieures.

Les pages publiques et le produit sont disponibles en français et en anglais. L’interface est adaptée au mobile et aux connexions limitées, avec un objectif d’accessibilité WCAG 2.2 AA. Les traitements longs affichent leur progression et permettent une reprise.

Les CV restent dans le compte jusqu’à leur suppression. Les fichiers temporaires sont supprimés après traitement. Les documents ne sont pas réutilisés pour entraîner l’IA. Cette exigence devra aussi être respectée par les services de traitement retenus.

Le principal indicateur de réussite est l’achat de crédits. Le parcours inscription → traitement → achat et les erreurs sont mesurés sans enregistrer le contenu des CV dans les outils de mesure. Aucune date, enveloppe budgétaire ou capacité d’équipe n’est arrêtée.

## Décisions encore ouvertes

Le pays d’établissement de l’entreprise, la liste exacte des pays de vente, la monnaie de facturation et la couverture des moyens de paiement restent à déterminer avant l’ouverture commerciale. Le public international ne signifie pas une vente mondiale dès le lancement.

Le coût de chaque service en crédits, les quantités et prix des packs et les conditions commerciales de remboursement restent à définir. Le coût des services doit permettre aux 20 crédits offerts de donner accès à plusieurs usages utiles. Le [modèle de données](../specs/0002-modele-donnees/index.md) fixe l’absence d’expiration et la traçabilité technique des remboursements ; la politique de remboursement partiel reste à concevoir.

Les formats, tailles et langues des documents acceptés, le traitement des CV scannés, le nombre initial de modèles et les limites de personnalisation seront précisés lors de la conception. La proposition de départ est un CV contenant du texte, un modèle et un export PDF pour la première tranche interne, puis PDF et Word et plusieurs modèles avant le lancement public.

La méthode de calcul du score ATS doit être explicable. Le score est une estimation de compatibilité selon des critères annoncés, sans garantie de résultat auprès d’un recruteur. Les optimisations doivent conserver les faits du CV et laisser l’utilisateur valider les modifications.

Les objectifs mesurables de rapidité, les volumes attendus et les règles de conservation des sauvegardes, journaux et justificatifs de transaction restent à fixer. Les exigences commerciales et de confidentialité dépendront notamment du pays d’établissement. Aucune conformité juridique n’est présumée dans ce plan.

## Vue d’ensemble

| # | Fonctionnalité | Phase | Statut |
|---|---|---|---|
| 1 | Architecture et socle exécutable | Fondations | done |
| 2 | Conventions et outils de qualité | Fondations | done |
| 3 | Modèle de données | Fondations | in-progress |
| 4 | Fondations visuelles et bilingues | Fondations | planned |
| 5 | Premier CV amélioré de bout en bout | Tranche 1 | planned |
| 6 | Imports et analyses ATS élargis | Tranche 2 | planned |
| 7 | Révision et adaptation à une offre | Tranche 2 | planned |
| 8 | Modèles, prévisualisation et exports | Tranche 2 | planned |
| 9 | Espace personnel et cycle de vie du compte | Tranche 2 | planned |
| 10 | Tarification et portefeuille de crédits | Tranche 3 | planned |
| 11 | Achat de packs par mobile et carte | Tranche 3 | planned |
| 12 | Administration des utilisateurs et crédits | Tranche 3 | planned |
| 13 | Administration des transactions | Tranche 3 | planned |
| 14 | Administration des modèles et services | Tranche 3 | planned |
| 15 | Pages publiques et conversion | Lancement | planned |
| 16 | Confidentialité et conditions du service | Lancement | planned |
| 17 | Mesure, fiabilité et préparation du lancement | Lancement | planned |
| 18 | Création de CV depuis zéro | Deferred | planned |
| 19 | Lettres de motivation assistées | Deferred | planned |
| 20 | Suivi des candidatures | Deferred | planned |

## Plan par domaine

| Domaine | État initial | Document |
|---|---|---|
| Fondations | Socle et contrôles terminés ; modèle de données conçu, à construire ; fondations visuelles à concevoir | [Fondations](fondations.md) |
| Parcours CV | 5 fonctionnalités à concevoir | [Parcours CV](parcours-cv.md) |
| Commerce et administration | 5 fonctionnalités à concevoir | [Commerce](commerce.md) |
| Lancement et suite | 3 fonctionnalités de lancement, 3 reportées | [Lancement](lancement.md) |

## Ordre et effort relatif

Les fondations précèdent la première tranche réelle. Celle ci inclut une authentification réelle, une sauvegarde réelle et une consommation de crédits réelle. Les tranches suivantes enrichissent ce parcours sans attendre que toutes les capacités soient complètes.

L’effort se concentre sur la fidélité des imports et exports, la qualité des améliorations IA, la reprise des traitements et la fiabilité du portefeuille et des paiements. Les pages publiques et les écrans de gestion reposent ensuite sur ces fondations. Une estimation en jours serait prématurée avant les décisions de conception.

Les fonctionnalités 1 à 17 forment le périmètre de lancement public. Une tranche interne utilisable ne vaut pas ouverture commerciale. Les fonctionnalités 18 à 20 sont reportées, sans disparaître de la vision produit. Aucun envoi automatique de candidature, API publique, espace recruteur ou organisation à plusieurs utilisateurs n’est prévu dans ce lancement.

## Légende

`planned` indique un travail prévu. `in-progress` indique une conception ou une réalisation en cours. `done` indique un travail terminé selon les étapes convenues. `existing` désigne une capacité antérieure au processus. `dropped` conserve la trace d’une capacité abandonnée. `Deferred` est une phase reportée, pas un statut de réalisation.

`needs a decision` signifie qu’une décision reste à concevoir. Chaque fonctionnalité non conçue a une seule case d’entrée. `/architect` ajoutera ensuite le lien de spécification et les jalons de réalisation. Les tâches détaillées restent dans les spécifications. La première case non cochée indique la prochaine étape recommandée.

La prochaine étape recommandée est `/develop modèle de données` pour la fonctionnalité 3 du [plan Fondations](fondations.md), dont la spécification a été validée après relecture indépendante et corrections. Les conventions et contrôles automatiques sont terminés. Les critères AC-1 à AC-7 du socle sont validés ; sa couverture permanente partielle a été acceptée. La révocation de l'ancien jeton partagé reste une recommandation reportée et non un critère.
