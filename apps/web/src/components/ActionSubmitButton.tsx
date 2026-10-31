'use client';

import React from 'react';
import { useFormStatus } from 'react-dom';
import { CircleNotch } from '@/components/Icons';

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
      className={`${className} disabled:opacity-60 disabled:cursor-not-allowed ${pending ? 'flex items-center gap-1.5' : ''}`}
      {...props}
    >
      {pending ? (
        <>
          <CircleNotch className="w-4 h-4 animate-spin" weight="bold" />
          <span>{pendingText}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
