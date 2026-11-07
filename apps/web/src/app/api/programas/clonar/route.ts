import { NextResponse } from 'next/server';
import { cloneProgramSchema } from '@revezo/contracts';
import { prisma } from '@revezo/db';
import { getSession, getCurrentUserContext } from '@/lib/auth-service';
import { can, cloneSlotsForNewDate } from '@revezo/domain';

export async function POST(request: Request) {
  try {
    const session = await getSession();
    const userContext = await getCurrentUserContext();

    if (!session || !userContext) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = cloneProgramSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Dados inválidos' },
        { status: 400 }
      );
    }

    const original = await prisma.program.findUnique({
      where: { id: parsed.data.programId },
      include: {
        departments: true,
        slots: true,
      },
    });

    if (!original) {
      return NextResponse.json({ success: false, error: 'Programa original não encontrado' }, { status: 404 });
    }

    const allowed = can(userContext, 'program:clone', {
      churchId: original.churchId || undefined,
      departmentIds: original.departments.map((d) => d.departmentId),
    });

    if (!allowed) {
      return NextResponse.json(
        { success: false, error: 'Você não tem permissão para clonar este programa' },
        { status: 403 }
      );
    }

    // Utiliza função pura do domínio para recalcular slots para a nova data
    const clonedSlotsData = cloneSlotsForNewDate(
      original.slots.map((s) => ({
        title: s.title,
        departmentId: s.departmentId,
        functionId: s.functionId,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        requiredCount: s.requiredCount,
      })),
      parsed.data.targetDate
    );

    const [targetYear, targetMonth, targetDay] = parsed.data.targetDate.split('-').map(Number);
    const newProgDate = new Date(original.date);
    newProgDate.setFullYear(targetYear!, targetMonth! - 1, targetDay!);

    const cloned = await prisma.$transaction(async (tx) => {
      const prog = await tx.program.create({
        data: {
          title: original.title,
          date: newProgDate,
          churchId: original.churchId || null,
          createdById: userContext.id,
          createdByRole: userContext.globalRole,
          clonedFromId: original.id,
          departments: {
            create: original.departments.map((d) => ({
              departmentId: d.departmentId,
            })),
          },
          slots: {
            create: clonedSlotsData.map((s) => ({
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
          churchId: original.churchId || null,
          action: 'PROGRAM_CLONED',
          targetType: 'Program',
          targetId: prog.id,
          result: 'SUCCESS',
          meta: { originalId: original.id, newDate: parsed.data.targetDate, createdByRole: userContext.globalRole },
        },
      });

      return prog;
    });

    return NextResponse.json({ success: true, programId: cloned.id });
  } catch (err: unknown) {
    console.error('Erro ao clonar programa:', err);
    return NextResponse.json(
      { success: false, error: 'Ocorreu um erro ao clonar o programa.' },
      { status: 500 }
    );
  }
}
