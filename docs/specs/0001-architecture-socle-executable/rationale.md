# Raisons du choix 0001

## Context

Le projet ne contient que les documents de périmètre, sans source, spécification antérieure, AGENTS.md ni dépôt Git initialisé lors de la conception. Le lancement vise un service CV payant en français et anglais, avec traitements IA, documents privés, crédits et paiements. Le scope impose une progression Tracer Bullet et une exigence GA, sans budget arrêté ni volume annoncé (basis: [scope](../../scope/index.md)).

Le porteur maîtrise Next.js, TypeScript, PostgreSQL et Supabase. Il souhaite minimiser les coûts fixes et a choisi un stockage externe à Supabase. La première preuve est technique, sans vrai CV et sans inscription publique. Le pays d’établissement et les contraintes de résidence ne sont pas encore fixés ; cette décision ne conclut aucune conformité juridique.

## Options considered

| Option | Atout | Coût ou limite |
|---|---|---|
| Railway web et processus, Supabase, R2, retenue | Même environnement Node pour le site et les traitements ; compétence réutilisée | Deux processus consomment des ressources même avec peu de trafic ; trois fournisseurs à gérer |
| Cloudflare OpenNext pour le web, Railway pour les traitements, Supabase et R2 | Couche web à facturation principalement liée à l’usage | Adaptateur et compatibilité Workers à suivre, deux environnements d’exécution |
| Vercel pour le web, Railway pour les traitements, Supabase et R2 | Intégration Next.js directe et expérience de déploiement | Un fournisseur supplémentaire et tarification à évaluer pour l’usage commercial |

Bases de cette comparaison : documentation [Railway](https://docs.railway.com/pricing/plans), [OpenNext Cloudflare](https://opennext.js.org/cloudflare), [limites Workers](https://developers.cloudflare.com/workers/platform/limits/) et [durée des fonctions Vercel](https://vercel.com/docs/functions/configuring-functions/duration). Les limites des fonctions web ne remplacent pas une stratégie persistante de reprise.

## Rationale

L’unité de code reste commune ; séparer le processus de traitement répond à la reprise exigée dans le scope et à la future génération de documents. Ce n’est pas un découpage en services métier indépendants. Railway évite d’imposer dès le départ les contraintes d’un second runtime. Le choix est un compromis de simplicité, pas l’affirmation qu’il sera toujours le moins cher (basis: scope, documentation Railway et Workers).

Supabase fournit déjà PostgreSQL et Auth. Sa file persistante évite Redis ou un orchestrateur supplémentaire pour cette première tâche simple. Le mécanisme de livraison ne garantit pas à lui seul l’unicité des effets ; la transaction de création, la clé de requête, le bail et la clé R2 déterministe apportent cette protection (basis: [Supabase Queues](https://supabase.com/docs/guides/queues/pgmq), pratique d’idempotence et de bail).

Les migrations SQL et fonctions transactionnelles sont préférées à un ORM conformément au choix utilisateur. Un workspace pnpm suffit aux deux processus ; un outil d’orchestration de monorepo supplémentaire n’a pas de bénéfice démontré ici. Des routes HTTP internes explicites rendent la démonstration et ses erreurs faciles à vérifier ; une API publique séparée n’est pas demandée.

R2 est choisi pour les fichiers privés, son quota gratuit et l’absence de facturation du trafic sortant. S3 reste une alternative crédible si des exigences régionales ou des intégrations AWS le justifient. Supabase Storage aurait réduit le nombre de fournisseurs mais ne correspond pas à la préférence exprimée (basis: [tarifs R2](https://developers.cloudflare.com/r2/pricing/), [tarifs S3](https://aws.amazon.com/s3/pricing/)). Les liens signés sont des autorisations temporaires utilisables par quiconque les possède ; leur émission reste contrôlée par l’application (basis: [URLs présignées R2](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)).

### Coût et exploitation

Les pages consultées indiquent Railway Hobby à 5 USD par mois avec 5 USD d’usage inclus, et Supabase Pro à partir de 25 USD par mois. Ce sont des indications de forfait, pas le coût complet des deux services, de la base et des volumes. Supabase Free peut servir à la validation avec ses restrictions ; son comportement de mise en pause n’est pas une garantie de disponibilité. La production devra être chiffrée séparément (basis: [Railway](https://docs.railway.com/pricing/plans), [Supabase](https://supabase.com/pricing)).

Le local utilise un bucket R2 dédié pour tester le vrai protocole sans introduire un émulateur. Cette simplicité impose une connexion Internet pour la partie stockage. La localisation indicative R2 ne vaut pas garantie de résidence (basis: [localisation R2](https://developers.cloudflare.com/r2/reference/data-location/)).

### Compétences et connecteurs recensés

La recherche a été autorisée. Aucun outil n’a été installé ou connecté. Les fiches de compétences restent des candidats à inspecter au moment de construire, conformément au choix utilisateur.

| Technologie | Candidat repéré | Suite retenue |
|---|---|---|
| Next.js | Compétences Vercel et Next dans l’[annuaire Next.js](https://www.skills.sh/topic/nextjs) | Vérifier le dépôt, la portée et le contenu avant sélection |
| Supabase | [supabase/agent-skills](https://www.skills.sh/supabase/agent-skills) | Examiner les conventions SQL, RLS et Auth |
| Railway | [railwayapp/railway-skills](https://www.skills.sh/railwayapp/railway-skills) | Vérifier la provenance et les actions proposées |
| Cloudflare | [cloudflare/skills](https://www.skills.sh/cloudflare/skills) | Ne retenir que les instructions utiles à R2 |

Le [MCP Supabase](https://supabase.com/docs/guides/ai-tools/mcp) est prévu comme option limitée au projet de validation, avec `read_only=true`. Les [MCP Railway](https://docs.railway.com/ai/mcp-server) et [Cloudflare](https://developers.cloudflare.com/agents/model-context-protocol/cloudflare/servers-for-cloudflare/) sont différés. Leur disponibilité ne vaut pas autorisation de modifier l’infrastructure (basis: documentation des connecteurs et choix utilisateur).

### Relecture indépendante

Une relecture par un autre modèle a confirmé que le socle est implémentable, puis proposé trois corrections approuvées par le porteur du projet : rendre explicite le refus des mutations SQL directes, définir la terminaison des tâches associées à des messages invalides et la récupération des tâches privées de message, et aligner le critère d’accès sur le caractère transmissible des liens signés. Ces corrections figurent dans le contrat et ses vérifications. Aucun changement de fournisseur ou de topologie n’en résulte.

## References

Sources du projet : [périmètre](../../scope/index.md), [fondations](../../scope/fondations.md), [parcours CV](../../scope/parcours-cv.md). Les choix utilisateur de cette conversation sont retranscrits dans la décision.

Pratiques mobilisées : application modulaire, tranche verticale Tracer Bullet, transaction atomique, contrôle par propriétaire, livraison répétable avec effets idempotents et bail de traitement.

Les liens officiels et fiches d’annuaire ci dessus ont été consultés pendant la conception. Ils servent à retracer les raisons du choix ; les fiches d’annuaire ne remplacent pas l’inspection des compétences. Les tarifs et compatibilités devront être revérifiés au moment d’engager une dépense ou de figer les versions.
