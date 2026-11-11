import { NextResponse } from 'next/server';
import { createProgramSchema } from '@revezo/contracts';
import { prisma } from '@revezo/db';
import { getSession, getCurrentUserContext, getActiveChurchContext } from '@/lib/auth-service';
import { can } from '@revezo/domain';

export async function POST(request: Request) {
  try {
    const session = await getSession();
    const userContext = await getCurrentUserContext();

    if (!session || !userContext) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }

    const churchContext = await getActiveChurchContext();
    const activeChurchId = churchContext?.activeChurch?.id || userContext.churchId;

    const body = await request.json();
    const parsed = createProgramSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Dados do programa inválidos' },
        { status: 400 }
      );
    }

    const allowed = can(userContext, 'program:create', {
      churchId: activeChurchId || undefined,
      departmentIds: parsed.data.departmentIds,
    });

    if (!allowed) {
      return NextResponse.json(
        { success: false, error: 'Você não tem permissão para criar programas nestes departamentos ou congregação' },
        { status: 403 }
      );
    }

    const newProgram = await prisma.$transaction(async (tx) => {
      const prog = await tx.program.create({
        data: {
          title: parsed.data.title,
          date: new Date(parsed.data.date),
          churchId: activeChurchId || null,
          createdById: userContext.id,
          createdByRole: userContext.globalRole,
          departments: {
            create: parsed.data.departmentIds.map((deptId) => ({
              departmentId: deptId,
            })),
          },
          slots: {
            create: parsed.data.slots.map((s) => ({
              title: s.title,
              departmentId: s.departmentId,
              functionId: s.functionId || null,
              startsAt: new Date(s.startsAt),
              endsAt: new Date(s.endsAt),
              requiredCount: s.requiredCount,
            })),
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          churchId: activeChurchId || null,
          action: 'PROGRAM_CREATED',
          targetType: 'Program',
          targetId: prog.id,
          result: 'SUCCESS',
          meta: { title: prog.title, createdByRole: userContext.globalRole },
        },
      });

      return prog;
    });

    return NextResponse.json({ success: true, programId: newProgram.id });
  } catch (err: unknown) {
    console.error('Erro ao criar programa:', err);
    return NextResponse.json(
      { success: false, error: 'Ocorreu um erro ao salvar o programa.' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getSession();
    const userContext = await getCurrentUserContext();

    if (!session || !userContext) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const programId = searchParams.get('id');

    if (!programId) {
      return NextResponse.json({ success: false, error: 'ID do programa não informado' }, { status: 400 });
    }

    const existing = await prisma.program.findUnique({
      where: { id: programId },
      include: { departments: true },
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Programa não encontrado' }, { status: 404 });
    }

    // Validação hierárquica e congregação
    const allowed = can(userContext, 'program:delete', {
      churchId: existing.churchId || undefined,
      departmentIds: existing.departments.map((d) => d.departmentId),
      createdByRole: (existing.createdByRole as any) || undefined,
    });

    if (!allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'Você não tem permissão para excluir este programa (restrição de congregação ou nível hierárquico superior).',
        },
        { status: 403 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.program.delete({
        where: { id: programId },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          churchId: existing.churchId || null,
          action: 'PROGRAM_DELETED',
          targetType: 'Program',
          targetId: programId,
          result: 'SUCCESS',
          meta: { title: existing.title, createdByRole: existing.createdByRole },
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error('Erro ao excluir programa:', err);
    return NextResponse.json(
      { success: false, error: 'Ocorreu um erro ao excluir o programa.' },
      { status: 500 }
    );
  }
}
