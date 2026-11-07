import { z } from 'zod';

export const triggerRemindersSchema = z.object({
  referenceDate: z.string().datetime().optional(),
  dryRun: z.boolean().optional(),
});

export type TriggerRemindersInput = z.infer<typeof triggerRemindersSchema>;

export const webPushSubscriptionSchema = z.object({
  type: z.literal('web').optional(),
  endpoint: z.string().url('Endpoint de push deve ser uma URL válida'),
  keys: z.object({
    p256dh: z.string().min(1, 'Chave p256dh obrigatória'),
    auth: z.string().min(1, 'Chave auth obrigatória'),
  }),
});

export type WebPushSubscriptionInput = z.infer<typeof webPushSubscriptionSchema>;

export const nativePushSubscriptionSchema = z.object({
  type: z.literal('native'),
  token: z.string().min(10, 'Token nativo de dispositivo obrigatório'),
  platform: z.enum(['android', 'ios']),
});

export type NativePushSubscriptionInput = z.infer<typeof nativePushSubscriptionSchema>;

export const pushSubscriptionSchema = z.union([
  webPushSubscriptionSchema,
  nativePushSubscriptionSchema,
]);

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

export const unsubscribePushSchema = z.object({
  endpoint: z.string().min(1, 'Endpoint ou identificador de push obrigatório'),
});

export type UnsubscribePushInput = z.infer<typeof unsubscribePushSchema>;

export const updateFeatureFlagSchema = z.object({
  key: z.string().min(1, 'Chave da flag obrigatória'),
  enabled: z.boolean({ required_error: 'O estado da flag (ativada/desativada) é obrigatório' } as any),
});

export type UpdateFeatureFlagInput = z.infer<typeof updateFeatureFlagSchema>;

export const sendTestNotificationSchema = z.object({
  channel: z.enum(['WHATSAPP', 'EMAIL', 'PUSH', 'SMS'], {
    message: 'Canal inválido. Escolha WHATSAPP, EMAIL, PUSH ou SMS.'
  }),
  targetUserId: z.string().min(1, 'Usuário de destino obrigatório'),
});

export type SendTestNotificationInput = z.infer<typeof sendTestNotificationSchema>;
