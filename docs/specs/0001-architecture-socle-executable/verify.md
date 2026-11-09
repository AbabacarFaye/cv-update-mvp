# Vérification : Architecture et socle exécutable · spec 0001 · 2026-11-09

Étapes dérivées des critères de la [spécification](index.md). `/check verify` les exécute et distingue les résultats locaux des résultats obtenus sur les services de validation. Aucune case n'est cochée par la seule présence du code.

## Sans Docker ni compte cloud

- [ ] `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, puis `pnpm validate:offline` réussissent sans vrai secret. → AC-1, AC-6
- [ ] `pnpm validate:offline` ne trouve aucun nom de variable secrète dans les fichiers JavaScript publics de `.next/static`. → AC-6
- [ ] Les points d'entrée web et worker échouent immédiatement si une variable nécessaire manque, sans imprimer sa valeur. `APP_ENV=production` avec démo activée est refusé. → AC-6
- [ ] Après `pnpm build`, lancer `pnpm validate:http` : la commande démarre et arrête le web avec des valeurs fictives ; santé `200`, page de connexion sans cache, lectures et lancement anonymes `401`, origine étrangère `403`. → AC-1, AC-5
- [ ] Inspecter `/foundation` sur téléphone et ordinateur : connexion, état vide, chargement, erreur, succès, déconnexion, navigation au clavier et focus visibles. → AC-2, AC-5

## Après installation de Docker ou Podman, avec Supabase local et R2 de développement

- [ ] `pnpm db:start`, puis `pnpm db:reset` **sur la base locale uniquement** ; `pnpm validate:db` confirme l'extension, la file, les tables, les colonnes, les contraintes et les privilèges ; `pnpm db:types` génère les types depuis la base et `pnpm typecheck` reste vert. → AC-1, AC-5
- [ ] Créer un compte Auth de validation, confirmer son adresse et l'ajouter à `foundation_allowed_users`. La connexion marche ; un autre compte, absent de cette table, est refusé. L'inscription publique est fermée. → AC-2, AC-5
- [ ] Depuis `/foundation`, lancer une tâche. Voir `queued`, puis `running`, puis `succeeded` ; télécharger le fichier UTF-8 et comparer ses octets à `CV a jour : socle operationnel.\n`. → AC-2
- [ ] Envoyer deux requêtes simultanées avec la même clé UUID et vérifier un seul `id` ; un nouvel essai de cette même clé retrouve la tâche même quand le quota est atteint. → AC-3
- [ ] Réexposer un message de tâche déjà terminée. Le worker archive le doublon sans créer une autre ligne ni un autre résultat logique. → AC-3
- [ ] Arrêter le worker après écriture R2 mais avant confirmation SQL ; attendre la fin de l'invisibilité du message et du bail, puis le redémarrer. La tâche reprend avec la même clé R2 et ne dépasse pas trois prises. → AC-4
- [ ] Simuler trois échecs R2 ; à la prise suivante, l'état est `failed`, le code est `attempts_exhausted` et une nouvelle tâche peut être créée. Un ancien jeton de bail ne modifie pas cette tâche. → AC-4
- [ ] Injecter une version de message inconnue avec `job_id` connu sans bail valide : état `failed`, code `unsupported_contract`, message archivé et quota libéré. Refaire avec bail valide : la tâche active reste intacte jusqu'à expiration. → AC-4
- [ ] Supprimer administrativement le message d'une tâche non terminale ; `pnpm admin orphans` la propose. `pnpm admin reconcile <uuid>` la termine avec `orphaned_message`. Une tâche dont le message est invisible ou le bail valide n'est pas proposée ou modifiée. → AC-4
- [ ] Comme `anon`, `authenticated` et `foundation_worker`, tenter `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE` directs sur les tables techniques ou de file : refus. Tenter aussi l'appel des fonctions réservées à l'administration depuis le rôle worker : refus. Les fonctions accordées au rôle correspondant continuent à fonctionner. → AC-5
- [ ] Sans session ou avec un autre compte, tenter lecture, lancement et émission de lien : refus ; l'identifiant d'une autre personne donne `404`. L'URL R2 non signée ne permet pas la lecture. → AC-5
- [ ] Émettre un lien signé avec une session autorisée, l'utiliser sans session pendant 60 secondes, puis tenter **une nouvelle requête** après expiration : refus. → AC-5

## Sur les services de validation isolés, après autorisation du déploiement

- [ ] Rejouer le parcours connexion → tâche → fichier avec deux services Railway, un projet Supabase et un bucket R2 privés de validation. Vérifier que chaque service a ses secrets propres et que le worker n'a pas de domaine public. → AC-2, AC-6, AC-7
- [ ] Dans les logs Railway, retrouver la création, la prise, le succès ou l'échec d'une tâche par son UUID. Aucun cookie, mot de passe, jeton, contenu, chaîne de connexion ni URL signée n'apparaît. → AC-7
- [ ] Répéter les épreuves d'idempotence, reprise et accès interdits qui dépendent des vrais fournisseurs ; noter séparément les résultats locaux et distants. → AC-3, AC-4, AC-5, AC-7

## Origine des valeurs

- [ ] Se connecter avec deux comptes distincts : la tâche porte l'UUID Auth du créateur dans `foundation_jobs.owner_id`, jamais un UUID fourni dans le corps HTTP ; l'autre compte ne la lit pas. → AC-2, AC-5
- [ ] Retirer puis rétablir un compte dans `foundation_allowed_users` : son droit de lancer et lire une tâche change avec cette table. → AC-5
- [ ] Comparer `id`, état, nombre d'essais, création et fin affichés aux colonnes de la même ligne `foundation_jobs` ; après reprise, le nombre d'essais augmente sans changement d'identifiant. → AC-2, AC-4
- [ ] Télécharger deux tâches : les octets UTF-8 sont identiques au texte fixe versionné, retour à la ligne compris. → AC-2, AC-3
- [ ] Vérifier dans R2 que la clé est `foundation/{owner_id}/{job_id}/result.txt` et qu'une nouvelle livraison du même message n'invente pas une autre clé. → AC-3
- [ ] Comparer `expiresAt` à la date de signature du lien ; vérifier les nouvelles requêtes avant et après 60 secondes. → AC-5
- [ ] Provoquer `attempts_exhausted` et `unsupported_contract` : le texte visible correspond au code en base et ne révèle aucun message brut d'un fournisseur. → AC-4, AC-5
- [ ] Pour une tâche créée, retrouver ses événements dans les logs par `jobId` et vérifier que chaque requête web porte un `requestId` UUID. → AC-7

## Couverture

AC-1 : installation, contrôles, démarrage, migration. AC-2 : connexion et parcours nominal. AC-3 : clé de requête et message répété. AC-4 : interruptions, épuisement, messages invalides, orphelins. AC-5 : propriété, rôles SQL et liens privés. AC-6 : secrets, environnements et configuration. AC-7 : services distants et corrélation.
