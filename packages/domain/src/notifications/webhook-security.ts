import { createHmac, timingSafeEqual } from 'crypto';

export interface VerifyWebhookSignatureParams {
  signature: string | null;
  timestamp: string | null;
  rawBody: string;
  secret: string;
  toleranceMs?: number;
  now?: number;
}

export interface WebhookVerificationResult {
  valid: boolean;
  reason: 'OK' | 'MISSING_DATA' | 'EXPIRED_TIMESTAMP' | 'INVALID_SIGNATURE';
}

/**
 * Valida a autenticidade e frescor de uma requisição de webhook via HMAC-SHA256
 * em tempo constante (timingSafeEqual) e janela de tolerância de timestamp.
 */
export function verifyWebhookSignature(params: VerifyWebhookSignatureParams): WebhookVerificationResult {
  const { signature, timestamp, rawBody, secret, toleranceMs = 5 * 60 * 1000, now = Date.now() } = params;

  if (!signature || !timestamp || !secret) {
    return { valid: false, reason: 'MISSING_DATA' };
  }

  const ts = parseInt(timestamp, 10);
  if (isNaN(ts) || Math.abs(now - ts) > toleranceMs) {
    return { valid: false, reason: 'EXPIRED_TIMESTAMP' };
  }

  // Suporta assinaturas com prefixo 'sha256=' (estilo Meta) ou hex direto
  const cleanSig = signature.startsWith('sha256=') ? signature.slice(7) : signature;

  const expectedSignature = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  const sigBuf = Buffer.from(cleanSig.toLowerCase(), 'utf-8');
  const expBuf = Buffer.from(expectedSignature.toLowerCase(), 'utf-8');

  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false, reason: 'INVALID_SIGNATURE' };
  }

  return { valid: true, reason: 'OK' };
}

/**
 * Rastreador em memória contra ataques de repetição (Replay Attacks) com TTL.
 */
export class WebhookReplayTracker {
  private events = new Map<string, number>();
  private readonly ttlMs: number;

  constructor(ttlMs = 10 * 60 * 1000) {
    this.ttlMs = ttlMs;
  }

  isReplay(eventId: string, now = Date.now()): boolean {
    const timestamp = this.events.get(eventId);
    if (!timestamp) {
      return false;
    }
    if (now - timestamp > this.ttlMs) {
      this.events.delete(eventId);
      return false;
    }
    return true;
  }

  record(eventId: string, now = Date.now()): void {
    if (this.events.size >= 5000) {
      this.cleanup(now);
    }
    this.events.set(eventId, now);
  }

  cleanup(now = Date.now()): void {
    for (const [id, ts] of this.events.entries()) {
      if (now - ts > this.ttlMs) {
        this.events.delete(id);
      }
    }
  }

  clear(): void {
    this.events.clear();
  }

  get size(): number {
    return this.events.size;
  }
}

/**
 * Singleton padrão de proteção contra replay para uso global no processo web.
 */
export const defaultWebhookReplayTracker = new WebhookReplayTracker();

/**
 * Verifica se a mensagem recebida é uma solicitação explícita de opt-out (ex: "PARAR").
 */
export function isOptOutKeyword(rawText?: string | null): boolean {
  if (!rawText) return false;

  // Normaliza texto: remove pontuação, acentos, converte para caixa baixa
  const clean = rawText
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '');

  const optOutWords = new Set([
    'parar',
    'stop',
    'sair',
    'cancelar',
    'desativar',
    'nao quero',
    'nao enviar',
    'bloquear',
  ]);

  return optOutWords.has(clean);
}

/**
 * Extrai dígitos numéricos de telefone e lida com formatos brasileiros.
 */
export function normalizePhoneDigits(phone?: string | null): string {
  if (!phone) return '';
  let digits = phone.replace(/\D/g, '');
  if (digits.length >= 10 && digits.length <= 11) {
    digits = `55${digits}`;
  }
  return digits;
}

export interface ExtractedWhatsAppMessage {
  senderPhone: string | null;
  messageText: string | null;
  eventId: string | null;
}

/**
 * Extrai dados essenciais de payloads recebidos de webhooks do WhatsApp de forma defensiva,
 * tratando o payload como dado NÃO CONFIÁVEL.
 */
export function extractIncomingWhatsAppPayload(body: any): ExtractedWhatsAppMessage {
  if (!body || typeof body !== 'object') {
    return { senderPhone: null, messageText: null, eventId: null };
  }

  let phone: string | null = null;
  let text: string | null = null;
  let eventId: string | null = null;

  // 1. Formato Simples / Genérico
  if (typeof body.phone === 'string' || typeof body.from === 'string') {
    phone = body.phone || body.from;
  }
  if (typeof body.text === 'string' || typeof body.message === 'string') {
    text = body.text || body.message;
  }
  if (typeof body.eventId === 'string' || typeof body.id === 'string') {
    eventId = body.eventId || body.id;
  }

  // 2. Formato Evolution API (Baileys)
  // { event: 'messages.upsert', data: { key: { remoteJid, id }, message: { conversation } } }
  if (body.data?.key?.remoteJid) {
    const rawJid = String(body.data.key.remoteJid);
    phone = rawJid.split('@')[0] || rawJid;
    eventId = body.data.key.id || eventId;
    if (typeof body.data.message?.conversation === 'string') {
      text = body.data.message.conversation;
    } else if (typeof body.data.message?.extendedTextMessage?.text === 'string') {
      text = body.data.message.extendedTextMessage.text;
    }
  }

  // 3. Formato Meta WhatsApp Cloud API
  // { entry: [{ changes: [{ value: { messages: [{ id, from, text: { body } }] } }] }] }
  const metaMessage = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (metaMessage) {
    phone = metaMessage.from || phone;
    eventId = metaMessage.id || eventId;
    text = metaMessage.text?.body || text;
  }

  // 4. Formato Z-API
  // { phone: '...', messageId: '...', text: { message: '...' } }
  if (body.phone && body.text && typeof body.text.message === 'string') {
    phone = body.phone;
    eventId = body.messageId || eventId;
    text = body.text.message;
  }

  // Sanitização estrita contra dados perigosos ou estouro de tamanho
  const cleanPhone = phone ? normalizePhoneDigits(phone) : null;
  const cleanText = text ? String(text).slice(0, 500).trim() : null;

  return {
    senderPhone: cleanPhone,
    messageText: cleanText,
    eventId: eventId ? String(eventId).slice(0, 128) : null,
  };
}
