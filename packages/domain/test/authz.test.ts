import { describe, expect, it } from 'vitest';
import {
  can,
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
