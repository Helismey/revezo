import { z } from 'zod';

export const phoneRegex = /^\+[1-9]\d{7,14}$/; // Padrão E.164 internacional

export const loginSchema = z.object({
  email: z.string().trim().email('E-mail inválido'),
  password: z.string().min(12, 'A senha deve ter no mínimo 12 caracteres').max(128, 'Senha muito longa'),
  totpCode: z
    .preprocess(
      (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
      z.string().regex(/^(\d{6}|[A-Za-z0-9]{10})$/, 'Código de 6 dígitos ou código de recuperação de 10 caracteres').optional()
    ),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const mfaEnableSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, 'O código deve ter exatamente 6 dígitos'),
  secret: z.string().trim().min(16, 'Segredo inválido'),
  recoveryCodeHashes: z.array(z.string().length(64)).length(8, 'Devem ser 8 hashes de códigos de recuperação'),
});

export type MfaEnableInput = z.infer<typeof mfaEnableSchema>;

export const mfaDisableSchema = z.object({
  password: z.string().min(1, 'Digite sua senha para confirmar a desativação'),
});

export type MfaDisableInput = z.infer<typeof mfaDisableSchema>;

export const addressSchema = z.object({
  street: z.string().trim().min(1, 'Rua obrigatória').max(120),
  number: z.string().trim().min(1, 'Número obrigatório').max(20),
  complement: z.string().trim().max(60).optional(),
  neighborhood: z.string().trim().min(1, 'Bairro obrigatório').max(60),
  city: z.string().trim().min(1, 'Cidade obrigatória').max(60),
  state: z.string().trim().length(2, 'UF deve ter 2 letras').toUpperCase(),
  postalCode: z.string().trim().regex(/^\d{5}-?\d{3}$/, 'CEP inválido'),
});

export const emergencyContactSchema = z.object({
  name: z.string().trim().min(2, 'Nome do contato obrigatório').max(80),
  relationship: z.string().trim().min(2, 'Grau de parentesco obrigatório').max(40),
  phone: z.string().trim().regex(phoneRegex, 'Telefone de emergência deve estar no padrão internacional (+55...)'),
});

export const registerSchema = z.object({
  name: z.string().trim().min(3, 'Nome deve ter no mínimo 3 caracteres').max(100),
  email: z.string().trim().email('E-mail inválido'),
  password: z.string().min(12, 'A senha deve ter no mínimo 12 caracteres').max(128),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data de nascimento deve estar no formato AAAA-MM-DD').optional(),
  gender: z.enum(['MASCULINO', 'FEMININO', 'OUTRO']).optional(),
  maritalStatus: z.enum(['SOLTEIRO', 'CASADO', 'DIVORCIADO', 'VIUVO', 'OUTRO']).optional(),
  phonePrimary: z.string().trim().regex(phoneRegex, 'Telefone principal deve estar no padrão internacional (+55...)'),
  phoneSecondary: z.string().trim().regex(phoneRegex, 'Telefone secundário inválido').optional().or(z.literal('')),
  whatsapp: z.string().trim().regex(phoneRegex, 'WhatsApp deve estar no padrão internacional (+55...)').optional().or(z.literal('')),
  address: addressSchema.optional(),
  emergencyContact: emergencyContactSchema.optional(),
  joinedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data de entrada ou batismo inválida').optional(),
  preferredChannel: z.enum(['WHATSAPP', 'EMAIL', 'PUSH', 'SMS']).default('WHATSAPP'),
  churchId: z.string().optional(),
  notes: z.string().max(500, 'Observações muito longas').optional(),
  termsAccepted: z.literal(true, {
    errorMap: () => ({ message: 'Você precisa aceitar os termos de privacidade para continuar' }),
  }),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const mfaVerifySchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'O código deve ter exatamente 6 dígitos'),
});

export type MfaVerifyInput = z.infer<typeof mfaVerifySchema>;

export const passwordResetRequestSchema = z.object({
  email: z.string().trim().email('E-mail inválido'),
});

export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(32, 'Token inválido'),
  newPassword: z.string().min(12, 'A senha deve ter no mínimo 12 caracteres').max(128),
});

export type PasswordResetConfirmInput = z.infer<typeof passwordResetConfirmSchema>;

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(32, 'Refresh token inválido'),
  deviceName: z.string().max(100).optional(),
});

export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
