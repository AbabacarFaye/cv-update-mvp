"use client";
import { useActionState, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { errorLabel, statusLabels, type JobView } from "@cv/contracts/foundation";
import { login } from "./actions";
export function LoginForm() {
  const [state, action, pending] = useActionState(login, { error: "" });
  return <form action={action} className="login"><p>Utilisez le compte créé pour la validation. L’inscription publique est fermée.</p><label htmlFor="email">Adresse email</label><input id="email" name="email" type="email" autoComplete="username" required maxLength={320} /><label htmlFor="password">Mot de passe</label><input id="password" name="password" type="password" autoComplete="current-password" required maxLength={1024} aria-describedby={state.error ? "login-error" : undefined} /><button disabled={pending}>{pending ? "Connexion en cours…" : "Se connecter"}</button>{state.error && <p id="login-error" className="error" role="alert">{state.error}</p>}</form>;
}
type Saved = { requestKey: string; jobId?: string };
function readSaved(key: string): Saved | null { try { const value = JSON.parse(localStorage.getItem(key) ?? "null"); return value && typeof value.requestKey === "string" ? value : null; } catch { return null; } }
function save(key: string, value: Saved) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* The in-memory request key still protects network retries. */ } }
class ApiError extends Error { constructor(public code: string, public requestId?: string) { super(code); } }
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  const body = await response.json();
  if (!response.ok) throw new ApiError(body.code, body.requestId);
  return body;
}
const subscribeHydration = () => () => {};
export function JobPanel({ userId }: { userId: string }) {
  const hydrated = useSyncExternalStore(subscribeHydration, () => true, () => false);
  return hydrated ? <HydratedJobPanel userId={userId} /> : <p role="status">Chargement de la tâche…</p>;
}
function HydratedJobPanel({ userId }: { userId: string }) {
  const storageKey = `foundation:${userId}`;
  const [saved, setSaved] = useState<Saved | null>(() => readSaved(storageKey));
  const savedRef = useRef<Saved | null>(saved);
  const [job, setJob] = useState<JobView | null>(null);
  const ready = true;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const remember = useCallback((value: Saved) => { savedRef.current = value; setSaved(value); save(storageKey, value); }, [storageKey]);
  const report = useCallback((e: unknown) => { setError(e instanceof ApiError ? `${errorLabel(e.code)}${e.requestId ? ` Référence : ${e.requestId}` : ""}` : errorLabel("unavailable")); }, []);
  useEffect(() => {
    if (!saved?.jobId) return;
    const id = saved.jobId;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      if (document.visibilityState !== "visible") return;
      try {
        const next = await request<JobView>(`/api/foundation/jobs/${id}`);
        if (cancelled) return;
        setJob(next); setError("");
        if (next.status === "succeeded" || next.status === "failed") return;
      } catch (e) {
        if (!cancelled) {
          report(e);
          if (e instanceof ApiError && e.code === "not_found") {
            savedRef.current = null; setSaved(null); setJob(null);
            try { localStorage.removeItem(storageKey); } catch { /* Storage may be disabled. */ }
            return;
          }
        }
      }
      if (!cancelled) timer = setTimeout(poll, 2000);
    }
    function onVisibility() { clearTimeout(timer); if (document.visibilityState === "visible") void poll(); }
    void poll(); document.addEventListener("visibilitychange", onVisibility);
    return () => { cancelled = true; clearTimeout(timer); document.removeEventListener("visibilitychange", onVisibility); };
  }, [saved?.jobId, report, storageKey]);
  useEffect(() => {
    if (!link) return;
    const timer = setTimeout(() => setLink(null), Math.max(0, Date.parse(link.expiresAt)-Date.now()));
    return () => clearTimeout(timer);
  }, [link]);
  async function launch() {
    setBusy(true); setError(""); setLink(null);
    // Keep the same key on uncertainty. A deliberate new launch after a terminal job gets a new key.
    const previous = savedRef.current;
    const value = !previous || job?.status === "succeeded" || job?.status === "failed" ? { requestKey: crypto.randomUUID() } : previous;
    remember(value);
    setJob(null);
    try {
      const result = await request<{ id: string }>("/api/foundation/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestKey: value.requestKey }) });
      setJob(null); remember({ ...value, jobId: result.id });
    } catch (e) { report(e); } finally { setBusy(false); }
  }
  async function download() {
    if (!job) return;
    setBusy(true); setError("");
    try { setLink(await request(`/api/foundation/jobs/${job.id}/download`)); }
    catch (e) { report(e); } finally { setBusy(false); }
  }
  const active = job?.status === "queued" || job?.status === "running";
  return <div className="task"><div role="status" aria-live="polite" className="status"><span className="eyebrow">État du traitement</span><h3>{!ready ? "Chargement…" : job ? statusLabels[job.status] : saved?.jobId ? "Récupération de la tâche…" : "Prêt pour un premier lancement"}</h3>{!saved && <p>Le résultat sera un fichier texte de démonstration.</p>}{job?.status === "failed" && <p>{errorLabel(job.errorCode ?? "unavailable")}</p>}</div>{job && <dl><div><dt>Identifiant</dt><dd className="mono">{job.id}</dd></div><div><dt>Tentatives</dt><dd>{job.attemptCount} / 3</dd></div><div><dt>Création</dt><dd><time dateTime={job.createdAt}>{new Date(job.createdAt).toLocaleString("fr-FR", { timeZone: "UTC" })} UTC</time></dd></div>{job.completedAt && <div><dt>Fin</dt><dd><time dateTime={job.completedAt}>{new Date(job.completedAt).toLocaleString("fr-FR", { timeZone: "UTC" })} UTC</time></dd></div>}</dl>}<div className="actions"><button onClick={launch} disabled={!ready || busy || active || (!!saved?.jobId && !job)}>{busy ? "Demande en cours…" : !saved ? "Lancer la tâche" : !job ? "Réessayer le lancement" : "Lancer une nouvelle tâche"}</button>{job?.status === "succeeded" && <button className="secondary" onClick={download} disabled={busy}>Obtenir le lien privé</button>}</div>{link && <div className="download"><a href={link.url} referrerPolicy="no-referrer">Télécharger le fichier texte</a><p>Ce lien est transmissible et expire au plus tard à {new Date(link.expiresAt).toLocaleTimeString("fr-FR")}. Vous pourrez en demander un nouveau.</p></div>}{error && <p className="error" role="alert">{error}</p>}</div>;
}
