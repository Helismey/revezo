'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { AlertBanner } from '@/components/AlertBanner';
import { Key } from '@/components/Icons';

export default function EsqueciSenhaPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'sucesso' | 'erro' | 'advertencia' | 'info';
    message: string;
    devToken?: string;
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await res.json();

      if (!res.ok && res.status !== 200) {
        setFeedback({
          type: 'erro',
          message: data.error || 'Não foi possível solicitar a recuperação. Tente novamente.',
        });
        return;
      }

      setFeedback({
        type: 'sucesso',
        message: data.message || 'Se o e-mail informado estiver cadastrado, você receberá um link para redefinir sua senha em instantes.',
        devToken: data.devToken,
      });
      setEmail('');
    } catch {
      setFeedback({
        type: 'erro',
        message: 'Erro de conexão com o servidor. Verifique sua conexão e tente novamente.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full bg-surface p-8 rounded-surface border border-line shadow-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-primary/10 text-primary rounded-control flex items-center justify-center mx-auto mb-4 border border-primary/20">
            <Key size={24} className="text-primary" />
          </div>
          <h1 className="font-display font-bold text-2xl text-ink">Recuperar Senha</h1>
          <p className="text-sm text-ink-muted mt-2 leading-relaxed">
            Informe seu e-mail cadastrado. Enviaremos um link de uso único válido por 30 minutos para você redefinir sua senha com segurança.
          </p>
        </div>

        {feedback && (
          <div className="mb-6 space-y-3">
            <AlertBanner type={feedback.type} message={feedback.message} />

            {feedback.devToken && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-control text-xs text-amber-900 dark:text-amber-200">
                <span className="font-bold block mb-1">Ambiente de Testes (Dev):</span>
                <p className="mb-2">Link direto para redefinição:</p>
                <Link
                  href={`/redefinir-senha?token=${feedback.devToken}`}
                  className="font-mono underline break-all text-primary font-semibold"
                >
                  /redefinir-senha?token={feedback.devToken}
                </Link>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-ink mb-1" htmlFor="email">
              E-mail cadastrado
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-surface border border-field-border rounded-control text-ink text-base focus:outline-none focus:ring-2 focus:ring-primary min-h-touch"
              placeholder="seu.email@exemplo.com"
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-primary text-white font-semibold rounded-control hover:opacity-95 transition-opacity disabled:opacity-50 text-base shadow-sm min-h-touch flex items-center justify-center"
          >
            {loading ? 'Processando envio...' : 'Enviar link de recuperação'}
          </button>
        </form>

        <div className="mt-6 text-center border-t border-line pt-4">
          <Link
            href="/login"
            className="text-sm font-medium text-primary hover:underline"
          >
            ← Voltar para o login
          </Link>
        </div>
      </div>
    </div>
  );
}
