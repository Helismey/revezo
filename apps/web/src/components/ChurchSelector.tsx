'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

interface ChurchSelectorProps {
  currentChurch: {
    id: string;
    name: string;
    slug: string;
  } | null;
  availableChurches: {
    id: string;
    name: string;
    slug: string;
  }[];
  canSwitch: boolean;
}

export function ChurchSelector({ currentChurch, availableChurches, canSwitch }: ChurchSelectorProps) {
  const router = useRouter();
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

  if (!canSwitch || availableChurches.length <= 1) {
    return (
      <div className="flex items-center space-x-2">
        <span className="font-display font-bold text-base sm:text-lg text-ink truncate max-w-[200px] sm:max-w-xs block leading-tight">
          {currentChurch?.name || 'Revezo'}
        </span>
      </div>
    );
  }

  const handleSelectChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const targetId = e.target.value;
    if (!targetId || targetId === currentChurch?.id) return;

    setSwitching(true);
    setSwitchError(null);
    try {
      const res = await fetch('/api/igrejas/alternar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ churchId: targetId }),
      });

      if (res.ok) {
        router.refresh();
      } else {
        setSwitchError('Não foi possível alternar de congregação.');
      }
    } catch {
      setSwitchError('Erro de conexão ao alternar congregação.');
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div className="flex items-center space-x-2">
      <div className="relative">
        <select
          value={currentChurch?.id || ''}
          onChange={handleSelectChange}
          disabled={switching}
          aria-label="Selecionar congregação ativa"
          className="appearance-none font-display font-bold text-sm sm:text-base text-ink bg-bg hover:bg-line/40 border border-line rounded-control px-3 py-1.5 pr-8 focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer disabled:opacity-50"
        >
          {availableChurches.map((church) => (
            <option key={church.id} value={church.id}>
              {church.name}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-ink-muted">
          <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
            <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
          </svg>
        </div>
      </div>
      {switching && <span className="text-xs text-ink-muted animate-pulse">Carregando...</span>}
      {switchError && (
        <span role="alert" className="text-xs text-danger font-medium">
          {switchError}
        </span>
      )}
    </div>
  );
}
