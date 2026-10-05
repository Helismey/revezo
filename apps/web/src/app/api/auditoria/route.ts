import { NextResponse } from 'next/server';
import { auditLogQuerySchema } from '@revezo/contracts';
import { prisma, queryAuditLogs, recordAudit } from '@revezo/db';
import { can } from '@revezo/domain';
import { getSession, getCurrentUserContext, getActiveChurchContext } from '@/lib/auth-service';

export async function GET(request: Request) {
  try {
    const session = await getSession();
    const userContext = await getCurrentUserContext();

    if (!session || !userContext) {
      return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 });
    }

    const { activeChurch } = await getActiveChurchContext();
    const clientIp = request.headers.get('x-forwarded-for') || '127.0.0.1';

    // Acesso restrito a ADMIN_MASTER (audit:view)
    if (!can(userContext, 'audit:view')) {
      await recordAudit(prisma, {
        churchId: activeChurch?.id,
        actorId: session.userId,
        action: 'AUDIT_TRAIL_ACCESS_DENIED',
        targetType: 'AuditLog',
        result: 'DENIED',
        ip: clientIp,
        meta: {
          motivo: 'Tentativa de acesso à trilha de auditoria sem privilégio ADMIN_MASTER',
          globalRole: userContext.globalRole,
        },
      });

      return NextResponse.json(
        { success: false, error: 'Acesso restrito ao Administrador Geral (ADMIN_MASTER)' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const query = {
      actorId: searchParams.get('actorId') || undefined,
      searchUser: searchParams.get('searchUser') || undefined,
      action: searchParams.get('action') || undefined,
      result: (searchParams.get('result') as any) || undefined,
      targetType: searchParams.get('targetType') || undefined,
      targetId: searchParams.get('targetId') || undefined,
      from: searchParams.get('from') || undefined,
      to: searchParams.get('to') || undefined,
      churchId: searchParams.get('churchId') || undefined,
      page: searchParams.get('page') || undefined,
      limit: searchParams.get('limit') || undefined,
      format: (searchParams.get('format') as 'json' | 'csv') || 'json',
    };

    const parsed = auditLogQuerySchema.safeParse(query);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || 'Parâmetros inválidos' },
        { status: 400 }
      );
    }

    const result = await queryAuditLogs(parsed.data);

    if (parsed.data.format === 'csv') {
      // Registra a exportação da trilha de auditoria na própria auditoria
      await recordAudit(prisma, {
        churchId: parsed.data.churchId || activeChurch?.id,
        actorId: session.userId,
        action: 'DATA_EXPORTED',
        targetType: 'AuditLog',
        targetId: 'AUDIT_TRAIL_CSV',
        result: 'SUCCESS',
        ip: clientIp,
        meta: {
          tipoExportacao: 'AUDIT_LOG_CSV',
          filtros: parsed.data,
          totalItensExportados: result.items.length,
        },
      });

      const headers = [
        'Data e Hora',
        'Ação',
        'Resultado',
        'Ator (Nome)',
        'Ator (E-mail)',
        'Alvo (Tipo)',
        'Alvo (ID)',
        'Alvo (Usuário)',
        'IP',
        'Congregação',
        'Metadados',
      ];

      const rows = result.items.map((log) => {
        const date = new Date(log.createdAt);
        const dateFormatted = `${date.toLocaleDateString('pt-BR')} ${date.toLocaleTimeString('pt-BR')}`;
        const metaStr = log.meta ? JSON.stringify(log.meta).replace(/"/g, '""') : '';

        return [
          `"${dateFormatted}"`,
          `"${log.action.replace(/"/g, '""')}"`,
          `"${log.result}"`,
          `"${(log.actor?.name || 'Sistema').replace(/"/g, '""')}"`,
          `"${(log.actor?.email || '-').replace(/"/g, '""')}"`,
          `"${log.targetType || '-'}"`,
          `"${log.targetId || '-'}"`,
          `"${(log.targetUser ? `${log.targetUser.name} (${log.targetUser.email})` : '-').replace(/"/g, '""')}"`,
          `"${log.ip || '-'}"`,
          `"${(log.churchName || '-').replace(/"/g, '""')}"`,
          `"${metaStr}"`,
        ].join(',');
      });

      const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
      const filename = `trilha-auditoria-${new Date().toISOString().slice(0, 10)}.csv`;

      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    return NextResponse.json({ success: true, ...result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao processar trilha de auditoria';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
