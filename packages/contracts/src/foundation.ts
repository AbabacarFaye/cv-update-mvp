export const DEMO_CONTENT = "CV a jour : socle operationnel.\n";
export const DOWNLOAD_TTL_SECONDS = 60;
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type JobStatus = "queued" | "running" | "succeeded" | "failed";
export type JobView = { id: string; status: JobStatus; attemptCount: number; createdAt: string; completedAt: string | null; errorCode: string | null };
export const statusLabels: Record<JobStatus, string> = { queued: "En attente", running: "Traitement en cours", succeeded: "Fichier disponible", failed: "Traitement en échec" };
export const errorLabels: Record<string, string> = {
  unauthorized: "Connectez vous pour continuer.", forbidden: "Ce compte ne dispose pas d’un accès de validation.",
  invalid_request: "La demande est invalide.", not_found: "Cette tâche n’est pas accessible.",
  quota_exceeded: "Une tâche est déjà en cours, ou la limite de dix lancements par heure est atteinte.",
  unavailable: "Le service est indisponible. Vous pouvez réessayer.", not_ready: "Le fichier n’est pas encore disponible.",
  attempts_exhausted: "Les trois tentatives ont échoué. Vous pouvez lancer une nouvelle tâche.",
  unsupported_contract: "Le format du message n’est pas pris en charge.", invalid_message: "Le message de traitement est invalide.",
  orphaned_message: "Le message de cette tâche a été perdu. Vous pouvez lancer une nouvelle tâche.",
  invalid_credentials: "Connexion impossible. Vérifiez vos identifiants ou réessayez plus tard.",
};
export function errorLabel(code: string) { return errorLabels[code] ?? errorLabels.unavailable; }
export function objectKey(ownerId: string, jobId: string) { return `foundation/${ownerId}/${jobId}/result.txt`; }
