import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { prisma, Prisma } from '@revezo/db';
import {
  GlobalRole,
  AccountStatus,
  UserContext,
  HybridRateLimiter,
  verifyPassword,
  verifyTotp,
  encryptField,
  decryptField,
  generateTotpSecret,
  getTotpUri,
  generateRecoveryCodes,
  verifyAndConsumeRecoveryCode,
  formatSecretForDisplay,
  validatePasswordPolicy,
  hashPassword,
  generateSessionId,
  evaluateSessionValidity,
  ACCESS_TOKEN_LIFETIME_SECONDS,
} from '@revezo/domain';
import { RegisterInput } from '@revezo/contracts';
import QRCode from 'qrcode';

const SESSION_COOKIE_NAME = 'revezo_sess';
const SESSION_SECRET = process.env.AUTH_SECRET || 'chave-secreta-padrao-desenvolvimento-revezo-32b';
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 dias

// Rate limiters híbridos (Upstash Redis REST em produção serverless / memória local em desenvolvimento)
export const loginRateLimiter = new HybridRateLimiter({
  prefix: 'login',
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000,
  blockDurationMs: 15 * 60 * 1000,
});

// Rate limiter para recuperação de senha: 3 tentativas por 15 minutos
export const passwordResetRateLimiter = new HybridRateLimiter({
  prefix: 'password-reset',
  maxAttempts: 3,
  windowMs: 15 * 60 * 1000,
  blockDurationMs: 15 * 60 * 1000,
});

// Rate limiter para autocadastro: 5 tentativas por hora por IP
export const registerRateLimiter = new HybridRateLimiter({
  prefix: 'register',
  maxAttempts: 5,
  windowMs: 60 * 60 * 1000,
  blockDurationMs: 60 * 60 * 1000,
});

export interface SessionData {
  sessionId?: string; // ID aleatório de 256 bits (Regra 10)
  userId: string;
  globalRole: GlobalRole;
  status: AccountStatus;
  name: string;
  email: string;
  mfaEnabled?: boolean;
  isManager?: boolean;
  createdAt: number;
  lastActiveAt?: number;
}

/**
 * Assina e serializa a sessão com HMAC-SHA256 para evitar adulteração de cookie.
 */
export function signSessionPayload(data: SessionData): string {
  const json = JSON.stringify(data);
  const base64Data = Buffer.from(json, 'utf8').toString('base64url');
  const signature = createHmac('sha256', SESSION_SECRET)
    .update(base64Data)
    .digest('base64url');
  return `${base64Data}.${signature}`;
}

/**
 * Emite Access Token curto de 15 minutos para aplicativo mobile nativo (Capacitor/App).
 * Regra 10: Access token de 15 min + refresh com rotação.
 */
export function signMobileAccessToken(data: SessionData): string {
  const now = Date.now();
  return signSessionPayload({
    ...data,
    sessionId: data.sessionId || generateSessionId(),
    createdAt: now,
    lastActiveAt: now,
  });
}

/**
 * Valida a assinatura e desserializa a sessão.
 */
export function verifySessionToken(token: string): SessionData | null {
  try {
    const [base64Data, signature] = token.split('.');
    if (!base64Data || !signature) return null;

    const expectedSignature = createHmac('sha256', SESSION_SECRET)
      .update(base64Data)
      .digest('base64url');

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSignature);

    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const json = Buffer.from(base64Data, 'base64url').toString('utf8');
    return JSON.parse(json) as SessionData;
  } catch {
    return null;
  }
}

/**
 * Obtém a sessão do usuário autenticado no servidor.
 * Valida integridade, expiração absoluta, expiração por inatividade e status da conta.
 */
export const getSession = cache(async function getSession(): Promise<SessionData | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);
  let rawToken = sessionCookie?.value;
  let isBearerToken = false;

  // Se não houver cookie, verifica se a requisição porta Bearer Token (Regra 09: API compatível com mobile/Capacitor)
  if (!rawToken) {
    try {
      const reqHeaders = await headers();
      const authHeader = reqHeaders.get('authorization');
      if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
        rawToken = authHeader.substring(7).trim();
        isBearerToken = true;
      }
    } catch {
      // headers() pode não estar disponível em contextos estáticos
    }
  }

  if (!rawToken) {
    return null;
  }

  const session = verifySessionToken(rawToken);
  if (!session) {
    return null;
  }

  const now = Date.now();

  // Se for Bearer Token de app mobile, valida expiração estrita de 15 minutos (Regra 10)
  if (isBearerToken) {
    if (now - session.createdAt > ACCESS_TOKEN_LIFETIME_SECONDS * 1000) {
      return null;
    }
  } else {
    // Para sessão web com cookie, avalia expiração máxima e inatividade (Regra 10)
    const validation = evaluateSessionValidity(
      {
        sessionId: session.sessionId || 'legacy',
        userId: session.userId,
        globalRole: session.globalRole,
        status: session.status,
        name: session.name,
        email: session.email,
        mfaEnabled: session.mfaEnabled,
        isManager: session.isManager,
        createdAt: session.createdAt,
        lastActiveAt: session.lastActiveAt || session.createdAt,
      },
      now
    );

    if (!validation.valid) {
      return null;
    }
  }

  // Contas PENDENTES, REJEITADAS ou INATIVAS não acessam dados (Regra 10)
  if (session.status !== 'ACTIVE') {
    return null;
  }

  return session;
});

/**
 * Cria ou rotaciona a sessão segura no login web com ID aleatório de 256 bits (Regra 10).
 */
export async function createSession(user: {
  id: string;
  globalRole: GlobalRole;
  status: AccountStatus;
  name: string;
  email: string;
  mfaEnabled?: boolean;
  isManager?: boolean;
}) {
  const now = Date.now();
  const sessionData: SessionData = {
    sessionId: generateSessionId(),
    userId: user.id,
    globalRole: user.globalRole,
    status: user.status,
    name: user.name,
    email: user.email,
    mfaEnabled: user.mfaEnabled,
    isManager: user.isManager,
    createdAt: now,
    lastActiveAt: now,
  };

  const token = signSessionPayload(sessionData);
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: '/',
  });

  return token;
}

/**
 * Destrói a sessão (logout).
 */
export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Obtém o contexto completo de autorização do usuário autenticado para uso em can().
 */
export const getCurrentUserContext = cache(async function getCurrentUserContext(): Promise<UserContext | null> {
  const session = await getSession();
  if (!session) return null;

  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: session.userId },
      include: {
        pastorChurches: {
          select: { churchId: true },
        },
        memberships: {
          select: {
            departmentId: true,
            role: true,
          },
        },
      },
    });

    if (!dbUser) {
      return {
        id: session.userId,
        globalRole: session.globalRole,
        status: session.status,
        departmentMemberships: [],
      };
    }

    return {
      id: dbUser.id,
      globalRole: dbUser.globalRole as GlobalRole,
      status: dbUser.status as AccountStatus,
      churchId: dbUser.churchId,
      pastorChurchIds: dbUser.pastorChurches.map((pc) => pc.churchId),
      departmentMemberships: dbUser.memberships.map((m) => ({
        departmentId: m.departmentId,
        role: m.role as 'MANAGER' | 'MEMBER',
      })),
    };
  } catch {
    return {
      id: session.userId,
      globalRole: session.globalRole,
      status: session.status,
      departmentMemberships: [],
    };
  }
});

export const ACTIVE_CHURCH_COOKIE_NAME = 'active_church_id';

/**
 * Obtém os dados da congregação ativa no contexto atual.
 * - ADMIN_MASTER: pode escolher qualquer igreja ativa.
 * - PASTOR: pode escolher entre as congregações a ele atribuídas.
 * - ELDER e USER: fixados estritamente na sua congregação cadastrada.
 */
export const getActiveChurchContext = cache(async function getActiveChurchContext(): Promise<{
  church: {
    id: string;
    name: string;
    slug: string;
    primaryColor: string;
    secondaryColor: string;
    logoUrl?: string | null;
  } | null;
  activeChurch: {
    id: string;
    name: string;
    slug: string;
    primaryColor: string;
    secondaryColor: string;
    logoUrl?: string | null;
  } | null;
  availableChurches: { id: string; name: string; slug: string }[];
  canSwitchChurch: boolean;
}> {
  const session = await getSession();
  const userContext = await getCurrentUserContext();
  const cookieStore = await cookies();
  const activeCookie = cookieStore.get(ACTIVE_CHURCH_COOKIE_NAME)?.value;

  try {
    // 1. Visitante / Não autenticado: carrega congregação padrão do banco
    if (!session || !userContext) {
      const defaultChurch = await prisma.church.findFirst({
        where: { active: true },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          name: true,
          slug: true,
          primaryColor: true,
          secondaryColor: true,
          logoUrl: true,
        },
      });

      return {
        church: defaultChurch,
        activeChurch: defaultChurch,
        availableChurches: defaultChurch ? [{ id: defaultChurch.id, name: defaultChurch.name, slug: defaultChurch.slug }] : [],
        canSwitchChurch: false,
      };
    }

    // 2. ADMIN_MASTER: Acesso global a todas as congregações
    if (userContext.globalRole === 'ADMIN_MASTER') {
      const allChurches = await prisma.church.findMany({
        where: { active: true },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          slug: true,
          primaryColor: true,
          secondaryColor: true,
          logoUrl: true,
        },
      });

      const activeChurch = (activeCookie && allChurches.find((c) => c.id === activeCookie)) || allChurches[0] || null;

      return {
        church: activeChurch,
        activeChurch: activeChurch,
        availableChurches: allChurches.map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
        canSwitchChurch: allChurches.length > 1,
      };
    }

    // 3. PASTOR: Acesso a todas as congregações pastoreadas
    if (userContext.globalRole === 'PASTOR') {
      const pastorChurches = await prisma.pastorChurch.findMany({
        where: { pastorId: userContext.id },
        include: {
          church: {
            select: {
              id: true,
              name: true,
              slug: true,
              primaryColor: true,
              secondaryColor: true,
              logoUrl: true,
              active: true,
            },
          },
        },
      });

      let churches = pastorChurches.map((pc) => pc.church).filter((c) => c.active);

      // Se ainda não tiver congregação vinculada explicitamente, busca todas as ativas
      if (churches.length === 0) {
        churches = await prisma.church.findMany({
          where: { active: true },
          orderBy: { name: 'asc' },
          select: {
            id: true,
            name: true,
            slug: true,
            primaryColor: true,
            secondaryColor: true,
            logoUrl: true,
            active: true,
          },
        });
      }

      const activeChurch = (activeCookie && churches.find((c) => c.id === activeCookie)) || churches[0] || null;

      return {
        church: activeChurch,
        activeChurch: activeChurch,
        availableChurches: churches.map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
        canSwitchChurch: churches.length > 1,
      };
    }

    // 4. ELDER ou USER (Líder / Voluntário): fixado na sua congregação única
    if (userContext.churchId) {
      const userChurch = await prisma.church.findUnique({
        where: { id: userContext.churchId },
        select: {
          id: true,
          name: true,
          slug: true,
          primaryColor: true,
          secondaryColor: true,
          logoUrl: true,
        },
      });

      return {
        church: userChurch,
        activeChurch: userChurch,
        availableChurches: userChurch ? [{ id: userChurch.id, name: userChurch.name, slug: userChurch.slug }] : [],
        canSwitchChurch: false,
      };
    }

    // Fallback caso usuário ainda não tenha churchId
    const fallbackChurch = await prisma.church.findFirst({
      where: { active: true },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        primaryColor: true,
        secondaryColor: true,
        logoUrl: true,
      },
    });

    return {
      church: fallbackChurch,
      activeChurch: fallbackChurch,
      availableChurches: fallbackChurch ? [{ id: fallbackChurch.id, name: fallbackChurch.name, slug: fallbackChurch.slug }] : [],
      canSwitchChurch: false,
    };
  } catch {
    const defaultFallback = {
      id: 'church_default_1',
      name: 'Comunidade da Fé',
      slug: 'comunidade-da-fe',
      primaryColor: '#0F4C5C',
      secondaryColor: '#E36414',
      logoUrl: null,
    };
    return {
      church: defaultFallback,
      activeChurch: defaultFallback,
      availableChurches: [{ id: defaultFallback.id, name: defaultFallback.name, slug: defaultFallback.slug }],
      canSwitchChurch: false,
    };
  }
});

/**
 * Alterna a congregação ativa no contexto do usuário (apenas ADMIN_MASTER e PASTOR).
 */
export async function switchActiveChurch(targetChurchId: string): Promise<{ success: boolean; error?: string }> {
  const userContext = await getCurrentUserContext();
  if (!userContext) {
    return { success: false, error: 'Usuário não autenticado' };
  }

  // Valida permissão de troca
  if (userContext.globalRole !== 'ADMIN_MASTER' && userContext.globalRole !== 'PASTOR') {
    return { success: false, error: 'Apenas a liderança pastoral e administradores podem alternar congregações' };
  }

  // Se for Pastor, verifica se a congregação está autorizada para ele
  if (userContext.globalRole === 'PASTOR' && userContext.pastorChurchIds && userContext.pastorChurchIds.length > 0) {
    if (!userContext.pastorChurchIds.includes(targetChurchId)) {
      return { success: false, error: 'Você não possui permissão para acessar esta congregação' };
    }
  }

  // Confirma existência da congregação
  const church = await prisma.church.findUnique({
    where: { id: targetChurchId },
  });

  if (!church || !church.active) {
    return { success: false, error: 'Congregação não encontrada ou inativa' };
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_CHURCH_COOKIE_NAME, targetChurchId, {
    httpOnly: false, // Disponível para Client Components para sincronização instantânea
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60, // 30 dias
    path: '/',
  });

  return { success: true };
}

/**
 * Autentica usuário com proteção contra rate-limiting, timing attacks e suporte a MFA.
 */
export async function authenticateUser(email: string, password: string, totpCode?: string, clientIp = '127.0.0.1') {
  // 1. Rate Limit por IP e e-mail
  const rateLimitKey = `${clientIp}:${email.toLowerCase().trim()}`;
  const blockCheck = await loginRateLimiter.isBlocked(rateLimitKey);
  if (blockCheck.blocked) {
    const minutes = Math.ceil(blockCheck.remainingMs / 60000);
    return {
      success: false,
      error: `Muitas tentativas incorretas. Tente novamente em ${minutes} minuto(s).`,
    };
  }

  // 2. Busca do usuário (sem revelar se existe ou não)
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    include: {
      memberships: {
        select: { role: true },
      },
    },
  });

  // Mensagem genérica anti-enumeração
  const INVALID_CREDENTIALS_MSG = 'E-mail ou senha incorretos.';

  if (!user) {
    await loginRateLimiter.recordAttempt(rateLimitKey);
    await prisma.auditLog.create({
      data: {
        action: 'LOGIN_FAILED',
        result: 'DENIED',
        ip: clientIp,
        meta: { email: email.toLowerCase().trim(), reason: 'USER_NOT_FOUND' },
      },
    });
    return { success: false, error: INVALID_CREDENTIALS_MSG };
  }

  // 2.1 Bloqueio temporário por conta (Regra 10: limitar tentativas por IP e por conta)
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        churchId: user.churchId,
        action: 'LOGIN_BLOCKED_ACCOUNT_LOCKED',
        result: 'DENIED',
        ip: clientIp,
        meta: { minutesLeft },
      },
    });
    return {
      success: false,
      error: `Esta conta está temporariamente bloqueada por excesso de tentativas. Tente novamente em ${minutesLeft} minuto(s).`,
    };
  }

  // 3. Verificação de senha
  const passwordValid = verifyPassword(password, user.passwordHash);
  if (!passwordValid) {
    await loginRateLimiter.recordAttempt(rateLimitKey);
    const newFailed = user.failedLogins + 1;
    const shouldLock = newFailed >= 5;
    const lockedUntil = shouldLock ? new Date(Date.now() + 15 * 60 * 1000) : user.lockedUntil;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLogins: newFailed,
        lockedUntil,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        churchId: user.churchId,
        action: shouldLock ? 'ACCOUNT_LOCKED_BRUTE_FORCE' : 'LOGIN_FAILED',
        result: 'DENIED',
        ip: clientIp,
        meta: { reason: 'INVALID_PASSWORD', failedAttempts: newFailed, locked: shouldLock },
      },
    });

    if (shouldLock) {
      return {
        success: false,
        error: 'Muitas tentativas incorretas. Esta conta foi temporariamente bloqueada por 15 minutos.',
      };
    }

    return { success: false, error: INVALID_CREDENTIALS_MSG };
  }

  // 4. Se a conta for PENDENTE ou INATIVA
  if (user.status === 'PENDING') {
    return {
      success: false,
      error: 'Seu cadastro está pendente de aprovação por um responsável.',
    };
  }

  if (user.status === 'REJECTED' || user.status === 'INACTIVE') {
    return {
      success: false,
      error: 'Sua conta está inativa ou não autorizada.',
    };
  }

  // 5. MFA TOTP obrigatório para ADMIN_MASTER ou quando ativado na conta
  const requiresMfa = user.globalRole === 'ADMIN_MASTER' || user.mfaEnabled;
  if (requiresMfa && user.mfaSecretEnc) {
    if (!totpCode) {
      return {
        success: false,
        requiresMfa: true,
        error: 'Digite o código do aplicativo autenticador ou um código de recuperação.',
      };
    }

    const secretKey = SESSION_SECRET;
    let plainSecret = '';
    try {
      if (user.mfaSecretEnc.startsWith('v1:')) {
        plainSecret = decryptField(user.mfaSecretEnc, secretKey);
      } else {
        plainSecret = Buffer.from(user.mfaSecretEnc, 'base64').toString('utf8');
      }
    } catch {
      plainSecret = user.mfaSecretEnc;
    }

    const cleanCode = totpCode.trim().replace(/[\s-]/g, '');
    let isValidMfa = false;

    // Se tiver 6 dígitos numéricos, tenta validar como TOTP
    if (/^\d{6}$/.test(cleanCode)) {
      isValidMfa = verifyTotp(cleanCode, plainSecret);
    }

    // Se não validou como TOTP ou se for código de recuperação, tenta validar recovery code
    if (!isValidMfa && user.mfaRecoveryCodes && Array.isArray(user.mfaRecoveryCodes)) {
      const recoveryResult = verifyAndConsumeRecoveryCode(cleanCode, user.mfaRecoveryCodes as string[]);
      if (recoveryResult.valid) {
        isValidMfa = true;
        await prisma.user.update({
          where: { id: user.id },
          data: {
            mfaRecoveryCodes: recoveryResult.remainingHashedCodes,
          },
        });
        await prisma.auditLog.create({
          data: {
            actorId: user.id,
            action: 'LOGIN_MFA_RECOVERY_CODE_USED',
            result: 'SUCCESS',
            ip: clientIp,
            meta: { remainingCodesCount: recoveryResult.remainingHashedCodes.length },
          },
        });
      }
    }

    if (!isValidMfa) {
      await loginRateLimiter.recordAttempt(rateLimitKey);
      await prisma.auditLog.create({
        data: {
          actorId: user.id,
          action: 'LOGIN_MFA_FAILED',
          result: 'DENIED',
          ip: clientIp,
        },
      });
      return {
        success: false,
        requiresMfa: true,
        error: 'Código de autenticação ou de recuperação inválido.',
      };
    }
  }

  // 6. Login bem-sucedido: limpa tentativas e rotaciona sessão
  await loginRateLimiter.reset(rateLimitKey);

  // Reseta contadores de falhas por conta no banco
  if (user.failedLogins > 0 || user.lockedUntil) {
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null },
    });
  }

  const isManager = user.memberships?.some((m) => m.role === 'MANAGER');

  const token = await createSession({
    id: user.id,
    globalRole: user.globalRole as GlobalRole,
    status: user.status as AccountStatus,
    name: user.name,
    email: user.email,
    mfaEnabled: user.mfaEnabled,
    isManager,
  });

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      churchId: user.churchId,
      action: 'LOGIN_SUCCESS',
      result: 'SUCCESS',
      ip: clientIp,
    },
  });

  return { success: true, token, user };
}

/**
 * Autocadastro de voluntário com estado PENDENTE e criptografia de campos sensíveis.
 */
export async function registerVolunteer(data: RegisterInput, clientIp = '127.0.0.1') {
  // 0. Proteção de rate limit por IP (Regra 10)
  const blockCheck = await registerRateLimiter.isBlocked(clientIp);
  if (blockCheck.blocked) {
    const minutes = Math.ceil(blockCheck.remainingMs / 60000);
    return {
      success: false,
      error: `Muitas tentativas de cadastro a partir deste endereço. Tente novamente em ${minutes} minuto(s).`,
    };
  }
  await registerRateLimiter.recordAttempt(clientIp);

  // 1. Validação de senha
  const passCheck = validatePasswordPolicy(data.password);
  if (!passCheck.valid) {
    return { success: false, error: passCheck.message };
  }

  // 2. Proteção contra enumeração: se o email já existe, não confirma mas não cria duplicado
  const existing = await prisma.user.findUnique({
    where: { email: data.email.toLowerCase().trim() },
  });

  if (existing) {
    // Retorna mensagem neutra idêntica
    return {
      success: true,
      message: 'Cadastro enviado. Assim que um responsável aprovar, você receberá um aviso.',
    };
  }

  // 3. Hash de senha e criptografia de campos sensíveis
  const passwordHash = hashPassword(data.password);

  let addressData: unknown = null;
  if (data.address) {
    addressData = {
      ...data.address,
      encryptedPayload: encryptField(JSON.stringify(data.address), SESSION_SECRET),
    };
  }

  let emergencyData: unknown = null;
  if (data.emergencyContact) {
    emergencyData = {
      name: data.emergencyContact.name,
      relationship: data.emergencyContact.relationship,
      phoneEnc: encryptField(data.emergencyContact.phone, SESSION_SECRET),
    };
  }

  // Determina congregação para o membro
  let targetChurchId = data.churchId;
  if (!targetChurchId) {
    const defaultChurch = await prisma.church.findFirst({
      where: { active: true },
      orderBy: { createdAt: 'asc' },
    });
    targetChurchId = defaultChurch?.id;
  }

  const newUser = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email.toLowerCase().trim(),
      passwordHash,
      globalRole: 'USER',
      status: 'PENDING',
      churchId: targetChurchId || null,
      birthDate: data.birthDate ? new Date(data.birthDate) : null,
      gender: data.gender,
      maritalStatus: data.maritalStatus,
      phonePrimary: data.phonePrimary,
      phoneSecondary: data.phoneSecondary || null,
      whatsapp: data.whatsapp || data.phonePrimary,
      address: addressData as any,
      emergencyContact: emergencyData as any,
      joinedAt: data.joinedAt ? new Date(data.joinedAt) : null,
      preferredChannel: data.preferredChannel,
      notes: data.notes || null,
      termsAcceptedAt: new Date(),
      termsVersion: 'v1.0',
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: newUser.id,
      churchId: targetChurchId || null,
      action: 'USER_REGISTERED',
      targetType: 'User',
      targetId: newUser.id,
      result: 'SUCCESS',
      ip: clientIp,
      meta: { name: newUser.name, email: newUser.email },
    },
  });

  return {
    success: true,
    message: 'Cadastro enviado. Assim que um responsável aprovar, você receberá um aviso.',
  };
}

/**
 * Inicia o setup de MFA para o usuário logado: gera segredo, QR Code e códigos de recuperação.
 */
export async function startMfaSetup(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, mfaEnabled: true },
  });

  if (!user) {
    return { success: false, error: 'Usuário não encontrado.' };
  }

  const church = await prisma.churchSettings.findFirst();
  const issuer = church?.name || 'Revezo';

  const secret = generateTotpSecret();
  const formattedSecret = formatSecretForDisplay(secret);
  const otpauthUri = getTotpUri(secret, user.email, issuer);
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUri, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 240,
    color: {
      dark: '#111827',
      light: '#FFFFFF',
    },
  });

  const { plainCodes, hashedCodes } = generateRecoveryCodes();

  return {
    success: true,
    secret,
    formattedSecret,
    otpauthUri,
    qrCodeDataUrl,
    plainRecoveryCodes: plainCodes,
    recoveryCodeHashes: hashedCodes,
  };
}

/**
 * Valida o primeiro código TOTP do voluntário e ativa permanentemente o MFA.
 */
export async function enableMfa(
  userId: string,
  code: string,
  secret: string,
  recoveryCodeHashes: string[],
  clientIp = '127.0.0.1'
) {
  const cleanCode = code.trim().replace(/\s/g, '');
  const isValid = verifyTotp(cleanCode, secret);

  if (!isValid) {
    await prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'MFA_ENABLE_FAILED',
        result: 'DENIED',
        ip: clientIp,
        meta: { reason: 'INVALID_CODE' },
      },
    });
    return {
      success: false,
      error: 'Código de verificação incorreto. Confira os 6 números gerados no seu aplicativo autenticador.',
    };
  }

  const mfaSecretEnc = encryptField(secret, SESSION_SECRET);

  await prisma.user.update({
    where: { id: userId },
    data: {
      mfaEnabled: true,
      mfaSecretEnc,
      mfaRecoveryCodes: recoveryCodeHashes,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: userId,
      action: 'MFA_ENABLED',
      targetType: 'User',
      targetId: userId,
      result: 'SUCCESS',
      ip: clientIp,
    },
  });

  return {
    success: true,
    message: 'Autenticação em duas etapas ativada com sucesso.',
  };
}

/**
 * Desativa o MFA após confirmação de senha do usuário.
 */
export async function disableMfa(userId: string, password: string, clientIp = '127.0.0.1') {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    return { success: false, error: 'Usuário não encontrado.' };
  }

  // Regra de Segurança: Administradores Gerais não podem desativar o 2FA
  if (user.globalRole === 'ADMIN_MASTER') {
    return {
      success: false,
      error: 'A autenticação em duas etapas é mandatória para Administradores Gerais e não pode ser desativada.',
    };
  }

  const passwordValid = verifyPassword(password, user.passwordHash);
  if (!passwordValid) {
    await prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'MFA_DISABLE_FAILED',
        result: 'DENIED',
        ip: clientIp,
        meta: { reason: 'INVALID_PASSWORD' },
      },
    });
    return {
      success: false,
      error: 'Senha incorreta. Não foi possível desativar a autenticação em duas etapas.',
    };
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      mfaEnabled: false,
      mfaSecretEnc: null,
      mfaRecoveryCodes: Prisma.DbNull,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: userId,
      action: 'MFA_DISABLED',
      targetType: 'User',
      targetId: userId,
      result: 'SUCCESS',
      ip: clientIp,
    },
  });

  return {
    success: true,
    message: 'Autenticação em duas etapas desativada.',
  };
}

