import { UserContext, Action } from './can.js';

export interface UserScope {
  userId: string;
  globalRole: string;
  isUnrestrictedAdmin: boolean;
  canManageAllInChurch: boolean;
  churchId?: string | null;
  pastorChurchIds: string[];
  managedDepartmentIds: string[];
  allDepartmentIds: string[];
  isManagerOf(departmentId?: string | null): boolean;
  isInChurchScope(churchId?: string | null): boolean;
}

/**
 * Extrai o escopo completo de autorização do usuário autenticado.
 */
export function extractUserScope(user: UserContext | null | undefined): UserScope {
  if (!user || user.status !== 'ACTIVE') {
    return {
      userId: '',
      globalRole: 'ANONYMOUS',
      isUnrestrictedAdmin: false,
      canManageAllInChurch: false,
      pastorChurchIds: [],
      managedDepartmentIds: [],
      allDepartmentIds: [],
      isManagerOf: () => false,
      isInChurchScope: () => false,
    };
  }

  const isUnrestrictedAdmin = user.globalRole === 'ADMIN_MASTER';
  const isPastor = user.globalRole === 'PASTOR';
  const isElder = user.globalRole === 'ELDER';
  const canManageAllInChurch = isUnrestrictedAdmin || isPastor || isElder;

  const managedDepartmentIds = user.departmentMemberships
    .filter((m) => m.role === 'MANAGER')
    .map((m) => m.departmentId);

  const allDepartmentIds = user.departmentMemberships.map((m) => m.departmentId);
  const pastorChurchIds = user.pastorChurchIds || [];

  const isManagerOf = (departmentId?: string | null) => {
    if (!departmentId) return false;
    return isUnrestrictedAdmin || managedDepartmentIds.includes(departmentId);
  };

  const isInChurchScope = (targetChurchId?: string | null) => {
    if (isUnrestrictedAdmin) return true;
    if (!targetChurchId) return true;
    if (isPastor) {
      return pastorChurchIds.length === 0 || pastorChurchIds.includes(targetChurchId);
    }
    return user.churchId === targetChurchId;
  };

  return {
    userId: user.id,
    globalRole: user.globalRole,
    isUnrestrictedAdmin,
    canManageAllInChurch,
    churchId: user.churchId,
    pastorChurchIds,
    managedDepartmentIds,
    allDepartmentIds,
    isManagerOf,
    isInChurchScope,
  };
}

/**
 * Cria cláusula de busca scoped no Prisma para Departamentos,
 * garantindo que consultas sejam filtradas pelo escopo do usuário (Anti-IDOR).
 */
export function buildDepartmentScopeWhere(
  user: UserContext | null | undefined,
  action: Action,
  targetChurchId?: string | null
): Record<string, any> {
  const scope = extractUserScope(user);

  if (!user || user.status !== 'ACTIVE') {
    return { id: '__DENIED_EMPTY__' };
  }

  // 1. ADMIN_MASTER: acesso global (filtrado apenas por congregação se especificado)
  if (scope.isUnrestrictedAdmin) {
    return targetChurchId ? { churchId: targetChurchId } : {};
  }

  // 2. PASTOR: congregações sob seus cuidados
  if (user.globalRole === 'PASTOR') {
    const churchFilter = targetChurchId
      ? { churchId: targetChurchId }
      : scope.pastorChurchIds.length > 0
      ? { churchId: { in: scope.pastorChurchIds } }
      : {};
    return churchFilter;
  }

  // 3. ELDER: sua congregação local
  if (user.globalRole === 'ELDER') {
    return {
      churchId: user.churchId || targetChurchId || '__NO_CHURCH__',
    };
  }

  // 4. GESTOR / MEMBRO
  // Para visualização de departamentos (ex: lista pública interna da igreja)
  if (action === 'department:view') {
    return {
      churchId: user.churchId || targetChurchId || '__NO_CHURCH__',
    };
  }

  // Para ações de alteração/gestão (ex: department:update, member:add, etc.)
  // Filtrado exclusivamente nos departamentos onde é gestor
  if (scope.managedDepartmentIds.length > 0) {
    return {
      id: { in: scope.managedDepartmentIds },
      ...(user.churchId ? { churchId: user.churchId } : {}),
    };
  }

  // Voluntário comum não tem escopo de gestão
  return { id: '__DENIED_EMPTY__' };
}

/**
 * Cria cláusula de busca scoped no Prisma para Escalas (Assignments),
 * garantindo que IDs de escalas fornecidos pelo cliente sejam validados diretamente no WHERE.
 */
export function buildAssignmentScopeWhere(
  user: UserContext | null | undefined,
  action: Action,
  targetChurchId?: string | null
): Record<string, any> {
  const scope = extractUserScope(user);

  if (!user || user.status !== 'ACTIVE') {
    return { id: '__DENIED_EMPTY__' };
  }

  // Ações de confirmação/desmarcação e visualização própria
  if (
    action === 'assignment:confirm:own' ||
    action === 'assignment:decline:own' ||
    action === 'assignment:view:own'
  ) {
    return { userId: user.id };
  }

  // ADMIN_MASTER: irrestrito
  if (scope.isUnrestrictedAdmin) {
    return targetChurchId ? { slot: { program: { churchId: targetChurchId } } } : {};
  }

  // PASTOR: igrejas sob cuidado pastoral
  if (user.globalRole === 'PASTOR') {
    if (targetChurchId) {
      return { slot: { program: { churchId: targetChurchId } } };
    }
    if (scope.pastorChurchIds.length > 0) {
      return { slot: { program: { churchId: { in: scope.pastorChurchIds } } } };
    }
    return {};
  }

  // ELDER: toda a sua igreja
  if (user.globalRole === 'ELDER') {
    return {
      slot: { program: { churchId: user.churchId || targetChurchId || '__NO_CHURCH__' } },
    };
  }

  // GESTOR: apenas escalas dos departamentos sob sua gestão
  if (scope.managedDepartmentIds.length > 0) {
    return {
      slot: {
        departmentId: { in: scope.managedDepartmentIds },
      },
    };
  }

  // Membro comum tentando alterar escala de outros
  return { id: '__DENIED_EMPTY__' };
}

/**
 * Cria cláusula de busca scoped no Prisma para Voluntários/Membros,
 * garantindo que a consulta retorne apenas membros dentro da congregação ou departamentos permitidos.
 */
export function buildMemberScopeWhere(
  user: UserContext | null | undefined,
  action: Action,
  targetChurchId?: string | null
): Record<string, any> {
  const scope = extractUserScope(user);

  if (!user || user.status !== 'ACTIVE') {
    return { id: '__DENIED_EMPTY__' };
  }

  // Ações de perfil próprio
  if (
    action === 'profile:view:own' ||
    action === 'profile:update:own' ||
    action === 'profile:export:own'
  ) {
    return { id: user.id };
  }

  // ADMIN_MASTER: irrestrito
  if (scope.isUnrestrictedAdmin) {
    return targetChurchId ? { churchId: targetChurchId } : {};
  }

  // PASTOR: suas congregações
  if (user.globalRole === 'PASTOR') {
    if (targetChurchId) {
      return { churchId: targetChurchId };
    }
    if (scope.pastorChurchIds.length > 0) {
      return { churchId: { in: scope.pastorChurchIds } };
    }
    return {};
  }

  // ELDER: sua congregação local
  if (user.globalRole === 'ELDER') {
    return {
      churchId: user.churchId || targetChurchId || '__NO_CHURCH__',
    };
  }

  // GESTOR: voluntários vinculados aos departamentos que ele gerencia
  if (scope.managedDepartmentIds.length > 0) {
    return {
      memberships: {
        some: {
          departmentId: { in: scope.managedDepartmentIds },
        },
      },
      ...(user.churchId ? { churchId: user.churchId } : {}),
    };
  }

  // Membro comum não tem escopo para gerenciar outros voluntários
  return { id: '__DENIED_EMPTY__' };
}
