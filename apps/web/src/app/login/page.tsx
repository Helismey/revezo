'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertBanner } from '@/components/AlertBanner';
import { Logo } from '@/components/Logo';
import { isCapacitorNative, setSecureToken } from '@/lib/capacitor-adapter';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawFrom = searchParams.get('from') || '/';
  const from = rawFrom.startsWith('/') && !rawFrom.startsWith('//') && !rawFrom.includes('\\') ? rawFrom : '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [requiresMfa, setRequiresMfa] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const payload: { email: string; password: string; totpCode?: string } = {
        email: email.trim(),
        password,
      };
      if (totpCode.trim()) {
        payload.totpCode = totpCode.trim();
      }

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        if (data.requiresMfa) {
          setRequiresMfa(true);
        }
        setError(data.error || 'Não foi possível entrar. Verifique os dados.');
        return;
      }

      if (data.token && isCapacitorNative()) {
        try {
          await setSecureToken(data.token);
        } catch {
          // Ignora falha de gravação segura em fallback
        }
      }

      router.push(from);
      router.refresh();
    } catch {
      setError('Erro de conexão. Tente novamente em instantes.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full bg-surface p-8 rounded-surface border border-line shadow-sm">
        <div className="text-center mb-8">
          <Logo type="icon" variant="light" className="h-14 w-auto mx-auto mb-4" />
          <h1 className="font-display font-bold text-2xl text-ink">Entrar no Revezo</h1>
          <p className="text-sm text-ink-muted mt-1">Acesse suas escalas e compromissos</p>
        </div>

        {error && (
          <div className="mb-6">
            <AlertBanner type="erro" message={error} />
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-ink mb-1" htmlFor="email">
              E-mail
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
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-semibold text-ink" htmlFor="password">
                Senha
              </label>
              <Link
                href="/esqueci-senha"
                className="text-xs text-primary font-medium hover:underline"
              >
                Esqueceu sua senha?
              </Link>
            </div>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-surface border border-field-border rounded-control text-ink text-base focus:outline-none focus:ring-2 focus:ring-primary min-h-touch"
              placeholder="••••••••••••"
            />
          </div>

          {requiresMfa && (
            <div className="p-4 bg-info-soft rounded-control border border-primary/20 space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-semibold text-ink" htmlFor="totp">
                  {useRecoveryCode ? 'Código de recuperação' : 'Código de verificação (2FA)'}
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setUseRecoveryCode(!useRecoveryCode);
                    setTotpCode('');
                  }}
                  className="text-xs text-primary font-semibold hover:underline"
                >
                  {useRecoveryCode ? 'Usar aplicativo autenticador' : 'Usar código de recuperação'}
                </button>
              </div>

              {useRecoveryCode ? (
                <div>
                  <input
                    id="totp"
                    type="text"
                    maxLength={10}
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                    className="w-full px-3.5 py-2.5 bg-surface border border-primary rounded-control text-center text-lg font-mono tracking-widest text-ink focus:outline-none focus:ring-2 focus:ring-primary min-h-touch uppercase"
                    placeholder="10 DIGITOS"
                    autoFocus
                  />
                  <span className="text-xs text-ink-muted block mt-1.5 leading-relaxed">
                    Digite um dos seus códigos de recuperação gerados na ativação. Cada código pode ser usado uma única vez.
                  </span>
                </div>
              ) : (
                <div>
                  <input
                    id="totp"
                    type="text"
                    maxLength={6}
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                    className="w-full px-3.5 py-2.5 bg-surface border border-primary rounded-control text-center text-xl font-mono tracking-widest text-ink focus:outline-none focus:ring-2 focus:ring-primary min-h-touch"
                    placeholder="123456"
                    autoFocus
                  />
                  <span className="text-xs text-ink-muted block mt-1.5 leading-relaxed">
                    Abra seu aplicativo autenticador (Google Authenticator, Microsoft Authenticator, 1Password, etc.) e digite o código de 6 dígitos.
                  </span>
                </div>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-primary text-on-primary font-semibold rounded-control hover:opacity-95 transition-opacity disabled:opacity-50 min-h-touch flex items-center justify-center text-base"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-line text-center">
          <p className="text-sm text-ink-muted">
            Ainda não tem cadastro?{' '}
            <Link href="/cadastro" className="font-semibold text-primary hover:underline">
              Cadastre-se como voluntário
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[80vh] flex flex-col justify-center items-center py-12 px-4">
          <div className="max-w-md w-full bg-surface p-8 rounded-surface border border-line shadow-sm text-center">
            <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm font-medium text-ink-muted">Carregando...</p>
          </div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
