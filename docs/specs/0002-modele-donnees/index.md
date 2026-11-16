# 0002. Modèle de données

**Date**: 2026-11-16
**Status**: Proposed

## Summary

Un compte possède plusieurs CV, chacun organisé en variantes et versions. Les traitements travaillent sur une version précise et réservent des crédits avant de produire leur résultat. PostgreSQL garantit les liens de propriété, les mouvements financiers et les effets uniques malgré les reprises. Les fichiers privés restent dans R2, avec une purge explicite après suppression.

## Decision

**Chosen option**: modèle relationnel pour les identités, relations, traitements et finances ; contenu de chaque version de CV dans un document JSON structuré et versionné. Les écritures sensibles passent par des fonctions SQL transactionnelles, sans nouvel ORM ni fournisseur (basis: [socle](../0001-architecture-socle-executable/index.md), [conventions](../../../AGENTS.md)).

Cette spécification couvre la fonctionnalité 3 de [Fondations](../../scope/fondations.md), commune aux quatre workspaces. Elle définit le contrat de persistance et ses opérations, pas les écrans, l’intégration IA, les moteurs PDF/Word ni le prestataire de paiement. Les fonctions de domaine ci dessous constituent la surface de cette fondation ; les futures spécifications de parcours fixeront leurs routes HTTP. Les exemples de validation utilisent des données synthétiques.

La structure `docs/specs/<numéro>-<nom>/` suit les consignes du dépôt. Le contenu a été validé par le porteur du projet le 2026-11-16, après relecture indépendante et intégration des six corrections approuvées. Le statut reste `Proposed` jusqu’au début de la réalisation et ne deviendra `Accepted` qu’après réalisation et vérification.

## Requirements

Les critères suivants sont dérivés des réponses de conception. Un utilisateur doit retrouver ses CV et versions sans exposer ceux d’un autre compte, comprendre ses crédits et pouvoir supprimer ses documents selon les règles annoncées. Un opérateur doit résoudre les incidents sans modifier silencieusement l’historique.

| ID | Résultat observable |
|---|---|
| AC-1 | Deux comptes ne peuvent ni lire ni relier leurs données privées ; un administrateur applicatif ne consulte aucun contenu de CV |
| AC-2 | Un CV contient plusieurs variantes générales, linguistiques ou adaptées ; chacune a son brouillon et sa version courante ; restaurer crée une nouvelle version sans supprimer l’historique |
| AC-3 | Une sauvegarde obsolète est refusée sans perte du travail local ; une proposition IA reste liée à sa version de départ, consultable même refusée, et ne remplace le travail courant qu’après validation explicite |
| AC-4 | Le contenu structuré couvre les rubriques retenues ; les originaux restent téléchargeables ; une révision de modèle et ses réglages sont figés dans chaque version et ne changent pas avec le catalogue |
| AC-5 | Les 20 crédits de bienvenue sont attribués après vérification de l’email, une seule fois par compte ; aucun crédit n’expire ; le registre explique chaque mouvement et son lot |
| AC-6 | Un lancement réserve le tarif accepté ; les traitements simultanés ne rendent pas le disponible négatif ; un succès débite une seule fois, même si sa proposition est refusée, et un échec définitif libère la réservation |
| AC-7 | Requêtes, messages et confirmations de paiement répétés n’ajoutent aucun effet métier ; un nouvel essai après échec définitif constitue une nouvelle demande au tarif alors accepté |
| AC-8 | Les reprises techniques sont bornées ; une échéance par service permet de terminer un traitement bloqué et de libérer ses crédits ; un résultat tardif ne réactive pas un traitement terminal |
| AC-9 | La suppression d’un CV ou du compte est refusée pendant tout traitement actif ; sinon l’accès est retiré immédiatement, puis les contenus et fichiers sont purgés par une procédure relançable |
| AC-10 | Chaque achat conserve pack, prix, monnaie et quantité ; un remboursement retire les crédits concernés encore disponibles et bloque les nouveaux traitements payants si les crédits à reprendre ont déjà été consommés |
| AC-11 | Les ajustements, remboursements et résolutions portent auteur, motif et références ; les traces financières peuvent survivre à la suppression du compte sans conserver le contenu du CV |
| AC-12 | Une validation de persistance traverse compte vérifié, CV, version, réservation, résultat et débit ; les migrations métier préservent la démonstration existante |

## Feature design

### Conventions de données et propriété

Les noms ci dessous sont les noms SQL cibles. Sauf précision contraire : `id uuid` primaire généré par PostgreSQL, `created_at timestamptz` obligatoire produit en base. Les dates sont des instants UTC. `?` indique un champ nullable ; les autres champs sont obligatoires. Les compteurs sont des entiers non négatifs. Les montants monétaires sont des `bigint` en unité mineure, jamais des flottants ; les API les sérialisent en chaînes décimales. Les crédits sont des entiers `bigint`, également sérialisés en chaînes.

Chaque table de contenu porte `owner_id uuid` et une référence au profil. Des clés étrangères composites `(owner_id, parent_id)` et, pour les versions, `(owner_id, document_id, variant_id, id)`, empêchent les liens entre propriétaires ou CV différents. Les identifiants fournis par le client ne suffisent jamais à déterminer un propriétaire. Le catalogue est global ; la révision référencée par un CV doit être publiée au moment de sa sélection.

Les relations financières utilisent un `wallet_id` stable. Le lien `wallets.user_id` vers Auth est nullable pour permettre la suppression du compte sans cascade financière. Aucun email, nom, texte de CV ou offre ne figure dans les tables de portefeuille. Une référence à un traitement supprimé peut devenir nulle ; la clé de déduplication financière et le motif restent présents.

### Comptes, documents et présentation

| Table | Champs spécifiques et contraintes |
|---|---|
| `profiles` | `user_id uuid` primaire → `auth.users`, `locale text` (`fr`, `en`), `state text` (`active`, `suspended`, `deleting`), `created_at`, `updated_at` ; pas de copie du mot de passe ou de l’email |
| `documents` | `owner_id`, `name text` non vide, `state text` (`active`, `deleting`), `deletion_requested_at timestamptz?`, `updated_at` |
| `variants` | `owner_id`, `document_id`, `name text`, `language text` (`fr`, `en` au lancement), `kind text` (`general`, `translation`, `adaptation`), `current_version_id uuid?`, `updated_at` ; plusieurs variantes de même langue sont permises |
| `target_offers` | `owner_id`, `document_id`, `variant_id` unique, `text text` non vide, `job_title text?`, `company text?`, `url text?` ; exactement une offre par adaptation, aucune pour les autres variantes |
| `drafts` | `owner_id`, `document_id`, `variant_id` unique, `base_version_id uuid?`, `revision bigint` initial 0, `content jsonb`, `template_revision_id uuid?`, `settings jsonb`, `updated_at` |
| `versions` | `owner_id`, `document_id`, `variant_id`, `number bigint`, `source_version_id uuid?`, `origin text` (`import`, `manual`, `ai`, `restore`, `translation`), `content jsonb`, `template_revision_id uuid`, `settings jsonb` ; unicité `(variant_id, number)` ; lignes immuables sauf purge |
| `proposal_decisions` | `owner_id`, `document_id`, `variant_id`, `proposed_version_id uuid` unique, `decision text` (`accepted`, `rejected`), `decided_at timestamptz` ; absence de ligne = en attente ; le choix initial est immuable |
| `templates` | `code text` unique, `name_fr text`, `name_en text`, `enabled boolean` |
| `template_revisions` | `template_id uuid`, `number bigint`, `renderer_key text`, `renderer_version text`, `settings_schema jsonb`, `default_settings jsonb`, `state text` (`draft`, `published`) ; unicité `(template_id, number)` ; publication rend la révision immuable |
| `files` | `owner_id`, `document_id`, `job_id uuid?`, `role text` (`original`, `export`, `temporary`), `object_key text` unique, `media_type text`, `size_bytes bigint`, `sha256 text?`, `state text` (`pending`, `available`, `purging`), `upload_expires_at timestamptz?` |
| `exports` | `owner_id`, `document_id`, `version_id uuid`, `job_id uuid` unique, `file_id uuid` unique, `format text` (`pdf`, `docx`) ; le fichier est disponible avant validation du succès |

Un brouillon peut précéder la première version. Sa publication exige une révision de modèle publiée. Une version source peut venir d’une autre variante du même CV, ce qui permet traduction, adaptation et restauration ; elle ne peut pas venir d’un autre CV. La version courante appartient toujours à sa propre variante. Les cycles de provenance sont impossibles : seule une version déjà existante peut servir de source et cette référence n’est jamais modifiée.

La création d’une adaptation crée sa variante, son offre et son brouillon dans une seule transaction. Le texte de l’offre devient immuable après lancement du premier traitement sur cette adaptation. Une autre offre demande une autre adaptation, afin de ne pas réécrire le contexte de résultats précédents. Aucun suivi de candidature, statut de recrutement ou envoi automatique n’est ajouté.

Une validation de brouillon crée une version et avance le pointeur courant atomiquement. Restaurer copie le contenu, la présentation et la référence source dans une nouvelle version de la variante cible. Accepter une proposition vérifie le pointeur courant et le compteur du brouillon attendus ; une divergence donne un conflit et exige une nouvelle confirmation sur l’état réellement affiché. Un brouillon modifié n’est pas écrasé. Une proposition refusée reste restaurable comme nouvelle version, sans réécrire le refus initial.

Retirer un modèle du catalogue interdit ses nouvelles sélections, mais conserve ses révisions et les moteurs nécessaires à la lecture et à l’export des versions existantes. Changer de modèle ou de réglages passe par le brouillon puis crée une nouvelle version. Les originaux sont conservés après extraction réussie ; les fichiers temporaires sont purgés après traitement. Une source d’import rejetée n’est pas un original durable.

### Format du contenu

Le contrat partagé `CvContentV1` a la forme `{schemaVersion: 1, contact, headline, summary, sections}`. `headline` et `summary` sont des chaînes, éventuellement vides. `contact` contient `fullName`, `email`, `phone`, `location` (chaînes ou null) et `links` (tableau `{id, label, url}`). L’import ne complète jamais une donnée absente par une invention.

`sections` est une liste ordonnée de `{id, kind, title, items}`. `kind` vaut `experience`, `education`, `skills`, `languages`, `certifications`, `projects` ou `custom`. Chaque entrée a un `id uuid` stable et les champs suivants :

| Rubrique | Champs d’une entrée, en plus de `id` |
|---|---|
| Expérience | `title text?`, `organization text?`, `location text?`, `startDate text?`, `endDate text?`, `current boolean`, `description text`, `highlights text[]` |
| Formation | `qualification text?`, `institution text?`, `location text?`, `startDate text?`, `endDate text?`, `current boolean`, `description text` |
| Compétence | `name text`, `level text?` |
| Langue | `name text`, `level text?` |
| Certification | `name text`, `issuer text?`, `date text?`, `url text?`, `description text` |
| Projet | `name text`, `role text?`, `startDate text?`, `endDate text?`, `url text?`, `description text`, `highlights text[]` |
| Rubrique libre | `title text?`, `body text` |

Les dates partielles sont conservées comme texte fourni, sans inventer de jour ou de mois. Les tableaux peuvent être vides ; `name` est non vide lorsqu’une entrée nommée existe. Les champs inconnus sont refusés, les identifiants d’entrées sont uniques dans une version. Le texte reste du texte, jamais du HTML exécutable. Une URL facultative présente doit utiliser `http` ou `https`. Les rubriques libres permettent de préserver un contenu non classé. La validation TypeScript partagée et les contrôles SQL de forme refusent les formats inconnus ; la limite initiale d’un contenu est 1 Mio UTF-8, recommandation technique révisable avant activation d’un service d’import. Ce plafond est distinct de la taille du fichier source.

### Traitements et résultats

| Table | Champs spécifiques et contraintes |
|---|---|
| `services` | `code text` unique parmi `import`, `ats`, `optimize`, `adapt`, `export_pdf`, `export_docx`, `enabled boolean`, `current_revision_id uuid?` |
| `service_revisions` | `service_id`, `number bigint`, `cost_credits bigint`, `max_attempts integer > 0`, `deadline_seconds integer > 0`, `attempt_timeout_seconds integer > 0`, `lease_seconds integer > 0`, `input_contract text`, `result_contract text` ; unicité `(service_id, number)` ; immuable dès activation |
| `jobs` | `owner_id`, `document_id`, `variant_id uuid?`, `input_version_id uuid?`, `input_file_id uuid?`, `service_revision_id`, `request_key uuid`, `request_fingerprint text`, `status text`, `attempt_count integer`, `lease_token uuid?`, `lease_until timestamptz?`, `deadline_at timestamptz`, `completed_at timestamptz?`, `error_code text?` ; unicité `(owner_id, request_key)` |
| `analyses` | `owner_id`, `document_id`, `input_version_id`, `job_id` unique, `method_version text`, `score numeric` entre 0 et 100, `criteria jsonb`, `findings jsonb`, `limitations text[]` ; immuable |
| `job_results` | `job_id` primaire, `proposed_version_id uuid?`, `analysis_id uuid?`, `export_id uuid?`, `imported_version_id uuid?` ; exactement une référence, du type attendu par le service |

L’import prend un fichier disponible ; les autres services prennent une version publiée. Une adaptation exige une variante d’adaptation et son offre. Les exports et imports coûtent zéro ; ATS, optimisation et adaptation IA ont un tarif strictement positif. Les prix commerciaux ne sont pas fixés par cette spécification. Les analyses et optimisations ne s’exécutent jamais sur un brouillon mutable. Les contrats détaillés de score et de sortie des fournisseurs appartiennent aux spécifications du parcours ; un service ne peut être activé sans validateurs de ses contrats.

Pour l’import, `start_job` exige une variante cible, une révision de modèle publiée et des réglages valides, ainsi que les valeurs attendues du compteur du brouillon et du pointeur courant. Sous verrou, il contrôle ces valeurs et conserve dans `jobs` les champs immuables `import_template_revision_id uuid?`, `import_settings jsonb?`, `import_draft_revision bigint?` et `import_current_version_id uuid?`. Les trois premiers sont obligatoires pour un import et nuls pour les autres services ; le dernier peut être nul si aucune version courante n’existe. Le résultat importé prend sa présentation dans ces champs, jamais dans le brouillon au moment du succès. Le modèle synthétique de validation possède sa propre révision publiée, sans préjuger du modèle commercial.

Le succès de l’import crée toujours sa version et la rend consultable. Dans la même transaction, il ne l’adopte comme version courante et n’aligne le brouillon que si compteur et pointeur correspondent encore aux valeurs figées au lancement ; le compteur du brouillon est alors incrémenté. Sinon, le traitement réussit mais le travail courant reste intact. L’utilisateur peut ensuite appeler `adopt_import`, avec les compteurs et pointeurs actuellement affichés, pour adopter explicitement cette version et remplacer son brouillon après confirmation. Une nouvelle divergence refuse l’adoption sans modification. `job_results` conserve pour l’import `import_adopted_at timestamptz?` ; une adoption réussie est unique, sa répétition ne réapplique jamais l’ancien contenu après de nouvelles modifications.

Les états sont `queued → running → succeeded` ou `failed`, avec `running → queued` pour un nouvel essai technique. Les états terminaux sont immuables. `queued` et `running` sont actifs et bloquent la suppression, y compris pour un service gratuit. L’échéance absolue est calculée à la création à partir de la révision de service et ne se prolonge jamais lors d’une reprise.

La création réserve les crédits et insère tâche et message dans une transaction. Le message contient seulement `{version: 1, jobId}`. Le bail autorise une tentative ; renouvellement avant expiration, borné par `deadline_at`. Un jeton expiré ou remplacé ne confirme aucun résultat. Avant de débiter, la confirmation vérifie résultat validé, références disponibles, bail courant et échéance non dépassée ; elle publie le résultat, débite les allocations et termine la tâche dans la même transaction. Un résultat disponible est facturé même si l’utilisateur refuse ensuite sa proposition.

Le processus lance une réconciliation au démarrage puis toutes les 30 secondes : sous verrou, terminer les tâches arrivées à leur échéance ou ayant épuisé leurs essais sans bail valide, libérer les réservations et archiver leurs messages. Une tâche sans message ni bail valide est remise en file tant que ses limites le permettent, sinon terminée. Une panne de base retarde cette réconciliation ; aucune garantie de délai n’est annoncée pendant une indisponibilité. Un résultat tardif est rejeté et ses fichiers temporaires sont purgés. Après reprise du service, le blocage de suppression prend fin avec cette réconciliation.

Les tentatives externes ne sont pas exactement uniques : un fournisseur IA peut avoir été appelé avant une panne. Utiliser sa clé d’idempotence lorsqu’elle existe ; le produit ne facture qu’un seul résultat logique. Chaque tentative écrit dans une clé R2 distincte comprenant le jeton de bail ; seul le fichier accepté est publié. Un ancien processus ne peut donc pas écraser le résultat d’une tentative récente. Les fonctions de file et de bail suivent le principe du socle, avec une file métier distincte (basis: [API Queues](https://supabase.com/docs/guides/queues/api)).

### Portefeuille et commerce

| Table | Champs spécifiques et contraintes |
|---|---|
| `wallets` | `user_id uuid?` unique → Auth avec `ON DELETE SET NULL`, `state text` (`active`, `blocked`, `closed`) ; pas de solde mutable indépendant du registre |
| `credit_lots` | `wallet_id`, `origin text` (`welcome`, `purchase`, `admin_grant`), `purchase_id uuid?`, `funding_payment_id uuid?` unique, `initial_quantity bigint > 0`, `consumption_class text` (`gift`, `purchased`) ; un seul lot de bienvenue par portefeuille, un seul lot par achat ; achat et paiement créditant obligatoires pour `purchase`, nuls sinon ; clé étrangère composite garantissant que le paiement appartient à cet achat |
| `credit_movements` | `wallet_id`, `lot_id`, `delta bigint` non nul, `kind text` (`grant`, `consume`, `refund_revoke`, `admin_adjust`), `operation_key text` unique, `job_id uuid?`, `refund_id uuid?`, `audit_id uuid?`, `reason_code text` ; immuable hors politique de conservation approuvée |
| `credit_reservations` | `wallet_id`, `job_id uuid?` unique, `operation_key text` unique et durable, `quantity bigint > 0`, `state text` (`held`, `captured`, `released`), `resolved_at timestamptz?` ; `job_id` obligatoire tant que la réservation est `held`, détachable seulement lors de la purge d’une tâche terminale |
| `credit_allocations` | Clé primaire `(reservation_id, lot_id)`, `quantity bigint > 0` ; lots du même portefeuille que la réservation |
| `packs` | `code text` unique, `name_fr text`, `name_en text`, `enabled boolean`, `current_revision_id uuid?` |
| `pack_revisions` | `pack_id`, `number bigint`, `credits bigint > 0`, `amount_minor bigint > 0`, `currency text` code à trois lettres, `currency_exponent integer` entre 0 et 3 ; unicité `(pack_id, number)` ; immuable |
| `purchases` | `wallet_id`, `pack_revision_id`, `request_key uuid`, `request_fingerprint text`, `credits bigint`, `amount_minor bigint`, `currency text`, `currency_exponent integer`, `state text` (`pending`, `paid`, `partially_refunded`, `refunded`) ; unicité `(wallet_id, request_key)` |
| `payments` | `purchase_id`, `provider text`, `provider_account text`, `external_payment_id text`, `expected_amount_minor bigint > 0`, `expected_currency text`, `registration_key uuid` unique, `status text` (`pending`, `failed`, `confirmed`), `confirmed_at timestamptz?` ; unicité `(provider, provider_account, external_payment_id)` ; rattachement immuable |
| `payment_events` | `payment_id uuid?`, `provider text`, `provider_account text`, `external_event_id text`, `external_payment_id text`, `external_purchase_ref text?`, `event_type text`, `amount_minor bigint`, `currency text`, `payload_fingerprint text`, `received_at timestamptz`, `processing_state text` (`received`, `applied`, `review`), `reason_code text?` ; unicité fournisseur, compte et événement ; données normalisées minimales, pas de corps brut contenant des données personnelles |
| `refunds` | `payment_id`, `external_refund_id text`, `amount_minor bigint > 0`, `credits_to_revoke bigint >= 0`, `policy_version text`, `audit_id uuid` obligatoire, `state text` (`pending`, `applied`, `review`) ; unicité `(payment_id, external_refund_id)` |
| `financial_incidents` | `wallet_id`, `refund_id uuid?`, `funding_payment_id uuid?`, `excess_payment_id uuid?`, `kind text`, `unrecovered_credits bigint >= 0`, `state text` (`open`, `resolved`), `resolution_code text?`, `resolution_audit_id uuid?` ; au plus un incident de chaque type par remboursement ; pour un double paiement, deux paiements distincts du même achat obligatoires et unicité `(kind, excess_payment_id)` |
| `admin_audit` | `actor_kind text` (`user`, `service`), `actor_user_id uuid?`, `actor_ref uuid`, `service_code text?`, `source_event_id uuid?`, `action text`, `target_type text`, `target_id uuid`, `reason text` non vide, `request_key uuid` unique, `created_at` ; journal append only, motif sans contenu CV ; acteur humain issu de la session ou identité de service issue de la configuration de confiance |

Le solde comptable est la somme des mouvements. Le réservé est la somme des allocations encore `held`. Le disponible est leur différence. Les quantités par lot et portefeuille restent non négatives. Chaque attribution crée lot et mouvement positif atomiquement. Une réservation n’est pas un débit ; sa capture crée les mouvements négatifs, sa libération ne crée aucun crédit supplémentaire.

Les lots offerts (`welcome`, `admin_grant`) sont consommés avant les lots achetés ; dans chaque classe, ordre `(created_at, id)`. Les crédits n’expirent pas. Les ajustements négatifs portent sur les quantités disponibles uniquement, selon ce même ordre. Une correction du registre ajoute une opération compensatrice avec motif et référence ; elle ne modifie pas l’ancienne ligne.

L’attribution de bienvenue vérifie l’utilisateur Auth réel et `email_confirmed_at`, puis crée au plus un lot de 20 crédits. Elle est invoquée lors de l’initialisation du compte et réessayable aux connexions ultérieures ; elle ne dépend pas d’un champ envoyé par le navigateur. La garantie est par compte Auth, pas par personne physique : la prévention des réinscriptions abusives reste une décision commerciale distincte.

Un tarif est accepté par identifiant de révision et montant attendu. Si la révision n’est plus la révision active au lancement, la demande échoue avec `price_changed` avant toute réservation ; le client présente le nouveau tarif. Une tâche déjà créée conserve son coût et ses limites. Une même clé et les mêmes paramètres renvoient la tâche existante ; une même clé avec un contenu différent donne `idempotency_conflict`. Un échec définitif n’est pas réinitialisé : relancer exige une nouvelle clé.

L’adaptateur de confiance appelle `register_payment_attempt` après obtention de l’identifiant du prestataire : achat, fournisseur, compte marchand, identifiant externe et clé d’enregistrement. L’opération copie le montant et la monnaie de l’achat comme valeurs attendues ; elle contrôle que le compte marchand appartient à la configuration autorisée de l’adaptateur. Une répétition identique retourne la tentative existante ; réaffecter une même identité externe à un autre achat est refusé. Cette opération peut rattacher tardivement une tentative initiée avant clôture du portefeuille, sans autoriser de nouvel achat.

Une confirmation authentifiée est comparée à cette tentative enregistrée : fournisseur, compte marchand, identifiant, montant et monnaie. L’événement seul ne crée jamais de rattachement à un achat. La première confirmation valide attribue le lot avec son `funding_payment_id` dans la même transaction que la transition de l’achat. Les événements répétés sont sans effet. Un deuxième paiement réellement confirmé pour le même achat crée un incident référençant le paiement créditant et le paiement excédentaire, sans second lot ; son règlement est administratif. Un événement tardif `failed` ne fait pas revenir un paiement confirmé en échec. Une confirmation non encore rattachable reste `review` ; l’enregistrement de la tentative puis la réconciliation périodique reprennent les événements correspondants, sous les mêmes contrôles et contraintes d’unicité, sans nouvelle réception nécessaire.

Seul le remboursement du paiement créditant peut reprendre les crédits du lot. Son remboursement intégral vise tous les crédits de ce lot ; un remboursement partiel exige une quantité explicitement calculée par une politique commerciale versionnée, jamais déduite implicitement d’un arrondi monétaire. Tant que cette politique n’existe pas, la demande partielle reste en revue, sans mouvement automatique. Le remboursement d’un paiement excédentaire impose `credits_to_revoke = 0`, avec la règle versionnée `excess_payment_v1` : aucun mouvement de crédits, aucun blocage lié à une consommation et aucun changement de l’état remboursé de l’achat légitime. Les montants remboursés cumulés sont bornés par paiement ; les crédits repris cumulés sont bornés par lot crédité. L’état de remboursement de l’achat suit uniquement le paiement créditant. L’incident de double paiement conserve sa résolution auditée.

Chaque remboursement crée son audit dans la transaction de son enregistrement, y compris s’il reste en revue. Une action administrative exige acteur de session et motif non vide. Un remboursement reçu du prestataire utilise l’identité de service enregistrée pour l’adaptateur, l’événement source et une raison normalisée fournie par celui ci, ou `provider_refund` en l’absence de raison plus précise. L’acteur n’est jamais accepté depuis le corps d’une requête utilisateur. `refunds.audit_id` est obligatoire et chaque mouvement de reprise référence cet audit. La clé externe de remboursement retrouve la même ligne et le même audit lors d’une répétition ; des paramètres contradictoires donnent `refund_conflict`. Les étapes ultérieures ajoutent, si nécessaire, un audit de résolution distinct sans modifier l’attribution initiale.

Lors de l’application, retirer les crédits ciblés disponibles du lot d’achat. Si des réservations empêchent ce retrait, bloquer temporairement les nouveaux traitements payants et conserver le remboursement `pending` ; réévaluer après chaque capture ou libération, puis par réconciliation périodique. Les traitements déjà réservés peuvent terminer. Le manque effectivement consommé crée un incident et maintient le portefeuille bloqué. Le solde ne devient pas négatif et aucun autre lot n’est débité pour compenser. Les recharges restent possibles mais ne débloquent pas automatiquement le compte. Une résolution administrative documente récupération externe ou perte acceptée ; le portefeuille ne redevient actif que sans incident bloquant ni remboursement en attente de retrait.

### Atomicité, verrous et déduplication

Toutes les mutations utilisateur et tout nouveau lancement vérifient l’état actif du profil. La finalisation et la réconciliation des tâches déjà engagées restent possibles après suspension afin de résoudre leurs réservations ; les opérations financières de confiance restent possibles pour un portefeuille clôturé, sans rétablir d’accès. Ordre de verrou commun : profil s’il existe, documents par UUID, variantes par UUID, portefeuille, achats/paiements, tâches par UUID, réservations et lots par UUID. Une opération qui n’utilise qu’un sous ensemble respecte cet ordre. La suppression du compte verrouille d’abord le profil ; aucune tâche ne peut être créée pendant son passage à `deleting`.

La ligne portefeuille sert de verrou de sérialisation, même si le solde est calculé. Après verrou, recalculer disponible et réservations dans la même transaction que leur modification. Un contrôle effectué seulement dans le web ne suffit pas (basis: [PostgreSQL Explicit Locking](https://www.postgresql.org/docs/16/explicit-locking.html)). Les publications de versions verrouillent la variante et attribuent le prochain numéro sous ce verrou.

Les mutations utilisateur utilisent une clé UUID. Une table `mutation_receipts` conserve `(owner_id, operation, request_key)` unique, l’empreinte SHA-256 des paramètres normalisés, les identifiants de résultat et la révision retournée, jamais le contenu. Le reçu est écrit dans la transaction de l’effet. Une répétition identique rend le résultat initial ; une empreinte différente est refusée. Les reçus liés à un CV sont purgés avec lui, sauf sa clé de création : avant retrait du reçu, créer atomiquement `deleted_document_creations(owner_id uuid, request_key uuid, deleted_at timestamptz)`, clé primaire `(owner_id, request_key)`. Cette trace minimale ne conserve ni nom, ni contenu, ni empreinte du contenu, ni identifiant du CV. `create_document` recherche cette clé avant toute création et retourne toujours `resource_deleted` lorsqu’elle existe, même si les paramètres ont changé. La suppression du compte purge ces traces. Les autres requêtes qui référencent le CV supprimé donnent `not_found`, sans recréation. Les clés financières restent dans le registre et les contraintes d’origine. Les opérations de maintenance utilisent l’identifiant de cible et son état comme clé naturelle.

### Surface des opérations

Cette surface est un contrat de fonctions serveur et SQL, pas une nouvelle API publique. `key` est une UUID de requête. `expected` regroupe les compteurs et pointeurs affichés à l’utilisateur. Les fonctions utilisateur tirent leur identité de la session ; les fonctions de processus n’acceptent que des tâches qu’elles sont habilitées à traiter.

| Opération | Entrées essentielles | Sortie et erreurs significatives | Autorisation |
|---|---|---|---|
| `ensure_account` | `locale` (`fr` ou `en`), `key` | Profil, portefeuille, bonus attribué ou déjà présent ; `account_inactive`, `email_unverified` pour le bonus | Utilisateur connecté |
| `create_document` | `name`, `language`, `key` | CV, variante générale, brouillon ; `invalid_input`, `resource_deleted` | Utilisateur actif |
| `create_variant` | `documentId`, `kind`, `language`, `sourceVersionId?`, offre si adaptation, `key` | Variante, brouillon ; `not_found`, `invalid_offer` | Propriétaire |
| `register_file` / `complete_file` | CV, rôle original, métadonnées, clé ; puis ID et métadonnées vérifiées côté serveur | Fichier pending puis available ; `expired_upload`, `invalid_file` | Propriétaire ; validation finale par serveur habilité |
| `save_draft` | Variante, contenu, présentation, `expected.revision`, `key` | Nouvelle révision ; `draft_conflict`, `invalid_content` | Propriétaire |
| `publish_draft` | Variante, `expected.revision`, `expected.currentVersionId`, `key` | Version et brouillon aligné ; `draft_conflict`, `version_conflict` | Propriétaire |
| `restore_version` | Source, variante cible, `expected`, `key` | Nouvelle version ; `version_conflict`, `draft_conflict` | Propriétaire |
| `decide_proposal` | Proposition, choix, `expected`, `key` | Décision, version courante ; `already_decided`, `version_conflict`, `draft_conflict` | Propriétaire |
| `start_job` | Service, révision tarifaire et coût attendus, version ou fichier, variante cible si nécessaire, `key` ; pour import, présentation et `expected` obligatoires | Tâche et réservation éventuelle ; `insufficient_credits`, `wallet_blocked`, `price_changed`, `service_disabled`, `invalid_presentation`, `draft_conflict`, `version_conflict` | Propriétaire actif |
| `adopt_import` | Tâche d’import réussie, `expected.revision`, `expected.currentVersionId`, `key` | Version courante et brouillon aligné ; `draft_conflict`, `version_conflict`, `already_adopted` sans modification | Propriétaire |
| `claim_job` / `renew_job` | Tâche, puis jeton de bail | Bail, entrée autorisée ; `lease_conflict`, `job_terminal` | Processus dédié |
| `complete_job` / `fail_attempt` | Tâche, bail, résultat validé ou code d’erreur | État et capture ou reprise/libération ; `stale_lease`, `deadline_exceeded`, `invalid_result` | Processus dédié |
| `reconcile_jobs` | Curseur et limite | Tâches expirées ou réparées ; indisponibilité DB réessayable | Processus dédié |
| `create_purchase` | Révision du pack, prix/monnaie/quantité attendus, `key` | Achat pending ; `pack_changed`, `pack_disabled` | Propriétaire actif |
| `register_payment_attempt` | Achat, fournisseur, compte marchand, identifiant externe, clé d’enregistrement | Tentative et rapprochement des événements en revue ; `payment_binding_conflict`, `provider_account_forbidden` | Adaptateur de confiance |
| `apply_payment_event` | Événement normalisé vérifié, identifiants fournisseur, montant, monnaie | État, lot éventuel, incident ; `payment_mismatch`, `event_conflict` | Adaptateur de paiement de confiance, jamais navigateur |
| `apply_refund` | Paiement, référence, montant, quantité, version de politique, motif ; événement source pour l’adaptateur | Retrait, attente ou incident et audit ; `refund_exceeds_payment`, `policy_required`, `reason_required`, `refund_conflict` | Adaptateur habilité ou administration financière |
| `adjust_credits` / `resolve_incident` | Cible, quantité ou résolution, motif, `key` | Mouvements et audit ; `reserved_credits`, `reason_required` | Administration financière |
| `request_document_deletion` / `request_account_deletion` | Cible ou compte courant, `key` | Suppression engagée ; `active_jobs` sans modification | Propriétaire |
| `run_purge` | Lot de demandes et curseur | Avancement durable, reprises ; erreur R2/DB réessayable | Administration de purge |
| Lectures paginées | Ressource, curseur `(created_at,id)`, limite 1 à 100, défaut 20 | Résultats, prochain curseur ; `not_found` pour toute ressource étrangère | Propriétaire ; catalogue publié accessible selon futur parcours |

Les fonctions renvoient des codes métier stables, pas d’erreurs brutes du fournisseur. Les futures routes mapperont notamment conflit vers HTTP 409, entrée invalide vers 400/422 et ressource étrangère vers 404. Un `read_job` ne contient pas le résultat privé ; le contenu est lu par une opération propriétaire distincte. Un administrateur technique ne peut pas appeler cette dernière.

### Origine des valeurs

| Valeur | Source |
|---|---|
| Propriétaire, état du compte, email confirmé | Session vérifiée, profil en base, `auth.users.email_confirmed_at` |
| Langue de l’interface | Profil ; à la création, choix explicite, sinon `fr` |
| Langue de variante, nom du CV, texte de l’offre | Entrées utilisateur validées ; aucune déduction de nationalité |
| Contenu et présentation d’une version | Brouillon validé, version restaurée ou résultat IA validé ; révision de modèle et réglages référencés |
| Présentation et adoption d’un import | Révision publiée et réglages fournis au lancement, figés dans la tâche ; compteurs initiaux comparés à la variante au succès, puis confirmation explicite en cas de divergence |
| Score et constats | Résultat validé du moteur ATS identifié par `method_version`, pour la version d’entrée exacte |
| Tarif et limites de tâche | Révision de service acceptée ; échéance calculée par PostgreSQL à la création |
| Prix, monnaie, quantité d’achat | Révision de pack confirmée ; copies figées dans l’achat |
| Solde et disponible | Somme des mouvements, moins allocations réservées |
| Lot et débit | Politique de consommation par classe puis ancienneté ; allocations figées au lancement |
| Clés R2 | Identifiants en base et rôle du fichier ; jamais un chemin arbitraire du navigateur |
| Identité d’un paiement et authenticité | Tentative rattachée par `register_payment_attempt`, valeurs attendues copiées de l’achat ; événement vérifié par l’adaptateur puis rapproché, jamais le retour navigateur |
| Quantité à reprendre lors d’un remboursement | Lot lié au paiement créditant pour un total ; politique versionnée pour un partiel ; zéro pour un paiement excédentaire |
| Auteur et motif d’un remboursement | Session administrative et motif obligatoire, ou identité de service de l’adaptateur et raison normalisée liée à l’événement ; audit référencé par remboursement et mouvements |
| Auteur et motif d’administration | Identité administrative vérifiée et motif obligatoire fourni à l’action |

### Accès, suppression et exploitation

RLS (filtrage des lignes selon l’utilisateur) s’applique à chaque table exposée. Révoquer toutes les écritures directes aux rôles clients et processus ; les mutations passent par les fonctions autorisées. Les fonctions privilégiées fixent `search_path = ''`, qualifient les objets, vérifient explicitement propriété et état, et ne sont pas exécutables par `PUBLIC` ou `anon`. Les fonctions internes restent dans un schéma non exposé ; seuls les points RPC nécessaires sont exposés avec droits ciblés (basis: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [fonctions Supabase](https://supabase.com/docs/guides/database/functions)).

Une table privée `admin_roles(user_id, role)` attribue `support`, `finance` ou `catalog`. Aucun rôle ne donne accès au contenu de CV, aux offres, aux résultats détaillés ou aux liens de téléchargement. `support` lit états techniques et état du compte ; `finance` lit transactions et portefeuille et utilise les actions auditées ; `catalog` publie les révisions et disponibilités. Le contrôle utilise la table courante, pas les métadonnées modifiables par l’utilisateur. Les opérateurs d’infrastructure restent techniquement privilégiés, séparés des administrateurs applicatifs.

Les messages de file, journaux et audits excluent contenu CV, offre, email, secrets et URL signée. Le processus ne reçoit que les entrées nécessaires à son bail. Le rôle de traitement n’a pas les droits financiers d’administration. Aucune nouvelle variable secrète ni fournisseur n’est requis pour construire et vérifier ce modèle ; l’intégration réelle des futurs adaptateurs définira ses secrets séparément.

La suppression verrouille le profil et le CV, vérifie l’absence de toute tâche active, puis pose l’état `deleting` et crée une entrée `purge_requests(id, owner_id?, document_id?, scope, state, cursor?, last_error_code?, requested_at, completed_at?)`. Aucun travail ne peut ensuite être lancé. RLS et émission des liens refusent immédiatement le contenu. Une URL R2 déjà signée reste utilisable jusqu’à son expiration de 60 secondes, comme dans le socle ; retirer l’accès applicatif n’annule pas rétroactivement ce lien.

La purge efface les objets R2 avant de supprimer leurs métadonnées. Elle détache les références financières aux tâches terminales et conserve seulement leurs identifiants opaques de déduplication. Ensuite, une transaction SQL retire les pointeurs courants et les liens de résultat, puis efface les exports, analyses, décisions, brouillons, tâches et messages archivés, fichiers, versions, offres et variantes, dans un ordre compatible avec les clés étrangères. Elle termine par le CV et ses reçus. Les références internes de provenance sont supprimées ensemble, avec contraintes différées si nécessaire. Une absence d’objet R2 vaut succès, une erreur de service vaut reprise, jamais succès silencieux. Les clés des objets à supprimer restent disponibles jusqu’à confirmation de leur suppression. Les anciennes tentatives et uploads expirés sont couverts par le même inventaire de fichiers et une réconciliation des préfixes orphelins, sans supprimer un upload non expiré.

La suppression du compte refuse toute tâche active sur ses CV. Une fois acceptée, elle interdit les nouvelles opérations, clôt le portefeuille, purge tous les contenus, détache l’identité financière, puis supprime Auth avec le rôle administratif. Les événements financiers tardifs restent traitables via les références de paiement ; ils ne recréent ni compte ni accès. Un achat confirmé tardivement peut produire son lot dans le portefeuille clôturé, sans utilisation possible, et un incident à résoudre. Aucune suppression ne prétend révoquer à elle seule un JWT déjà émis : toutes les fonctions privées vérifient que le profil existe et est actif (basis: [gestion des utilisateurs Supabase](https://supabase.com/docs/guides/auth/managing-user-data?language=js&queryGroups=language)).

La durée des traces financières, des sauvegardes et des journaux reste à valider avant ouverture commerciale selon les décisions d’établissement. La construction ne fixe aucune durée légale et ne présente pas une suppression des données actives comme une suppression immédiate des sauvegardes. Les justificatifs commerciaux éventuels restent séparés des CV ; leur schéma nominatif ne peut pas être improvisé par cette fondation.

Indexer les clés étrangères et lectures fréquentes : `(owner_id, created_at, id)`, `(variant_id, number)`, lots/mouvements/réservations par portefeuille, achats par portefeuille/date, événements par état/date, tâches actives par échéance et bail, purges non terminées. Les listes sont paginées ; aucun cache de solde ni moteur de recherche supplémentaire. Les volumes et délais commerciaux restent à définir dans le parcours, sans promesse de capacité non mesurée.

### Scénarios critiques de vérification

| Scénario | Critères |
|---|---|
| Deux comptes, références croisées forgées, lectures et écritures directes, rôle admin tentant un téléchargement | AC-1 |
| Création, traduction, adaptation avec offre, publication, restauration, refus puis restauration d’une proposition | AC-2, AC-3, AC-4 |
| Deux onglets sauvegardent le même compteur ; proposition arrivée après modification du brouillon ; retrait du modèle utilisé | AC-3, AC-4 |
| Import sans présentation refusé ; présentation figée malgré changement du catalogue ; variante inchangée adoptée automatiquement, variante modifiée préservée puis adoption explicite ; répétition d’adoption sans réécriture | AC-2, AC-3, AC-4, AC-7 |
| Deux initialisations concurrentes après vérification email ; avant vérification aucun bonus | AC-5, AC-7 |
| Deux tâches dépasseraient ensemble le disponible ; une seule réservation admissible ; ordre des lots vérifié | AC-6 |
| Reprise après appel externe et avant confirmation SQL ; répétition de confirmation et crash après commit avant archivage | AC-6, AC-7, AC-8 |
| Expiration sans message, ancien bail, limites atteintes, reprise du processus après indisponibilité | AC-8 |
| Course lancement/suppression ; export actif gratuit ; purge R2 interrompue ; JWT ancien après suppression | AC-1, AC-9 |
| Confirmation répétée, hors ordre, montant faux, deuxième paiement pour le même achat | AC-7, AC-10 |
| Confirmation avant enregistrement de tentative puis rapprochement ; tentative réaffectée à un autre achat refusée ; remboursement du second paiement sans retrait des crédits du premier | AC-7, AC-10 |
| Remboursement avant dépense, après dépense et pendant réservation ; refus d’un partiel sans politique ; résolution auditée | AC-10, AC-11 |
| Remboursement administratif sans motif refusé ; événement prestataire attribué à son service ; répétition conservant un seul audit initial et les mêmes mouvements | AC-7, AC-11 |
| Création de CV, suppression, purge puis répétition de la clé de création : `resource_deleted`, aucun nouveau CV ; trace minimale effacée avec le compte | AC-7, AC-9 |
| Suppression du compte avec achat pending, confirmation tardive sans réouverture, conservation sans contenu CV | AC-9, AC-11 |
| Parcours synthétique complet et contrôles existants du socle inchangés | AC-12 |

## Build plan

Ces jalons construisent la fondation de persistance, selon Tracer Bullet, sans anticiper les écrans ou les intégrations des fonctionnalités suivantes. Chaque jalon ajoute seulement les migrations et contrats nécessaires au parcours qu’il vérifie ; le modèle cible reste celui de cette décision.

1. Établir le fil réel en PostgreSQL : compte vérifié, CV et variante, version structurée, portefeuille et bonus, réservation, tâche en file, résultat synthétique et débit. Inclure immédiatement droits, propriété, révision de service de validation et expiration. La configuration de validation utilise coût 1, trois tentatives, échéance 300 secondes, délai d’essai 20 secondes et bail 60 secondes, sans activer un service commercial. Vérifier avec deux utilisateurs et le processus réel. Satisfait AC-1, AC-5, AC-6, AC-7, AC-8, AC-12.
2. Élargir documents, variantes, brouillons, offres, présentation et fichiers originaux ; valider le contrat JSON partagé et les conflits de sauvegarde/restauration/proposition. Aucun moteur de traduction automatique n’est ajouté. Satisfait AC-2, AC-3, AC-4, AC-12.
3. Ajouter catalogue commercial, achats, événements, remboursements et audit, avec adaptateur de validation local de confiance ; éprouver concurrence et rapprochement. Aucun endpoint de paiement public avant la spécification du prestataire. Satisfait AC-5, AC-6, AC-7, AC-10, AC-11.
4. Traverser retrait d’accès, purge R2 puis SQL, compte Auth et événements tardifs ; éprouver interruptions et reprise de réconciliation. Les identifiants de purge et états techniques restent disponibles à l’opérateur sans contenu privé. Satisfait AC-1, AC-8, AC-9, AC-11.
5. Générer les types depuis la base migrée, exécuter contrôles du dépôt et tests de contrats sur PostgreSQL réel, consigner les preuves locales et de validation séparément, puis réaliser la revue indépendante. Vérifier que le socle `foundation_*` continue de fonctionner. Satisfait AC-1 à AC-12.

Les migrations sont additives et ne réutilisent pas les données de démonstration comme données commerciales. Avant activation d’un parcours, sa migration et ses fonctions sont vérifiées ; en cas de défaut, désactiver le service et corriger par migration suivante, sans supprimer les mouvements existants. Les tests du modèle ne remplacent pas les futurs essais fournisseurs et exports réels.

## Consequences

La séparation variantes, versions et présentation protège l’historique et les faits du CV. Les lots rendent les remboursements explicables. En contrepartie, le nombre de tables et les transactions sont plus importants qu’un simple document avec un solde mutable.

Le verrou par portefeuille sérialise ses dépenses, ce qui convient au compte individuel mais devra être mesuré si les volumes changent. Le contenu JSON nécessite un validateur versionné et des migrations explicites de format. La suppression reste indisponible pendant un traitement actif ; une supervision des échéances et des purges est donc nécessaire.

Les coûts commerciaux, délais par service et règles de remboursement partiel ne sont pas inventés ici. Leurs révisions doivent être configurées et validées avant activation. Cette fondation ne suffit pas à autoriser une ouverture commerciale.

## Follow-up

1. Fonctionnalité 5 : choisir formats et limites des fichiers, intégration Auth publique, fournisseurs IA, contrats de résultats, modèle initial, durées opérationnelles des services et routes du parcours. Conserver les invariants de cette spécification.
2. Fonctionnalités 10 et 11 : fixer coûts, prix, monnaies, marchés, prestataire, remboursements partiels et règles contre les bonus abusifs. Ne pas activer un remboursement partiel sans politique versionnée.
3. Fonctionnalités 9 et 16 : arrêter durées de conservation, justificatifs, sauvegardes, information utilisateur et gestion des paiements encore en attente lors de la suppression du compte.
4. Fonctionnalités 12 à 14 : concevoir les écrans et procédures de support, finance et catalogue à partir des autorisations présentes.
5. Fonctionnalité 17 : fixer volumes, alertes sur traitements expirés/purges bloquées, sauvegarde et restauration, puis éprouver la capacité réelle.

## Rationale

Voir [les options, les décisions et les sources officielles vérifiées](rationale.md).
