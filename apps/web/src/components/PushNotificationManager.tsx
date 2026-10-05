'use client';

import React, { useState, useEffect } from 'react';
import { Bell } from '@/components/Icons';
import { isCapacitorNative } from '@/lib/capacitor-adapter';
import { registerNativePush } from '@/lib/capacitor-push';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function PushNotificationManager() {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isIosPromptNeeded, setIsIosPromptNeeded] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'sucesso' | 'erro' | 'aviso'; text: string } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Detecta se é dispositivo iOS fora do modo PWA standalone
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true;

    if (isIOS && !isStandalone && !isCapacitorNative()) {
      setIsIosPromptNeeded(true);
    }

    if (isCapacitorNative()) {
      setIsSupported(true);
    } else if ('serviceWorker' in navigator && 'PushManager' in window) {
      setIsSupported(true);
      checkCurrentSubscription();
    }
  }, []);

  async function checkCurrentSubscription() {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        const sub = await reg.pushManager.getSubscription();
        setIsSubscribed(!!sub);
      }
    } catch {
      // Falha silenciosa de leitura de permissão
    }
  }

  async function handleSubscribe() {
    setLoading(true);
    setStatusMessage(null);

    if (isCapacitorNative()) {
      try {
        const result = await registerNativePush({
          onTokenReceived: () => {
            setIsSubscribed(true);
            setStatusMessage({
              type: 'sucesso',
              text: 'Notificações ativadas no seu aplicativo móvel! Você receberá alertas diretamente neste celular.',
            });
          },
        });

        if (!result.success) {
          setStatusMessage({
            type: 'erro',
            text: result.error || 'Não foi possível ativar notificações no aplicativo.',
          });
        } else {
          setIsSubscribed(true);
          setStatusMessage({
            type: 'sucesso',
            text: 'Notificações ativadas no seu aplicativo móvel! Você receberá alertas diretamente neste celular.',
          });
        }
      } catch (err: unknown) {
        setStatusMessage({
          type: 'erro',
          text: err instanceof Error ? err.message : 'Falha ao ativar notificações no app.',
        });
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      if (Notification.permission === 'denied') {
        setStatusMessage({
          type: 'aviso',
          text: 'As notificações estão bloqueadas neste aparelho. Fique tranquilo(a): você continuará recebendo avisos de escala e lembretes normalmente por e-mail ou WhatsApp.',
        });
        setLoading(false);
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatusMessage({
          type: 'aviso',
          text: 'Você não autorizou as notificações neste aparelho. Lembretes e escalas continuarão sendo enviados pelo e-mail cadastrado ou WhatsApp.',
        });
        setLoading(false);
        return;
      }

      // Garante o registro do Service Worker
      let reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        reg = await navigator.serviceWorker.register('/sw.js');
      }

      // Busca a chave pública VAPID do servidor
      const keyRes = await fetch('/api/push/public-key');
      const keyData = await keyRes.json();

      if (!keyRes.ok || !keyData.success) {
        setStatusMessage({
          type: 'erro',
          text: keyData.error || 'Não foi possível obter as credenciais de notificação do servidor.',
        });
        setLoading(false);
        return;
      }

      if (!keyData.publicKey) {
        setStatusMessage({
          type: 'aviso',
          text: 'O servidor está em modo de simulação (chaves VAPID não configuradas). As notificações funcionarão internamente.',
        });
        setLoading(false);
        return;
      }

      const convertedVapidKey = urlBase64ToUint8Array(keyData.publicKey);
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey as unknown as BufferSource,
      });

      // Salva no banco de dados da aplicação
      const subRes = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      });

      const subData = await subRes.json();

      if (!subRes.ok || !subData.success) {
        setStatusMessage({
          type: 'erro',
          text: subData.error || 'Erro ao registrar dispositivo no servidor.',
        });
        setLoading(false);
        return;
      }

      setIsSubscribed(true);
      setStatusMessage({
        type: 'sucesso',
        text: 'Notificações ativadas com sucesso! Você receberá alertas diretamente neste celular.',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao ativar notificações push.';
      setStatusMessage({
        type: 'erro',
        text: msg,
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleUnsubscribe() {
    setLoading(true);
    setStatusMessage(null);

    if (isCapacitorNative()) {
      setIsSubscribed(false);
      setStatusMessage({
        type: 'sucesso',
        text: 'Notificações push desativadas neste aplicativo.',
      });
      setLoading(false);
      return;
    }

    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          const endpoint = sub.endpoint;
          await sub.unsubscribe();

          await fetch('/api/push/unsubscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint }),
          });
        }
      }

      setIsSubscribed(false);
      setStatusMessage({
        type: 'sucesso',
        text: 'Notificações push desativadas neste aparelho.',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao desativar notificações.';
      setStatusMessage({
        type: 'erro',
        text: msg,
      });
    } finally {
      setLoading(false);
    }
  }

  if (!isSupported) {
    return (
      <div className="p-4 bg-bg rounded-control border border-line text-xs text-ink-muted">
        Este navegador ou dispositivo não possui suporte a notificações push nativas.
      </div>
    );
  }

  return (
    <div className="p-4 bg-bg rounded-control border border-line space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h5 className="font-semibold text-sm text-ink flex items-center gap-2">
            <Bell size={18} className="text-primary flex-shrink-0" /> Notificações Push neste Aparelho
          </h5>
          <p className="text-xs text-ink-muted mt-0.5">
            {isSubscribed
              ? 'Este celular/navegador está configurado para receber avisos imediatos de escala.'
              : 'Receba alertas sonoros e na tela de bloqueio quando você for escalado(a) ou houver trocas.'}
          </p>
        </div>

        <div>
          {isSubscribed ? (
            <button
              type="button"
              onClick={handleUnsubscribe}
              disabled={loading}
              className="px-3.5 py-2 border border-line text-ink-muted hover:text-danger hover:border-danger text-xs font-semibold rounded-control transition-colors min-h-touch disabled:opacity-50"
            >
              {loading ? 'Atualizando...' : 'Desativar neste aparelho'}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubscribe}
              disabled={loading}
              className="px-4 py-2 bg-primary text-white text-xs font-semibold rounded-control hover:opacity-95 transition-opacity min-h-touch disabled:opacity-50"
            >
              {loading ? 'Ativando...' : 'Ativar notificações neste celular'}
            </button>
          )}
        </div>
      </div>

      {isIosPromptNeeded && (
        <div className="p-3 bg-bg-muted rounded-control border border-line text-xs text-ink-muted space-y-1">
          <p className="font-semibold text-ink flex items-center gap-1.5">
            📱 Usuários de iPhone / iPad (iOS):
          </p>
          <p>
            No iPhone, as notificações push exigem que o aplicativo esteja instalado na Tela de Início.
            Para ativar: toque no botão <strong>Compartilhar</strong> do Safari e escolha <strong>"Adicionar à Tela de Início"</strong>.
          </p>
        </div>
      )}

      {statusMessage && (
        <div
          className={`text-xs p-3 rounded-control font-medium ${
            statusMessage.type === 'sucesso'
              ? 'bg-success-soft text-success-ink border border-success/30'
              : statusMessage.type === 'erro'
              ? 'bg-danger-soft text-danger-ink border border-danger/30'
              : 'bg-warning-soft text-warning-ink border border-warning/30'
          }`}
        >
          {statusMessage.text}
        </div>
      )}
    </div>
  );
}
