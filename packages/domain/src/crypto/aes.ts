import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const CURRENT_VERSION = 'v1';
const IV_LENGTH = 12; // 96 bits recomendado para GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * Normaliza ou deriva uma chave de 32 bytes a partir de uma string ou chave hex.
 */
function normalizeKey(key: string): Buffer {
  if (key.length === 64 && /^[0-9a-fA-F]+$/.test(key)) {
    return Buffer.from(key, 'hex');
  }
  const keyBuf = Buffer.from(key, 'utf-8');
  if (keyBuf.length === 32) {
    return keyBuf;
  }
  // Se for diferente de 32 bytes, deriva uma chave uniforme de 256 bits com SHA-256
  return createHash('sha256').update(keyBuf).digest();
}

/**
 * Criptografa dados em nível de aplicação usando AES-256-GCM.
 * Formato retornado: v1:ivHex:authTagHex:ciphertextHex
 */
export function encryptField(plainText: string, encryptionKey: string): string {
  if (!plainText) return '';
  const key = normalizeKey(encryptionKey);
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plainText, 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return `${CURRENT_VERSION}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decriptografa dados criptografados com AES-256-GCM.
 */
export function decryptField(encryptedPayload: string, encryptionKey: string): string {
  if (!encryptedPayload) return '';

  const parts = encryptedPayload.split(':');
  if (parts.length !== 4) {
    throw new Error('Payload criptografado em formato inválido');
  }

  const [version, ivHex, authTagHex, cipherTextHex] = parts as [string, string, string, string];
  if (version !== CURRENT_VERSION) {
    throw new Error(`Versão de criptografia não suportada: ${version}`);
  }

  const key = normalizeKey(encryptionKey);
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(cipherTextHex, 'hex');

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

/**
 * Verifica se uma string está no formato de payload criptografado (v1:iv:tag:cipher).
 */
export function isEncryptedPayload(value: unknown): value is string {
  if (typeof value !== 'string' || !value.startsWith(`${CURRENT_VERSION}:`)) {
    return false;
  }
  return value.split(':').length === 4;
}

/**
 * Criptografa um objeto JSON sensível (ex.: endereço residencial) sem manter chaves em texto claro.
 */
export function encryptSensitiveJson(
  data: Record<string, unknown> | null | undefined,
  encryptionKey?: string | null
): { encryptedPayload: string } | Record<string, unknown> | null {
  if (!data || typeof data !== 'object') return null;
  if ('encryptedPayload' in data && isEncryptedPayload(data.encryptedPayload) && Object.keys(data).length === 1) {
    return { encryptedPayload: data.encryptedPayload };
  }
  const cleanData = { ...data };
  delete cleanData.encryptedPayload;
  if (Object.keys(cleanData).length === 0) return null;
  if (!encryptionKey) return cleanData;
  return {
    encryptedPayload: encryptField(JSON.stringify(cleanData), encryptionKey),
  };
}

/**
 * Decriptografa um objeto JSON sensível armazenado no banco.
 */
export function decryptSensitiveJson<T = Record<string, unknown>>(
  stored: unknown,
  encryptionKey?: string | null
): T | null {
  if (!stored || typeof stored !== 'object') return null;
  const obj = stored as Record<string, unknown>;
  if (isEncryptedPayload(obj.encryptedPayload) && encryptionKey) {
    try {
      const jsonStr = decryptField(obj.encryptedPayload, encryptionKey);
      return JSON.parse(jsonStr) as T;
    } catch {
      // Fallback para campos legados se existirem
    }
  }
  const copy = { ...obj };
  delete copy.encryptedPayload;
  return Object.keys(copy).length > 0 ? (copy as T) : null;
}

/**
 * Criptografa o telefone do contato de emergência sem manter `phone` em texto claro.
 */
export function encryptEmergencyContact(
  contact: { name?: string; relationship?: string; phone?: string; phoneEnc?: string } | null | undefined,
  encryptionKey?: string | null
): { name: string; relationship: string; phoneEnc?: string; phone?: string } | null {
  if (!contact || typeof contact !== 'object') return null;
  const name = (contact.name || '').trim();
  const relationship = (contact.relationship || '').trim();
  const rawPhone = (contact.phone || '').trim();
  if (!name && !relationship && !rawPhone && !contact.phoneEnc) return null;

  if (contact.phoneEnc && isEncryptedPayload(contact.phoneEnc) && !rawPhone) {
    return { name, relationship, phoneEnc: contact.phoneEnc };
  }

  if (encryptionKey && rawPhone) {
    return {
      name,
      relationship,
      phoneEnc: isEncryptedPayload(rawPhone) ? rawPhone : encryptField(rawPhone, encryptionKey),
    };
  }

  return {
    name,
    relationship,
    ...(rawPhone ? { phone: rawPhone } : {}),
  };
}

/**
 * Decriptografa o contato de emergência para exibição ou exportação LGPD.
 */
export function decryptEmergencyContact(
  stored: unknown,
  encryptionKey?: string | null
): { name: string; relationship: string; phone: string } | null {
  if (!stored || typeof stored !== 'object') return null;
  const obj = stored as Record<string, unknown>;
  const name = typeof obj.name === 'string' ? obj.name : '';
  const relationship = typeof obj.relationship === 'string' ? obj.relationship : '';
  let phone = typeof obj.phone === 'string' ? obj.phone : '';

  if (isEncryptedPayload(obj.phoneEnc) && encryptionKey) {
    try {
      phone = decryptField(obj.phoneEnc, encryptionKey);
    } catch {
      // Mantém fallback vazio ou legado
    }
  } else if (isEncryptedPayload(phone) && encryptionKey) {
    try {
      phone = decryptField(phone, encryptionKey);
    } catch {
      // Mantém fallback
    }
  }

  if (!name && !relationship && !phone) return null;
  return { name, relationship, phone };
}

/**
 * Criptografa uma string opcional (ex.: notes, guardianPhone) se a chave estiver presente.
 */
export function encryptOptionalString(
  value: string | null | undefined,
  encryptionKey?: string | null
): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (isEncryptedPayload(trimmed)) return trimmed;
  if (!encryptionKey) return trimmed;
  return encryptField(trimmed, encryptionKey);
}

/**
 * Decriptografa uma string opcional se estiver no formato criptografado v1.
 */
export function decryptOptionalString(
  value: string | null | undefined,
  encryptionKey?: string | null
): string | null {
  if (!value) return null;
  if (isEncryptedPayload(value) && encryptionKey) {
    try {
      return decryptField(value, encryptionKey);
    } catch {
      return null;
    }
  }
  return value;
}

