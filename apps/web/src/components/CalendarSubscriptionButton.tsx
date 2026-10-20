'use client';

import React, { useState } from 'react';
import { Calendar, X, Copy, Check, CalendarBlank } from '@/components/Icons';

export function CalendarSubscriptionButton() {
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [calendarLinks, setCalendarLinks] = useState<{ icsUrl: string; webcalUrl: string } | null>(null);
  const [copiedWebcal, setCopiedWebcal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenModal = async () => {
    setModalOpen(true);
    setError(null);
    if (calendarLinks) return;

    setLoading(true);
    try {
      const res = await fetch('/api/calendario/token', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Não foi possível gerar o link de calendário.');
        return;
      }
      setCalendarLinks({
        icsUrl: data.icsUrl,
        webcalUrl: data.webcalUrl,
      });
    } catch {
      setError('Erro de comunicação ao gerar o link de calendário.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyWebcal = async () => {
    if (!calendarLinks) return;
    try {
      await navigator.clipboard.writeText(calendarLinks.webcalUrl);
      setCopiedWebcal(true);
      setTimeout(() => setCopiedWebcal(false), 3000);
    } catch {
      // Fallback
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpenModal}
        className="px-3.5 py-2 bg-bg border border-line text-ink font-semibold rounded-control text-xs sm:text-sm hover:bg-surface min-h-touch inline-flex items-center gap-2 transition-colors"
      >
        <Calendar size={18} />
        <span>Sincronizar com Calendário</span>
      </button>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40">
          <div className="bg-surface rounded-surface border border-line max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2">
                <Calendar size={20} className="text-primary flex-shrink-0" />
                <h3 className="font-display font-bold text-lg text-ink">
                  Sincronizar Escalas com o Calendário
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-ink-muted hover:text-ink p-1 rounded-control min-h-touch min-w-[44px] flex items-center justify-center"
                aria-label="Fechar modal"
              >
                <X size={20} />
              </button>
            </div>

            {loading ? (
              <p className="text-sm text-ink-muted text-center py-6">Gerando seu link seguro de assinatura...</p>
            ) : error ? (
              <p className="text-sm text-danger text-center py-4">{error}</p>
            ) : (
              calendarLinks && (
                <div className="space-y-4">
                  <p className="text-xs text-ink-muted leading-relaxed">
                    Adicione suas escalas ao <strong>Google Agenda</strong>, <strong>Apple Calendar</strong> ou <strong>Outlook</strong>. Os cultos e horários serão atualizados automaticamente no seu celular.
                  </p>

                  <div className="space-y-2 p-3 bg-bg border border-line rounded-control">
                    <span className="block text-xs font-semibold text-ink uppercase tracking-wider">
                      Link de Assinatura Automática (Recomendado)
                    </span>
                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        readOnly
                        aria-label="Link de assinatura do calendário"
                        value={calendarLinks.webcalUrl}
                        className="flex-1 px-3 py-1.5 bg-surface border border-field-border rounded-control text-xs font-mono text-ink select-all"
                      />
                      <button
                        type="button"
                        onClick={handleCopyWebcal}
                        className="px-3 py-1.5 bg-primary text-white text-xs font-semibold rounded-control hover:opacity-95 whitespace-nowrap min-h-touch inline-flex items-center gap-1"
                      >
                        {copiedWebcal ? (
                          <>
                            <Check size={14} weight="bold" /> Copiado!
                          </>
                        ) : (
                          <>
                            <Copy size={14} /> Copiar
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-line">
                    <span className="block text-xs font-semibold text-ink uppercase tracking-wider">
                      Ou baixe o arquivo avulso:
                    </span>
                    <a
                      href={calendarLinks.icsUrl}
                      download="escala.ics"
                      className="px-4 py-2 bg-surface border border-line hover:bg-bg text-ink text-xs font-semibold rounded-control inline-flex items-center gap-2 min-h-touch transition-colors"
                    >
                      <CalendarBlank size={16} />
                      <span>Baixar arquivo .ics</span>
                    </a>
                  </div>

                  <div className="text-[11px] text-ink-muted bg-info-soft/40 p-3 rounded-control space-y-1">
                    <p className="font-semibold text-ink">Como assinar no celular:</p>
                    <p>• <strong>iPhone (Apple Calendar):</strong> Abra o app Calendário &gt; Contas &gt; Adicionar Assinatura de Calendário e cole o link.</p>
                    <p>• <strong>Android / Google Agenda:</strong> Acesse calendar.google.com no computador &gt; Outros calendários (+) &gt; Do URL e cole o link copiado.</p>
                  </div>
                </div>
              )
            )}

            <div className="flex justify-end pt-3 border-t border-line">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 bg-bg border border-line text-ink font-semibold rounded-control text-sm hover:bg-surface min-h-touch"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
