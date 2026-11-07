import { describe, expect, it } from 'vitest';
import {
  createChurchSchema,
  assignElderSchema,
  switchActiveChurchSchema,
  updateChurchSettingsSchema,
  createProgramSchema,
  createDepartmentSchema,
  registerSchema,
} from '@revezo/contracts';

describe('Fase 2: Contratos Zod de Igrejas, Atribuições e Hierarquia', () => {
  describe('createChurchSchema', () => {
    it('valida dados corretos de criação de congregação', () => {
      const valid = {
        name: 'Igreja Central de Goiânia',
        slug: 'igreja-central-goiania',
        primaryColor: '#0F4C5C',
        secondaryColor: '#F2B632',
        phone: '+5562988887777',
      };

      const result = createChurchSchema.safeParse(valid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Igreja Central de Goiânia');
        expect(result.data.slug).toBe('igreja-central-goiania');
      }
    });

    it('rejeita nome de igreja muito curto (< 3 caracteres)', () => {
      const invalid = {
        name: 'Ib',
        slug: 'ib-go',
      };

      const result = createChurchSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('mínimo 3 caracteres');
      }
    });

    it('rejeita slug com letras maiúsculas, espaços ou caracteres especiais', () => {
      expect(createChurchSchema.safeParse({ name: 'Igreja', slug: 'Igreja Central' }).success).toBe(false);
      expect(createChurchSchema.safeParse({ name: 'Igreja', slug: 'igreja_central' }).success).toBe(false);
      expect(createChurchSchema.safeParse({ name: 'Igreja', slug: 'igreja@central' }).success).toBe(false);
      expect(createChurchSchema.safeParse({ name: 'Igreja', slug: 'igreja-esperança' }).success).toBe(false);
    });

    it('rejeita cores hexadecimais fora do padrão #RRGGBB', () => {
      expect(
        createChurchSchema.safeParse({
          name: 'Igreja Nova',
          slug: 'igreja-nova',
          primaryColor: 'azul',
        }).success
      ).toBe(false);

      expect(
        createChurchSchema.safeParse({
          name: 'Igreja Nova',
          slug: 'igreja-nova',
          primaryColor: '#FFF', // curto não permitido
        }).success
      ).toBe(false);

      expect(
        createChurchSchema.safeParse({
          name: 'Igreja Nova',
          slug: 'igreja-nova',
          primaryColor: '#1234567', // 7 dígitos
        }).success
      ).toBe(false);
    });

    it('aceita endereço estruturado e lista de pastores na criação', () => {
      const validWithAddress = {
        name: 'Igreja Nova Esperança',
        slug: 'igreja-nova-esperanca',
        primaryColor: '#123456',
        secondaryColor: '#654321',
        phone: '+5562999990000',
        address: {
          logradouro: 'Avenida Brasil',
          numero: '500',
          complemento: 'Sala 2',
          bairro: 'Setor Sul',
          cidade: 'Goiânia',
          uf: 'GO',
          cep: '74000-000',
        },
        pastorIds: ['pastor-1', 'pastor-2'],
      };

      const result = createChurchSchema.safeParse(validWithAddress);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.address?.uf).toBe('GO');
        expect(result.data.pastorIds).toHaveLength(2);
      }
    });

    it('rejeita endereço com UF inválida ou campos vazios', () => {
      const invalidAddress = {
        name: 'Igreja Nova Esperança',
        slug: 'igreja-nova-esperanca',
        address: {
          logradouro: 'Rua 1',
          numero: '10',
          bairro: 'Centro',
          cidade: 'Goiânia',
          uf: 'GOIAS', // deve ter 2 caracteres
        },
      };

      const result = createChurchSchema.safeParse(invalidAddress);
      expect(result.success).toBe(false);
    });
  });

  describe('assignElderSchema', () => {
    it('valida dados corretos para vincular Ancião', () => {
      const valid = {
        userId: 'user-voluntario-1',
        churchId: 'church-sede-123',
      };

      const result = assignElderSchema.safeParse(valid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.userId).toBe('user-voluntario-1');
        expect(result.data.churchId).toBe('church-sede-123');
      }
    });

    it('rejeita campos vazios ou ausentes', () => {
      expect(assignElderSchema.safeParse({ userId: '', churchId: 'c1' }).success).toBe(false);
      expect(assignElderSchema.safeParse({ userId: 'u1', churchId: '' }).success).toBe(false);
      expect(assignElderSchema.safeParse({}).success).toBe(false);
    });
  });

  describe('switchActiveChurchSchema', () => {
    it('valida ID da congregação alvo para alternância', () => {
      const result = switchActiveChurchSchema.safeParse({ churchId: 'igreja-bairronovo' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.churchId).toBe('igreja-bairronovo');
      }
    });

    it('rejeita ID vazio', () => {
      expect(switchActiveChurchSchema.safeParse({ churchId: '' }).success).toBe(false);
      expect(switchActiveChurchSchema.safeParse({}).success).toBe(false);
    });
  });

  describe('updateChurchSettingsSchema', () => {
    it('valida atualização de nome e identidade visual', () => {
      const valid = {
        name: 'Comunidade da Fé',
        primaryColor: '#112233',
        secondaryColor: '#445566',
        logoUrl: 'https://exemplo.com/logo.png',
      };

      const result = updateChurchSettingsSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('rejeita cores inválidas na atualização', () => {
      const invalid = {
        name: 'Comunidade da Fé',
        primaryColor: '#ZZZZZZ',
        secondaryColor: '#445566',
      };

      const result = updateChurchSettingsSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('Extensões de Schemas com churchId', () => {
    it('createProgramSchema aceita churchId opcional', () => {
      const validProgram = {
        title: 'Culto da Família',
        churchId: 'igreja-central-id',
        date: new Date('2026-10-18T19:00:00Z').toISOString(),
        departmentIds: ['dept-1'],
        slots: [],
      };

      const result = createProgramSchema.safeParse(validProgram);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.churchId).toBe('igreja-central-id');
      }
    });

    it('createDepartmentSchema aceita churchId opcional', () => {
      const validDept = {
        name: 'Sonoplastia',
        churchId: 'igreja-central-id',
      };

      const result = createDepartmentSchema.safeParse(validDept);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.churchId).toBe('igreja-central-id');
      }
    });

    it('registerSchema aceita churchId opcional da congregação escolhida', () => {
      const validReg = {
        name: 'João Pedro da Silva',
        email: 'joao.pedro@example.com',
        password: 'SenhaForte@2026!',
        phonePrimary: '+5562987654321',
        churchId: 'igreja-central-id',
        termsAccepted: true,
      };

      const result = registerSchema.safeParse(validReg);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.churchId).toBe('igreja-central-id');
      }
    });
  });
});
