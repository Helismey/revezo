import { NextResponse } from 'next/server';
import { switchActiveChurchSchema } from '@revezo/contracts';
import { switchActiveChurch } from '@/lib/auth-service';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = switchActiveChurchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Dados inválidos' },
        { status: 400 }
      );
    }

    const result = await switchActiveChurch(parsed.data.churchId);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || 'Erro ao alternar congregação' },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao alternar congregação:', error);
    return NextResponse.json(
      { success: false, error: 'Erro interno ao processar a troca de congregação' },
      { status: 500 }
    );
  }
}
