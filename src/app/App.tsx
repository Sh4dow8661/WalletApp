import { useEffect, useState } from "react";
import { Wallet } from "lucide-react";

interface Health {
  ok: boolean;
  servicio: string;
  fase: number;
  runtime: string;
}

/**
 * Pantalla de humo de la Fase 1. Su único trabajo es demostrar que la cadena
 * completa funciona: React monta, Tailwind aplica el tema y el navegador habla
 * con el Worker corriendo en workerd. La UI de verdad llega en la Fase 4.
 */
export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<Health>;
      })
      .then(setHealth)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="bg-primary-light dark:bg-primary-dark/20 rounded-3xl p-5">
        <Wallet className="text-primary size-12" aria-hidden />
      </div>

      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">WalletApp</h1>
        <p className="text-sm opacity-70">Migración a PWA · Fase 1</p>
      </div>

      <div className="w-full rounded-2xl border border-black/10 p-4 text-left text-sm dark:border-white/15">
        <p className="mb-2 font-medium">Estado del Worker</p>
        {error && <p className="text-expense">Sin respuesta: {error}</p>}
        {!error && !health && <p className="opacity-60">Consultando…</p>}
        {health && (
          <dl className="space-y-1 font-mono text-xs">
            <div className="flex justify-between gap-4">
              <dt className="opacity-60">servicio</dt>
              <dd>{health.servicio}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="opacity-60">fase</dt>
              <dd>{health.fase}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="opacity-60">runtime</dt>
              <dd className="text-income">{health.runtime}</dd>
            </div>
          </dl>
        )}
      </div>
    </main>
  );
}
