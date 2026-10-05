/**
 * Autorização centralizada RBAC com suporte multi-igreja e hierarquia eclesiástica.
 * Regra fundamental: Negar por padrão.
 */

export type GlobalRole = 'ADMIN_MASTER' | 'PASTOR' | 'ELDER' | 'USER';
export type AccountStatus = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'INACTIVE';
export type DepartmentRole = 'MANAGER' | 'MEMBER';

export interface UserContext {
  id: string;
  globalRole: GlobalRole;
  status: AccountStatus;
  churchId?: string | null;           // Para ELDER e USER (1 igreja única)
  pastorChurchIds?: string[];        // Para PASTOR (igrejas sob seus cuidados)
  departmentMemberships: {
    departmentId: string;
    role: DepartmentRole;
  }[];
}

export const ROLE_HIERARCHY_LEVEL: Record<GlobalRole, number> = {
  ADMIN_MASTER: 4,
  PASTOR: 3,
  ELDER: 2,
  USER: 1,
};

/**
 * Determina se o usuário possui nível hierárquico igual ou superior ao criador do recurso
 * para poder alterá-lo ou excluí-lo. Níveis inferiores nunca podem alterar dados de níveis acima.
 */
export function canModifyResourceByHierarchy(
  userRole: GlobalRole,
  resourceCreatedByRole?: GlobalRole | null
): boolean {
  if (!resourceCreatedByRole) return true;
  return ROLE_HIERARCHY_LEVEL[userRole] >= ROLE_HIERARCHY_LEVEL[resourceCreatedByRole];
}

export type Action =
  // Sessão & Perfil
  | 'profile:view:own'
  | 'profile:update:own'
  | 'profile:view:other'
  | 'profile:update:other'
  | 'profile:export:own'
  // Autocadastro e Aprovações
  | 'registration:approve'
  | 'registration:reject'
  // Membros
  | 'member:create'
  | 'member:list'
  | 'member:import'
  | 'member:export'
  // Departamentos e Funções
  | 'department:create'
  | 'department:update'
  | 'department:view'
  | 'department:member:add'
  | 'department:member:update'
  | 'department:member:remove'
  | 'function:create'
  | 'function:update'
  | 'manager:assign'
  // Programas e Cronogramas
  | 'program:create'
  | 'program:update'
  | 'program:delete'
  | 'program:clone'
  | 'program:view'
  // Escalas (Assignments)
  | 'assignment:create'
  | 'assignment:delete'
  | 'assignment:confirm:own'
  | 'assignment:decline:own'
  | 'assignment:view:all'
  | 'assignment:view:department'
  | 'assignment:view:own'
  | 'schedule:approve'
  // Disponibilidade
  | 'availability:manage:own'
  // Multi-Igreja, Gestão Pastoral e Configurações
  | 'church:create'
  | 'church:settings:update'
  | 'church:switch'
  | 'church:elder:assign'
  // Regras Técnicas do Sistema (Exclusivo ADMIN_MASTER)
  | 'system:technical:manage'
  | 'audit:view';

export interface ResourceContext {
  targetUserId?: string;
  churchId?: string;
  departmentId?: string;
  departmentIds?: string[];
  newRole?: GlobalRole;
  createdByRole?: GlobalRole | null;
}

/**
 * Função pura de autorização: can(user, action, resource).
 */
export function can(
  user: UserContext | null | undefined,
  action: Action,
  resource?: ResourceContext
): boolean {
  if (!user) {
    return false;
  }

  // Contas PENDENTES, REJEITADAS ou INATIVAS não têm acesso a nenhuma ação protegida
  if (user.status !== 'ACTIVE') {
    return false;
  }

  // Regra fundamental (Regra 11): Ninguém altera o próprio papel (nem ADMIN_MASTER, PASTOR, ELDER, GESTOR ou USER)
  if (
    action === 'profile:update:other' &&
    resource?.targetUserId === user.id &&
    resource?.newRole &&
    resource.newRole !== user.globalRole
  ) {
    return false;
  }

  // 1. ADMIN_MASTER possui acesso a tudo
  if (user.globalRole === 'ADMIN_MASTER') {
    return true;
  }

  // 2. Ações técnicas e exclusivas de ADMIN_MASTER
  const adminOnlyActions: Action[] = [
    'system:technical:manage',
    'audit:view',
    'member:import',
    'member:export',
  ];

  if (adminOnlyActions.includes(action)) {
    return false;
  }

  // 3. Verificação de Escopo de Igreja (Anti-IDOR)
  // Usuários com igreja única (ELDER e USER) só podem acessar recursos da sua própria igreja
  if (user.globalRole === 'ELDER' || user.globalRole === 'USER') {
    if (resource?.churchId && user.churchId && resource.churchId !== user.churchId) {
      return false;
    }
  }

  // Pastores com congregações atribuídas só podem acessar suas congregações
  if (user.globalRole === 'PASTOR') {
    if (
      resource?.churchId &&
      user.pastorChurchIds &&
      user.pastorChurchIds.length > 0 &&
      !user.pastorChurchIds.includes(resource.churchId)
    ) {
      return false;
    }
  }

  // 4. Verificação de Imutabilidade Hierárquica
  // Ações de alteração ou exclusão de entidades gerenciadas (programas, departamentos)
  const hierarchicalModifyActions: Action[] = [
    'program:update',
    'program:delete',
    'department:update',
  ];

  if (hierarchicalModifyActions.includes(action) && resource?.createdByRole) {
    if (!canModifyResourceByHierarchy(user.globalRole, resource.createdByRole)) {
      return false;
    }
  }

  // 5. PASTOR (Master Pastoral Multi-Igreja)
  if (user.globalRole === 'PASTOR') {
    // Pastor não pode promover alguém a ADMIN_MASTER
    if (
      action === 'profile:update:other' &&
      resource?.newRole &&
      ROLE_HIERARCHY_LEVEL[resource.newRole] >= ROLE_HIERARCHY_LEVEL.ADMIN_MASTER
    ) {
      return false;
    }

    // Pastor não pode auto-rebaixar seu próprio papel
    if (
      action === 'profile:update:other' &&
      resource?.targetUserId === user.id &&
      resource?.newRole &&
      resource.newRole !== 'PASTOR'
    ) {
      return false;
    }

    // Todas as outras ações pastorais/gestão são permitidas ao Pastor dentro do seu escopo
    return true;
  }

  // 6. ANCIÃO (Administração Local de 1 Igreja)
  if (user.globalRole === 'ELDER') {
    // Ancião não pode vincular nem alterar outros anciãos, pastores ou admins
    if (action === 'church:elder:assign') {
      return false;
    }
    if (action === 'church:settings:update' || action === 'church:create' || action === 'church:switch') {
      return false;
    }
    if (
      action === 'profile:update:other' &&
      resource?.newRole &&
      ROLE_HIERARCHY_LEVEL[resource.newRole] >= ROLE_HIERARCHY_LEVEL.ELDER
    ) {
      return false;
    }

    // Ações de gestão na sua congregação
    switch (action) {
      case 'program:create':
      case 'program:view':
      case 'program:clone':
      case 'program:update':
      case 'program:delete':
      case 'registration:approve':
      case 'registration:reject':
      case 'department:create':
      case 'department:view':
      case 'department:update':
      case 'department:member:add':
      case 'department:member:update':
      case 'department:member:remove':
      case 'function:create':
      case 'function:update':
      case 'manager:assign':
      case 'member:create':
      case 'member:list':
      case 'profile:view:other':
      case 'assignment:create':
      case 'assignment:delete':
      case 'assignment:view:all':
      case 'assignment:view:department':
      case 'schedule:approve':
        return true;

      case 'profile:view:own':
      case 'profile:update:own':
      case 'profile:export:own':
      case 'availability:manage:own':
      case 'assignment:confirm:own':
      case 'assignment:decline:own':
      case 'assignment:view:own':
        return !resource?.targetUserId || resource.targetUserId === user.id;

      case 'profile:update:other':
        return true;

      default:
        return false;
    }
  }

  // 7. LÍDER DE DEPARTAMENTO (GESTOR) & VOLUNTÁRIO (USER)
  // Determina departamentos onde o usuário é GESTOR
  const managedDepartmentIds = user.departmentMemberships
    .filter((m) => m.role === 'MANAGER')
    .map((m) => m.departmentId);

  const isManagerOf = (deptId?: string): boolean => {
    if (!deptId) return false;
    return managedDepartmentIds.includes(deptId);
  };

  const isManagerOfAny = (deptIds?: string[]): boolean => {
    if (!deptIds || deptIds.length === 0) return false;
    return deptIds.some((id) => managedDepartmentIds.includes(id));
  };

  switch (action) {
    // Perfil próprio
    case 'profile:view:own':
    case 'profile:update:own':
    case 'profile:export:own':
    case 'availability:manage:own':
      return !resource?.targetUserId || resource.targetUserId === user.id;

    // Confirmação e desmarcação própria
    case 'assignment:confirm:own':
    case 'assignment:decline:own':
    case 'assignment:view:own':
      return !resource?.targetUserId || resource.targetUserId === user.id;

    // Ver outro perfil (membro comum só vê sanitizado; gestor vê completo do seu dept)
    case 'profile:view:other':
      if (resource?.departmentId) {
        return isManagerOf(resource.departmentId);
      }
      if (resource?.departmentIds) {
        return isManagerOfAny(resource.departmentIds);
      }
      return false;

    // Alterar perfil de outro usuário (apenas gestor do departamento sobre voluntários)
    case 'profile:update:other':
      if (resource?.newRole) {
        return false;
      }
      if (resource?.departmentId) {
        return isManagerOf(resource.departmentId);
      }
      if (resource?.departmentIds) {
        return isManagerOfAny(resource.departmentIds);
      }
      return false;

    // Aprovações e rejeições de cadastro
    case 'registration:approve':
    case 'registration:reject':
      return isManagerOf(resource?.departmentId);

    // Departamentos e Funções
    case 'department:view':
      return true; // Membros ativos podem visualizar a lista de departamentos da igreja
    case 'department:update':
    case 'department:member:add':
    case 'department:member:update':
    case 'department:member:remove':
    case 'member:create':
    case 'function:create':
    case 'function:update':
      return isManagerOf(resource?.departmentId);

    // Listagem geral de voluntários (apenas para quem é gestor de pelo menos 1 departamento)
    case 'member:list':
      if (resource?.departmentId) {
        return isManagerOf(resource.departmentId);
      }
      return managedDepartmentIds.length > 0;

    // Programas
    case 'program:view':
      return true; // Membros podem ver a agenda de programas
    case 'program:create':
    case 'program:update':
    case 'program:delete':
    case 'program:clone':
      if (resource?.departmentId) {
        return isManagerOf(resource.departmentId);
      }
      if (resource?.departmentIds) {
        return isManagerOfAny(resource.departmentIds);
      }
      return false;

    // Escalas (atribuir, remover e aprovar)
    case 'assignment:create':
    case 'assignment:delete':
    case 'assignment:view:department':
    case 'schedule:approve':
      if (resource?.departmentId) {
        return isManagerOf(resource.departmentId);
      }
      if (resource?.departmentIds) {
        return isManagerOfAny(resource.departmentIds);
      }
      return false;

    default:
      return false;
  }
}
