import { z } from 'zod';

export const createConfirmationTokenSchema = z.object({
  assignmentId: z.string().min(1, 'Escala obrigatória'),
  expiresInDays: z.number().int().min(1).max(30).optional(),
});

export type CreateConfirmationTokenInput = z.infer<typeof createConfirmationTokenSchema>;

export const consumeConfirmationTokenSchema = z.object({
  token: z
    .string()
    .min(32, 'Token inválido')
    .max(128, 'Token inválido'),
  action: z.enum(['CONFIRM', 'DECLINE'], {
    message: 'Ação deve ser CONFIRM ou DECLINE'
  }),
  reason: z.string().max(200, 'Motivo deve ter no máximo 200 caracteres').optional(),
});

export type ConsumeConfirmationTokenInput = z.infer<typeof consumeConfirmationTokenSchema>;

export const verifyConfirmationTokenQuerySchema = z.object({
  token: z
    .string()
    .min(32, 'Token inválido')
    .max(128, 'Token inválido'),
});

export type VerifyConfirmationTokenQuery = z.infer<typeof verifyConfirmationTokenQuerySchema>;
