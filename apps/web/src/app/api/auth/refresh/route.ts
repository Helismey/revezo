import { NextResponse } from 'next/server';
import { refreshTokenSchema } from '@revezo/contracts';
import { rotateAppRefreshToken, prisma } from '@revezo/db';
import { ACCESS_TOKEN_LIFETIME_SECONDS } from '@revezo/domain';
import { signMobileAccessToken, SessionData } from '@/lib/auth-service';

/**
 * Endpoint de rotação de Refresh Token para aplicativo mobile (Capacitor/App).
 * Implementa a Regra 10: Rotação contínua e detecção de reuso com revogação da família inteira.
 */
export async function POST(request: Request) {
  try {
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
    const body = await request.json();
    const parsed = refreshTokenSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || 'Dados inválidos' },
        { status: 400 }
      );
    }

    const { refreshToken, deviceName } = parsed.data;

    // Rotação transacional com detecção de reuso (Regra 10)
    const result = await rotateAppRefreshToken({
      rawRefreshToken: refreshToken,
      deviceName,
      ip: clientIp,
    });

    // Busca papéis departamentais atualizados para a nova sessão
    const memberships = await prisma.departmentMember.findMany({
      where: { userId: result.user.id },
      select: { role: true },
    });
    const isManager = memberships.some((m) => m.role === 'MANAGER');

    const sessionData: SessionData = {
      userId: result.user.id,
      globalRole: result.user.globalRole as any,
      status: result.user.status as any,
      name: result.user.name,
      email: result.user.email,
      mfaEnabled: result.user.mfaEnabled,
      isManager,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    };

    // Novo access token com 15 minutos de expiração
    const accessToken = signMobileAccessToken(sessionData);

    return NextResponse.json({
      success: true,
      tokenType: 'Bearer',
      accessToken,
      token: accessToken, // Retrocompatibilidade
      refreshToken: result.rawRefreshToken,
      expiresIn: ACCESS_TOKEN_LIFETIME_SECONDS, // 900 segundos (15 minutos)
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Falha ao renovar sessão do aplicativo';
    const isSecurityViolation = msg.includes('Reuso de token detectado');

    return NextResponse.json(
      { success: false, error: msg },
      { status: isSecurityViolation ? 403 : 401 }
    );
  }
}
