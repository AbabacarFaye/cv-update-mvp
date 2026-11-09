import { notFound } from "next/navigation";
import { webConfig } from "@cv/server/config";
import { authorized, HttpError } from "@/lib/http";
import { LoginForm, JobPanel } from "./panels";
import { logout } from "./actions";
export const dynamic = "force-dynamic";
export default async function Foundation() {
  if (!webConfig().enabled) notFound();
  let userId: string | null = null;
  let notice = "";
  try { userId = (await authorized()).user.id; }
  catch (error) {
    if (!(error instanceof HttpError)) throw error;
    if (error.status === 503) throw error;
    if (error.status === 403) notice = "Ce compte ne dispose pas d’un accès de validation. Connectez vous avec le compte prévu.";
  }
  return <main id="main"><div className="intro"><p className="eyebrow">Architecture et socle exécutable</p><h1>Vérifier le circuit complet.</h1><p>Connectez vous avec votre compte de validation, lancez une tâche et récupérez son fichier privé.</p></div><div className="workspace"><section className="panel" aria-labelledby="task-title"><div className="panel-heading"><h2 id="task-title">{userId ? "Tâche de démonstration" : "Connexion de validation"}</h2>{userId && <form action={logout}><button className="secondary">Se déconnecter</button></form>}</div>{notice && <p role="alert">{notice}</p>}{userId ? <JobPanel key={userId} userId={userId} /> : <LoginForm />}</section><aside className="panel guide"><h2>Un fichier, de bout en bout</h2><ol><li><strong>Lancer</strong><p>Une demande crée une tâche et son message.</p></li><li><strong>Suivre</strong><p>Le traitement continue même si vous fermez cette page.</p></li><li><strong>Télécharger</strong><p>Le fichier texte est privé. Le lien délivré reste utilisable pendant 60 secondes par toute personne qui le possède.</p></li></ol><p className="hint">Accès réservé aux comptes autorisés. Une tâche à la fois et dix nouveaux lancements par heure.</p></aside></div></main>;
}
