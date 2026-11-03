"use client";

import { buttonClass } from "@/components/ui";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <h1 className="text-xl font-semibold">Algo deu errado</h1>
      <p className="mt-2 text-sm text-muted">Não foi possível carregar esta página. Tente novamente em instantes.</p>
      <button type="button" onClick={reset} className={buttonClass("primary", "md", "mt-6")}>
        Tentar novamente
      </button>
    </main>
  );
}
