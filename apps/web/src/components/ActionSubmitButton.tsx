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
      className={`${className} disabled:opacity-60 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus:outline-none flex items-center justify-center gap-2`}
      {...props}
    >
      {pending && <CircleNotch size={16} className="animate-spin" />}
      {pending ? pendingText : children}
    </button>
  );
}
