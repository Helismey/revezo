import { describe, expect, it, beforeEach } from 'vitest';
import { createHmac } from 'crypto';
import {
  verifyWebhookSignature,
  WebhookReplayTracker,
  isOptOutKeyword,
  normalizePhoneDigits,
  extractIncomingWhatsAppPayload,
} from '../src/index.js';

describe('Webhook Security: Assinatura HMAC e Tolerância de Tempo', () => {
  const secret = 'super-secret-webhook-key-revezo';
  const now = 1700000000000;
  const rawBody = JSON.stringify({ message: 'teste de integridade' });

  function generateSignature(ts: number, body: string, key: string): string {
    return createHmac('sha256', key).update(`${ts}.${body}`).digest('hex');
  }

  it('valida assinatura correta dentro da janela de tolerância', () => {
    const timestamp = String(now - 30 * 1000); // 30 segundos atrás
    const signature = generateSignature(Number(timestamp), rawBody, secret);

    const result = verifyWebhookSignature({
      signature,
      timestamp,
      rawBody,
      secret,
      now,
    });

    expect(result.valid).toBe(true);
    expect(result.reason).toBe('OK');
  });

  it('suporta assinatura no formato com prefixo sha256=', () => {
    const timestamp = String(now);
    const signature = `sha256=${generateSignature(Number(timestamp), rawBody, secret)}`;

    const result = verifyWebhookSignature({
      signature,
      timestamp,
      rawBody,
      secret,
      now,
    });

    expect(result.valid).toBe(true);
    expect(result.reason).toBe('OK');
  });

  it('rejeita requisição quando assinatura ou timestamp estão ausentes', () => {
    expect(
      verifyWebhookSignature({
        signature: null,
        timestamp: String(now),
        rawBody,
        secret,
        now,
      }).valid
    ).toBe(false);

    expect(
      verifyWebhookSignature({
        signature: 'valid-looking-sig',
        timestamp: null,
        rawBody,
        secret,
        now,
      }).valid
    ).toBe(false);
  });

  it('rejeita timestamp expirado além da janela de tolerância de 5 minutos', () => {
    const expiredTimestamp = String(now - 6 * 60 * 1000); // 6 minutos atrás
    const signature = generateSignature(Number(expiredTimestamp), rawBody, secret);

    const result = verifyWebhookSignature({
      signature,
      timestamp: expiredTimestamp,
      rawBody,
      secret,
      now,
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('EXPIRED_TIMESTAMP');
  });

  it('rejeita timestamp adulterado no futuro além da tolerância', () => {
    const futureTimestamp = String(now + 10 * 60 * 1000); // 10 minutos no futuro
    const signature = generateSignature(Number(futureTimestamp), rawBody, secret);

    const result = verifyWebhookSignature({
      signature,
      timestamp: futureTimestamp,
      rawBody,
      secret,
      now,
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('EXPIRED_TIMESTAMP');
  });

  it('rejeita assinatura adulterada ou gerada com chave errada', () => {
    const timestamp = String(now);
    const badSignature = generateSignature(Number(timestamp), rawBody, 'wrong-secret-key');

    const result = verifyWebhookSignature({
      signature: badSignature,
      timestamp,
      rawBody,
      secret,
      now,
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('INVALID_SIGNATURE');
  });
});

describe('Webhook Replay Protection: WebhookReplayTracker', () => {
  let tracker: WebhookReplayTracker;
  const ttlMs = 5 * 60 * 1000; // 5 minutos

  beforeEach(() => {
    tracker = new WebhookReplayTracker(ttlMs);
  });

  it('permite evento inédito e bloqueia tentativa de repetição (replay attack)', () => {
    const eventId = 'evt-uniq-1234';
    const now = 1000000;

    expect(tracker.isReplay(eventId, now)).toBe(false);
    tracker.record(eventId, now);

    // Segunda tentativa imediata deve ser detectada como replay
    expect(tracker.isReplay(eventId, now)).toBe(true);
    expect(tracker.isReplay(eventId, now + 1000)).toBe(true);
  });

  it('expira eventos antigos após o TTL configurado', () => {
    const eventId = 'evt-old-5678';
    const initialTime = 1000000;

    tracker.record(eventId, initialTime);
    expect(tracker.isReplay(eventId, initialTime + 1000)).toBe(true);

    // Após expirar o TTL (5 minutos + 1ms)
    const afterTtl = initialTime + ttlMs + 1;
    expect(tracker.isReplay(eventId, afterTtl)).toBe(false);
  });

  it('executa limpeza automática (cleanup) de registros expirados', () => {
    const now = 1000000;
    tracker.record('evt-1', now - ttlMs - 100);
    tracker.record('evt-2', now - 1000);

    expect(tracker.size).toBe(2);
    tracker.cleanup(now);
    expect(tracker.size).toBe(1);
    expect(tracker.isReplay('evt-2', now)).toBe(true);
  });
});

describe('Detecção de Opt-Out e Sanitização de Telefone', () => {
  it('reconhece palavras-chave de opt-out (PARAR, STOP, SAIR, etc.) mesmo com pontuação ou acentos', () => {
    expect(isOptOutKeyword('PARAR')).toBe(true);
    expect(isOptOutKeyword('parar')).toBe(true);
    expect(isOptOutKeyword(' Parar! ')).toBe(true);
    expect(isOptOutKeyword('STOP')).toBe(true);
    expect(isOptOutKeyword('sair')).toBe(true);
    expect(isOptOutKeyword('cancelar')).toBe(true);
    expect(isOptOutKeyword('desativar')).toBe(true);
    expect(isOptOutKeyword('Não quero')).toBe(true);
    expect(isOptOutKeyword('nao quero')).toBe(true);

    // Não confunde com frases normais
    expect(isOptOutKeyword('Posso parar na igreja mais cedo?')).toBe(false);
    expect(isOptOutKeyword('Confirmado')).toBe(false);
    expect(isOptOutKeyword('Sim')).toBe(false);
    expect(isOptOutKeyword('')).toBe(false);
    expect(isOptOutKeyword(null)).toBe(false);
  });

  it('normaliza dígitos de telefone brasileiros adicionando DDI 55 quando necessário', () => {
    expect(normalizePhoneDigits('62987654321')).toBe('5562987654321');
    expect(normalizePhoneDigits('(62) 98765-4321')).toBe('5562987654321');
    expect(normalizePhoneDigits('5562987654321')).toBe('5562987654321');
    expect(normalizePhoneDigits('+55 (62) 98765-4321')).toBe('5562987654321');
  });

  it('extrai dados de forma defensiva de múltiplos formatos de provedor', () => {
    // 1. Simples
    const simple = extractIncomingWhatsAppPayload({
      phone: '62987654321',
      text: 'PARAR',
      id: 'simple-123',
    });
    expect(simple.senderPhone).toBe('5562987654321');
    expect(simple.messageText).toBe('PARAR');
    expect(simple.eventId).toBe('simple-123');

    // 2. Evolution API
    const evo = extractIncomingWhatsAppPayload({
      event: 'messages.upsert',
      data: {
        key: {
          remoteJid: '5562987654321@s.whatsapp.net',
          id: 'evo-msg-999',
        },
        message: {
          conversation: 'PARAR',
        },
      },
    });
    expect(evo.senderPhone).toBe('5562987654321');
    expect(evo.messageText).toBe('PARAR');
    expect(evo.eventId).toBe('evo-msg-999');

    // 3. Meta Cloud API
    const meta = extractIncomingWhatsAppPayload({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: 'wamid.12345',
                    from: '5562987654321',
                    text: { body: 'PARAR' },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(meta.senderPhone).toBe('5562987654321');
    expect(meta.messageText).toBe('PARAR');
    expect(meta.eventId).toBe('wamid.12345');

    // 4. Z-API
    const zapi = extractIncomingWhatsAppPayload({
      phone: '5562987654321',
      messageId: 'zapi-456',
      text: { message: 'PARAR' },
    });
    expect(zapi.senderPhone).toBe('5562987654321');
    expect(zapi.messageText).toBe('PARAR');
    expect(zapi.eventId).toBe('zapi-456');
  });
});
