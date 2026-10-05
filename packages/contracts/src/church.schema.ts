import { z } from 'zod';

export const hexColorRegex = /^#([0-9A-Fa-f]{6})$/;

export const churchAddressSchema = z.object({
  logradouro: z.string().trim().min(1, 'Logradouro é obrigatório').max(150),
  numero: z.string().trim().min(1, 'Número é obrigatório').max(20),
  complemento: z.string().trim().max(100).optional().nullable(),
  bairro: z.string().trim().min(1, 'Bairro é obrigatório').max(100),
  cidade: z.string().trim().min(1, 'Cidade é obrigatória').max(100),
  uf: z.string().trim().length(2, 'UF deve ter 2 letras').toUpperCase(),
  cep: z.string().trim().regex(/^\d{5}-?\d{3}$/, 'CEP deve ter 8 dígitos (ex: 74000-000)').optional().nullable(),
});

export type ChurchAddress = z.infer<typeof churchAddressSchema>;

export const safeImageUrlSchema = z
  .string()
  .trim()
  .url('URL da imagem inválida')
  .max(500, 'URL muito longa')
  .refine(
    (url) => !url.toLowerCase().endsWith('.svg') && !url.toLowerCase().includes('.svg?'),
    'Imagens no formato SVG são proibidas por motivos de segurança (Regra 12)'
  );

export const updateChurchSettingsSchema = z.object({
  churchId: z.string().optional(),
  name: z.string().trim().min(3, 'Nome da igreja deve ter no mínimo 3 caracteres').max(100),
  logoUrl: safeImageUrlSchema.optional().nullable().or(z.literal('')),
  primaryColor: z.string().regex(hexColorRegex, 'Cor primária deve estar no formato #RRGGBB'),
  secondaryColor: z.string().regex(hexColorRegex, 'Cor secundária deve estar no formato #RRGGBB'),
  phone: z.string().trim().optional().nullable(),
  address: churchAddressSchema.optional().nullable(),
});

export type UpdateChurchSettingsInput = z.infer<typeof updateChurchSettingsSchema>;

export const createChurchSchema = z.object({
  name: z.string().trim().min(3, 'Nome da igreja deve ter no mínimo 3 caracteres').max(100),
  slug: z.string().trim().min(3).max(50).regex(/^[a-z0-9-]+$/, 'Slug deve conter apenas letras minúsculas, números e hífens'),
  logoUrl: safeImageUrlSchema.optional().nullable().or(z.literal('')),
  primaryColor: z.string().regex(hexColorRegex, 'Cor primária deve estar no formato #RRGGBB').default('#1E40AF'),
  secondaryColor: z.string().regex(hexColorRegex, 'Cor secundária deve estar no formato #RRGGBB').default('#F59E0B'),
  phone: z.string().trim().optional().nullable(),
  address: churchAddressSchema.optional().nullable(),
  pastorIds: z.array(z.string().min(1)).optional(),
});

export type CreateChurchInput = z.infer<typeof createChurchSchema>;

export const updateChurchSchema = z.object({
  churchId: z.string().min(1, 'ID da igreja é obrigatório'),
  name: z.string().trim().min(3, 'Nome da igreja deve ter no mínimo 3 caracteres').max(100).optional(),
  slug: z.string().trim().min(3).max(50).regex(/^[a-z0-9-]+$/, 'Slug deve conter apenas letras minúsculas, números e hífens').optional(),
  logoUrl: safeImageUrlSchema.optional().nullable().or(z.literal('')),
  primaryColor: z.string().regex(hexColorRegex, 'Cor primária deve estar no formato #RRGGBB').optional(),
  secondaryColor: z.string().regex(hexColorRegex, 'Cor secundária deve estar no formato #RRGGBB').optional(),
  phone: z.string().trim().optional().nullable(),
  address: churchAddressSchema.optional().nullable(),
  pastorIds: z.array(z.string().min(1)).optional(),
  active: z.boolean().optional(),
});

export type UpdateChurchInput = z.infer<typeof updateChurchSchema>;

export const assignElderSchema = z.object({
  userId: z.string().min(1, 'ID do usuário é obrigatório'),
  churchId: z.string().min(1, 'ID da igreja é obrigatório'),
});

export type AssignElderInput = z.infer<typeof assignElderSchema>;

export const switchActiveChurchSchema = z.object({
  churchId: z.string().min(1, 'ID da igreja é obrigatório'),
});

export type SwitchActiveChurchInput = z.infer<typeof switchActiveChurchSchema>;
