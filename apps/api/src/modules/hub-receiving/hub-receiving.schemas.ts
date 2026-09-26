import { z } from 'zod';

export const startReceivingSchema = z.object({ pickupTaskId: z.string().uuid() }).strict();
export const scanHubPackageSchema = z.object({
  packageCode: z.string().trim().min(1).max(160),
  localEventId: z.string().trim().min(8).max(255).optional(),
  resultHint: z.enum(['DAMAGED', 'UNREADABLE']).optional(),
  notes: z.string().trim().max(500).optional(),
}).strict();
export const completeReceivingSchema = z.object({
  acknowledgeDiscrepancy: z.boolean().default(false),
  discrepancyReason: z.string().trim().min(1).max(500).optional(),
  notes: z.string().trim().max(1000).optional(),
}).strict().superRefine((value, context) => {
  if (value.acknowledgeDiscrepancy && !value.discrepancyReason) {
    context.addIssue({ code: 'custom', path: ['discrepancyReason'], message: 'Explain the acknowledged discrepancy' });
  }
});

export type StartReceivingInput = z.infer<typeof startReceivingSchema>;
export type ScanHubPackageInput = z.infer<typeof scanHubPackageSchema>;
export type CompleteReceivingInput = z.infer<typeof completeReceivingSchema>;
