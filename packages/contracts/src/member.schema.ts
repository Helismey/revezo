import { z } from 'zod';
import { addressSchema, emergencyContactSchema, phoneRegex } from './auth.schema.js';
import { safeImageUrlSchema } from './church.schema.js';

export const updateMemberSchema = z.object({
  name: z.string().trim().min(3, 'Nome deve ter no mínimo 3 caracteres').max(100, 'Nome muito longo').optional(),
  photoUrl: safeImageUrlSchema.optional().nullable().or(z.literal('')),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data de nascimento deve estar no formato AAAA-MM-DD').optional().nullable().or(z.literal('')),
  gender: z.enum(['MASCULINO', 'FEMININO', 'OUTRO']).optional().nullable(),
  maritalStatus: z.enum(['SOLTEIRO', 'CASADO', 'DIVORCIADO', 'VIUVO', 'OUTRO']).optional().nullable(),
  phonePrimary: z.string().trim().regex(phoneRegex, 'Telefone principal deve estar no padrão internacional (+55...)').optional(),
  phoneSecondary: z.string().trim().regex(phoneRegex, 'Telefone secundário inválido').optional().nullable().or(z.literal('')),
  whatsapp: z.string().trim().regex(phoneRegex, 'WhatsApp deve estar no padrão internacional (+55...)').optional().nullable().or(z.literal('')),
  address: addressSchema.optional().nullable(),
  emergencyContact: emergencyContactSchema.optional().nullable(),
  joinedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data de entrada ou batismo inválida').optional().nullable().or(z.literal('')),
  preferredChannel: z.enum(['WHATSAPP', 'EMAIL', 'PUSH', 'SMS']).optional(),
  notes: z.string().max(500, 'Observações não podem ultrapassar 500 caracteres').optional().nullable(),
  optOutWhatsapp: z.boolean().optional(),
  optOutEmail: z.boolean().optional(),
  optOutPush: z.boolean().optional(),
  optOutSms: z.boolean().optional(),
});

export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;

export const approveMemberSchema = z.object({
  userId: z.string().min(1, 'ID do usuário obrigatório'),
  departmentId: z.string().min(1, 'Departamento obrigatório'),
  functionIds: z.array(z.string()).default([]),
});

export type ApproveMemberInput = z.infer<typeof approveMemberSchema>;

export const rejectMemberSchema = z.object({
  userId: z.string().min(1, 'ID do usuário obrigatório'),
  reason: z.string().max(200).optional(),
});

export type RejectMemberInput = z.infer<typeof rejectMemberSchema>;

export const eraseUserDataSchema = z.object({
  password: z.string().min(1, 'A senha é obrigatória para confirmar a exclusão'),
  reason: z.string().max(200).optional(),
});

export type EraseUserDataInput = z.infer<typeof eraseUserDataSchema>;

// Validação de cada linha da planilha importada (CSV / Excel)
export const importMemberRowSchema = z.object({
  name: z.string().trim().min(3, 'Nome deve ter pelo menos 3 caracteres').max(100, 'Nome muito longo'),
  email: z.string().trim().email('E-mail inválido'),
  phonePrimary: z.string().trim().optional().nullable(),
  whatsapp: z.string().trim().optional().nullable(),
  departmentName: z.string().trim().optional().nullable(),
  functionName: z.string().trim().optional().nullable(),
  isMinor: z.boolean().default(false),
  guardianName: z.string().trim().optional().nullable(),
  guardianPhone: z.string().trim().optional().nullable(),
});

export type ImportMemberRowInput = z.infer<typeof importMemberRowSchema>;

// Confirmação de importação em lote
export const confirmImportMembersSchema = z.object({
  rows: z.array(importMemberRowSchema).min(1, 'Pelo menos uma linha deve ser importada'),
  defaultStatus: z.enum(['ACTIVE', 'PENDING']).default('ACTIVE'),
  updateExisting: z.boolean().default(false),
});

export type ConfirmImportMembersInput = z.infer<typeof confirmImportMembersSchema>;

// Cadastro direto de membro por Admin ou Gestor
export const adminCreateMemberSchema = z.object({
  name: z.string().trim().min(3, 'Nome deve ter no mínimo 3 caracteres').max(100, 'Nome muito longo'),
  email: z.string().trim().email('E-mail inválido'),
  phonePrimary: z.string().trim().optional().nullable(),
  whatsapp: z.string().trim().optional().nullable(),
  departmentId: z.string().optional().nullable(),
  functionIds: z.array(z.string()).default([]),
  churchId: z.string().optional(),
  status: z.enum(['ACTIVE', 'PENDING']).default('ACTIVE'),
  isMinor: z.boolean().default(false),
  guardianName: z.string().trim().optional().nullable(),
  guardianPhone: z.string().trim().optional().nullable(),
});

export type AdminCreateMemberInput = z.infer<typeof adminCreateMemberSchema>;

export const departmentMembershipUpdateSchema = z.object({
  departmentId: z.string().min(1, 'ID do departamento obrigatório'),
  action: z.enum(['ADD', 'REMOVE', 'UPDATE']),
  role: z.enum(['MANAGER', 'MEMBER']).optional(),
  functionIds: z.array(z.string()).optional(),
});

export type DepartmentMembershipUpdateInput = z.infer<typeof departmentMembershipUpdateSchema>;

export const adminUpdateMemberSchema = z.object({
  userId: z.string().min(1, 'ID do usuário é obrigatório'),
  name: z.string().trim().min(3, 'Nome deve ter no mínimo 3 caracteres').max(100, 'Nome muito longo').optional(),
  email: z.string().trim().email('E-mail inválido').optional(),
  phonePrimary: z.string().trim().optional().nullable().or(z.literal('')),
  whatsapp: z.string().trim().optional().nullable().or(z.literal('')),
  status: z.enum(['ACTIVE', 'PENDING', 'INACTIVE']).optional(),
  globalRole: z.enum(['USER', 'ELDER', 'PASTOR', 'ADMIN_MASTER']).optional(),
  isMinor: z.boolean().optional(),
  guardianName: z.string().trim().optional().nullable().or(z.literal('')),
  guardianPhone: z.string().trim().optional().nullable().or(z.literal('')),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data de nascimento inválida (AAAA-MM-DD)').optional().nullable().or(z.literal('')),
  notes: z.string().max(500, 'Observações não podem ultrapassar 500 caracteres').optional().nullable(),
  departmentUpdates: z.array(departmentMembershipUpdateSchema).optional(),
});

export type AdminUpdateMemberInput = z.infer<typeof adminUpdateMemberSchema>;

export const unlinkDepartmentMemberSchema = z.object({
  userId: z.string().min(1, 'ID do usuário é obrigatório'),
  departmentId: z.string().min(1, 'ID do departamento é obrigatório'),
});

export type UnlinkDepartmentMemberInput = z.infer<typeof unlinkDepartmentMemberSchema>;


