"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="empty-state">
      <h1>Let’s try that again.</h1>
      <p>Intentémoslo de nuevo.</p>
      <button className="button primary" onClick={reset}>
        Retry / Reintentar
      </button>
    </main>
  );
}
