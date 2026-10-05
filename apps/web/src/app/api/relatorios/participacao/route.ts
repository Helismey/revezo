import { NextResponse } from 'next/server';
import { participationReportQuerySchema } from '@revezo/contracts';
import { getDepartmentParticipationReport, prisma, recordAudit } from '@revezo/db';
import { getSession, getCurrentUserContext, getActiveChurchContext } from '@/lib/auth-service';

export async function GET(request: Request) {
  try {
    const session = await getSession();
    const userContext = await getCurrentUserContext();
    const { activeChurch } = await getActiveChurchContext();

    if (!session || !userContext) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }

    const isAdmin = userContext.globalRole === 'ADMIN_MASTER';
    const isPastor = userContext.globalRole === 'PASTOR';
    const isElder = userContext.globalRole === 'ELDER';
    const isManager = userContext.departmentMemberships.some((m) => m.role === 'MANAGER');

    if (!isAdmin && !isPastor && !isElder && !isManager) {
      return NextResponse.json(
        { success: false, error: 'Acesso restrito a gestores, liderança pastoral e administradores' },
        { status: 403 }
      );
    }

    // Se for pastor ou ancião, valida vínculo com a congregação ativa
    if (activeChurch) {
      if (isPastor && !userContext.pastorChurchIds?.includes(activeChurch.id)) {
        return NextResponse.json(
          { success: false, error: 'Você não tem acesso aos relatórios desta congregação' },
          { status: 403 }
        );
      }
      if (isElder && userContext.churchId !== activeChurch.id) {
        return NextResponse.json(
          { success: false, error: 'Você não tem acesso aos relatórios de outra congregação' },
          { status: 403 }
        );
      }
    }

    const { searchParams } = new URL(request.url);
    const query = {
      from: searchParams.get('from') || undefined,
      to: searchParams.get('to') || undefined,
      departmentId: searchParams.get('departmentId') || undefined,
      format: (searchParams.get('format') as 'json' | 'csv') || 'json',
    };

    const parsed = participationReportQuerySchema.safeParse(query);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || 'Parâmetros inválidos' },
        { status: 400 }
      );
    }

    // Se não for admin, pastor ou ancião (ou seja, apenas gestor de depto), restringe aos departamentos que gerencia
    let deptFilter = parsed.data.departmentId;
    if (!isAdmin && !isPastor && !isElder) {
      const managedDeptIds = userContext.departmentMemberships
        .filter((m) => m.role === 'MANAGER')
        .map((m) => m.departmentId);

      if (deptFilter && !managedDeptIds.includes(deptFilter)) {
        return NextResponse.json(
          { success: false, error: 'Você não tem permissão para ver relatórios deste departamento' },
          { status: 403 }
        );
      }

      if (!deptFilter && managedDeptIds.length === 1) {
        deptFilter = managedDeptIds[0];
      }
    }

    const report = await getDepartmentParticipationReport({
      departmentId: deptFilter,
      from: parsed.data.from,
      to: parsed.data.to,
      churchId: activeChurch?.id,
    });

    if (parsed.data.format === 'csv') {
      // Registra a exportação de dados na trilha de auditoria (Regra 19 / LGPD)
      await recordAudit(prisma, {
        churchId: activeChurch?.id,
        actorId: session.userId,
        action: 'DATA_EXPORTED',
        targetType: 'Report',
        targetId: 'PARTICIPATION_REPORT_CSV',
        result: 'SUCCESS',
        ip: request.headers.get('x-forwarded-for') || '127.0.0.1',
        meta: {
          reportType: 'PARTICIPATION_REPORT',
          departmentId: deptFilter,
          from: parsed.data.from,
          to: parsed.data.to,
          totalVolunteers: report.volunteers.length,
          totalAssignments: report.totals.totalAssignments,
        },
      });

      // Gera CSV seguro e com suporte a acentos no Excel
      const headers = ['Voluntário', 'E-mail', 'Departamentos', 'Total Escalado', 'Confirmadas', 'Recusadas', 'Substituídas', 'Pendentes', 'Taxa de Comparecimento'];
      const rows = report.volunteers.map((v) => {
        const rate = v.totalScheduled > 0 ? Math.round((v.confirmed / v.totalScheduled) * 100) : 0;
        return [
          `"${v.name.replace(/"/g, '""')}"`,
          `"${v.email.replace(/"/g, '""')}"`,
          `"${v.departmentNames.join('; ').replace(/"/g, '""')}"`,
          v.totalScheduled,
          v.confirmed,
          v.declined,
          v.substituted,
          v.pending,
          `"${rate}%"`,
        ].join(',');
      });

      const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');

      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="relatorio-participacao-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    return NextResponse.json({ success: true, data: report });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao gerar relatório';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
