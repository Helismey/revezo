'use client';

import React, { useEffect, useId, useRef } from 'react';
import { X } from './Icons';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  maxWidthClass?: string;
  children: React.ReactNode;
}

/**
 * Componente de Modal acessível (WCAG 2.1 AA):
 * - role="dialog" e aria-modal="true"
 * - aria-labelledby vinculado ao título
 * - Fechamento via tecla Escape e clique no backdrop
 * - Gerenciamento de foco ao abrir e restauração ao fechar
 */
export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  maxWidthClass = 'max-w-lg',
  children,
}: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    dialogRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`bg-surface rounded-surface border border-line w-full ${maxWidthClass} p-6 space-y-4 shadow-xl focus:outline-none max-h-[90vh] overflow-y-auto`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="font-display font-bold text-lg sm:text-xl text-ink">
              {title}
            </h2>
            {subtitle && <p className="text-xs text-ink-muted mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela"
            className="text-ink-muted hover:text-ink p-1 min-h-touch min-w-touch flex items-center justify-center rounded-control"
          >
            <X size={18} />
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (inputValue?: string) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
  withInput?: boolean;
  inputLabel?: string;
  inputPlaceholder?: string;
  loading?: boolean;
}

/**
 * Diálogo acessível do Design System para substituir confirm() e prompt() nativos do navegador.
 */
export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'danger',
  withInput = false,
  inputLabel = 'Motivo (opcional)',
  inputPlaceholder = 'Digite aqui...',
  loading = false,
}: ConfirmDialogProps) {
  const [inputValue, setInputValue] = React.useState('');

  useEffect(() => {
    if (isOpen) {
      setInputValue('');
    }
  }, [isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidthClass="max-w-md">
      <p className="text-sm text-ink-muted leading-relaxed">{description}</p>

      {withInput && (
        <div>
          <label className="block text-xs font-semibold text-ink-muted uppercase mb-1.5">
            {inputLabel}
          </label>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={inputPlaceholder}
            maxLength={300}
            className="w-full px-3.5 py-2.5 bg-bg border border-line rounded-control text-sm text-ink focus:outline-none focus:border-primary min-h-touch"
          />
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-3 border-t border-line">
        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          className="px-4 py-2 border border-line text-ink-muted font-semibold text-sm rounded-control hover:text-ink min-h-touch disabled:opacity-50"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => onConfirm(withInput ? inputValue.trim() || undefined : undefined)}
          className={`px-4 py-2 text-white font-semibold text-sm rounded-control hover:opacity-95 min-h-touch disabled:opacity-50 ${
            variant === 'danger' ? 'bg-danger' : 'bg-primary'
          }`}
        >
          {loading ? 'Processando...' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
