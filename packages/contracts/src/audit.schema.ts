import { z } from 'zod';

export const auditLogQuerySchema = z.object({
  actorId: z.string().optional(),
  searchUser: z.string().optional(),
  action: z.string().optional(),
  targetType: z.string().optional(),
  targetId: z.string().optional(),
  result: z.enum(['SUCCESS', 'DENIED', 'FAILED']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  churchId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50).optional(),
  format: z.enum(['json', 'csv']).default('json').optional(),
});

export type AuditLogQueryInput = z.infer<typeof auditLogQuerySchema>;

export const scheduleHistoryQuerySchema = z.object({
  departmentId: z.string().optional(),
  programId: z.string().optional(),
  userId: z.string().optional(),
  eventType: z.enum(['ALL', 'ASSIGNED', 'CONFIRMED', 'DECLINED', 'SUBSTITUTED', 'SWAP']).default('ALL').optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50).optional(),
  format: z.enum(['json', 'csv']).default('json').optional(),
});

export type ScheduleHistoryQueryInput = z.infer<typeof scheduleHistoryQuerySchema>;
