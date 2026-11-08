import { NextResponse } from 'next/server';
import { loginSchema } from '@revezo/contracts';
import { authenticateUser } from '@/lib/auth-service';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Dados inválidos' },
        { status: 400 }
      );
    }

    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';

    const result = await authenticateUser(
      parsed.data.email,
      parsed.data.password,
      parsed.data.totpCode,
      clientIp
    );

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          requiresMfa: result.requiresMfa,
        },
        { status: 401 }
      );
    }

    return NextResponse.json({ success: true, token: result.token });
  } catch (err) {
    console.error('Erro na rota de login:', err);
    return NextResponse.json(
      { success: false, error: 'Ocorreu um erro interno. Tente novamente mais tarde.' },
      { status: 500 }
    );
  }
}
