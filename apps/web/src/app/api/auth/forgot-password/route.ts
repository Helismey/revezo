import { NextResponse } from 'next/server';
import { passwordResetRequestSchema } from '@revezo/contracts';
import { requestPasswordResetToken } from '@revezo/db';
import { passwordResetRateLimiter } from '@/lib/auth-service';

export async function POST(request: Request) {
  try {
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
    const userAgent = request.headers.get('user-agent') || undefined;

    // Rate limiting estrito por IP para evitar spam/DDoS
    const rateLimit = await passwordResetRateLimiter.recordAttempt(clientIp);
    if (rateLimit.blocked) {
      return NextResponse.json(
        {
          success: false,
          error: 'Muitas solicitações de recuperação em pouco tempo. Aguarde alguns minutos antes de tentar novamente.',
        },
        { status: 429 }
      );
    }

    const body = await request.json();
    const parsed = passwordResetRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.errors[0]?.message || 'E-mail inválido.',
        },
        { status: 400 }
      );
    }

    const result = await requestPasswordResetToken({
      email: parsed.data.email,
      ip: clientIp,
      userAgent,
    });

    // Em ambiente de desenvolvimento, logamos o link no terminal para testes locais
    if (process.env.NODE_ENV !== 'production' && result.rawToken) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      console.log('----------------------------------------------------');
      console.log('[DEV] Link para redefinição de senha gerado:');
      console.log(`${baseUrl}/redefinir-senha?token=${result.rawToken}`);
      console.log('----------------------------------------------------');
    }

    // Regra 10 e Anti-enumeração: Resposta estritamente idêntica para o cliente
    return NextResponse.json({
      success: true,
      message: 'Se o e-mail informado estiver cadastrado, você receberá um link para redefinir sua senha em instantes.',
      ...(process.env.NODE_ENV !== 'production' && result.rawToken ? { devToken: result.rawToken } : {}),
    });
  } catch (err: unknown) {
    console.error('Erro na solicitação de redefinição de senha:', err);
    return NextResponse.json(
      {
        success: false,
        error: 'Ocorreu um erro ao processar sua solicitação. Tente novamente mais tarde.',
      },
      { status: 500 }
    );
  }
}
