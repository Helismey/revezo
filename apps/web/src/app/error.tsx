'use client';

import React from 'react';
import Link from 'next/link';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      role="alert"
      className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center"
    >
      <div className="bg-surface border border-line rounded-surface p-8 max-w-md w-full space-y-4 shadow-sm">
        <h1 className="font-display font-bold text-xl sm:text-2xl text-ink">
          Ocorreu um imprevisto ao carregar esta página
        </h1>
        <p className="text-sm text-ink-muted leading-relaxed">
          Não foi possível concluir a operação no momento. Verifique sua conexão e tente novamente.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => reset()}
            className="w-full sm:w-auto px-5 py-2.5 bg-primary text-on-primary font-semibold text-sm rounded-control hover:opacity-95 min-h-touch"
          >
            Tentar novamente
          </button>
          <Link
            href="/"
            className="w-full sm:w-auto px-5 py-2.5 border border-line text-ink font-semibold text-sm rounded-control hover:bg-bg min-h-touch flex items-center justify-center"
          >
            Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}
