import { describe, expect, it } from 'vitest';
import {
  can,
  canModifyResourceByHierarchy,
  ROLE_HIERARCHY_LEVEL,
  UserContext,
  maskPhoneNumber,
  maskEmail,
  sanitizeMemberForVolunteers,
  RawMemberData,
  extractUserScope,
  buildDepartmentScopeWhere,
  buildAssignmentScopeWhere,
  buildMemberScopeWhere,
} from '../src/index.js';

describe('Autorização RBAC (can) e Escopo Departamental', () => {
  const adminMaster: UserContext = {
    id: 'admin-1',
    globalRole: 'ADMIN_MASTER',
    status: 'ACTIVE',
    departmentMemberships: [],
  };

  const gestorLouvor: UserContext = {
    id: 'gestor-louvor',
    globalRole: 'USER',
    status: 'ACTIVE',
    departmentMemberships: [
      { departmentId: 'dept-louvor', role: 'MANAGER' },
      { departmentId: 'dept-midia', role: 'MEMBER' },
    ],
  };

  const membroComum: UserContext = {
    id: 'membro-1',
    globalRole: 'USER',
    status: 'ACTIVE',
    departmentMemberships: [
      { departmentId: 'dept-louvor', role: 'MEMBER' },
    ],
  };

  const usuarioPendente: UserContext = {
    id: 'pendente-1',
    globalRole: 'USER',
    status: 'PENDING',
    departmentMemberships: [],
  };

  it('ADMIN_MASTER possui permissão irrestrita nas ações administrativas', () => {
    expect(can(adminMaster, 'church:settings:update')).toBe(true);
    expect(can(adminMaster, 'audit:view')).toBe(true);
    expect(can(adminMaster, 'department:create')).toBe(true);
    expect(can(adminMaster, 'manager:assign')).toBe(true);
    expect(can(adminMaster, 'assignment:create', { departmentId: 'dept-louvor' })).toBe(true);
  });

  it('impede que o ADMIN_MASTER rebaixe a si próprio para USER (regra de segurança)', () => {
    expect(
      can(adminMaster, 'profile:update:other', {
        targetUserId: adminMaster.id,
        newRole: 'USER',
      })
    ).toBe(false);
  });

  it('GESTOR pode gerenciar apenas o departamento onde é gestor', () => {
    // No seu departamento: permitido
    expect(can(gestorLouvor, 'assignment:create', { departmentId: 'dept-louvor' })).toBe(true);
    expect(can(gestorLouvor, 'registration:approve', { departmentId: 'dept-louvor' })).toBe(true);
    expect(can(gestorLouvor, 'function:create', { departmentId: 'dept-louvor' })).toBe(true);
    expect(can(gestorLouvor, 'department:member:add', { departmentId: 'dept-louvor' })).toBe(true);
    expect(can(gestorLouvor, 'department:member:update', { departmentId: 'dept-louvor' })).toBe(true);
    expect(can(gestorLouvor, 'department:member:remove', { departmentId: 'dept-louvor' })).toBe(true);

    // Em outro departamento: negado (proteção contra IDOR)
    expect(can(gestorLouvor, 'assignment:create', { departmentId: 'dept-midia' })).toBe(false);
    expect(can(gestorLouvor, 'assignment:create', { departmentId: 'dept-infantil' })).toBe(false);
    expect(can(gestorLouvor, 'registration:approve', { departmentId: 'dept-midia' })).toBe(false);
    expect(can(gestorLouvor, 'department:member:add', { departmentId: 'dept-midia' })).toBe(false);
    expect(can(gestorLouvor, 'department:member:remove', { departmentId: 'dept-midia' })).toBe(false);

    // Ações exclusivas de ADMIN_MASTER: negado para gestor
    expect(can(gestorLouvor, 'church:settings:update')).toBe(false);
    expect(can(gestorLouvor, 'audit:view')).toBe(false);
    expect(can(gestorLouvor, 'department:create')).toBe(false);
  });

  it('MEMBRO só tem acesso ao próprio espaço e visualização permitida', () => {
    // Pode ver e interagir com sua própria escala
    expect(can(membroComum, 'assignment:view:own', { targetUserId: membroComum.id })).toBe(true);
    expect(can(membroComum, 'assignment:confirm:own', { targetUserId: membroComum.id })).toBe(true);
    expect(can(membroComum, 'assignment:decline:own', { targetUserId: membroComum.id })).toBe(true);
    expect(can(membroComum, 'profile:view:own', { targetUserId: membroComum.id })).toBe(true);

    // Não pode criar ou alterar escalas nem gerenciar equipe
    expect(can(membroComum, 'assignment:create', { departmentId: 'dept-louvor' })).toBe(false);
    expect(can(membroComum, 'department:create')).toBe(false);
    expect(can(membroComum, 'department:member:add', { departmentId: 'dept-louvor' })).toBe(false);
    expect(can(membroComum, 'department:member:remove', { departmentId: 'dept-louvor' })).toBe(false);
    expect(can(membroComum, 'registration:approve')).toBe(false);

    // Não pode ver dados completos de outro membro
    expect(can(membroComum, 'profile:view:other', { targetUserId: 'outro-user', departmentId: 'dept-louvor' })).toBe(false);
  });

  it('PENDENTE, REJEITADO ou INATIVO tem acesso NEGADO a todas as ações', () => {
    expect(can(usuarioPendente, 'profile:view:own')).toBe(false);
    expect(can(usuarioPendente, 'assignment:view:own')).toBe(false);
    expect(can(usuarioPendente, 'department:view')).toBe(false);
    expect(can(usuarioPendente, 'program:view')).toBe(false);
  });
});

describe('Perfis PASTOR e ELDER, Proteção Hierárquica e Multi-Igreja', () => {
  const pastorCarlos: UserContext = {
    id: 'pastor-carlos',
    globalRole: 'PASTOR',
    status: 'ACTIVE',
    pastorChurchIds: ['igreja-central', 'igreja-bairronovo'],
    departmentMemberships: [],
  };

  const anciaoCentral: UserContext = {
    id: 'anciao-central',
    globalRole: 'ELDER',
    status: 'ACTIVE',
    churchId: 'igreja-central',
    departmentMemberships: [],
  };

  const anciaoBairroNovo: UserContext = {
    id: 'anciao-bairronovo',
    globalRole: 'ELDER',
    status: 'ACTIVE',
    churchId: 'igreja-bairronovo',
    departmentMemberships: [],
  };

  const voluntarioCentral: UserContext = {
    id: 'voluntario-central',
    globalRole: 'USER',
    status: 'ACTIVE',
    churchId: 'igreja-central',
    departmentMemberships: [],
  };

  describe('PASTOR: Acesso Master Pastoral Multi-Igreja sem Regras Técnicas', () => {
    it('permite que o Pastor navegue e altere configurações pastorais de suas congregações', () => {
      expect(can(pastorCarlos, 'church:switch')).toBe(true);
      expect(can(pastorCarlos, 'church:settings:update', { churchId: 'igreja-central' })).toBe(true);
      expect(can(pastorCarlos, 'church:settings:update', { churchId: 'igreja-bairronovo' })).toBe(true);
    });

    it('permite que o Pastor vincule Anciãos às congregações', () => {
      expect(can(pastorCarlos, 'church:elder:assign', { churchId: 'igreja-central' })).toBe(true);
    });

    it('bloqueia o Pastor de alterar regras técnicas do sistema', () => {
      expect(can(pastorCarlos, 'system:technical:manage')).toBe(false);
      expect(can(pastorCarlos, 'audit:view')).toBe(false);
    });

    it('impede que o Pastor promova qualquer pessoa para ADMIN_MASTER', () => {
      expect(
        can(pastorCarlos, 'profile:update:other', {
          targetUserId: 'membro-qualquer',
          newRole: 'ADMIN_MASTER',
        })
      ).toBe(false);
    });

    it('impede que o Pastor acesse uma congregação que não esteja na sua lista de atribuição', () => {
      expect(can(pastorCarlos, 'program:create', { churchId: 'igreja-outra-cidade' })).toBe(false);
    });
  });

  describe('ANCIÃO: Administração Local da Igreja e Proteção Hierárquica', () => {
    it('permite que o Ancião crie cronogramas e aprove novos cadastros na sua igreja', () => {
      expect(can(anciaoCentral, 'program:create', { churchId: 'igreja-central' })).toBe(true);
      expect(can(anciaoCentral, 'registration:approve', { churchId: 'igreja-central' })).toBe(true);
      expect(can(anciaoCentral, 'department:create', { churchId: 'igreja-central' })).toBe(true);
    });

    it('impede que o Ancião acesse dados ou cronogramas de outra congregação (Anti-IDOR)', () => {
      expect(can(anciaoCentral, 'program:create', { churchId: 'igreja-bairronovo' })).toBe(false);
      expect(can(anciaoCentral, 'registration:approve', { churchId: 'igreja-bairronovo' })).toBe(false);
    });

    it('impede que o Ancião vincule outros anciãos ou altere regras técnicas', () => {
      expect(can(anciaoCentral, 'church:elder:assign')).toBe(false);
      expect(can(anciaoCentral, 'system:technical:manage')).toBe(false);
      expect(can(anciaoCentral, 'church:settings:update')).toBe(false);
      expect(can(anciaoCentral, 'church:switch')).toBe(false);
    });

    it('PROTEÇÃO HIERÁRQUICA: Impede que o Ancião altere ou exclua programas criados por PASTOR ou ADMIN_MASTER', () => {
      // Criado pelo Pastor: Ancião NÃO pode alterar nem excluir
      expect(
        can(anciaoCentral, 'program:update', {
          churchId: 'igreja-central',
          createdByRole: 'PASTOR',
        })
      ).toBe(false);
      expect(
        can(anciaoCentral, 'program:delete', {
          churchId: 'igreja-central',
          createdByRole: 'PASTOR',
        })
      ).toBe(false);

      // Criado pelo Admin Master: Ancião NÃO pode alterar
      expect(
        can(anciaoCentral, 'program:update', {
          churchId: 'igreja-central',
          createdByRole: 'ADMIN_MASTER',
        })
      ).toBe(false);

      // Criado por outro Ancião ou por ele mesmo: Ancião PODE alterar
      expect(
        can(anciaoCentral, 'program:update', {
          churchId: 'igreja-central',
          createdByRole: 'ELDER',
        })
      ).toBe(true);
    });
  });

  describe('VOLUNTÁRIO: Restrito a 1 igreja única', () => {
    it('impede que voluntário acesse recursos de outra congregação', () => {
      expect(
        can(voluntarioCentral, 'assignment:view:own', {
          targetUserId: voluntarioCentral.id,
          churchId: 'igreja-bairronovo',
        })
      ).toBe(false);
    });
  });
});

describe('Sanitização e Mascaramento de Dados Pessoais (LGPD)', () => {
  it('mascara número de telefone ocultando dígitos centrais', () => {
    expect(maskPhoneNumber('+5562987654321')).toBe('+55629****-4321');
    expect(maskPhoneNumber('')).toBe('');
  });

  it('mascara e-mail preservando início e domínio', () => {
    expect(maskEmail('voluntario@igreja.org.br')).toBe('v***o@igreja.org.br');
    expect(maskEmail('')).toBe('');
  });

  it('sanitiza membro para voluntários da equipe removendo telefone, endereço e emergência', () => {
    const raw: RawMemberData = {
      id: 'usr-1',
      name: 'Maria Souza',
      email: 'maria@example.com',
      phonePrimary: '+5562988887777',
      address: { street: 'Rua das Flores', number: '123' },
      emergencyContact: { name: 'José', phone: '+5562999998888' },
      departmentMemberships: [
        {
          departmentId: 'dept-1',
          departmentName: 'Recepção',
          role: 'MEMBER',
          functions: [{ functionId: 'f-1', functionName: 'Porta' }],
        },
      ],
    };

    const sanitized = sanitizeMemberForVolunteers(raw);
    expect(sanitized.id).toBe('usr-1');
    expect(sanitized.name).toBe('Maria Souza');
    expect((sanitized as unknown as RawMemberData).phonePrimary).toBeUndefined();
    expect((sanitized as unknown as RawMemberData).email).toBeUndefined();
    expect((sanitized as unknown as RawMemberData).address).toBeUndefined();
    expect((sanitized as unknown as RawMemberData).emergencyContact).toBeUndefined();
  });
});

describe('Regra 11: Imutabilidade do Próprio Papel e Listagem de Membros', () => {
  const pastor: UserContext = {
    id: 'pastor-1',
    globalRole: 'PASTOR',
    status: 'ACTIVE',
    pastorChurchIds: ['church-1'],
    departmentMemberships: [],
  };

  const anciao: UserContext = {
    id: 'anciao-1',
    globalRole: 'ELDER',
    status: 'ACTIVE',
    churchId: 'church-1',
    departmentMemberships: [],
  };

  const gestor: UserContext = {
    id: 'gestor-1',
    globalRole: 'USER',
    status: 'ACTIVE',
    churchId: 'church-1',
    departmentMemberships: [{ departmentId: 'dept-1', role: 'MANAGER' }],
  };

  const voluntario: UserContext = {
    id: 'vol-1',
    globalRole: 'USER',
    status: 'ACTIVE',
    churchId: 'church-1',
    departmentMemberships: [{ departmentId: 'dept-1', role: 'MEMBER' }],
  };

  it('impede que qualquer usuário altere o próprio papel global', () => {
    // Pastor não pode mudar seu próprio papel
    expect(can(pastor, 'profile:update:other', { targetUserId: pastor.id, newRole: 'ADMIN_MASTER' })).toBe(false);
    expect(can(pastor, 'profile:update:other', { targetUserId: pastor.id, newRole: 'USER' })).toBe(false);

    // Ancião não pode mudar seu próprio papel
    expect(can(anciao, 'profile:update:other', { targetUserId: anciao.id, newRole: 'PASTOR' })).toBe(false);
    expect(can(anciao, 'profile:update:other', { targetUserId: anciao.id, newRole: 'USER' })).toBe(false);

    // Gestor e Voluntário não podem mudar o próprio papel
    expect(can(gestor, 'profile:update:other', { targetUserId: gestor.id, newRole: 'ELDER' })).toBe(false);
    expect(can(voluntario, 'profile:update:other', { targetUserId: voluntario.id, newRole: 'ELDER' })).toBe(false);
  });

  it('valida permissão de listagem geral de membros (member:list)', () => {
    // Admin, Pastor e Ancião podem listar membros de sua congregação
    expect(can(pastor, 'member:list', { churchId: 'church-1' })).toBe(true);
    expect(can(anciao, 'member:list', { churchId: 'church-1' })).toBe(true);

    // Gestor de departamento pode listar membros para sua gestão
    expect(can(gestor, 'member:list')).toBe(true);
    expect(can(gestor, 'member:list', { departmentId: 'dept-1' })).toBe(true);
    expect(can(gestor, 'member:list', { departmentId: 'dept-2' })).toBe(false);

    // Voluntário comum NÃO tem permissão de listagem cadastral de voluntários
    expect(can(voluntario, 'member:list')).toBe(false);
  });
});

describe('Construtores de Consulta Scoped (Prisma Anti-IDOR Filters)', () => {
  const gestorA: UserContext = {
    id: 'usr-gestor-a',
    globalRole: 'USER',
    status: 'ACTIVE',
    churchId: 'igreja-1',
    departmentMemberships: [{ departmentId: 'dept-a', role: 'MANAGER' }],
  };

  const membroComum: UserContext = {
    id: 'usr-membro',
    globalRole: 'USER',
    status: 'ACTIVE',
    churchId: 'igreja-1',
    departmentMemberships: [{ departmentId: 'dept-a', role: 'MEMBER' }],
  };

  const inativo: UserContext = {
    id: 'usr-inativo',
    globalRole: 'USER',
    status: 'INACTIVE',
    churchId: 'igreja-1',
    departmentMemberships: [{ departmentId: 'dept-a', role: 'MEMBER' }],
  };

  it('buildDepartmentScopeWhere restringe consultas de gestão aos departamentos sob gerência', () => {
    const whereGestor = buildDepartmentScopeWhere(gestorA, 'department:update');
    expect(whereGestor).toEqual({
      id: { in: ['dept-a'] },
      churchId: 'igreja-1',
    });

    const whereMembro = buildDepartmentScopeWhere(membroComum, 'department:update');
    expect(whereMembro).toEqual({ id: '__DENIED_EMPTY__' });

    const whereInativo = buildDepartmentScopeWhere(inativo, 'department:update');
    expect(whereInativo).toEqual({ id: '__DENIED_EMPTY__' });
  });

  it('buildAssignmentScopeWhere restringe remoção e criação de escalas ao escopo departamental', () => {
    const whereGestor = buildAssignmentScopeWhere(gestorA, 'assignment:delete');
    expect(whereGestor).toEqual({
      slot: {
        departmentId: { in: ['dept-a'] },
      },
    });

    const whereMembro = buildAssignmentScopeWhere(membroComum, 'assignment:delete');
    expect(whereMembro).toEqual({ id: '__DENIED_EMPTY__' });

    // Ações próprias são restritas ao próprio userId
    const wherePropria = buildAssignmentScopeWhere(membroComum, 'assignment:confirm:own');
    expect(wherePropria).toEqual({ userId: 'usr-membro' });
  });

  it('buildMemberScopeWhere restringe busca de membros aos departamentos gerenciados', () => {
    const whereGestor = buildMemberScopeWhere(gestorA, 'member:create');
    expect(whereGestor).toEqual({
      memberships: {
        some: {
          departmentId: { in: ['dept-a'] },
        },
      },
      churchId: 'igreja-1',
    });

    const whereMembro = buildMemberScopeWhere(membroComum, 'member:create');
    expect(whereMembro).toEqual({ id: '__DENIED_EMPTY__' });
  });
});

describe('Cobertura Exaustiva de Hierarquia, Escopo Multi-Departamento (departmentIds) e Ramificações RBAC', () => {
  const pastorComIgrejas: UserContext = {
    id: 'pastor-1',
    globalRole: 'PASTOR',
    status: 'ACTIVE',
    pastorChurchIds: ['c-1', 'c-2'],
    departmentMemberships: [],
  };

  const pastorSemLista: UserContext = {
    id: 'pastor-2',
    globalRole: 'PASTOR',
    status: 'ACTIVE',
    pastorChurchIds: [],
    departmentMemberships: [],
  };

  const elder: UserContext = {
    id: 'elder-1',
    globalRole: 'ELDER',
    status: 'ACTIVE',
    churchId: 'c-1',
    departmentMemberships: [],
  };

  const managerA: UserContext = {
    id: 'mgr-a',
    globalRole: 'USER',
    status: 'ACTIVE',
    churchId: 'c-1',
    departmentMemberships: [
      { departmentId: 'dept-a', role: 'MANAGER' },
      { departmentId: 'dept-b', role: 'MEMBER' },
    ],
  };

  const volunteer: UserContext = {
    id: 'vol-1',
    globalRole: 'USER',
    status: 'ACTIVE',
    churchId: 'c-1',
    departmentMemberships: [{ departmentId: 'dept-a', role: 'MEMBER' }],
  };

  it('valida níveis da hierarquia (ROLE_HIERARCHY_LEVEL) e canModifyResourceByHierarchy', () => {
    expect(ROLE_HIERARCHY_LEVEL.ADMIN_MASTER).toBe(4);
    expect(ROLE_HIERARCHY_LEVEL.PASTOR).toBe(3);
    expect(ROLE_HIERARCHY_LEVEL.ELDER).toBe(2);
    expect(ROLE_HIERARCHY_LEVEL.USER).toBe(1);

    expect(canModifyResourceByHierarchy('USER', null)).toBe(true);
    expect(canModifyResourceByHierarchy('USER', undefined)).toBe(true);
    expect(canModifyResourceByHierarchy('USER', 'USER')).toBe(true);
    expect(canModifyResourceByHierarchy('USER', 'ELDER')).toBe(false);
    expect(canModifyResourceByHierarchy('ELDER', 'ELDER')).toBe(true);
    expect(canModifyResourceByHierarchy('ELDER', 'PASTOR')).toBe(false);
    expect(canModifyResourceByHierarchy('PASTOR', 'PASTOR')).toBe(true);
    expect(canModifyResourceByHierarchy('PASTOR', 'ADMIN_MASTER')).toBe(false);
    expect(canModifyResourceByHierarchy('ADMIN_MASTER', 'ADMIN_MASTER')).toBe(true);
  });

  it('valida imutabilidade hierárquica em department:update, program:update e program:delete', () => {
    // PASTOR não pode alterar nem excluir o que foi criado por ADMIN_MASTER
    expect(can(pastorComIgrejas, 'department:update', { churchId: 'c-1', createdByRole: 'ADMIN_MASTER' })).toBe(false);
    expect(can(pastorComIgrejas, 'program:update', { churchId: 'c-1', createdByRole: 'ADMIN_MASTER' })).toBe(false);
    expect(can(pastorComIgrejas, 'program:delete', { churchId: 'c-1', createdByRole: 'ADMIN_MASTER' })).toBe(false);

    // PASTOR pode alterar o que foi criado por PASTOR ou ELDER
    expect(can(pastorComIgrejas, 'department:update', { churchId: 'c-1', createdByRole: 'PASTOR' })).toBe(true);
    expect(can(pastorComIgrejas, 'department:update', { churchId: 'c-1', createdByRole: 'ELDER' })).toBe(true);

    // GESTOR (USER) não pode alterar programa/departamento criado por ELDER
    expect(can(managerA, 'department:update', { departmentId: 'dept-a', createdByRole: 'ELDER' })).toBe(false);
    expect(can(managerA, 'program:update', { departmentId: 'dept-a', createdByRole: 'ELDER' })).toBe(false);
    expect(can(managerA, 'program:delete', { departmentId: 'dept-a', createdByRole: 'ELDER' })).toBe(false);

    // GESTOR (USER) pode alterar se criado por USER ou sem createdByRole
    expect(can(managerA, 'department:update', { departmentId: 'dept-a', createdByRole: 'USER' })).toBe(true);
    expect(can(managerA, 'program:delete', { departmentId: 'dept-a', createdByRole: 'USER' })).toBe(true);
  });

  it('valida escopo de PASTOR e promoção de outros usuários até PASTOR', () => {
    // Pastor com lista vazia não sofre bloqueio de escopo por lista
    expect(can(pastorSemLista, 'program:create', { churchId: 'qualquer' })).toBe(true);

    // Pastor pode promover outro usuário para ELDER ou PASTOR, mas não ADMIN_MASTER
    expect(can(pastorComIgrejas, 'profile:update:other', { targetUserId: 'outro', newRole: 'ELDER' })).toBe(true);
    expect(can(pastorComIgrejas, 'profile:update:other', { targetUserId: 'outro', newRole: 'PASTOR' })).toBe(true);
    expect(can(pastorComIgrejas, 'profile:update:other', { targetUserId: 'outro', newRole: 'ADMIN_MASTER' })).toBe(false);

    // Pastor atualizando o próprio perfil via profile:update:other mantendo papel PASTOR ou sem newRole é permitido
    expect(can(pastorComIgrejas, 'profile:update:other', { targetUserId: pastorComIgrejas.id, newRole: 'PASTOR' })).toBe(true);
    expect(can(pastorComIgrejas, 'profile:update:other', { targetUserId: pastorComIgrejas.id })).toBe(true);
  });

  it('valida todas as ações permitidas, próprias e bloqueadas para ELDER (Ancião)', () => {
    expect(can(elder, 'church:create')).toBe(false);
    expect(can(elder, 'church:settings:update')).toBe(false);
    expect(can(elder, 'church:switch')).toBe(false);
    expect(can(elder, 'church:elder:assign')).toBe(false);

    // Elder não pode promover ninguém a ELDER, PASTOR ou ADMIN_MASTER
    expect(can(elder, 'profile:update:other', { targetUserId: 'outro', newRole: 'ELDER' })).toBe(false);
    expect(can(elder, 'profile:update:other', { targetUserId: 'outro', newRole: 'PASTOR' })).toBe(false);
    expect(can(elder, 'profile:update:other', { targetUserId: 'outro', newRole: 'ADMIN_MASTER' })).toBe(false);

    // Elder pode atualizar outro usuário para USER ou sem newRole
    expect(can(elder, 'profile:update:other', { targetUserId: 'outro', newRole: 'USER' })).toBe(true);
    expect(can(elder, 'profile:update:other', { targetUserId: 'outro' })).toBe(true);

    // Ações de gestão local permitidas ao Elder
    const elderAllowed: Parameters<typeof can>[1][] = [
      'program:create',
      'program:view',
      'program:clone',
      'program:update',
      'program:delete',
      'registration:approve',
      'registration:reject',
      'department:create',
      'department:view',
      'department:update',
      'department:member:add',
      'department:member:update',
      'department:member:remove',
      'function:create',
      'function:update',
      'manager:assign',
      'member:create',
      'member:list',
      'profile:view:other',
      'assignment:create',
      'assignment:delete',
      'assignment:view:all',
      'assignment:view:department',
      'schedule:approve',
    ];
    for (const act of elderAllowed) {
      expect(can(elder, act, { churchId: 'c-1' })).toBe(true);
    }

    // Ações próprias do Elder: permitidas sem targetUserId ou com o próprio ID; negadas com ID de outro
    const ownActions: Parameters<typeof can>[1][] = [
      'profile:view:own',
      'profile:update:own',
      'profile:export:own',
      'availability:manage:own',
      'assignment:confirm:own',
      'assignment:decline:own',
      'assignment:view:own',
    ];
    for (const act of ownActions) {
      expect(can(elder, act)).toBe(true);
      expect(can(elder, act, { targetUserId: elder.id })).toBe(true);
      expect(can(elder, act, { targetUserId: 'outro-id' })).toBe(false);
    }
  });

  it('valida isManagerOf e isManagerOfAny (departmentIds) para GESTOR e VOLUNTÁRIO em todos os cases do switch', () => {
    const multiDeptActions: Parameters<typeof can>[1][] = [
      'profile:view:other',
      'profile:update:other',
      'registration:approve',
      'registration:reject',
      'program:create',
      'program:update',
      'program:delete',
      'program:clone',
      'assignment:create',
      'assignment:delete',
      'assignment:view:department',
      'schedule:approve',
    ];

    for (const act of multiDeptActions) {
      // Sem departmentId nem departmentIds -> false
      expect(can(managerA, act, {})).toBe(false);
      // Com departmentIds vazio -> false
      expect(can(managerA, act, { departmentIds: [] })).toBe(false);
      // Com departmentIds contendo apenas dept onde NÃO é gestor -> false
      expect(can(managerA, act, { departmentIds: ['dept-b', 'dept-c'] })).toBe(false);
      // Com departmentIds contendo dept-a (onde é gestor) -> true
      expect(can(managerA, act, { departmentIds: ['dept-b', 'dept-a'] })).toBe(true);
      // Com departmentId onde é gestor -> true
      expect(can(managerA, act, { departmentId: 'dept-a' })).toBe(true);
      // Com departmentId onde NÃO é gestor -> false
      expect(can(managerA, act, { departmentId: 'dept-b' })).toBe(false);
    }

    // profile:update:other para GESTOR com qualquer newRole (mesmo USER) deve ser bloqueado
    expect(can(managerA, 'profile:update:other', { departmentId: 'dept-a', newRole: 'USER' })).toBe(false);

    // Ações de departamento único sem departmentId -> false
    const singleDeptActions: Parameters<typeof can>[1][] = [
      'department:update',
      'department:member:add',
      'department:member:update',
      'department:member:remove',
      'member:create',
      'function:create',
      'function:update',
    ];
    for (const act of singleDeptActions) {
      expect(can(managerA, act, {})).toBe(false);
      expect(can(managerA, act, { departmentId: 'dept-a' })).toBe(true);
      expect(can(managerA, act, { departmentId: 'dept-b' })).toBe(false);
    }

    // Ações próprias sem targetUserId para USER -> true
    expect(can(volunteer, 'profile:view:own')).toBe(true);
    expect(can(volunteer, 'assignment:confirm:own')).toBe(true);

    // Sem objeto resource (resource = undefined) para todas as ações multi-dept e single-dept deve retornar false sem lançar erro
    for (const act of multiDeptActions) {
      expect(can(managerA, act)).toBe(false);
    }
    for (const act of singleDeptActions) {
      expect(can(managerA, act)).toBe(false);
    }

    // PASTOR e ELDER sem resource em member:import e member:export -> false
    expect(can(pastorComIgrejas, 'member:import')).toBe(false);
    expect(can(pastorComIgrejas, 'member:export')).toBe(false);
    expect(can(elder, 'member:import')).toBe(false);
    expect(can(elder, 'member:export')).toBe(false);
  });
});
