import { describe, it, expect } from 'vitest';
import {
  validateProfileDates,
  exportMemberData,
  can,
  UserContext,
  sanitizeCsvCell,
  encryptSensitiveJson,
  decryptSensitiveJson,
  encryptEmergencyContact,
  decryptEmergencyContact,
  encryptOptionalString,
  decryptOptionalString,
} from '../src/index.js';

describe('Perfil do Membro e LGPD (Domain)', () => {
  describe('validateProfileDates', () => {
    const fixedNow = new Date('2026-09-30T12:00:00Z');

    it('aceita datas válidas no passado com entrada após nascimento', () => {
      const res = validateProfileDates('1990-05-15', '2015-10-20', fixedNow);
      expect(res.valid).toBe(true);
      expect(res.error).toBeUndefined();
    });

    it('aceita quando datas são nulas ou indefinidas', () => {
      expect(validateProfileDates(null, null, fixedNow).valid).toBe(true);
      expect(validateProfileDates(undefined, undefined, fixedNow).valid).toBe(true);
    });

    it('rejeita data de nascimento no futuro', () => {
      const res = validateProfileDates('2030-01-01', null, fixedNow);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('futuro');
    });

    it('rejeita data de entrada ou batismo no futuro', () => {
      const res = validateProfileDates('1995-01-01', '2028-06-01', fixedNow);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('futuro');
    });

    it('rejeita data de entrada anterior à data de nascimento', () => {
      const res = validateProfileDates('2000-01-01', '1995-01-01', fixedNow);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('anterior à data de nascimento');
    });
  });

  describe('exportMemberData (Portabilidade LGPD Art. 18)', () => {
    it('formata os dados do titular e NUNCA expõe segredos técnicos', () => {
      const mockUser = {
        id: 'user-123',
        name: 'Maria Silva',
        email: 'maria@exemplo.com.br',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$fakeHash',
        mfaSecretEnc: 'aes:enc:secret',
        photoUrl: 'https://exemplo.com/fotos/maria.jpg',
        birthDate: new Date('1988-03-20'),
        gender: 'FEMININO',
        maritalStatus: 'CASADO',
        phonePrimary: '+5511999998888',
        phoneSecondary: null,
        whatsapp: '+5511999998888',
        address: {
          street: 'Rua das Flores',
          number: '123',
          neighborhood: 'Centro',
          city: 'Goiânia',
          state: 'GO',
          postalCode: '74000-000',
        },
        emergencyContact: {
          name: 'João Silva',
          relationship: 'Esposo',
          phone: '+5511988887777',
        },
        joinedAt: new Date('2018-05-10'),
        preferredChannel: 'WHATSAPP',
        notes: 'Sem restrições',
        status: 'ACTIVE',
        createdAt: new Date('2024-01-01T10:00:00Z'),
        optOutWhatsapp: false,
        optOutEmail: false,
        optOutPush: false,
        optOutSms: true,
        termsAcceptedAt: new Date('2024-01-01T10:05:00Z'),
        termsVersion: '1.0',
        memberships: [
          {
            role: 'MEMBER',
            department: { name: 'Música' },
            functions: [{ function: { name: 'Vocal' } }],
          },
        ],
        assignments: [
          {
            id: 'asg-1',
            status: 'CONFIRMED',
            createdAt: new Date('2026-09-01'),
            slot: {
              title: 'Louvor Principal',
              startsAt: new Date('2026-09-10T19:00:00Z'),
              endsAt: new Date('2026-09-10T21:00:00Z'),
              program: { title: 'Culto de Celebração', date: new Date('2026-09-10') },
              department: { name: 'Música' },
            },
          },
        ],
        availabilities: [
          {
            kind: 'PREFERRED_WEEKDAY',
            weekday: 0,
            from: null,
            to: null,
          },
        ],
      };

      const exported = exportMemberData(mockUser as any);

      // Verificação de conformidade LGPD
      expect(exported.cabecalho.direitosDoTitular).toContain('Lei nº 13.709/2018');
      expect(exported.dadosPessoais.nomeCompleto).toBe('Maria Silva');
      expect(exported.dadosPessoais.email).toBe('maria@exemplo.com.br');
      expect(exported.dadosPessoais.dataNascimento).toBe('1988-03-20');
      expect(exported.contato.telefonePrincipal).toBe('+5511999998888');
      expect(exported.preferenciasPrivacidade.optOut.sms).toBe(true);
      expect(exported.departamentosEFuncoes[0].departamento).toBe('Música');
      expect(exported.departamentosEFuncoes[0].funcoes).toContain('Vocal');
      expect(exported.historicoEscalas[0].programa).toBe('Culto de Celebração');

      // Garantia absoluta de que segredos nunca constam no JSON exportado
      const jsonString = JSON.stringify(exported);
      expect(jsonString).not.toContain('passwordHash');
      expect(jsonString).not.toContain('fakeHash');
      expect(jsonString).not.toContain('mfaSecretEnc');
      expect(jsonString).not.toContain('aes:enc');
    });
  });

  describe('Autorização de Perfil (can())', () => {
    const activeMember: UserContext = {
      id: 'usr-1',
      globalRole: 'USER',
      status: 'ACTIVE',
      departmentMemberships: [{ departmentId: 'dept-1', role: 'MEMBER' }],
    };

    const pendingMember: UserContext = {
      id: 'usr-2',
      globalRole: 'USER',
      status: 'PENDING',
      departmentMemberships: [],
    };

    it('permite que o membro veja, atualize e exporte seu próprio perfil', () => {
      expect(can(activeMember, 'profile:view:own', { targetUserId: 'usr-1' })).toBe(true);
      expect(can(activeMember, 'profile:update:own', { targetUserId: 'usr-1' })).toBe(true);
      expect(can(activeMember, 'profile:export:own', { targetUserId: 'usr-1' })).toBe(true);
    });

    it('proíbe membro de ver ou alterar perfil de terceiro diretamente', () => {
      expect(can(activeMember, 'profile:view:other', { targetUserId: 'usr-other', departmentId: 'dept-1' })).toBe(false);
      expect(can(activeMember, 'profile:update:other', { targetUserId: 'usr-other', departmentId: 'dept-1' })).toBe(false);
    });

    it('proíbe membro pendente de qualquer ação no perfil', () => {
      expect(can(pendingMember, 'profile:view:own', { targetUserId: 'usr-2' })).toBe(false);
      expect(can(pendingMember, 'profile:update:own', { targetUserId: 'usr-2' })).toBe(false);
      expect(can(pendingMember, 'profile:export:own', { targetUserId: 'usr-2' })).toBe(false);
    });
  });

  describe('sanitizeCsvCell (Proteção contra injeção de fórmulas CSV)', () => {
    it('escapa células que iniciam com =, +, -, @', () => {
      expect(sanitizeCsvCell('=1+1')).toBe("'=1+1");
      expect(sanitizeCsvCell('+cmd')).toBe("'+cmd");
      expect(sanitizeCsvCell('-5')).toBe("'-5");
      expect(sanitizeCsvCell('@SUM(A1:A10)')).toBe("'@SUM(A1:A10)");
    });

    it('mantém textos e números comuns inalterados', () => {
      expect(sanitizeCsvCell('João Silva')).toBe('João Silva');
      expect(sanitizeCsvCell('12345')).toBe('12345');
      expect(sanitizeCsvCell('joao@exemplo.com')).toBe('joao@exemplo.com');
    });

    it('trata nulos e indefinidos de forma segura', () => {
      expect(sanitizeCsvCell(null)).toBe('');
      expect(sanitizeCsvCell(undefined)).toBe('');
    });
  });

  describe('Validação de Schemas Zod de Membros e Importação', () => {
    it('valida linha de membro importada com sucesso', async () => {
      const { importMemberRowSchema } = await import('@revezo/contracts');
      const valid = importMemberRowSchema.safeParse({
        name: 'Pedro Alvares',
        email: 'pedro@igreja.com',
        phonePrimary: '+5511999998888',
        departmentName: 'Louvor',
        functionName: 'Guitarra',
        isMinor: false,
      });
      expect(valid.success).toBe(true);
    });

    it('rejeita linha de importação com e-mail inválido ou nome curto', async () => {
      const { importMemberRowSchema } = await import('@revezo/contracts');
      const invalidEmail = importMemberRowSchema.safeParse({
        name: 'Carlos',
        email: 'email-invalido',
      });
      expect(invalidEmail.success).toBe(false);

      const invalidName = importMemberRowSchema.safeParse({
        name: 'Jo',
        email: 'jo@igreja.com',
      });
      expect(invalidName.success).toBe(false);
    });

    it('valida cadastro direto de membro com campos de menor de idade', async () => {
      const { adminCreateMemberSchema } = await import('@revezo/contracts');
      const minorUser = adminCreateMemberSchema.safeParse({
        name: 'Lucas Menor',
        email: 'lucas@igreja.com',
        isMinor: true,
        guardianName: 'Marcos Pai',
        guardianPhone: '+5511988887777',
      });
      expect(minorUser.success).toBe(true);
      if (minorUser.success) {
        expect(minorUser.data.isMinor).toBe(true);
        expect(minorUser.data.guardianName).toBe('Marcos Pai');
      }
    });

    it('valida adminUpdateMemberSchema com campos cadastrais, cargo e atualizações departamentais', async () => {
      const { adminUpdateMemberSchema } = await import('@revezo/contracts');
      const valid = adminUpdateMemberSchema.safeParse({
        userId: 'user-456',
        name: 'Carlos Oliveira',
        email: 'carlos@igreja.com',
        phonePrimary: '+5511999990000',
        whatsapp: '+5511999990000',
        status: 'ACTIVE',
        globalRole: 'ELDER',
        isMinor: false,
        birthDate: '1985-06-15',
        notes: 'Disponível aos sábados à noite',
        departmentUpdates: [
          {
            departmentId: 'dept-midia',
            action: 'REMOVE',
          },
          {
            departmentId: 'dept-louvor',
            action: 'ADD',
            role: 'MEMBER',
            functionIds: ['func-violao'],
          },
        ],
      });

      expect(valid.success).toBe(true);
      if (valid.success) {
        expect(valid.data.userId).toBe('user-456');
        expect(valid.data.globalRole).toBe('ELDER');
        expect(valid.data.departmentUpdates?.length).toBe(2);
      }
    });

    it('rejeita adminUpdateMemberSchema sem userId ou com data de nascimento inválida', async () => {
      const { adminUpdateMemberSchema } = await import('@revezo/contracts');
      const noUserId = adminUpdateMemberSchema.safeParse({
        name: 'Carlos',
      });
      expect(noUserId.success).toBe(false);

      const invalidDate = adminUpdateMemberSchema.safeParse({
        userId: 'user-1',
        birthDate: '15/06/1985', // Formato não ISO AAAA-MM-DD
      });
      expect(invalidDate.success).toBe(false);
    });

    it('valida unlinkDepartmentMemberSchema', async () => {
      const { unlinkDepartmentMemberSchema } = await import('@revezo/contracts');
      const valid = unlinkDepartmentMemberSchema.safeParse({
        userId: 'user-123',
        departmentId: 'dept-123',
      });
      expect(valid.success).toBe(true);

      const invalid = unlinkDepartmentMemberSchema.safeParse({
        userId: '',
        departmentId: 'dept-123',
      });
      expect(invalid.success).toBe(false);
    });

    it('exige guardianName e guardianPhone em formato E.164 no registerSchema quando isMinor é true (LGPD Art. 14)', async () => {
      const { registerSchema } = await import('@revezo/contracts');
      const missingGuardian = registerSchema.safeParse({
        name: 'Jovem Voluntário',
        email: 'jovem@igreja.com',
        password: 'SenhaForte123!',
        phonePrimary: '+5562999990000',
        isMinor: true,
        termsAccepted: true,
      });
      expect(missingGuardian.success).toBe(false);

      const withValidGuardian = registerSchema.safeParse({
        name: 'Jovem Voluntário',
        email: 'jovem@igreja.com',
        password: 'SenhaForte123!',
        phonePrimary: '+5562999990000',
        isMinor: true,
        guardianName: 'Maria Responsável',
        guardianPhone: '+5562988887777',
        termsAccepted: true,
      });
      expect(withValidGuardian.success).toBe(true);
    });
  });

  describe('Criptografia de Campos Sensíveis em Repouso (LGPD Art. 46)', () => {
    const testKey = 'chave-teste-criptografia-lgpd-32bytes!';

    it('criptografa e descriptografa endereço JSON sem vazar texto puro', () => {
      const rawAddress = {
        street: 'Av. Goiás',
        number: '500',
        neighborhood: 'Setor Central',
        city: 'Goiânia',
        state: 'GO',
        postalCode: '74000-000',
      };

      const encrypted = encryptSensitiveJson(rawAddress, testKey);
      expect(encrypted).toHaveProperty('encryptedPayload');
      expect(JSON.stringify(encrypted)).not.toContain('Av. Goiás');

      const decrypted = decryptSensitiveJson<typeof rawAddress>(encrypted, testKey);
      expect(decrypted).toEqual(rawAddress);
    });

    it('criptografa e descriptografa contato de emergência e observações, e exportMemberData descriptografa com chave', () => {
      const rawEmergency = {
        name: 'Ana Souza',
        relationship: 'Mãe',
        phone: '+5562999991111',
      };
      const encEmergency = encryptEmergencyContact(rawEmergency, testKey);
      expect(JSON.stringify(encEmergency)).not.toContain('+5562999991111');
      expect(decryptEmergencyContact(encEmergency, testKey)).toEqual(rawEmergency);

      const encNotes = encryptOptionalString('Restrição alimentar leve', testKey);
      expect(encNotes).not.toContain('Restrição');
      expect(decryptOptionalString(encNotes, testKey)).toBe('Restrição alimentar leve');

      const exported = exportMemberData(
        {
          id: 'u-enc',
          name: 'Pedro Criptografado',
          email: 'pedro@exemplo.com',
          birthDate: null,
          gender: null,
          maritalStatus: null,
          photoUrl: null,
          phonePrimary: '+5562900001111',
          phoneSecondary: null,
          whatsapp: null,
          address: encryptSensitiveJson({ street: 'Rua Secreta' }, testKey),
          emergencyContact: encEmergency,
          joinedAt: null,
          preferredChannel: 'EMAIL',
          notes: encNotes,
          status: 'ACTIVE',
          createdAt: new Date('2026-01-01T00:00:00Z'),
          optOutWhatsapp: false,
          optOutEmail: false,
          optOutPush: false,
          optOutSms: false,
          termsAcceptedAt: new Date('2026-01-01T00:00:00Z'),
          termsVersion: 'v1.0',
          memberships: [],
          assignments: [],
          availabilities: [],
        },
        testKey
      );

      expect(exported.endereco).toEqual({ street: 'Rua Secreta' });
      expect(exported.contatoEmergencia).toEqual(rawEmergency);
      expect(exported.dadosPessoais.observacoes).toBe('Restrição alimentar leve');
    });
  });
});

