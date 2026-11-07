import { NextResponse } from 'next/server';
import { passwordResetConfirmSchema } from '@revezo/contracts';
import { resetPasswordWithToken, verifyPasswordResetToken } from '@revezo/db';
import { passwordResetRateLimiter } from '@/lib/auth-service';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json({ valid: false, error: 'Token não fornecido' }, { status: 400 });
    }

    const check = await verifyPasswordResetToken(token);

    if (!check.valid) {
      const reasonMessages: Record<string, string> = {
        NOT_FOUND: 'Link de redefinição inválido.',
        ALREADY_USED: 'Este link de redefinição já foi utilizado anteriormente.',
        EXPIRED: 'Este link de redefinição expirou. Solicite um novo link.',
        USER_INACTIVE: 'Conta de voluntário inativa ou não aprovada.',
      };

      return NextResponse.json({
        valid: false,
        error: reasonMessages[check.reason || 'NOT_FOUND'] || 'Link inválido ou expirado.',
      });
    }

    return NextResponse.json({
      valid: true,
      userName: check.userName,
    });
  } catch (err: unknown) {
    console.error('Erro na validação do token de redefinição:', err);
    return NextResponse.json(
      { valid: false, error: 'Erro ao validar link de redefinição.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';

    // Rate limiting para evitar ataques de força bruta
    const rateLimit = await passwordResetRateLimiter.recordAttempt(clientIp);
    if (rateLimit.blocked) {
      return NextResponse.json(
        {
          success: false,
          error: 'Muitas tentativas em pouco tempo. Aguarde alguns minutos antes de tentar novamente.',
        },
        { status: 429 }
      );
    }

    const body = await request.json();
    const parsed = passwordResetConfirmSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.issues[0]?.message || 'Dados inválidos.',
        },
        { status: 400 }
      );
    }

    const result = await resetPasswordWithToken({
      rawToken: parsed.data.token,
      newPassword: parsed.data.newPassword,
      ip: clientIp,
    });

    return NextResponse.json({
      success: true,
      message: 'Sua senha foi redefinida com sucesso! Você já pode entrar com a nova senha.',
      userName: result.userName,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Erro ao redefinir senha.';
    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 400 }
    );
  }
}
