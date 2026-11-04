'use client';

import React from 'react';
import { useFormStatus } from 'react-dom';
import { CircleNotch } from './Icons';

interface ActionSubmitButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  pendingText?: string;
  children: React.ReactNode;
}

/**
 * Botão de submissão para Server Actions que exibe estado de carregamento instantâneo
 * e previne cliques duplicados (double-submit) via useFormStatus.
 */
export function ActionSubmitButton({
  pendingText = 'Salvando...',
  children,
  className = '',
  disabled,
  ...props
}: ActionSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending}
      className={`${className} disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-shadow`}
      {...props}
    >
      {pending ? (
        <span className="flex items-center justify-center gap-2">
          <CircleNotch className="w-4 h-4 animate-spin" weight="bold" />
          {pendingText}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
