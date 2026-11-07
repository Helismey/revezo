import { NextResponse } from 'next/server';
import { prisma, createChurchWithAudit, updateChurchWithAudit } from '@revezo/db';
import { createChurchSchema, updateChurchSchema } from '@revezo/contracts';
import { can } from '@revezo/domain';
import { getCurrentUserContext } from '@/lib/auth-service';

export async function GET() {
  try {
    const user = await getCurrentUserContext();
    if (!user || user.status !== 'ACTIVE') {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }

    const canManage = can(user, 'church:create');
    if (!canManage) {
      return NextResponse.json(
        { success: false, error: 'Acesso negado: você não tem permissão para gerenciar congregações' },
        { status: 403 }
      );
    }

    const isMaster = user.globalRole === 'ADMIN_MASTER';

    const churches = await prisma.church.findMany({
      where: isMaster ? undefined : { id: { in: user.pastorChurchIds || [] } },
      include: {
        pastors: {
          include: {
            pastor: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        _count: {
          select: {
            users: true,
            departments: true,
            programs: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    let availablePastors: { id: string; name: string; email: string }[] = [];
    if (isMaster) {
      availablePastors = await prisma.user.findMany({
        where: {
          globalRole: 'PASTOR',
          status: 'ACTIVE',
        },
        select: {
          id: true,
          name: true,
          email: true,
        },
        orderBy: { name: 'asc' },
      });
    }

    return NextResponse.json({
      success: true,
      churches,
      availablePastors,
    });
  } catch (error) {
    console.error('Erro ao listar congregações:', error);
    return NextResponse.json(
      { success: false, error: 'Erro interno ao consultar congregações' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUserContext();
    if (!user || user.status !== 'ACTIVE') {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }

    if (!can(user, 'church:create')) {
      return NextResponse.json(
        { success: false, error: 'Acesso negado: apenas Administrador Master e Pastores podem criar congregações' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = createChurchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Dados inválidos' },
        { status: 400 }
      );
    }

    const ip = request.headers.get('x-forwarded-for') || undefined;

    const church = await createChurchWithAudit({
      actorId: user.id,
      actorRole: user.globalRole as 'ADMIN_MASTER' | 'PASTOR',
      name: parsed.data.name,
      slug: parsed.data.slug,
      primaryColor: parsed.data.primaryColor,
      secondaryColor: parsed.data.secondaryColor,
      phone: parsed.data.phone,
      logoUrl: parsed.data.logoUrl,
      address: parsed.data.address,
      pastorIds: parsed.data.pastorIds,
      ip,
    });

    return NextResponse.json({ success: true, church }, { status: 201 });
  } catch (error: unknown) {
    console.error('Erro ao cadastrar congregação:', error);
    const message = error instanceof Error ? error.message : 'Erro ao cadastrar congregação';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  try {
    const user = await getCurrentUserContext();
    if (!user || user.status !== 'ACTIVE') {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = updateChurchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Dados inválidos' },
        { status: 400 }
      );
    }

    if (!can(user, 'church:settings:update', { churchId: parsed.data.churchId })) {
      return NextResponse.json(
        { success: false, error: 'Acesso negado: sem permissão para editar esta congregação' },
        { status: 403 }
      );
    }

    const ip = request.headers.get('x-forwarded-for') || undefined;

    const church = await updateChurchWithAudit({
      actorId: user.id,
      actorRole: user.globalRole as 'ADMIN_MASTER' | 'PASTOR',
      churchId: parsed.data.churchId,
      name: parsed.data.name,
      slug: parsed.data.slug,
      primaryColor: parsed.data.primaryColor,
      secondaryColor: parsed.data.secondaryColor,
      phone: parsed.data.phone,
      logoUrl: parsed.data.logoUrl,
      address: parsed.data.address,
      pastorIds: parsed.data.pastorIds,
      active: parsed.data.active,
      ip,
    });

    return NextResponse.json({ success: true, church });
  } catch (error: unknown) {
    console.error('Erro ao atualizar congregação:', error);
    const message = error instanceof Error ? error.message : 'Erro ao atualizar congregação';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
