import { NextResponse } from 'next/server';
import { loginSchema } from '@revezo/contracts';
import { createAppSessionTokens } from '@revezo/db';
import { ACCESS_TOKEN_LIFETIME_SECONDS } from '@revezo/domain';
import {
  authenticateUser,
  signMobileAccessToken,
  SessionData,
} from '@/lib/auth-service';

/**
 * Endpoint de emissão de Access Token (15 min) e Refresh Token rotacionável para
 * aplicativos nativos e clientes mobile (Capacitor/App).
 * Respeita a Rule 10 (Access token 15 min + Refresh token rotacionável), Rule 09 e Rule 17.
 */
export async function POST(request: Request) {
  try {
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || 'Dados inválidos' },
        { status: 400 }
      );
    }

    const { email, password, totpCode } = parsed.data;

    // Autentica com toda a lógica de rate limiting, MFA e scrypt/Argon2id blindada em authenticateUser
    const authResult = await authenticateUser(email, password, totpCode, clientIp);

    if (!authResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: authResult.error,
          requiresMfa: authResult.requiresMfa,
        },
        { status: 401 }
      );
    }

    const user = authResult.user;
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Usuário não encontrado' },
        { status: 404 }
      );
    }

    // Identifica dispositivo do app
    const userAgent = request.headers.get('user-agent') || 'Dispositivo Mobile';
    const deviceName =
      typeof body.deviceName === 'string' && body.deviceName.trim()
        ? body.deviceName.trim().slice(0, 100)
        : userAgent.slice(0, 100);

    // Emite refresh token com rotação e hash SHA-256 no banco
    const sessionTokens = await createAppSessionTokens({
      userId: user.id,
      deviceName,
      ip: clientIp,
    });

    const isManager = user.memberships?.some((m: { role: string }) => m.role === 'MANAGER');

    const sessionData: SessionData = {
      userId: user.id,
      globalRole: user.globalRole as any,
      status: user.status as any,
      name: user.name,
      email: user.email,
      mfaEnabled: user.mfaEnabled,
      isManager,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    };

    // Assina access token curto de 15 minutos (Regra 10)
    const accessToken = signMobileAccessToken(sessionData);

    return NextResponse.json({
      success: true,
      tokenType: 'Bearer',
      accessToken,
      token: accessToken, // Retrocompatibilidade com clientes existentes
      refreshToken: sessionTokens.rawRefreshToken,
      expiresIn: ACCESS_TOKEN_LIFETIME_SECONDS, // 900 segundos (15 minutos)
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        globalRole: user.globalRole,
        mfaEnabled: user.mfaEnabled,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao autenticar cliente mobile';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
