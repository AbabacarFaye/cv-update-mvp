# Vérification : Architecture et socle exécutable · spec 0001 · 2026-11-09

Étapes dérivées des critères de la [spécification](index.md). `/check verify` les exécute et distingue les résultats locaux des résultats obtenus sur les services de validation. Aucune case n'est cochée par la seule présence du code.

## État au 14 novembre 2026

Mise à jour partielle demandée après les vérifications locales. Les cases cochées représentent les opérations observées, sans valider globalement AC-1 à AC-7. Les contrôles distants restent ouverts. Les contrôles locaux complémentaires du 14 novembre ont été exécutés sans accès aux ressources distantes. Aucune révocation de jeton n'a été effectuée.

Preuves durables : [rapport des contrôles locaux](../../reviews/evidence/2026-11-14-local/README.md), avec résultats JSON et captures. Les résultats des sessions précédentes sont conservés séparément et identifiés comme tels. Les contrôles de construction, de configuration incomplète et HTTP proviennent de la session précédente.

Les étapes regroupant plusieurs opérations restent ouvertes si une partie manque de preuve. Les précisions ci-dessous distinguent ce qui est acquis de ce qui reste à exécuter.

## Sans Docker ni compte cloud

- [x] `pnpm typecheck`, `pnpm lint`, `pnpm build` et `pnpm validate:offline` ont réussi lors des sessions locales. TypeScript et les contrôles hors ligne ont été rejoués après séparation des identifiants R2. → AC-1, AC-6
- [ ] `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, puis `pnpm validate:offline` réussissent sans vrai secret. → AC-1, AC-6
- [x] `pnpm validate:offline` ne trouve aucun nom de variable secrète dans les fichiers JavaScript publics de `.next/static`. → AC-6
- [x] Les points d'entrée web et worker échouent immédiatement si une variable nécessaire manque, sans imprimer sa valeur. `APP_ENV=production` avec démo activée est refusé. → AC-6
- [x] Après `pnpm build`, lancer `pnpm validate:http` : la commande démarre et arrête le web avec des valeurs fictives ; santé `200`, page de connexion sans cache, lectures et lancement anonymes `401`, origine étrangère `403`. → AC-1, AC-5
- [x] Inspecter `/foundation` sur téléphone et ordinateur : connexion, état vide, chargement, erreur, succès, déconnexion, navigation au clavier et focus visibles. → AC-2, AC-5

## Après installation de Docker ou Podman, avec Supabase local et R2 de développement

- [x] Supabase local fonctionne ; `pnpm validate:db` confirme le schéma et les privilèges, et `pnpm typecheck` réussit. Les types ont été générés depuis la base lors de la préparation précédente. → AC-1, AC-5
- [ ] `pnpm db:start`, puis `pnpm db:reset` **sur la base locale uniquement** ; `pnpm validate:db` confirme l'extension, la file, les tables, les colonnes, les contraintes et les privilèges ; `pnpm db:types` génère les types depuis la base et `pnpm typecheck` reste vert. → AC-1, AC-5
- [x] Créer un compte Auth de validation, confirmer son adresse et l'ajouter à `foundation_allowed_users`. La connexion marche ; un autre compte, absent de cette table, est refusé. L'inscription publique est fermée. → AC-2, AC-5
- [x] Depuis `/foundation`, lancer une tâche. Voir `queued`, puis `running`, puis `succeeded` ; télécharger le fichier UTF-8 et comparer ses octets à `CV a jour : socle operationnel.\n`. → AC-2
- [x] Envoyer deux requêtes simultanées avec la même clé UUID et vérifier un seul `id` ; un nouvel essai de cette même clé retrouve la tâche même quand le quota est atteint. → AC-3
- [x] Réexposer un message de tâche déjà terminée. Le worker archive le doublon sans créer une autre ligne ni un autre résultat logique. → AC-3
- [x] Arrêter le worker après écriture R2 mais avant confirmation SQL ; attendre la fin de l'invisibilité du message et du bail, puis le redémarrer. La tâche reprend avec la même clé R2 et ne dépasse pas trois prises. → AC-4
- [x] Trois écritures R2 refusées conduisent à `attempts_exhausted` avec trois essais ; une nouvelle tâche réussit ensuite. Un ancien bail est refusé après reprise et après réconciliation. → AC-4
- [ ] Simuler trois échecs R2 ; à la prise suivante, l'état est `failed`, le code est `attempts_exhausted` et une nouvelle tâche peut être créée. Un ancien jeton de bail ne modifie pas cette tâche. → AC-4
- [x] Injecter une version de message inconnue avec `job_id` connu sans bail valide : état `failed`, code `unsupported_contract`, message archivé et quota libéré. Refaire avec bail valide : la tâche active reste intacte jusqu'à expiration. → AC-4
- [x] La suppression du message local puis les appels SQL `orphan_candidates()` et `reconcile_orphan()` produisent `orphaned_message`. Message invisible et bail valide sont protégés. Le script administratif réel a également été exécuté le 14 novembre, voir les preuves durables. → AC-4
- [x] Supprimer administrativement le message d'une tâche non terminale ; `pnpm admin orphans` la propose. `pnpm admin reconcile <uuid>` la termine avec `orphaned_message`. Une tâche dont le message est invisible ou le bail valide n'est pas proposée ou modifiée. → AC-4
- [x] Comme `anon`, `authenticated` et `foundation_worker`, tenter `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE` directs sur les tables techniques ou de file : refus. Tenter aussi l'appel des fonctions réservées à l'administration depuis le rôle worker : refus. Les fonctions accordées au rôle correspondant continuent à fonctionner. → AC-5
- [x] Sans session ou avec un autre compte, tenter lecture, lancement et émission de lien : refus ; l'identifiant d'une autre personne donne `404`. L'URL R2 non signée ne permet pas la lecture. → AC-5
- [x] Émettre un lien signé avec une session autorisée, l'utiliser sans session pendant 60 secondes, puis tenter **une nouvelle requête** après expiration : refus. → AC-5

## Sur les services de validation isolés, après autorisation du déploiement

Préparation partielle du projet Supabase : le rôle `foundation_worker` se connecte sous TLS vérifié avec les droits attendus ; deux comptes Auth synthétiques sont confirmés et un seul est autorisé. L’image worker inclut la racine CA requise pour le pooler. Les identifiants R2 distincts et les endpoints présents dans les deux fichiers de validation ont été éprouvés directement sur le bucket privé, sans parcours applicatif. Voir [preuves de préparation distante](../../reviews/evidence/2026-11-14-remote-preparation/README.md). L’origine HTTPS et les services Railway restent à configurer ; aucune case ci-dessous n’est encore validée.

- [ ] Rejouer le parcours connexion → tâche → fichier avec deux services Railway, un projet Supabase et un bucket R2 privés de validation. Vérifier que chaque service a ses secrets propres et que le worker n'a pas de domaine public. → AC-2, AC-6, AC-7
- [ ] Dans les logs Railway, retrouver la création, la prise, le succès ou l'échec d'une tâche par son UUID. Aucun cookie, mot de passe, jeton, contenu, chaîne de connexion ni URL signée n'apparaît. → AC-7
- [ ] Répéter les épreuves d'idempotence, reprise et accès interdits qui dépendent des vrais fournisseurs ; noter séparément les résultats locaux et distants. → AC-3, AC-4, AC-5, AC-7

## Origine des valeurs

- [x] Se connecter avec deux comptes distincts : la tâche porte l'UUID Auth du créateur dans `foundation_jobs.owner_id`, jamais un UUID fourni dans le corps HTTP ; l'autre compte ne la lit pas. → AC-2, AC-5
- [x] Retirer puis rétablir un compte dans `foundation_allowed_users` : son droit de lancer et lire une tâche change avec cette table. → AC-5
- [x] La réponse API correspond à la base pour l’état, le nombre d’essais et la date de création. La reprise conserve l’identifiant et passe de un à deux essais. Le 14 novembre, identifiant, état, essais, création et fin ont aussi été comparés au DOM réel pour la tâche synthétique, avec conservation des microsecondes dans les attributs datetime. → AC-2, AC-4
- [x] Comparer `id`, état, nombre d'essais, création et fin affichés aux colonnes de la même ligne `foundation_jobs` ; après reprise, le nombre d'essais augmente sans changement d'identifiant. → AC-2, AC-4
- [x] Télécharger deux tâches : les octets UTF-8 sont identiques au texte fixe versionné, retour à la ligne compris. → AC-2, AC-3
- [x] Vérifier dans R2 que la clé est `foundation/{owner_id}/{job_id}/result.txt` et qu'une nouvelle livraison du même message n'invente pas une autre clé. → AC-3
- [x] Le lien porte une durée de 60 secondes ; lecture réussie avant expiration et nouvelle requête refusée avec HTTP `403` après expiration. La comparaison exacte a réussi le 14 novembre via l’API locale avec une signature fictive ; les lectures R2 avant et après expiration sont les preuves de la session précédente. → AC-5
- [x] Comparer `expiresAt` à la date de signature du lien ; vérifier les nouvelles requêtes avant et après 60 secondes. → AC-5
- [x] L’écran `attempts_exhausted` affiche les trois essais et un message sans détail brut du fournisseur. `unsupported_contract` a aussi été traité par le worker réel et affiché sur ordinateur et téléphone le 14 novembre. → AC-4, AC-5
- [x] Provoquer `attempts_exhausted` et `unsupported_contract` : le texte visible correspond au code en base et ne révèle aucun message brut d'un fournisseur. → AC-4, AC-5
- [x] Pour une tâche créée, retrouver ses événements dans les logs par `jobId` et vérifier que chaque requête web porte un `requestId` UUID. → AC-7

## Administration locale complémentaire du 14 novembre

- [x] Le script `scripts/admin.ts` traite `orphans`, `reconcile` et `purge-list`, respecte les messages invisibles et les baux valides, et ignore les identifiants inexistants ou déjà traités. → AC-4
- [x] Les arguments absents ou invalides sont refusés avec sortie `1`. Les quatre commandes administratives sont refusées au rôle worker ; les fonctions correspondantes renvoient SQLSTATE `42501`. → AC-5
- [x] `purge` ignore les tâches actives ou trop récentes. La limite SQL stricte de sept jours est vérifiée à la microseconde ; la purge SQL supprime la ligne et l’archive puis devient sans effet au second appel. → AC-4
- [x] Quand la suppression du fichier est bloquée, la commande de purge échoue et conserve la ligne SQL. → AC-4
- [ ] La purge complète par la commande, fichier R2 puis ligne SQL, reste bloquée par le périmètre exclusivement local. Aucun stockage distant ni substitut de stockage n’a été utilisé.

## Permissions R2 locales

- [x] `.env.worker` et `apps/web/.env.local` sont ignorés par Git, avec permissions `600`, et contiennent des identifiants R2 distincts, différents de l'ancien jeu partagé. → AC-6
- [x] Sur `cv-update-dev`, le worker écrit avec HTTP `200`. Le web lit et délivre un lien de téléchargement utilisable avec HTTP `200` ; son écriture directe et son envoi signé sont refusés avec HTTP `403`. → AC-5, AC-6
- [ ] Confirmer la révocation de l'ancien jeton partagé après présentation des résultats. Aucune révocation effectuée par l'agent.

## Permissions R2 du bucket de validation

- [x] `.env.web.validation` et `.env.worker.validation` sont ignorés par Git, absents de l’index et lisibles seulement par leur propriétaire ; leurs identifiants sont distincts et ciblent `cv-update-validation`. → AC-6 partiel
- [x] Le Worker écrit un objet synthétique avec HTTP `200` ; le Web le lit et le télécharge par URL GET signée avec HTTP `200` et contenu identique. Les écritures Web directe et signée sont refusées avec HTTP `403`. → AC-5, AC-6 partiels
- [x] Les trois clés synthétiques sont supprimées avec HTTP `204`, puis chacune renvoie HTTP `404` à la lecture Web. → nettoyage du test
- [x] Renseigner `R2_ENDPOINT` dans les deux fichiers de validation et rejouer les contrôles R2 avec ces endpoints, sans repli sur la configuration de développement. → AC-6 partiel
- [ ] Renseigner `APP_ORIGIN` après attribution du domaine HTTPS Railway ; rejouer les contrôles applicatifs et vérifier les secrets des deux services. → AC-6, AC-7

## Couverture

AC-1 : installation, contrôles, démarrage, migration. AC-2 : connexion et parcours nominal. AC-3 : clé de requête et message répété. AC-4 : interruptions, épuisement, messages invalides, orphelins. AC-5 : propriété, rôles SQL et liens privés. AC-6 : secrets, environnements et configuration. AC-7 : services distants et corrélation.
