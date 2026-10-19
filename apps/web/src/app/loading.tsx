import React from 'react';

export default function GlobalLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="py-12 space-y-6 animate-pulse"
    >
      <div className="space-y-2">
        <div className="h-8 w-56 bg-line/60 rounded-control" />
        <div className="h-4 w-80 max-w-full bg-line/40 rounded-control" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="h-36 bg-surface border border-line rounded-surface p-6" />
        <div className="h-36 bg-surface border border-line rounded-surface p-6" />
      </div>

      <span className="sr-only">Carregando informações da escala...</span>
    </div>
  );
}
