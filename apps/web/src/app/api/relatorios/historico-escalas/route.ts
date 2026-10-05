import { NextResponse } from 'next/server';
import { scheduleHistoryQuerySchema } from '@revezo/contracts';
import { prisma, getScheduleHistory, recordAudit } from '@revezo/db';
import { getSession, getCurrentUserContext, getActiveChurchContext } from '@/lib/auth-service';

export async function GET(request: Request) {
  try {
    const session = await getSession();
    const userContext = await getCurrentUserContext();
    const { activeChurch } = await getActiveChurchContext();
    const clientIp = request.headers.get('x-forwarded-for') || '127.0.0.1';

    if (!session || !userContext) {
      return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 });
    }

    const isAdmin = userContext.globalRole === 'ADMIN_MASTER';
    const isPastor = userContext.globalRole === 'PASTOR';
    const isElder = userContext.globalRole === 'ELDER';
    const managedDeptIds = userContext.departmentMemberships
      .filter((m) => m.role === 'MANAGER')
      .map((m) => m.departmentId);

    if (!isAdmin && !isPastor && !isElder && managedDeptIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Acesso restrito a gestores de departamento e liderança pastoral' },
        { status: 403 }
      );
    }

    // Validação de congregação ativa para pastor e ancião
    if (activeChurch) {
      if (isPastor && !userContext.pastorChurchIds?.includes(activeChurch.id)) {
        return NextResponse.json(
          { success: false, error: 'Você não tem acesso ao histórico desta congregação' },
          { status: 403 }
        );
      }
      if (isElder && userContext.churchId !== activeChurch.id) {
        return NextResponse.json(
          { success: false, error: 'Você não tem acesso ao histórico de outra congregação' },
          { status: 403 }
        );
      }
    }

    const { searchParams } = new URL(request.url);
    const query = {
      departmentId: searchParams.get('departmentId') || undefined,
      programId: searchParams.get('programId') || undefined,
      userId: searchParams.get('userId') || undefined,
      eventType: (searchParams.get('eventType') as any) || 'ALL',
      from: searchParams.get('from') || undefined,
      to: searchParams.get('to') || undefined,
      page: searchParams.get('page') || undefined,
      limit: searchParams.get('limit') || undefined,
      format: (searchParams.get('format') as 'json' | 'csv') || 'json',
    };

    const parsed = scheduleHistoryQuerySchema.safeParse(query);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || 'Parâmetros inválidos' },
        { status: 400 }
      );
    }

    // Se for apenas gestor de departamento, restringe ao(s) departamento(s) sob sua gestão
    let deptFilter = parsed.data.departmentId;
    if (!isAdmin && !isPastor && !isElder) {
      if (deptFilter && !managedDeptIds.includes(deptFilter)) {
        return NextResponse.json(
          { success: false, error: 'Você não tem permissão para ver histórico deste departamento' },
          { status: 403 }
        );
      }
      if (!deptFilter && managedDeptIds.length === 1) {
        deptFilter = managedDeptIds[0];
      }
    }

    const result = await getScheduleHistory({
      departmentId: deptFilter,
      churchId: activeChurch?.id,
      programId: parsed.data.programId,
      userId: parsed.data.userId,
      eventType: parsed.data.eventType,
      from: parsed.data.from,
      to: parsed.data.to,
      page: parsed.data.page,
      limit: parsed.data.limit,
    });

    if (parsed.data.format === 'csv') {
      // Registra a exportação de histórico na trilha de auditoria
      await recordAudit(prisma, {
        churchId: activeChurch?.id,
        actorId: session.userId,
        action: 'DATA_EXPORTED',
        targetType: 'ScheduleHistory',
        targetId: 'SCHEDULE_TIMELINE_CSV',
        result: 'SUCCESS',
        ip: clientIp,
        meta: {
          tipoExportacao: 'SCHEDULE_HISTORY_CSV',
          filtros: parsed.data,
          totalItensExportados: result.events.length,
        },
      });

      const headers = [
        'Data e Hora do Evento',
        'Tipo de Evento',
        'Ação',
        'Executado Por',
        'Voluntário',
        'E-mail Voluntário',
        'Substituto (se houver)',
        'Programa',
        'Departamento',
        'Função',
        'Data da Escala',
        'Motivo / Justificativa',
      ];

      const rows = result.events.map((ev) => {
        const evDate = new Date(ev.timestamp);
        const slotDate = new Date(ev.slot.startsAt);
        const evDateFormatted = `${evDate.toLocaleDateString('pt-BR')} ${evDate.toLocaleTimeString('pt-BR')}`;
        const slotDateFormatted = `${slotDate.toLocaleDateString('pt-BR')} ${slotDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

        return [
          `"${evDateFormatted}"`,
          `"${ev.eventType}"`,
          `"${ev.actionLabel.replace(/"/g, '""')}"`,
          `"${ev.actor.name.replace(/"/g, '""')}"`,
          `"${ev.volunteer.name.replace(/"/g, '""')}"`,
          `"${ev.volunteer.email.replace(/"/g, '""')}"`,
          `"${(ev.substitute ? `${ev.substitute.name} (${ev.substitute.email})` : '-').replace(/"/g, '""')}"`,
          `"${ev.slot.programTitle.replace(/"/g, '""')}"`,
          `"${ev.slot.departmentName.replace(/"/g, '""')}"`,
          `"${(ev.slot.functionName || '-').replace(/"/g, '""')}"`,
          `"${slotDateFormatted}"`,
          `"${(ev.details.reason || ev.details.notes || '-').replace(/"/g, '""')}"`,
        ].join(',');
      });

      const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
      const filename = `historico-escalas-${new Date().toISOString().slice(0, 10)}.csv`;

      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    return NextResponse.json({ success: true, ...result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao consultar histórico de escalas';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
