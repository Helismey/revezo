import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { POST } from '../src/app/api/webhooks/whatsapp/route';
import { defaultWebhookReplayTracker } from '@revezo/domain';
import { prisma } from '@revezo/db';
import { createHmac } from 'crypto';

vi.mock('@revezo/db', () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}));

describe('Webhook WhatsApp Security & Opt-Out Route Handler (/api/webhooks/whatsapp)', () => {
  const originalEnv = process.env;
  const mockSecret = 'test-webhook-secret-token-key';

  function signPayload(bodyText: string, timestamp: number, secret: string): string {
    return createHmac('sha256', secret).update(`${timestamp}.${bodyText}`).digest('hex');
  }

  beforeEach(() => {
    (process.env as any) = { ...originalEnv, WEBHOOK_SECRET: mockSecret, NODE_ENV: 'test' };
    defaultWebhookReplayTracker.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('rejeita com status 401 quando assinatura ou timestamp estão ausentes e o segredo está ativo', async () => {
    const req = new Request('https://escala.igreja.local/api/webhooks/whatsapp', {
      method: 'POST',
      body: JSON.stringify({ text: 'olá' }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.error).toContain('Assinatura ou timestamp ausente');
  });

  it('rejeita com status 400 quando o timestamp do webhook expirou além de 5 minutos', async () => {
    const now = Date.now();
    const expiredTimestamp = now - 6 * 60 * 1000; // 6 minutos atrás
    const bodyText = JSON.stringify({ message: 'oi' });
    const signature = signPayload(bodyText, expiredTimestamp, mockSecret);

    const req = new Request('https://escala.igreja.local/api/webhooks/whatsapp', {
      method: 'POST',
      headers: {
        'x-webhook-signature': signature,
        'x-webhook-timestamp': String(expiredTimestamp),
      },
      body: bodyText,
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain('Timestamp expirado ou fora da janela de tolerância');
  });

  it('rejeita com status 403 quando a assinatura HMAC é inválida', async () => {
    const now = Date.now();
    const bodyText = JSON.stringify({ message: 'teste de invasão' });
    const wrongSignature = signPayload(bodyText, now, 'wrong-key-secret');

    const req = new Request('https://escala.igreja.local/api/webhooks/whatsapp', {
      method: 'POST',
      headers: {
        'x-webhook-signature': wrongSignature,
        'x-webhook-timestamp': String(now),
      },
      body: bodyText,
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toContain('Assinatura HMAC inválida');
  });

  it('detecta e rejeita ataque de repetição (Replay Attack) com status 409', async () => {
    const now = Date.now();
    const bodyText = JSON.stringify({ phone: '5562987654321', text: 'olá', eventId: 'evt-repeat-999' });
    const signature = signPayload(bodyText, now, mockSecret);

    const createRequest = () =>
      new Request('https://escala.igreja.local/api/webhooks/whatsapp', {
        method: 'POST',
        headers: {
          'x-webhook-signature': signature,
          'x-webhook-timestamp': String(now),
          'x-webhook-event-id': 'evt-repeat-999',
        },
        body: bodyText,
      });

    // 1ª tentativa: deve ser aceita
    const firstRes = await POST(createRequest());
    expect(firstRes.status).toBe(200);

    // 2ª tentativa (replay do mesmo eventId): deve ser rejeitada com 409
    const secondRes = await POST(createRequest());
    const secondData = await secondRes.json();

    expect(secondRes.status).toBe(409);
    expect(secondData.error).toContain('replay attack prevenido');
  });

  it('aplica fail-closed com status 500 em ambiente de produção se WEBHOOK_SECRET estiver ausente', async () => {
    (process.env as any).NODE_ENV = 'production';
    delete process.env.WEBHOOK_SECRET;

    const req = new Request('https://escala.igreja.local/api/webhooks/whatsapp', {
      method: 'POST',
      body: JSON.stringify({ test: true }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toContain('WEBHOOK_SECRET não configurado no servidor em produção');
  });

  it('processa mensagem "PARAR", ativa opt-out de imediato e grava AuditLog', async () => {
    const mockUser = {
      id: 'usr-voluntario-1',
      name: 'Gabriel Martins',
      churchId: 'church-123',
      whatsapp: '5562987654321',
      optOutWhatsapp: false,
    };

    (prisma.user.findFirst as any).mockResolvedValue(mockUser);
    (prisma.user.update as any).mockResolvedValue({ ...mockUser, optOutWhatsapp: true });
    (prisma.auditLog.create as any).mockResolvedValue({ id: 'audit-log-1' });

    const now = Date.now();
    const bodyText = JSON.stringify({
      phone: '5562987654321',
      text: 'PARAR',
      id: 'evt-optout-1',
    });
    const signature = signPayload(bodyText, now, mockSecret);

    const req = new Request('https://escala.igreja.local/api/webhooks/whatsapp', {
      method: 'POST',
      headers: {
        'x-webhook-signature': signature,
        'x-webhook-timestamp': String(now),
        'x-webhook-event-id': 'evt-optout-1',
      },
      body: bodyText,
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.action).toBe('opt_out_processed');
    expect(data.autoReply).toContain('PARAR o envio de lembretes por WhatsApp foi atendida');

    // Verifica que o opt-out foi persistido no banco
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'usr-voluntario-1' },
      data: { optOutWhatsapp: true },
    });

    // Verifica que a trilha de auditoria foi criada com telefone mascarado
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'USER_OPTOUT_WHATSAPP_WEBHOOK',
          targetId: 'usr-voluntario-1',
          result: 'SUCCESS',
          meta: expect.objectContaining({
            phoneMasked: expect.stringContaining('****'),
            keyword: 'PARAR',
          }),
        }),
      })
    );
  });

  it('lida com solicitação "PARAR" de número não cadastrado sem quebrar a execução', async () => {
    (prisma.user.findFirst as any).mockResolvedValue(null);

    const now = Date.now();
    const bodyText = JSON.stringify({
      phone: '5511999998888',
      text: 'PARAR',
      id: 'evt-optout-unknown',
    });
    const signature = signPayload(bodyText, now, mockSecret);

    const req = new Request('https://escala.igreja.local/api/webhooks/whatsapp', {
      method: 'POST',
      headers: {
        'x-webhook-signature': signature,
        'x-webhook-timestamp': String(now),
      },
      body: bodyText,
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.action).toBe('opt_out_unmatched_user');
    expect(data.phoneMasked).toContain('****');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('trata payload malicioso com comandos ou scripts de forma defensiva como dado não confiável', async () => {
    const now = Date.now();
    const bodyText = JSON.stringify({
      phone: '5562987654321',
      text: '<script>alert("xss")</script>; DROP TABLE users; --',
      id: 'evt-malicious-1',
    });
    const signature = signPayload(bodyText, now, mockSecret);

    const req = new Request('https://escala.igreja.local/api/webhooks/whatsapp', {
      method: 'POST',
      headers: {
        'x-webhook-signature': signature,
        'x-webhook-timestamp': String(now),
      },
      body: bodyText,
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.action).toBe('received');
  });
});
