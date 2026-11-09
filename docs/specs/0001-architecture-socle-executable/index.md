# 0001. Architecture et socle exécutable

**Date**: 2026-11-04
**Status**: In Progress

## Summary

CV à jour utilise Next.js pour le site et un processus Node séparé pour les traitements, dans un dépôt commun. Railway exécute ces deux processus, Supabase fournit PostgreSQL, les comptes et la file de tâches, et Cloudflare R2 conserve les fichiers privés. Le premier socle démontre ce circuit avec un fichier technique sans données personnelles. Il ne réalise pas encore le parcours CV commercial.

## Decision

**Chosen option**: application modulaire commune, avec deux processus sur Railway, Supabase PostgreSQL et Auth, Supabase Queues et stockage R2 privé. Choix confirmés pendant la conception (basis: [périmètre](../../scope/index.md), maîtrise technique et réponses du porteur du projet).

Cette décision couvre la fonctionnalité 1 de [Fondations](../../scope/fondations.md). Les contrats ci dessous définissent le résultat attendu du socle. `/develop` en déduira les étapes de réalisation selon l’approche Tracer Bullet : établir le circuit complet, puis éprouver les interruptions et les accès interdits. Le statut reste `Proposed` jusqu’à la réalisation.

## Proposed stack

| Couche | Choix | Motif |
|---|---|---|
| Langage | TypeScript en mode strict | Compétence déjà maîtrisée, contrats communs |
| Web | Next.js App Router sur Node, sortie standalone | Interface et opérations serveur dans une application |
| Organisation | Workspace pnpm, `apps/web`, `apps/worker`, `packages/contracts`, `packages/server` | Deux processus, sans duplication des contrats |
| Exécution | Version Node LTS compatible avec Next.js, identique en local et dans les images | Éviter les différences de comportement |
| Données | PostgreSQL Supabase, migrations SQL versionnées, types générés | Pas d’ORM supplémentaire |
| Accès aux données | Client Supabase typé pour le web, fonctions SQL transactionnelles | Préserver les politiques d’accès et les opérations atomiques |
| Comptes | Supabase Auth et intégration serveur par cookies | Réutiliser le fournisseur retenu |
| Tâches | Supabase Queues, consommée par un processus Node Railway | Une file persistante proche des données |
| Fichiers | R2 privé, API compatible S3 et SDK AWS S3 pour Node | Stockage externe demandé et téléchargements directs |
| Hébergement | Deux services Railway, un pour le web et un pour le traitement | Même environnement Node, ressources indépendantes |
| Observation | Journaux JSON sur sortie standard, état des tâches en base, vues Railway | Diagnostic initial sans abonnement supplémentaire |
| Dépendances | Versions exactes enregistrées dans le manifeste, lockfile commité | Reproduction de la construction |

Les choix pnpm, organisation des répertoires, API HTTP interne et journaux sont des recommandations d’implémentation de cette spécification. Les versions compatibles et disponibles seront relevées et figées lors du scaffold, sans utiliser de balise flottante `latest` dans les images livrées. Les bibliothèques serveur et secrets ne peuvent pas être importés dans les composants navigateur.

## Requirements

| ID | Résultat observable |
|---|---|
| AC-1 | Après installation et configuration documentées, le site et le processus de traitement démarrent ; leur construction et le contrôle TypeScript réussissent |
| AC-2 | Un compte de validation autorisé se connecte, lance une tâche et voit son état évoluer jusqu’au téléchargement du fichier technique privé |
| AC-3 | Deux soumissions avec la même clé renvoient la même tâche ; une livraison répétée du message conserve un seul résultat logique |
| AC-4 | Un arrêt du processus pendant une tâche permet sa reprise ; un échec persistant devient visible après le nombre maximal d’essais ; un message invalide identifiable termine sa tâche en échec selon les règles de bail, et une procédure traite les tâches privées de message |
| AC-5 | Une personne non connectée ou non autorisée ne peut ni lancer la tâche, ni lire son état, ni faire émettre un lien de téléchargement ; aucun accès anonyme sans signature au fichier n’est possible ; un lien signé constitue une autorisation transmissible valable 60 secondes ; les mutations SQL directes des rôles clients et du processus sont refusées |
| AC-6 | Le développement, la validation et la future production ont des secrets et ressources distincts ; une configuration incomplète empêche le démarrage sans révéler de secret |
| AC-7 | Le même circuit est vérifié sur les vrais services de validation Railway, Supabase et R2 ; chaque tâche peut être retrouvée dans les journaux par son identifiant |

Ces critères sont dérivés des choix confirmés et ont été validés avec la spécification le 2026-11-04, après relecture indépendante et intégration des trois corrections approuvées. Aucun débit de crédits, import de CV, appel IA, export PDF ou paiement n’appartient à cette démonstration. Le modèle métier reste la fonctionnalité 3 du scope.

## Contrat du socle exécutable

### Responsabilités et circulation

Le navigateur échange avec Next.js sur la même origine. Next.js vérifie la session et l’autorisation, puis appelle une fonction SQL qui crée la tâche et son message dans une seule transaction. Le processus de traitement lit la file, écrit le résultat dans R2 et confirme le résultat en base. Le navigateur consulte l’état toutes les deux secondes tant que la page est visible. Il obtient ensuite un lien de téléchargement temporaire auprès de Next.js.

Le processus de traitement n’expose pas d’API métier publique. Le web ne lance pas de tâche longue après sa réponse HTTP. Aucun fichier durable ne repose sur le disque éphémère Railway. Les messages ne contiennent que l’identifiant de tâche et une version de contrat, jamais un CV ou un secret.

### Accès de validation

L’inscription publique est désactivée. Un compte email et mot de passe est créé par l’opérateur dans Supabase Auth ; ses identifiants ne sont pas inscrits dans le dépôt. Une table privée `foundation_allowed_users` référence son UUID Auth. Seule une opération d’administration peut modifier cette liste.

La page `/foundation` comprend la connexion, la déconnexion, le lancement, l’état, le message d’échec et le téléchargement. C’est un écran technique simple en français, utilisable au clavier, avec états explicites. Les composants visuels du produit, les traductions et le référencement attendent leurs fonctionnalités dédiées. Cette page et ses réponses privées ne sont pas mises en cache et sont exclues de l’indexation.

Chaque action serveur vérifie réellement la session Supabase et la liste d’autorisation. L’identité ne vient jamais du corps de requête. Les mutations vérifient aussi l’origine de la requête. Les tables exposées ont des politiques RLS (filtrage des lignes par utilisateur) ; les fonctions SQL vérifient `auth.uid()`, la propriété et l’autorisation. Aucune fonction privilégiée n’accepte un propriétaire arbitraire.

Les droits directs `INSERT`, `UPDATE`, `DELETE` et `TRUNCATE` sur les tables techniques et les tables de file sont révoqués pour `anon`, `authenticated` et le rôle du processus, y compris les droits hérités de `PUBLIC`. Les mutations passent exclusivement par les fonctions autorisées ; une politique RLS de propriété ne donne pas le droit de modifier un état ou de contourner un quota. Les fonctions de file accessibles au processus sont limitées à la file de démonstration. La lecture utilisateur des tâches reste limitée au propriétaire autorisé ; aucun accès client aux messages ou à la liste d’autorisation n’est accordé.

La connexion et la déconnexion utilisent des actions serveur Next.js et le client Supabase SSR. La connexion prend email et mot de passe, crée les cookies de session selon l’intégration Supabase, puis vérifie l’autorisation ; un compte refusé est déconnecté. Les opérations du processus utilisent son rôle PostgreSQL, distinct de l’identité Auth : leurs fonctions sont inaccessibles aux rôles `anon` et `authenticated`. Les fonctions privilégiées fixent leur `search_path`, qualifient les objets SQL et révoquent l’exécution par défaut. Le rôle du processus ne peut pas appeler les opérations d’administration.

### Données techniques minimales

| Entité | Champs et contraintes |
|---|---|
| `foundation_allowed_users` | `user_id uuid` primaire et référence `auth.users`, suppression en cascade ; aucune écriture client |
| `foundation_jobs` | `id uuid` généré en base, `owner_id uuid` obligatoire référence Auth, `request_key uuid` obligatoire, unicité `(owner_id, request_key)` |
| État de la tâche | `status` parmi `queued`, `running`, `succeeded`, `failed` ; `attempt_count integer` initial 0 ; `lease_token uuid` et `lease_until timestamptz` nullables |
| Résultat de la tâche | `object_key text` et `error_code text` nullables ; `created_at`, `updated_at` obligatoires, `completed_at` nullable ; toutes les dates en UTC |
| File `foundation_demo` | Message `{version: 1, job_id: uuid}` ; contenu persistant géré par Supabase Queues |

Les dates sont produites par PostgreSQL. Indexer `(owner_id, created_at)` et les tâches non terminales par état et échéance de bail. Un succès exige `object_key` et `completed_at`. Un échec exige `error_code` et `completed_at`. Une tâche terminale n’est pas relancée automatiquement. Ces tables techniques ne constituent pas le futur schéma métier.

### Surface HTTP interne

| Route | Entrée | Réponse | Contrôle et erreurs |
|---|---|---|---|
| `POST /api/foundation/jobs` | JSON `{requestKey: UUID}` | `202 {id, status}` ; doublon `200` avec la même tâche | Session, autorisation, origine ; `400`, `401`, `403`, `429`, `503` |
| `GET /api/foundation/jobs/:id` | UUID de tâche | `200 {id, status, attemptCount, createdAt, completedAt, errorCode}` | Session et propriété ; `401`, `403`, `404`, `503` |
| `GET /api/foundation/jobs/:id/download` | UUID de tâche | `200 {url, expiresAt}` | Session, propriété, succès ; `401`, `403`, `404`, `409`, `503` |
| `GET /api/health/live` | Aucune | `200 {status: "ok"}` | Public, aucun détail de configuration |

Un identifiant appartenant à un autre utilisateur renvoie `404`. Le client génère la clé de requête avant l’envoi et la conserve lors d’un nouvel essai réseau ; un lancement volontaire ultérieur en crée une nouvelle. Les erreurs ont la forme `{code, requestId}`, avec une traduction technique connue dans l’interface, sans message brut du fournisseur.

La session est exigée pour émettre le lien, pas pour l’utiliser ensuite auprès de R2. Toute personne possédant ce lien peut commencer un téléchargement pendant ses 60 secondes de validité, même sans session applicative. Après expiration, une nouvelle requête avec ce lien est refusée ; un téléchargement déjà commencé n’est pas interrompu par cette échéance. Le bucket reste privé et l’URL non signée ne donne aucun accès.

La fonction de création limite chaque compte à une tâche non terminale et dix nouvelles tâches sur une heure glissante. Un verrou transactionnel par utilisateur rend ce contrôle atomique. La recherche d’une clé existante précède le contrôle de quota, afin qu’un nouvel essai réseau reste possible.

### Origine des valeurs

| Valeur | Source |
|---|---|
| Propriétaire | Session Supabase validée, puis `auth.uid()` côté SQL |
| Autorisation | Présence dans `foundation_allowed_users` |
| ID, état, essais et dates affichés | Ligne `foundation_jobs` |
| Contenu du fichier | Octets UTF-8 fixes `CV a jour : socle operationnel.\n`, versionnés dans le code |
| Clé de fichier | `foundation/{owner_id}/{job_id}/result.txt`, calculée à partir de la ligne en base |
| Lien et échéance | Signature S3 produite côté serveur, durée fixée à 60 secondes |
| Message d’erreur visible | Correspondance versionnée entre `error_code` et texte ; aucune erreur fournisseur affichée directement |
| Corrélation | UUID de requête serveur et UUID de tâche, propagés dans les journaux |

### Reprises et échecs

Le processus traite une tâche à la fois au départ. Il interroge la file toutes les deux secondes lorsqu’elle est vide et attend progressivement jusqu’à trente secondes si la base est indisponible. Une lecture rend le message invisible pendant soixante secondes. Une fonction SQL de prise de tâche verrouille la ligne, incrémente l’essai et fournit un nouveau jeton de bail valable soixante secondes. Une tâche déjà terminale entraîne seulement l’archivage du message.

Le traitement technique est borné à vingt secondes par essai. L’écriture R2 utilise toujours la même clé et les mêmes octets. Un doublon peut réécrire ces octets, mais ne crée pas un second résultat. La confirmation SQL n’est acceptée que pour le jeton courant et un bail encore valide. Le processus archive le message après confirmation ; une panne entre confirmation et archivage est donc sans effet logique supplémentaire.

Une prise rencontrant un bail encore valide n’incrémente pas le compteur et n’exécute aucun traitement ; le message redevient disponible après son délai d’invisibilité. La fermeture de la page ne modifie pas l’état de la tâche. L’interface conserve localement son identifiant et sa clé de requête pour retrouver son état après rechargement, toujours sous contrôle du serveur.

Un bail expiré permet une nouvelle prise. Après trois prises échouées ou interrompues, la prochaine prise marque la tâche `failed` avec `attempts_exhausted` et archive le message. Un échec explicite libère la tâche pour un nouvel essai après expiration de l’invisibilité ; l’état affiché revient à `queued`. Un jeton périmé ne peut ni modifier l’état ni effacer le résultat d’un nouvel essai.

Un message invalide contenant un `job_id` UUID correspondant à une tâche existante est traité sous verrou SQL. Si la tâche est non terminale et sans bail valide, la fonction la passe à `failed`, fixe `completed_at`, libère le bail et archive le message dans la même transaction. Le code est `unsupported_contract` pour une version non prise en charge, sinon `invalid_message`. Si le bail est encore valide, le message reste dans la file jusqu’à une lecture ultérieure ; il ne peut pas interrompre un traitement en cours. Si la tâche est déjà terminale, seul le message est archivé. Un message sans tâche identifiable est archivé et journalisé avec son identifiant de file, sans conserver son contenu dans les journaux.

Une procédure réservée à l’administration recherche les tâches non terminales sans bail valide et sans message actif correspondant, y compris les messages temporairement invisibles lors de cette recherche. Elle présente les candidats à l’opérateur puis revérifie les conditions sous verrou avant de terminer les tâches retenues avec `orphaned_message`, `completed_at` et un bail libéré. Elle est relançable, journalise les identifiants traités et ne touche jamais une tâche dont le bail est valide. Cette procédure couvre notamment les messages dont le contenu ne permet plus d’identifier la tâche.

Les erreurs R2 et PostgreSQL restent temporaires jusqu’à épuisement des essais. Une erreur de configuration bloque le démarrage. À l’arrêt gracieux, le processus cesse de prendre des tâches ; une interruption forcée est couverte par le bail. Ces limites s’appliquent uniquement à la démonstration ; les futurs traitements IA et PDF devront définir leurs délais, renouvellement de bail et règles de reprise.

### Environnements et secrets

| Environnement | Ressources |
|---|---|
| Local | Web et processus Node locaux, Supabase CLI local avec Docker, bucket R2 de développement dédié |
| Validation | Deux services Railway, projet Supabase de validation, bucket R2 de validation |
| Production future | Ressources et secrets propres, démonstration désactivée ; aucune création requise dans ce socle |

Le développement est local pour l’application, Auth, PostgreSQL et Queues. Le test réel de stockage utilise le bucket R2 de développement et requiert Internet ; cette exception évite d’ajouter un émulateur S3. La validation des migrations inclut la disponibilité de l’extension de file sur les environnements Supabase retenus. Aucun accès aux données de production depuis le local ou la validation.

Les régions Railway et Supabase sont choisies proches l’une de l’autre lors du provisionnement et consignées. Ce choix vise la latence, sans présumer d’une exigence juridique. Un simple indice de localisation R2 ne garantit pas une résidence des données. Aucune donnée réelle de CV n’entre dans le socle de démonstration.

| Configuration | Usage et portée |
|---|---|
| `APP_ENV`, `APP_ORIGIN`, `FOUNDATION_DEMO_ENABLED` | Environnement, origine autorisée, activation explicite de la démo ; impossible à activer en production |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Clients Auth et données web ; valeurs publiques par nature, sans privilège administratif |
| `WORKER_DATABASE_URL` | Connexion TLS du processus avec rôle PostgreSQL dédié ; droits limités aux fonctions de prise, confirmation et file |
| `MIGRATION_DATABASE_URL` | Rôle de migration, uniquement dans la procédure d’administration, absent du runtime |
| `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Connexion et signature S3 ; credentials limités au bucket de l’environnement |

Le web reçoit seulement les permissions R2 de lecture nécessaires à la signature ; le processus reçoit celles nécessaires à l’écriture. La suppression technique utilise des credentials d’administration distincts. Les variables secrètes ne portent jamais de préfixe public Next.js. Le dépôt fournit des exemples vides et une validation de configuration ; aucun secret, mot de passe de validation ou URL signée n’est journalisé.

### Exploitation et vérification

Les journaux contiennent `timestamp`, `level`, `service`, `appEnv`, `requestId`, `jobId`, `event`, `attempt`, `durationMs`, `errorCode` selon le contexte. Ils excluent contenu de document, email, mot de passe, cookies, jetons, URL signée et chaînes de connexion. Les états de tâches donnent le suivi des échecs ; aucun outil analytique produit n’est ajouté.

La démonstration distante est désactivable après validation. Une procédure d’administration purge les fichiers de démonstration puis les lignes correspondantes, seulement pour les tâches terminales de plus de sept jours ; elle est relançable et ne touche pas les tâches actives. Les archives de messages correspondantes sont également purgées. Cette procédure ne définit pas la conservation future des CV.

La vérification comprend le parcours nominal (AC-2, AC-7), une soumission concurrente de même clé et la livraison répétée (AC-3), un arrêt après écriture R2 mais avant confirmation SQL et l’épuisement des essais (AC-4), ainsi que le démarrage avec secret manquant et la construction sans secrets embarqués (AC-1, AC-6). Pour AC-4, elle couvre aussi une version inconnue avec tâche identifiable, un bail encore valide, et la procédure de récupération d’une tâche privée de message ; le quota doit être libéré après terminaison en échec.

Pour AC-5, vérifier séparément le refus d’émettre un lien sans autorisation, le refus d’accès non signé au fichier, l’utilisation d’un lien valide sans session et le refus d’une nouvelle requête après expiration. Tenter également les mutations directes avec les rôles `anon`, `authenticated` et du processus : elles doivent échouer, tandis que les fonctions autorisées continuent de fonctionner. Le rapport distingue les résultats locaux de ceux obtenus sur les services distants.

## Consequences

Le socle réutilise vos compétences et garde un environnement Node commun. Les opérations longues ne dépendent pas de la durée d’une requête web. Le protocole de file exige néanmoins des fonctions transactionnelles, des tests de reprise et une surveillance des échecs.

Trois fournisseurs restent à administrer. Railway facture les ressources des deux processus, y compris leur consommation au repos. Les offres gratuites et crédits inclus ne constituent pas un budget garanti de production. Une enveloppe commerciale, la sauvegarde, la restauration et l’alerte opérationnelle devront être définies avant l’ouverture publique.

Le stockage privé ne suffit pas à définir la confidentialité du futur produit. Les politiques concernant les CV, les sauvegardes et les fournisseurs IA restent dans les décisions de lancement et du parcours réel.

## Follow-up

1. Inspecter et sélectionner pendant la construction les compétences Next.js, Supabase, Railway et Cloudflare recensées dans le rationale ; aucune installation effectuée.
2. Prévoir, si connecté, Supabase MCP limité au projet de validation en lecture seule. Différer les connecteurs Railway et Cloudflare. Aucun connecteur activé par cette décision.
3. Capturer les conventions et les contrôles communs après réalisation du socle, conformément à la fonctionnalité 2.
4. Concevoir le modèle métier, les fondations bilingues et le premier parcours CV dans leurs fonctionnalités respectives.
5. Avant production, arrêter budget, régions et éventuelles contraintes de résidence, supervision avec alertes, restauration et conservation ; choisir les fournisseurs IA et paiement dans leurs spécifications.

## Rationale

Voir [les options, leurs raisons et les sources vérifiées](rationale.md).
