import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = [
  '/login',
  '/cadastro',
  '/esqueci-senha',
  '/redefinir-senha',
  '/offline',
  '/manifest.json',
  '/favicon.ico',
  '/sw.js',
  '/icon-192.png',
  '/icon-512.png',
];

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Validação de origem para mitigar CSRF em requisições de mutação de API (Regra 12).
 */
function isAllowedOrigin(origin: string, host: string): boolean {
  try {
    const originUrl = new URL(origin);
    // 1. Mesma origem (Host bate com o cabeçalho Host da requisição)
    if (originUrl.host === host) return true;

    // 2. Clientes nativos móveis (Capacitor / Localhost dev)
    if (
      origin === 'capacitor://localhost' ||
      origin === 'http://localhost' ||
      originUrl.hostname === 'localhost' ||
      originUrl.hostname === '127.0.0.1'
    ) {
      return true;
    }

    // 3. Domínio da aplicação explicitamente configurado
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (appUrl) {
      const parsedAppUrl = new URL(appUrl);
      if (originUrl.host === parsedAppUrl.host) return true;
    }

    return false;
  } catch {
    return false;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get('host') || '';
  const origin = request.headers.get('origin');

  // 1. Tratamento seguro de CORS Preflight (OPTIONS) em rotas de API
  if (request.method === 'OPTIONS' && pathname.startsWith('/api/')) {
    const allowed = origin && isAllowedOrigin(origin, host) ? origin : `https://${host}`;
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': allowed,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // 2. Proteção CSRF / Origin em chamadas mutantes para rotas de API
  // Webhooks (/api/webhooks) usam HMAC criptográfico e cron (/api/cron) usa Bearer token
  const isWebhookOrCron = pathname.startsWith('/api/webhooks') || pathname.startsWith('/api/cron');
  if (pathname.startsWith('/api/') && MUTATING_METHODS.has(request.method) && !isWebhookOrCron) {
    if (origin && !isAllowedOrigin(origin, host)) {
      return NextResponse.json(
        { success: false, error: 'Origem não autorizada (proteção CSRF/CORS).' },
        { status: 403 }
      );
    }
  }

  const isPublic =
    PUBLIC_PATHS.some((path) => pathname === path) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/public') ||
    pathname.startsWith('/confirmar') ||
    pathname.startsWith('/api/confirmar') ||
    pathname.startsWith('/api/cron') ||
    pathname.startsWith('/api/calendario') ||
    pathname.startsWith('/api/webhooks') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.ico') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.js');

  const sessionCookie = request.cookies.get('revezo_sess');

  // 3. Controle de acesso por rota protegida
  if (!isPublic && !sessionCookie) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 4. Redirecionamento se já logado
  if (sessionCookie && (pathname === '/login' || pathname === '/cadastro')) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  const response = NextResponse.next();

  // 5. Injeta cabeçalhos defensivos essenciais em todas as respostas (Regra 12)
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  if (origin && isAllowedOrigin(origin, host)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
