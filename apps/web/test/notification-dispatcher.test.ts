import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NotificationDispatcher } from '../src/services/notifications/dispatcher';
import { NotificationRecipient, NotificationChannel, ChannelSendResult } from '../src/services/notifications/types';
import { RenderedMessage, InMemoryRateLimiter } from '@revezo/domain';
import { prisma, recordNotificationLog } from '@revezo/db';

vi.mock('@revezo/db', () => ({
  prisma: {
    featureFlag: {
      findMany: vi.fn(),
    },
  },
  recordNotificationLog: vi.fn(),
}));

describe('NotificationDispatcher: Segurança, Anti-Abuso e Opt-Out', () => {
  const originalEnv = process.env;

  const mockRecipient: NotificationRecipient = {
    userId: 'usr-12345',
    name: 'Samuel Pereira',
    email: 'samuel@example.com',
    phonePrimary: '(62) 98765-4321',
    whatsapp: '5562987654321',
    preferredChannel: 'WHATSAPP',
    optOutWhatsapp: false,
    optOutEmail: false,
    optOutPush: false,
    optOutSms: true,
  };

  const mockMessage: RenderedMessage = {
    subject: 'Escala do Próximo Domingo',
    title: 'Culto Matutino',
    bodyText: 'Olá, Samuel! Você está escalado na Sonoplastia às 09:00.',
    bodyHtml: '<p>Olá Samuel</p>',
    actionUrl: 'https://escala.igreja.local/confirmar/token-test',
  };

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();

    (prisma.featureFlag.findMany as any).mockResolvedValue([
      { key: 'whatsapp_enabled', enabled: true },
      { key: 'sms_enabled', enabled: false },
    ]);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('respeita o limite diário de envios por usuário (anti-abuso / rate limiting)', async () => {
    // Configura limite de 3 envios por usuário para o teste
    const maxDaily = 3;
    const testLimiter = new InMemoryRateLimiter({
      maxAttempts: maxDaily,
      windowMs: 24 * 60 * 60 * 1000,
    });

    const dispatcher = new NotificationDispatcher({
      maxDailyPerUser: maxDaily,
      dailyLimiter: testLimiter,
    });

    // Mock do canal para simular envio bem-sucedido
    const mockChannel: NotificationChannel = {
      name: 'email',
      send: vi.fn().mockResolvedValue({
        channel: 'email',
        success: true,
        externalMessageId: 'msg-ok',
      }),
    };
    dispatcher.registerChannel(mockChannel);

    // Disparos 1, 2 e 3 devem ter sucesso
    for (let i = 1; i <= maxDaily; i++) {
      const res = await dispatcher.dispatch({
        recipient: { ...mockRecipient, preferredChannel: 'EMAIL' },
        message: mockMessage,
        forcedChannel: 'email',
      });
      expect(res.success).toBe(true);
    }

    // Disparo 4 deve ser bloqueado por exceder o limite diário anti-abuso
    const blockedRes = await dispatcher.dispatch({
      recipient: { ...mockRecipient, preferredChannel: 'EMAIL' },
      message: mockMessage,
      forcedChannel: 'email',
    });

    expect(blockedRes.success).toBe(false);
    expect(blockedRes.error).toContain('Limite diário de notificações atingido para este usuário');
  });

  it('respeita opt-out de WhatsApp e faz fallback automático para E-mail', async () => {
    const dispatcher = new NotificationDispatcher();

    const mockEmailChannel: NotificationChannel = {
      name: 'email',
      send: vi.fn().mockResolvedValue({
        channel: 'email',
        success: true,
        externalMessageId: 'email-fallback-ok',
      }),
    };
    const mockWhatsAppChannel: NotificationChannel = {
      name: 'whatsapp',
      send: vi.fn(),
    };

    dispatcher.registerChannel(mockEmailChannel);
    dispatcher.registerChannel(mockWhatsAppChannel);

    // Usuário tem optOutWhatsapp: true
    const result = await dispatcher.dispatch({
      recipient: { ...mockRecipient, optOutWhatsapp: true },
      message: mockMessage,
      assignmentId: 'asg-test-1',
    });

    expect(mockWhatsAppChannel.send).not.toHaveBeenCalled();
    expect(mockEmailChannel.send).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.channel).toBe('email');
  });

  it('não envia nenhuma mensagem se o usuário possuir opt-out em todos os canais', async () => {
    const dispatcher = new NotificationDispatcher();

    const mockEmailChannel: NotificationChannel = {
      name: 'email',
      send: vi.fn(),
    };
    const mockWhatsAppChannel: NotificationChannel = {
      name: 'whatsapp',
      send: vi.fn(),
    };
    const mockPushChannel: NotificationChannel = {
      name: 'push',
      send: vi.fn(),
    };

    dispatcher.registerChannel(mockEmailChannel);
    dispatcher.registerChannel(mockWhatsAppChannel);
    dispatcher.registerChannel(mockPushChannel);

    const result = await dispatcher.dispatch({
      recipient: {
        ...mockRecipient,
        optOutWhatsapp: true,
        optOutEmail: true,
        optOutPush: true,
        optOutSms: true,
      },
      message: mockMessage,
    });

    expect(result.success).toBe(false);
    expect(mockWhatsAppChannel.send).not.toHaveBeenCalled();
    expect(mockEmailChannel.send).not.toHaveBeenCalled();
    expect(mockPushChannel.send).not.toHaveBeenCalled();
  });

  it('registra NotificationLog sem expor conteúdo integral da mensagem', async () => {
    const dispatcher = new NotificationDispatcher();

    const mockEmailChannel: NotificationChannel = {
      name: 'email',
      send: vi.fn().mockResolvedValue({
        channel: 'email',
        success: true,
      }),
    };
    dispatcher.registerChannel(mockEmailChannel);

    await dispatcher.dispatch({
      recipient: { ...mockRecipient, preferredChannel: 'EMAIL' },
      message: mockMessage,
      assignmentId: 'asg-log-999',
      kind: 'D7',
      forcedChannel: 'email',
    });

    expect(recordNotificationLog).toHaveBeenCalledWith(
      expect.objectContaining({
        assignmentId: 'asg-log-999',
        kind: 'D7',
        channel: 'EMAIL',
        success: true,
      })
    );

    // Garante que o corpo integral da mensagem NÃO foi repassado ao log
    const recordedCall = (recordNotificationLog as any).mock.calls[0][0];
    expect(recordedCall.bodyText).toBeUndefined();
    expect(recordedCall.message).toBeUndefined();
  });
});
