import { NextResponse } from 'next/server';
import { updateChurchSettingsSchema } from '@revezo/contracts';
import { prisma } from '@revezo/db';
import { getSession, getCurrentUserContext, getActiveChurchContext } from '@/lib/auth-service';
import { can, validateChurchThemeColor } from '@revezo/domain';

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
    const parsed = updateChurchSettingsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Dados inválidos' },
        { status: 400 }
      );
    }

    const allowed = can(userContext, 'church:settings:update', {
      churchId: activeChurchId || undefined,
    });

    if (!allowed) {
      return NextResponse.json(
        { success: false, error: 'Você não tem permissão para atualizar as configurações desta congregação' },
        { status: 403 }
      );
    }

    const contrastReport = validateChurchThemeColor(parsed.data.primaryColor);
    if (!contrastReport.passesWhiteText) {
      return NextResponse.json(
        {
          success: false,
          error: `O contraste da cor selecionada (${contrastReport.contrastWithWhite}:1) não atende aos requisitos de acessibilidade WCAG AA (mínimo 4.5:1).${contrastReport.suggestedHex ? ` Sugestão acessível: ${contrastReport.suggestedHex}` : ''}`,
          report: contrastReport
        },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      // Atualiza na congregação ativa caso exista
      if (activeChurchId) {
        await tx.church.update({
          where: { id: activeChurchId },
          data: {
            name: parsed.data.name,
            primaryColor: parsed.data.primaryColor,
            secondaryColor: parsed.data.secondaryColor,
          },
        });
      }

      // Atualiza também na tabela ChurchSettings padrão
      await tx.churchSettings.upsert({
        where: { id: 1 },
        update: {
          name: parsed.data.name,
          logoUrl: parsed.data.logoUrl || null,
          primaryColor: parsed.data.primaryColor,
          secondaryColor: parsed.data.secondaryColor,
        },
        create: {
          id: 1,
          name: parsed.data.name,
          logoUrl: parsed.data.logoUrl || null,
          primaryColor: parsed.data.primaryColor,
          secondaryColor: parsed.data.secondaryColor,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          churchId: activeChurchId || null,
          action: 'CHURCH_SETTINGS_UPDATED',
          targetType: 'ChurchSettings',
          targetId: activeChurchId || '1',
          result: 'SUCCESS',
          meta: {
            name: parsed.data.name,
            primaryColor: parsed.data.primaryColor,
            churchId: activeChurchId || null,
          },
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error('Erro ao atualizar configurações da igreja:', err);
    return NextResponse.json(
      { success: false, error: 'Erro ao salvar configurações.' },
      { status: 500 }
    );
  }
}
