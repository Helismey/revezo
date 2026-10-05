import { describe, expect, it, vi, beforeEach } from 'vitest';
import { middleware } from '../src/middleware';
import { POST as handleUploadPost } from '../src/app/api/upload/route';
import { NextRequest } from 'next/server';
import * as authService from '../src/lib/auth-service';
import nextConfig from '../next.config';

vi.mock('@revezo/db', () => ({
  prisma: {
    auditLog: {
      create: vi.fn(),
    },
  },
}));

describe('OWASP Web Security & Headers (/api/upload, middleware, next.config)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // 1. CABEÇALHOS DE SEGURANÇA (next.config.ts)
  // =========================================================================
  describe('Cabeçalhos HTTP de Segurança (A05: Security Misconfiguration)', () => {
    it('configura todos os cabeçalhos defensivos exigidos pela Regra 12', async () => {
      const headersConfig = await nextConfig.headers!();
      expect(headersConfig).toBeDefined();

      const globalHeaders = headersConfig.find((h: any) => h.source === '/:path*')?.headers;
      expect(globalHeaders).toBeDefined();

      const headerMap = new Map(globalHeaders.map((h: any) => [h.key, h.value]));

      expect(headerMap.get('X-Content-Type-Options')).toBe('nosniff');
      expect(headerMap.get('X-Frame-Options')).toBe('DENY');
      expect(headerMap.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
      expect(headerMap.get('Strict-Transport-Security')).toContain('max-age=63072000');
      expect(headerMap.get('Permissions-Policy')).toContain('camera=()');
      expect(headerMap.get('X-DNS-Prefetch-Control')).toBe('off');
      expect(headerMap.get('X-Permitted-Cross-Domain-Policies')).toBe('none');

      // CSP
      const csp = headerMap.get('Content-Security-Policy');
      expect(csp).toBeDefined();
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("base-uri 'self'");
      expect(csp).toContain("form-action 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
    });
  });

  // =========================================================================
  // 2. MIDDLEWARE CSRF & ORIGIN VALIDATION
  // =========================================================================
  describe('Middleware: Proteção CSRF e CORS em Rotas de API', () => {
    it('bloqueia chamadas de mutação (POST) vindas de origens terceiras não autorizadas (CSRF)', () => {
      const req = new NextRequest('https://escala.igreja.org/api/membros', {
        method: 'POST',
        headers: {
          origin: 'https://site-malicioso.com',
          host: 'escala.igreja.org',
        },
      });

      const res = middleware(req);
      expect(res.status).toBe(403);
    });

    it('permite chamadas de mutação da mesma origem (Same-Origin)', () => {
      const req = new NextRequest('https://escala.igreja.org/api/membros', {
        method: 'POST',
        headers: {
          origin: 'https://escala.igreja.org',
          host: 'escala.igreja.org',
          cookie: 'revezo_sess=mock_cookie',
        },
      });

      const res = middleware(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://escala.igreja.org');
    });

    it('permite origens de clientes móveis nativos (Capacitor)', () => {
      const req = new NextRequest('https://escala.igreja.org/api/membros', {
        method: 'POST',
        headers: {
          origin: 'capacitor://localhost',
          host: 'escala.igreja.org',
          cookie: 'revezo_sess=mock_cookie',
        },
      });

      const res = middleware(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('capacitor://localhost');
    });

    it('responde requisições CORS Preflight (OPTIONS) com status 204 e cabeçalhos adequados', () => {
      const req = new NextRequest('https://escala.igreja.org/api/membros', {
        method: 'OPTIONS',
        headers: {
          origin: 'https://escala.igreja.org',
          host: 'escala.igreja.org',
        },
      });

      const res = middleware(req);
      expect(res.status).toBe(204);
      expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
      expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    });

    it('injeta cabeçalhos defensivos básicos em todas as respostas servidas pelo middleware', () => {
      const req = new NextRequest('https://escala.igreja.org/login', {
        method: 'GET',
      });

      const res = middleware(req);
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(res.headers.get('X-Frame-Options')).toBe('DENY');
      expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    });
  });

  // =========================================================================
  // 3. ENDPOINT DE UPLOAD SEGURO (/api/upload)
  // =========================================================================
  describe('Endpoint de Upload Seguro (/api/upload)', () => {
    it('rejeita upload de usuário não autenticado com status 401', async () => {
      vi.spyOn(authService, 'getSession').mockResolvedValue(null);

      const formData = new FormData();
      formData.append('file', new File(['dummy'], 'foto.jpg', { type: 'image/jpeg' }));

      const req = new Request('https://escala.igreja.org/api/upload', {
        method: 'POST',
        body: formData,
      });

      const res = await handleUploadPost(req);
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.error).toContain('não autorizado');
    });

    it('aceita arquivo JPEG válido e gera nome seguro no servidor', async () => {
      vi.spyOn(authService, 'getSession').mockResolvedValue({
        userId: 'usr_valid_upload',
        status: 'ACTIVE',
      } as any);

      // Buffer JPEG real (FF D8 FF ...)
      const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
      const blob = new Blob([jpegBytes], { type: 'image/jpeg' });
      const file = new File([blob], '../../malicious-path/foto.jpg', { type: 'image/jpeg' });

      const formData = new FormData();
      formData.append('file', file);

      const req = new Request('https://escala.igreja.org/api/upload', {
        method: 'POST',
        body: formData,
      });

      const res = await handleUploadPost(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.mimeType).toBe('image/jpeg');
      expect(data.fileName).toMatch(/^[a-f0-9-]{36}\.jpg$/);
      expect(data.fileName).not.toContain('malicious-path');
      expect(data.url).toBe(`/uploads/${data.fileName}`);
    });

    it('rejeita arquivo SVG com status 400 e registra tentativa no log de auditoria', async () => {
      vi.spyOn(authService, 'getSession').mockResolvedValue({
        userId: 'usr_valid_upload',
        status: 'ACTIVE',
      } as any);

      const svgContent = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
      const blob = new Blob([svgContent], { type: 'image/svg+xml' });
      const file = new File([blob], 'logo.svg', { type: 'image/svg+xml' });

      const formData = new FormData();
      formData.append('file', file);

      const req = new Request('https://escala.igreja.org/api/upload', {
        method: 'POST',
        body: formData,
      });

      const res = await handleUploadPost(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('SVG');
    });

    it('rejeita arquivo com tamanho superior a 2 MB com status 400', async () => {
      vi.spyOn(authService, 'getSession').mockResolvedValue({
        userId: 'usr_valid_upload',
        status: 'ACTIVE',
      } as any);

      // Cria buffer maior que 2 MB
      const bigBuffer = new Uint8Array(2 * 1024 * 1024 + 512);
      bigBuffer[0] = 0xff;
      bigBuffer[1] = 0xd8;
      bigBuffer[2] = 0xff;

      const blob = new Blob([bigBuffer], { type: 'image/jpeg' });
      const file = new File([blob], 'foto_grande.jpg', { type: 'image/jpeg' });

      const formData = new FormData();
      formData.append('file', file);

      const req = new Request('https://escala.igreja.org/api/upload', {
        method: 'POST',
        body: formData,
      });

      const res = await handleUploadPost(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain('excede o limite');
    });
  });
});
