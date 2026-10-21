'use client';

import React from 'react';
import Link from 'next/link';
import { WifiSlash } from '@/components/Icons';
import { Logo } from '@/components/Logo';

export default function OfflinePage() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full bg-surface border border-line rounded-surface p-6 sm:p-8 text-center shadow-sm">
        <Logo type="full" variant="light" className="h-7 w-auto mx-auto mb-6" />
        <div className="w-16 h-16 bg-warning-soft text-warning rounded-full flex items-center justify-center mx-auto mb-4">
          <WifiSlash size={32} className="text-warning-ink" />
        </div>

        <h1 className="font-display font-bold text-xl sm:text-2xl text-ink">
          Você está sem conexão
        </h1>

        <p className="text-sm text-ink-muted mt-2 mb-6">
          Não conseguimos carregar novos dados no momento. Mas se você já abriu sua escala antes, ela continua disponível na memória do seu aparelho.
        </p>

        <div className="flex flex-col gap-3">
          <Link
            href="/minha-escala"
            className="w-full py-2.5 px-4 bg-primary text-white font-semibold rounded-control text-sm hover:opacity-95 transition-opacity min-h-touch flex items-center justify-center"
          >
            Ver Minha Escala Salva
          </Link>

          <button
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.location.reload();
              }
            }}
            className="w-full py-2.5 px-4 border border-line text-ink font-semibold rounded-control text-sm hover:bg-black/5 transition-colors min-h-touch"
          >
            Tentar Reconectar
          </button>
        </div>
      </div>
    </div>
  );
}
