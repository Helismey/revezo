import { Prisma } from '@prisma/client';
import { prisma } from '../client.js';

export interface CreateChurchParams {
  actorId: string;
  actorRole: 'ADMIN_MASTER' | 'PASTOR';
  name: string;
  slug: string;
  primaryColor?: string;
  secondaryColor?: string;
  phone?: string | null;
  logoUrl?: string | null;
  address?: {
    logradouro: string;
    numero: string;
    complemento?: string | null;
    bairro: string;
    cidade: string;
    uf: string;
    cep?: string | null;
  } | null;
  pastorIds?: string[];
  ip?: string;
}

export async function createChurchWithAudit(params: CreateChurchParams) {
  const {
    actorId,
    actorRole,
    name,
    slug,
    primaryColor = '#1E40AF',
    secondaryColor = '#F59E0B',
    phone,
    logoUrl,
    address,
    pastorIds = [],
    ip,
  } = params;

  return await prisma.$transaction(async (tx) => {
    const existing = await tx.church.findUnique({
      where: { slug },
    });
    if (existing) {
      throw new Error(`Já existe uma congregação cadastrada com o slug '${slug}'`);
    }

    const church = await tx.church.create({
      data: {
        name,
        slug,
        primaryColor,
        secondaryColor,
        phone: phone || null,
        logoUrl: logoUrl || null,
        address: address ? (address as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });

    const finalPastorIds = new Set<string>();
    if (actorRole === 'PASTOR') {
      finalPastorIds.add(actorId);
    }
    if (actorRole === 'ADMIN_MASTER' && pastorIds.length > 0) {
      const validPastors = await tx.user.findMany({
        where: {
          id: { in: pastorIds },
          globalRole: 'PASTOR',
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      validPastors.forEach((p) => finalPastorIds.add(p.id));
    }

    for (const pastorId of finalPastorIds) {
      await tx.pastorChurch.upsert({
        where: {
          pastorId_churchId: {
            pastorId,
            churchId: church.id,
          },
        },
        update: {},
        create: {
          pastorId,
          churchId: church.id,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        actorId,
        action: 'CHURCH_CREATE',
        targetType: 'Church',
        targetId: church.id,
        churchId: church.id,
        result: 'SUCCESS',
        ip,
        meta: {
          name: church.name,
          slug: church.slug,
          linkedPastorsCount: finalPastorIds.size,
        },
      },
    });

    return church;
  });
}

export interface UpdateChurchParams {
  actorId: string;
  actorRole: 'ADMIN_MASTER' | 'PASTOR';
  churchId: string;
  name?: string;
  slug?: string;
  primaryColor?: string;
  secondaryColor?: string;
  phone?: string | null;
  logoUrl?: string | null;
  address?: {
    logradouro: string;
    numero: string;
    complemento?: string | null;
    bairro: string;
    cidade: string;
    uf: string;
    cep?: string | null;
  } | null;
  pastorIds?: string[];
  active?: boolean;
  ip?: string;
}

export async function updateChurchWithAudit(params: UpdateChurchParams) {
  const {
    actorId,
    actorRole,
    churchId,
    name,
    slug,
    primaryColor,
    secondaryColor,
    phone,
    logoUrl,
    address,
    pastorIds,
    active,
    ip,
  } = params;

  return await prisma.$transaction(async (tx) => {
    const existing = await tx.church.findUnique({
      where: { id: churchId },
      include: { pastors: true },
    });
    if (!existing) {
      throw new Error('Congregação não encontrada');
    }

    if (actorRole === 'PASTOR') {
      const isLinked = existing.pastors.some((p) => p.pastorId === actorId);
      if (!isLinked) {
        throw new Error('Acesso negado: você não tem permissão para gerenciar esta congregação');
      }
    }

    if (slug && slug !== existing.slug) {
      const slugExists = await tx.church.findUnique({
        where: { slug },
      });
      if (slugExists) {
        throw new Error(`Já existe uma congregação com o slug '${slug}'`);
      }
    }

    const dataToUpdate: Prisma.ChurchUpdateInput = {};
    if (name !== undefined) dataToUpdate.name = name;
    if (slug !== undefined) dataToUpdate.slug = slug;
    if (primaryColor !== undefined) dataToUpdate.primaryColor = primaryColor;
    if (secondaryColor !== undefined) dataToUpdate.secondaryColor = secondaryColor;
    if (phone !== undefined) dataToUpdate.phone = phone;
    if (logoUrl !== undefined) dataToUpdate.logoUrl = logoUrl;
    if (address !== undefined) {
      dataToUpdate.address = address ? (address as Prisma.InputJsonValue) : Prisma.JsonNull;
    }
    if (active !== undefined) dataToUpdate.active = active;

    const updatedChurch = await tx.church.update({
      where: { id: churchId },
      data: dataToUpdate,
    });

    if (actorRole === 'ADMIN_MASTER' && pastorIds !== undefined) {
      await tx.pastorChurch.deleteMany({
        where: {
          churchId,
          pastorId: { notIn: pastorIds },
        },
      });

      const validPastors = await tx.user.findMany({
        where: {
          id: { in: pastorIds },
          globalRole: 'PASTOR',
          status: 'ACTIVE',
        },
        select: { id: true },
      });

      for (const pastor of validPastors) {
        await tx.pastorChurch.upsert({
          where: {
            pastorId_churchId: {
              pastorId: pastor.id,
              churchId,
            },
          },
          update: {},
          create: {
            pastorId: pastor.id,
            churchId,
          },
        });
      }
    }

    await tx.auditLog.create({
      data: {
        actorId,
        action: 'CHURCH_UPDATE',
        targetType: 'Church',
        targetId: churchId,
        churchId,
        result: 'SUCCESS',
        ip,
        meta: {
          fieldsUpdated: Object.keys(dataToUpdate),
        },
      },
    });

    return updatedChurch;
  });
}

/**
 * Alterna estado de feature flag com auditoria.
 */
export async function toggleFeatureFlagWithAudit(params: {
  key: string;
  enabled: boolean;
  actorId?: string;
  ip?: string;
}) {
  const { key, enabled, actorId, ip } = params;

  return await prisma.$transaction(async (tx) => {
    const updated = await tx.featureFlag.upsert({
      where: { key },
      update: {
        enabled,
        updatedBy: actorId || null,
      },
      create: {
        key,
        enabled,
        updatedBy: actorId || null,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: 'FEATURE_FLAG_UPDATED',
        targetType: 'FeatureFlag',
        targetId: key,
        result: 'SUCCESS',
        ip,
        meta: { key, enabled },
      },
    });

    return updated;
  });
}

export interface RecordNotificationParams {
  assignmentId?: string;
  kind: 'D7' | 'D2' | 'D1' | 'SUBSTITUTION' | 'OPEN_SLOT';
  channel: 'WHATSAPP' | 'EMAIL' | 'PUSH' | 'SMS';
  success: boolean;
  error?: string;
}

export async function recordNotificationLog(params: RecordNotificationParams) {
  const { assignmentId, kind, channel, success, error } = params;

  return await prisma.notificationLog.create({
    data: {
      assignmentId,
      kind,
      channel,
      success,
      error: error ? error.slice(0, 255) : null,
      sentAt: new Date(),
    },
  });
}
