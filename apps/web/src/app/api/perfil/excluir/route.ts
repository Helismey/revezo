import { NextResponse } from 'next/server';
import { eraseUserDataSchema } from '@revezo/contracts';
import { eraseUserDataWithAudit } from '@revezo/db';
import { getSession, clearSession } from '@/lib/auth-service';

export async function POST(request: Request) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = eraseUserDataSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Dados inválidos' },
        { status: 400 }
      );
    }

    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';

    await eraseUserDataWithAudit({
      userId: session.userId,
      passwordConfirm: parsed.data.password,
      reason: parsed.data.reason,
      ip: clientIp,
    });

    // Encerra a sessão do usuário imediatamente
    await clearSession();

    return NextResponse.json({
      success: true,
      message: 'Seus dados foram excluídos e sua conta foi desativada com sucesso.',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao processar solicitação de exclusão';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
