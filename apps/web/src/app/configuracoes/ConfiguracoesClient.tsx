'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { validateChurchThemeColor, ThemeContrastReport } from '@revezo/domain';
import { AlertBanner } from '@/components/AlertBanner';

interface ChurchSettingsData {
  name: string;
  logoUrl?: string | null;
  primaryColor: string;
  secondaryColor: string;
}

export function ConfiguracoesClient({ initialSettings }: { initialSettings: ChurchSettingsData }) {
  const router = useRouter();
  const [name, setName] = useState(initialSettings.name);
  const [logoUrl, setLogoUrl] = useState(initialSettings.logoUrl || '');
  const [primaryColor, setPrimaryColor] = useState(initialSettings.primaryColor);
  const [secondaryColor, setSecondaryColor] = useState(initialSettings.secondaryColor);
  const [message, setMessage] = useState<{ type: 'sucesso' | 'erro'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  // Validação em tempo real de contraste WCAG AA da cor da igreja
  let contrastReport: ThemeContrastReport = {
    primaryHex: primaryColor,
    contrastWithWhite: 9.5,
    contrastWithLightBg: 8.0,
    passesWhiteText: true,
    passesLightBg: true,
    suggestedHex: undefined,
  };

  try {
    contrastReport = validateChurchThemeColor(primaryColor);
  } catch {
    // Hex em edição incompleta
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setLoading(true);

    try {
      const res = await fetch('/api/configuracoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          logoUrl: logoUrl || undefined,
          primaryColor,
          secondaryColor,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setMessage({ type: 'erro', text: data.error || 'Erro ao salvar configurações.' });
        return;
      }

      if (typeof document !== 'undefined') {
        document.documentElement.style.setProperty('--color-primary', primaryColor);
        document.documentElement.style.setProperty('--color-secondary', secondaryColor);
      }

      setMessage({ type: 'sucesso', text: 'Configurações e tema da igreja atualizados com sucesso!' });
      router.refresh();
    } catch {
      setMessage({ type: 'erro', text: 'Erro de comunicação ao salvar.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      {message && <AlertBanner type={message.type} message={message.text} />}

      <div className="bg-surface rounded-surface border border-line p-6 shadow-sm">
        <h2 className="font-display font-bold text-xl text-ink mb-4">Identidade Visual da Igreja</h2>
        <p className="text-sm text-ink-muted mb-6">
          Personalize o nome e as cores principais do sistema. As cores de sinalização (sucesso, erro, advertência) permanecem fixas para garantir clareza e acessibilidade.
        </p>

        <form onSubmit={handleSave} className="space-y-6">
          <div>
            <label className="block text-xs font-semibold text-ink-muted uppercase mb-1">
              Nome da Igreja *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-surface border border-field-border rounded-control text-sm text-ink min-h-touch"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-muted uppercase mb-1">
              URL da Logomarca (opcional)
            </label>
            <input
              type="url"
              placeholder="https://sua-igreja.com/logo.png"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-surface border border-field-border rounded-control text-sm text-ink min-h-touch"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-ink-muted uppercase mb-1">
                Cor Primária da Igreja (Hexadecimal) *
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-10 h-10 rounded border border-field-border cursor-pointer p-0.5"
                />
                <input
                  type="text"
                  required
                  maxLength={7}
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="flex-1 px-3 py-2 bg-surface border border-field-border rounded-control text-sm text-ink font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-muted uppercase mb-1">
                Cor Secundária (Destaque) *
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="color"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="w-10 h-10 rounded border border-field-border cursor-pointer p-0.5"
                />
                <input
                  type="text"
                  required
                  maxLength={7}
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="flex-1 px-3 py-2 bg-surface border border-field-border rounded-control text-sm text-ink font-mono"
                />
              </div>
            </div>
          </div>

          {/* Verificador de Acessibilidade e Contraste WCAG 2.1 */}
          <div className="p-4 bg-bg rounded-control border border-line space-y-2">
            <span className="text-xs font-bold text-ink uppercase tracking-wider block">
              Verificador de Acessibilidade (WCAG AA)
            </span>
            <p className="text-xs text-ink-muted">
              Razão de contraste com texto branco:{' '}
              <strong className={contrastReport.passesWhiteText ? 'text-success' : 'text-danger'}>
                {contrastReport.contrastWithWhite}:1
              </strong>{' '}
              (Mínimo exigido: 4.5:1)
            </p>

            {!contrastReport.passesWhiteText && (
              <div className="pt-2">
                <AlertBanner
                  type="advertencia"
                  message="Esta cor é muito clara para botões com texto branco e causará dificuldade de leitura."
                />
                {contrastReport.suggestedHex && (
                  <button
                    type="button"
                    onClick={() => setPrimaryColor(contrastReport.suggestedHex!)}
                    className="mt-2 text-xs font-bold text-primary underline"
                  >
                    Aplicar tom acessível sugerido ({contrastReport.suggestedHex})
                  </button>
                )}
              </div>
            )}

            {/* Pré-visualização ao vivo */}
            <div className="pt-3 flex items-center space-x-3">
              <span className="text-xs text-ink-muted">Prévia do Botão:</span>
              <button
                type="button"
                style={{ backgroundColor: primaryColor }}
                className="px-4 py-2 text-white font-semibold text-xs rounded-control shadow-sm"
              >
                Confirmar Presença
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-primary text-white font-semibold rounded-control hover:opacity-95 text-sm min-h-touch disabled:opacity-50"
          >
            {loading ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </form>
      </div>
    </div>
  );
}
