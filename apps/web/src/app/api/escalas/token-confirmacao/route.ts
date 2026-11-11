import { NextResponse } from 'next/server';
import { createConfirmationTokenSchema } from '@revezo/contracts';
import { createConfirmationTokenWithAudit, prisma } from '@revezo/db';
import { getSession, getCurrentUserContext } from '@/lib/auth-service';
import { can } from '@revezo/domain';

export async function POST(request: Request) {
  try {
    const session = await getSession();
    const userContext = await getCurrentUserContext();

    if (!session || !userContext) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = createConfirmationTokenSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Dados inválidos' },
        { status: 400 }
      );
    }

    // Busca o departamento, congregação e o userId da escala para validação de escopo
    const assignment = await prisma.assignment.findUnique({
      where: { id: parsed.data.assignmentId },
      include: {
        slot: {
          select: {
            departmentId: true,
            program: {
              select: { churchId: true },
            },
          },
        },
      },
    });

    if (!assignment) {
      return NextResponse.json({ success: false, error: 'Escala não encontrada' }, { status: 404 });
    }

    const isOwn = assignment.userId === userContext.id;
    const isManager = can(userContext, 'assignment:create', {
      departmentId: assignment.slot.departmentId,
      churchId: assignment.slot.program?.churchId || undefined,
    });

    if (!isOwn && !isManager) {
      return NextResponse.json(
        { success: false, error: 'Você não tem permissão para gerar link para esta escala' },
        { status: 403 }
      );
    }

    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';

    // Determina baseUrl da requisição (ex: http://localhost:3000 ou https://escala.igreja.com)
    const host = request.headers.get('host') || 'localhost:3000';
    const proto = request.headers.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https');
    const baseUrl = `${proto}://${host}`;

    const tokenData = await createConfirmationTokenWithAudit({
      assignmentId: parsed.data.assignmentId,
      actorId: session.userId,
      ip: clientIp,
      maxDays: parsed.data.expiresInDays,
      baseUrl,
    });

    return NextResponse.json({
      success: true,
      token: tokenData.rawToken,
      confirmationUrl: tokenData.confirmationUrl,
      whatsappMessage: tokenData.whatsappMessage,
      expiresAt: tokenData.expiresAt.toISOString(),
      member: tokenData.member,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao gerar link de confirmação';
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
