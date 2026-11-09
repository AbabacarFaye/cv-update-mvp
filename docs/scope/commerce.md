# Commerce et administration

Le [périmètre général](index.md) définit les marchés prioritaires et les décisions commerciales ouvertes. Ces fonctions prolongent le portefeuille minimal de la première tranche.

## Tranche 3 : rendre le service commercialisable

### 10. Tarification et portefeuille de crédits · planned · needs a decision

Rendre les tarifs et le solde compréhensibles, compléter le registre des mouvements et encadrer l’attribution des 20 crédits de bienvenue.

**Done when:** le bonus est attribué une seule fois par compte éligible, le coût est visible avant chaque traitement, un solde insuffisant bloque le lancement, les opérations simultanées ne rendent pas le solde négatif et l’historique explique chaque mouvement.

- [ ] Concevoir les crédits (spec) : `/architect tarification et portefeuille de crédits`

### 11. Achat de packs par mobile et carte · planned · needs a decision

Permettre de choisir un pack et de payer par les moyens disponibles dans chaque pays de vente, notamment paiement mobile et carte.

**Done when:** prix et monnaie sont affichés avant paiement, un achat confirmé recharge une seule fois le portefeuille, les paiements en attente ou échoués sont compréhensibles, les confirmations retardées et remboursements suivent des règles définies et les parcours sont validés pour les marchés retenus.

- [ ] Concevoir les achats (spec) : `/architect achat de packs par mobile et carte`

### 12. Administration des utilisateurs et crédits · planned · needs a decision

Permettre aux administrateurs autorisés de rechercher un compte, gérer son accès et ajuster son solde avec justification.

**Done when:** seuls les rôles autorisés accèdent à ces actions, chaque ajustement est tracé avec auteur et motif, aucune modification ne réécrit silencieusement l’historique et les données personnelles visibles sont limitées au besoin.

- [ ] Concevoir la gestion des comptes (spec) : `/architect administration des utilisateurs et crédits`

### 13. Administration des transactions · planned · needs a decision

Suivre les achats, rapprocher les confirmations reçues et traiter les anomalies ou remboursements selon la politique définie.

**Done when:** l’administrateur retrouve le paiement et les mouvements associés, distingue les états en attente, confirmés, échoués ou remboursés et peut résoudre une anomalie sans créditer deux fois un achat.

- [ ] Concevoir le suivi commercial (spec) : `/architect administration des transactions`

### 14. Administration des modèles et services · planned · needs a decision

Gérer la disponibilité des modèles et des services, leurs tarifs en crédits et les packs proposés. Une modification doit préserver la compréhension des opérations déjà réalisées.

**Done when:** les changements autorisés sont tracés, les nouveaux tarifs s’appliquent selon une règle explicite aux nouveaux traitements, un modèle retiré ne détruit pas les CV sauvegardés et un service indisponible ne peut pas être acheté ou lancé par erreur.

- [ ] Concevoir le catalogue administrable (spec) : `/architect administration des modèles et services`
