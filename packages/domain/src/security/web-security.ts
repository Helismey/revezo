import { randomUUID } from 'crypto';

/**
 * Regra 12 & OWASP A10: Server-Side Request Forgery (SSRF)
 * Bloqueio de endereços locais, redes privadas e endpoints de metadados de nuvem.
 */
export const FORBIDDEN_IP_RANGES = [
  // Loopback
  /^127\./,
  /^localhost$/i,
  /^::1$/,
  /^\[::1\]$/,
  /^0\.0\.0\.0$/,
  // Link-local & Metadata Services (AWS, GCP, Azure, OpenStack)
  /^169\.254\./,
  /^metadata\.google\.internal$/i,
  /^169\.254\.169\.254$/,
  // Private IPv4 (RFC 1918)
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  // Carrier-grade NAT
  /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./,
  // IPv6 Link-Local
  /^fe80:/i,
];

export interface SafeUrlValidationResult {
  valid: boolean;
  reason?: 'VALID' | 'INVALID_PROTOCOL' | 'PRIVATE_OR_METADATA_IP' | 'DISALLOWED_DOMAIN' | 'SVG_FORBIDDEN' | 'MALFORMED';
}

export interface SafeUrlOptions {
  allowedDomains?: string[];
  allowHttpInDev?: boolean;
}

/**
 * Valida se uma URL externa é segura para consumo no servidor (proteção contra SSRF).
 * Bloqueia estritamente metadados de nuvem (169.254.169.254), redes privadas e SVGs.
 */
export function validateSafeExternalUrl(
  inputUrl: string,
  options: SafeUrlOptions = {}
): SafeUrlValidationResult {
  if (!inputUrl || typeof inputUrl !== 'string') {
    return { valid: false, reason: 'MALFORMED' };
  }

  const cleanUrl = inputUrl.trim();

  // Rejeita explicitamente SVGs (podem carregar scripts ou XML entity injection)
  if (cleanUrl.toLowerCase().endsWith('.svg') || cleanUrl.toLowerCase().includes('.svg?')) {
    return { valid: false, reason: 'SVG_FORBIDDEN' };
  }

  let parsed: URL;
  try {
    parsed = new URL(cleanUrl);
  } catch {
    return { valid: false, reason: 'MALFORMED' };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Verifica se o hostname está em algum range proibido (IPs privados ou metadata de nuvem)
  for (const pattern of FORBIDDEN_IP_RANGES) {
    if (pattern.test(hostname)) {
      return { valid: false, reason: 'PRIVATE_OR_METADATA_IP' };
    }
  }

  // Detecção de truques de evasão de IP (notação decimal pura ex: http://2130706433)
  if (/^\d+$/.test(hostname)) {
    return { valid: false, reason: 'PRIVATE_OR_METADATA_IP' };
  }

  // Detecção de IP hexadecimal (ex: 0x7f.0.0.1)
  if (/^0x[0-9a-fA-F]+/i.test(hostname)) {
    return { valid: false, reason: 'PRIVATE_OR_METADATA_IP' };
  }

  // Apenas HTTPS é aceito (ou HTTP localhost durante testes se explicitamente permitido)
  const isHttpAllowed = options.allowHttpInDev && parsed.protocol === 'http:';
  if (parsed.protocol !== 'https:' && !isHttpAllowed) {
    return { valid: false, reason: 'INVALID_PROTOCOL' };
  }

  // Se houver lista explícita de domínios permitidos, valida a inclusão
  if (options.allowedDomains && options.allowedDomains.length > 0) {
    const isDomainAllowed = options.allowedDomains.some((d) => {
      const allowedLower = d.toLowerCase();
      return hostname === allowedLower || hostname.endsWith(`.${allowedLower}`);
    });

    if (!isDomainAllowed) {
      return { valid: false, reason: 'DISALLOWED_DOMAIN' };
    }
  }

  return { valid: true, reason: 'VALID' };
}

/**
 * Regra 12 & OWASP: Upload de Imagens (Fotos e Logo)
 * - Aceitar só imagem (jpeg, png, webp), verificando magic bytes reais
 * - SVG proibido (pode conter scripts executáveis)
 * - Limite de tamanho (padrão: 2 MB)
 */
export const MAX_UPLOAD_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB (Regra 12)

export type AllowedImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface ImageUploadValidationResult {
  valid: boolean;
  mimeType?: AllowedImageMimeType;
  extension?: 'jpg' | 'png' | 'webp';
  error?: string;
  reason?: 'VALID' | 'FILE_TOO_LARGE' | 'INVALID_MAGIC_BYTES' | 'SVG_DETECTED' | 'EMPTY_FILE';
}

/**
 * Valida o conteúdo binário real de um arquivo de imagem por Magic Bytes (assinatura de arquivo).
 * Nunca confia na extensão informada pelo cliente.
 */
export function validateImageMagicBytes(
  buffer: Uint8Array | Buffer,
  maxSizeBytes: number = MAX_UPLOAD_FILE_SIZE_BYTES
): ImageUploadValidationResult {
  if (!buffer || buffer.length === 0) {
    return { valid: false, reason: 'EMPTY_FILE', error: 'Arquivo vazio ou não fornecido.' };
  }

  if (buffer.length > maxSizeBytes) {
    const maxMb = (maxSizeBytes / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      reason: 'FILE_TOO_LARGE',
      error: `Tamanho do arquivo excede o limite máximo permitido de ${maxMb} MB.`,
    };
  }

  // Detecção de SVG ou payloads HTML/XML disfarçados
  // SVG começa com <?xml, <svg, <!DOCTYPE svg, etc.
  const headerSlice = buffer.subarray(0, Math.min(buffer.length, 512));
  const headerText = Buffer.from(headerSlice).toString('utf8').toLowerCase();

  if (
    headerText.includes('<svg') ||
    headerText.includes('<?xml') ||
    headerText.includes('<!doctype svg') ||
    headerText.includes('<script') ||
    headerText.includes('<html')
  ) {
    return {
      valid: false,
      reason: 'SVG_DETECTED',
      error: 'Imagens em formato SVG ou vetoriais não são permitidas por motivos de segurança.',
    };
  }

  // Magic Bytes:
  // 1. JPEG: FF D8 FF
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { valid: true, mimeType: 'image/jpeg', extension: 'jpg', reason: 'VALID' };
  }

  // 2. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 && // P
    buffer[2] === 0x4e && // N
    buffer[3] === 0x47 && // G
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { valid: true, mimeType: 'image/png', extension: 'png', reason: 'VALID' };
  }

  // 3. WEBP: RIFF....WEBP (52 49 46 46 .... 57 45 42 50)
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 && // R
    buffer[1] === 0x49 && // I
    buffer[2] === 0x46 && // F
    buffer[3] === 0x46 && // F
    buffer[8] === 0x57 && // W
    buffer[9] === 0x45 && // E
    buffer[10] === 0x42 && // B
    buffer[11] === 0x50 // P
  ) {
    return { valid: true, mimeType: 'image/webp', extension: 'webp', reason: 'VALID' };
  }

  return {
    valid: false,
    reason: 'INVALID_MAGIC_BYTES',
    error: 'Formato de imagem não reconhecido. Formatos suportados: JPEG, PNG e WebP.',
  };
}

/**
 * Gera nome aleatório e seguro no servidor para o arquivo, evitando Path Traversal e injeções de extensão.
 */
export function generateSafeFileName(extension: 'jpg' | 'png' | 'webp' | string): string {
  const sanitizedExt = extension.replace(/[^a-z0-9]/gi, '').toLowerCase();
  const safeExt = ['jpg', 'jpeg', 'png', 'webp'].includes(sanitizedExt) ? sanitizedExt : 'jpg';
  return `${randomUUID()}.${safeExt}`;
}

/**
 * Remove metadados EXIF (incluindo coordenadas de GPS) de imagens JPEG no buffer.
 * Marcadores APP1 (Exif) em JPEG iniciam com FF E1.
 */
export function stripExifFromJpeg(buffer: Buffer): Buffer {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return buffer; // Não é JPEG
  }

  let offset = 2;
  const chunks: Buffer[] = [buffer.subarray(0, 2)]; // Mantém SOI (FF D8)

  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      break;
    }

    const marker = buffer[offset + 1];
    // Se atingir SOS (Start of Scan) ou EOI (End of Image), copia todo o resto
    if (marker === 0xda || marker === 0xd9) {
      chunks.push(buffer.subarray(offset));
      break;
    }

    if (offset + 4 > buffer.length) break;
    const length = buffer.readUInt16BE(offset + 2);

    // FF E1 é o segmento APP1 (onde residem os metadados Exif e GPS)
    if (marker === 0xe1) {
      // Ignora o chunk Exif (pula length + 2 bytes)
      offset += length + 2;
      continue;
    }

    // Outros chunks (SOF, DHT, DQT, etc.) são preservados
    chunks.push(buffer.subarray(offset, offset + length + 2));
    offset += length + 2;
  }

  return Buffer.concat(chunks);
}
