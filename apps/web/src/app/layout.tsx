import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Socle de validation | CV à jour", robots: { index: false, follow: false } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr"><body><a className="skip" href="#main">Aller au contenu</a><header><span className="brand">CV à jour</span><span className="tag">Espace de validation</span></header>{children}<footer>Démonstration technique · Aucun CV ni donnée personnelle dans le fichier produit.</footer></body></html>;
}
