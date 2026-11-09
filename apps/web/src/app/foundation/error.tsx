"use client";
export default function ErrorPage({ reset }: { reset: () => void }) { return <main id="main"><h1>Service indisponible</h1><p role="alert">Votre espace de validation ne peut pas être chargé pour le moment.</p><button onClick={reset}>Réessayer</button></main>; }
