import { NextResponse } from 'next/server';
import { registerSchema } from '@revezo/contracts';
import { registerVolunteer } from '@/lib/auth-service';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Dados inválidos' },
        { status: 400 }
      );
    }

    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';

    const result = await registerVolunteer(parsed.data, clientIp);

    if (!result.success) {
      const isRateLimited = result.error?.includes('tentativas');
      return NextResponse.json(
        { success: false, error: result.error },
        { status: isRateLimited ? 429 : 400 }
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error('Erro na rota de cadastro:', err);
    return NextResponse.json(
      { success: false, error: 'Ocorreu um erro ao enviar seu cadastro.' },
      { status: 500 }
    );
  }
}
