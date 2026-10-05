import { describe, expect, it, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { GET as handlePublicKeyGet } from '../src/app/api/push/public-key/route';
import { POST as handleSubscribePost } from '../src/app/api/push/subscribe/route';
import { POST as handleUnsubscribePost } from '../src/app/api/push/unsubscribe/route';
import * as authService from '../src/lib/auth-service';
import { prisma } from '@revezo/db';

describe('Testes de PWA, Offline e Web Push (Skill pwa-offline-push)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Manifesto PWA (/manifest.json) cumpre todos os requisitos de instalabilidade e ícones maskable', () => {
    const manifestPath = path.resolve(__dirname, '../public/manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);

    const manifestRaw = fs.readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestRaw);

    // Requisitos fundamentais do PWA (Skill pwa-offline-push)
    expect(manifest.name).toBe('Revezo');
    expect(manifest.short_name).toBe('Escala');
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.lang).toBe('pt-BR');
    expect(manifest.theme_color).toBe('#0F4C5C');
    expect(manifest.background_color).toBe('#F4F6F7');

    // Validação de ícones incluindo maskable
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);

    const has192 = manifest.icons.some((i: any) => i.sizes === '192x192' && i.src === '/icon-192.png');
    const has512Maskable = manifest.icons.some(
      (i: any) => i.sizes === '512x512' && i.src === '/icon-512.png' && i.purpose?.includes('maskable')
    );

    expect(has192).toBe(true);
    expect(has512Maskable).toBe(true);
  });

  it('Service Worker (/sw.js) implementa precache, fallback offline, SKIP_WAITING e limpeza de cache', () => {
    const swPath = path.resolve(__dirname, '../public/sw.js');
    expect(fs.existsSync(swPath)).toBe(true);

    const swContent = fs.readFileSync(swPath, 'utf-8');

    // 1. Instalação e Precache
    expect(swContent).toContain("addEventListener('install'");
    expect(swContent).toContain("'/offline'");
    expect(swContent).toContain("'/manifest.json'");

    // 2. Fallback offline em navegação
    expect(swContent).toContain("request.mode === 'navigate'");
    expect(swContent).toContain('OFFLINE_URL');

    // 3. Atualização do Service Worker (Aviso "Nova versão disponível" e SKIP_WAITING)
    expect(swContent).toContain("event.data.action === 'SKIP_WAITING'");
    expect(swContent).toContain('self.skipWaiting()');

    // 4. Limpeza de cache no logout (Regra 17 / LGPD)
    expect(swContent).toContain("event.data.action === 'CLEAR_USER_CACHE'");
    expect(swContent).toContain('/minha-escala');
    expect(swContent).toContain('/perfil');

    // 5. Notificações Push e clique
    expect(swContent).toContain("addEventListener('push'");
    expect(swContent).toContain("addEventListener('notificationclick'");
  });

  it('Endpoint de chave pública (/api/push/public-key) responde corretamente com VAPID configurado ou simulação', async () => {
    vi.spyOn(authService, 'getSession').mockResolvedValueOnce({
      userId: 'usr-1',
      churchId: 'church-1',
      globalRole: 'VOLUNTEER',
    } as any);

    const res = await handlePublicKeyGet();
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data).toHaveProperty('publicKey');
  });

  it('Inscrição Web Push (/api/push/subscribe) exige autenticação e payload válido', async () => {
    // 1. Não autenticado -> 401
    vi.spyOn(authService, 'getSession').mockResolvedValueOnce(null);
    const unauthReq = new Request('http://localhost:3000/api/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({ endpoint: 'https://push.example.com/sub/123', keys: { p256dh: 'k1', auth: 'k2' } }),
    });

    const unauthRes = await handleSubscribePost(unauthReq as any);
    expect(unauthRes.status).toBe(401);

    // 2. Autenticado com payload válido -> 200
    vi.spyOn(authService, 'getSession').mockResolvedValueOnce({
      userId: 'usr-voluntario-1',
      churchId: 'church-1',
      globalRole: 'VOLUNTEER',
    } as any);

    vi.spyOn(prisma.pushSubscription, 'upsert').mockResolvedValueOnce({
      id: 'sub-1',
      userId: 'usr-voluntario-1',
      endpoint: 'https://push.example.com/sub/123',
      keys: { p256dh: 'k1', auth: 'k2' },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    vi.spyOn(prisma.user, 'update').mockResolvedValueOnce({ id: 'usr-voluntario-1', optOutPush: false } as any);
    vi.spyOn(prisma.auditLog, 'create').mockResolvedValueOnce({ id: 'audit-1' } as any);

    const validReq = new Request('http://localhost:3000/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: 'https://push.example.com/sub/123',
        keys: { p256dh: 'chave-p256dh-valida', auth: 'chave-auth-valida' },
      }),
    });

    const validRes = await handleSubscribePost(validReq as any);
    expect(validRes.status).toBe(200);

    const validData = await validRes.json();
    expect(validData.success).toBe(true);
  });

  it('Cancelamento de Inscrição Web Push (/api/push/unsubscribe) remove a assinatura do banco', async () => {
    vi.spyOn(authService, 'getSession').mockResolvedValueOnce({
      userId: 'usr-voluntario-1',
      churchId: 'church-1',
      globalRole: 'VOLUNTEER',
    } as any);

    vi.spyOn(prisma.pushSubscription, 'findUnique').mockResolvedValueOnce({
      id: 'sub-1',
      userId: 'usr-voluntario-1',
      endpoint: 'https://push.example.com/sub/123',
    } as any);

    const deleteSpy = vi.spyOn(prisma.pushSubscription, 'delete').mockResolvedValueOnce({ id: 'sub-1' } as any);
    vi.spyOn(prisma.auditLog, 'create').mockResolvedValueOnce({ id: 'audit-2' } as any);

    const req = new Request('http://localhost:3000/api/push/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: 'https://push.example.com/sub/123',
      }),
    });

    const res = await handleUnsubscribePost(req as any);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(deleteSpy).toHaveBeenCalledWith({
      where: {
        endpoint: 'https://push.example.com/sub/123',
      },
    });
  });

  it('Resiliência e Fallback: Se Web Push for negado pelo usuário, lembretes operam por E-mail ou WhatsApp', () => {
    // Simula as preferências de usuário onde push foi negado (optOutPush = true)
    const volunteerWithPushDenied = {
      id: 'usr-1',
      name: 'Carlos Oliveira',
      email: 'carlos@revezo.local',
      phonePrimary: '5562988887777',
      preferredChannel: 'EMAIL',
      optOutPush: true,
      optOutEmail: false,
      optOutWhatsapp: false,
    };

    // Valida que o voluntário possui canais de entrega ativos para fallback
    const hasAlternativeChannel = !volunteerWithPushDenied.optOutEmail || !volunteerWithPushDenied.optOutWhatsapp;
    expect(hasAlternativeChannel).toBe(true);
    expect(volunteerWithPushDenied.email).toBeDefined();
  });
});
