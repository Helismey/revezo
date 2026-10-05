import { describe, expect, it } from 'vitest';
import {
  validateImageMagicBytes,
  generateSafeFileName,
  stripExifFromJpeg,
  validateSafeExternalUrl,
  sanitizeCsvCell,
  MAX_UPLOAD_FILE_SIZE_BYTES,
} from '../src/index.js';

describe('OWASP & Regra 12: Segurança Web, Validações e Upload', () => {
  // =========================================================================
  // 1. UPLOADS: MAGIC BYTES E PROIBIÇÃO DE SVG
  // =========================================================================
  describe('Uploads de Imagens e Detecção por Magic Bytes', () => {
    it('valida corretamente imagem JPEG genuína pelos magic bytes (FF D8 FF)', () => {
      const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
      const res = validateImageMagicBytes(jpegBuffer);

      expect(res.valid).toBe(true);
      expect(res.mimeType).toBe('image/jpeg');
      expect(res.extension).toBe('jpg');
    });

    it('valida corretamente imagem PNG genuína pelos magic bytes (89 50 4E 47 0D 0A 1A 0A)', () => {
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
      const res = validateImageMagicBytes(pngBuffer);

      expect(res.valid).toBe(true);
      expect(res.mimeType).toBe('image/png');
      expect(res.extension).toBe('png');
    });

    it('valida corretamente imagem WebP genuína pelos magic bytes (RIFF....WEBP)', () => {
      const webpBuffer = Buffer.from([
        0x52, 0x49, 0x46, 0x46, // RIFF
        0x20, 0x00, 0x00, 0x00, // tamanho
        0x57, 0x45, 0x42, 0x50, // WEBP
        0x56, 0x50, 0x38, 0x20, // VP8
      ]);
      const res = validateImageMagicBytes(webpBuffer);

      expect(res.valid).toBe(true);
      expect(res.mimeType).toBe('image/webp');
      expect(res.extension).toBe('webp');
    });

    it('PROÍBE ESTRITAMENTE SVG (Prevenção de XSS e injeção de script XML)', () => {
      const svgPayloads = [
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(document.cookie)</script></svg>',
        '<?xml version="1.0" encoding="UTF-8"?><svg height="100" width="100"></svg>',
        '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd"><svg></svg>',
        '<html><body><script src="https://evil.com/xss.js"></script></body></html>',
      ];

      for (const payload of svgPayloads) {
        const buffer = Buffer.from(payload, 'utf8');
        const res = validateImageMagicBytes(buffer);

        expect(res.valid).toBe(false);
        expect(res.reason).toBe('SVG_DETECTED');
        expect(res.error).toContain('SVG');
      }
    });

    it('rejeita arquivos executáveis ou textos comuns disfarçados com extensão de imagem', () => {
      const fakeJpg = Buffer.from('MZ\x90\x00\x03\x00\x00\x00 (Windows Executable Header)');
      const res = validateImageMagicBytes(fakeJpg);

      expect(res.valid).toBe(false);
      expect(res.reason).toBe('INVALID_MAGIC_BYTES');
    });

    it('rejeita arquivo com tamanho superior ao limite de 2 MB (Regra 12)', () => {
      const largeBuffer = Buffer.alloc(MAX_UPLOAD_FILE_SIZE_BYTES + 1024);
      // Preenche com magic bytes de JPEG
      largeBuffer[0] = 0xff;
      largeBuffer[1] = 0xd8;
      largeBuffer[2] = 0xff;

      const res = validateImageMagicBytes(largeBuffer);
      expect(res.valid).toBe(false);
      expect(res.reason).toBe('FILE_TOO_LARGE');
    });

    it('rejeita buffer vazio', () => {
      const res = validateImageMagicBytes(Buffer.alloc(0));
      expect(res.valid).toBe(false);
      expect(res.reason).toBe('EMPTY_FILE');
    });
  });

  // =========================================================================
  // 2. PATH TRAVERSAL & NOME SEGURO DE ARQUIVO
  // =========================================================================
  describe('Path Traversal & Geração Segura de Nome de Arquivo', () => {
    it('gera nome aleatório pelo servidor com UUID e previne path traversal', () => {
      const maliciousNames = [
        '../../../../etc/passwd.jpg',
        '..\\..\\windows\\system32\\cmd.exe.png',
        'shell.php.jpg',
        'foto.webp;rm -rf /',
      ];

      for (const name of maliciousNames) {
        const ext = name.split('.').pop() || 'jpg';
        const safeName = generateSafeFileName(ext);

        expect(safeName).not.toContain('..');
        expect(safeName).not.toContain('/');
        expect(safeName).not.toContain('\\');
        expect(safeName).toMatch(/^[a-f0-9-]{36}\.(jpg|png|webp)$/);
      }
    });
  });

  // =========================================================================
  // 3. REMOÇÃO DE EXIF / GPS
  // =========================================================================
  describe('Remoção de Metadados EXIF e Coordenadas de GPS', () => {
    it('remove segmento APP1 (FF E1) com metadados EXIF de imagens JPEG', () => {
      // JPEG simulado com segmento APP1 (EXIF) de 8 bytes
      const jpegWithExif = Buffer.from([
        0xff, 0xd8,             // SOI
        0xff, 0xe1, 0x00, 0x06, // APP1 (Exif) length=6
        0x45, 0x78, 0x69, 0x66, // 'Exif'
        0xff, 0xdb, 0x00, 0x04, // DQT (Quantization Table)
        0x01, 0x02,
        0xff, 0xd9,             // EOI
      ]);

      const stripped = stripExifFromJpeg(jpegWithExif);

      // Deve preservar SOI e DQT e EOI, mas não deve conter FF E1
      expect(stripped[0]).toBe(0xff);
      expect(stripped[1]).toBe(0xd8);

      const hasApp1 = stripped.includes(Buffer.from([0xff, 0xe1]));
      expect(hasApp1).toBe(false);
      expect(stripped.length).toBeLessThan(jpegWithExif.length);
    });
  });

  // =========================================================================
  // 4. SSRF PROTECTION (Server-Side Request Forgery)
  // =========================================================================
  describe('Proteção contra SSRF (Regra 12 & OWASP A10)', () => {
    it('aceita URLs públicas legítimas com protocolo HTTPS', () => {
      const res = validateSafeExternalUrl('https://images.unsplash.com/photo-1543269865-cbf427effbad.jpg');
      expect(res.valid).toBe(true);
      expect(res.reason).toBe('VALID');
    });

    it('bloqueia estritamente acesso a metadados de nuvem (AWS / GCP / Azure)', () => {
      const metadataUrls = [
        'http://169.254.169.254/latest/meta-data/',
        'https://169.254.169.254/computeMetadata/v1/',
        'http://metadata.google.internal/computeMetadata/v1/instance/',
      ];

      for (const url of metadataUrls) {
        const res = validateSafeExternalUrl(url);
        expect(res.valid).toBe(false);
        expect(res.reason).toBe('PRIVATE_OR_METADATA_IP');
      }
    });

    it('bloqueia endereços de loopback e localhost', () => {
      const loopbackUrls = [
        'http://localhost:3000/api/admin',
        'https://127.0.0.1:8080/internal',
        'http://127.0.0.2/secret',
        'http://[::1]/debug',
        'http://0.0.0.0:8000/',
      ];

      for (const url of loopbackUrls) {
        const res = validateSafeExternalUrl(url);
        expect(res.valid).toBe(false);
        expect(res.reason).toBe('PRIVATE_OR_METADATA_IP');
      }
    });

    it('bloqueia truques de evasão por IP decimal e hexadecimal', () => {
      // 2130706433 é 127.0.0.1 em notação inteira decimal
      const decimalUrl = 'http://2130706433/';
      expect(validateSafeExternalUrl(decimalUrl).valid).toBe(false);

      // 0x7f.0.0.1 é 127.0.0.1 em notação hexadecimal
      const hexUrl = 'http://0x7f000001/';
      expect(validateSafeExternalUrl(hexUrl).valid).toBe(false);
    });

    it('bloqueia redes privadas corporativas (RFC 1918)', () => {
      const privateUrls = [
        'http://10.0.0.1/admin',
        'http://192.168.1.1/router',
        'http://172.16.0.5/internal-db',
        'http://172.31.255.255/secrets',
      ];

      for (const url of privateUrls) {
        const res = validateSafeExternalUrl(url);
        expect(res.valid).toBe(false);
        expect(res.reason).toBe('PRIVATE_OR_METADATA_IP');
      }
    });

    it('rejeita protocolos perigosos (file, gopher, ftp, javascript, data)', () => {
      const badProtocols = [
        'file:///etc/passwd',
        'gopher://127.0.0.1:70/',
        'ftp://anonymous@ftp.server.com/file',
        'javascript:alert(1)',
        'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
      ];

      for (const url of badProtocols) {
        const res = validateSafeExternalUrl(url);
        expect(res.valid).toBe(false);
      }
    });

    it('rejeita URLs que apontam para arquivos SVG (prevenção de SSRF/XSS vetorial)', () => {
      const svgUrl = 'https://trusted-storage.com/logos/church.svg';
      const res = validateSafeExternalUrl(svgUrl);
      expect(res.valid).toBe(false);
      expect(res.reason).toBe('SVG_FORBIDDEN');
    });

    it('valida restrição de domínios permitidos quando especificado', () => {
      const options = { allowedDomains: ['escala.igreja.org', 'cdn.igreja.org'] };

      expect(validateSafeExternalUrl('https://cdn.igreja.org/photo.png', options).valid).toBe(true);
      expect(validateSafeExternalUrl('https://malicious-site.com/photo.png', options).valid).toBe(false);
    });
  });

  // =========================================================================
  // 5. CSV FORMULA INJECTION
  // =========================================================================
  describe('Sanitização de Células CSV contra Formula Injection', () => {
    it('escapa fórmulas maliciosas iniciando com =, +, -, @', () => {
      expect(sanitizeCsvCell('=cmd|/C calc!A0')).toBe("'=cmd|/C calc!A0");
      expect(sanitizeCsvCell('+1+2')).toBe("'+1+2");
      expect(sanitizeCsvCell('-SUM(A1:A10)')).toBe("'-SUM(A1:A10)");
      expect(sanitizeCsvCell('@HYPERLINK("http://evil.com","Click")')).toBe("'@HYPERLINK(\"http://evil.com\",\"Click\")");
    });

    it('mantém textos e números comuns inalterados', () => {
      expect(sanitizeCsvCell('Lucas Silva')).toBe('Lucas Silva');
      expect(sanitizeCsvCell('12345')).toBe('12345');
      expect(sanitizeCsvCell(null)).toBe('');
    });
  });
});
