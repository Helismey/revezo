import { z } from 'zod';

export const createSwapRequestSchema = z.object({
  assignmentId: z.string().min(1, 'Escala de origem é obrigatória'),
  targetUserId: z.string().optional(),
  targetAssignmentId: z.string().optional(),
  reason: z.string().max(300, 'Motivo deve ter no máximo 300 caracteres').optional(),
});

export const respondSwapRequestSchema = z.object({
  swapRequestId: z.string().min(1, 'ID do pedido de troca é obrigatório'),
  action: z.enum(['ACCEPT', 'REJECT'], {
    message: 'Ação deve ser ACEITAR ou RECUSAR'
  }),
  reason: z.string().max(300, 'Motivo deve ter no máximo 300 caracteres').optional(),
});

export const reviewSwapRequestSchema = z.object({
  swapRequestId: z.string().min(1, 'ID do pedido de troca é obrigatório'),
  action: z.enum(['APPROVE', 'REJECT'], {
    message: 'Ação deve ser APROVAR ou REJEITAR'
  }),
  notes: z.string().max(300, 'Observações devem ter no máximo 300 caracteres').optional(),
});

export type CreateSwapRequestInput = z.infer<typeof createSwapRequestSchema>;
export type RespondSwapRequestInput = z.infer<typeof respondSwapRequestSchema>;
export type ReviewSwapRequestInput = z.infer<typeof reviewSwapRequestSchema>;
