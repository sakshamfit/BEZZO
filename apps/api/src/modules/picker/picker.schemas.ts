import { z } from 'zod';

export const pickerHeartbeatSchema = z
  .object({
    status: z.enum(['AVAILABLE', 'OFFLINE', 'ON_BREAK']).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    accuracyMeters: z.number().min(0).max(100_000).optional(),
    deviceConnectivity: z.enum(['ONLINE', 'OFFLINE', 'WEAK']).optional(),
    appVersion: z.string().trim().min(1).max(50).optional(),
  })
  .strict();

export const pickerLocationSchema = z
  .object({
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
  })
  .strict()
  .default({});

export const scanPackageSchema = z
  .object({
    scanCode: z.string().trim().min(1).max(160),
    localEventId: z.string().trim().min(8).max(255).optional(),
    scanResultHint: z
      .enum([
        'ACCEPTED',
        'DUPLICATE',
        'UNEXPECTED',
        'UNREADABLE',
        'DAMAGED',
        'WRONG_HUB',
        'ALREADY_RECEIVED',
      ])
      .nullable()
      .optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
  })
  .strict();

export const completePickupSchema = z
  .object({
    partialReason: z.string().trim().min(1).max(500).optional(),
    missingPackageCodes: z.array(z.string().trim().min(1).max(160)).max(500).optional(),
    supplierExplanation: z.string().trim().min(1).max(1000).optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .strict();

export type PickerHeartbeatInput = z.infer<typeof pickerHeartbeatSchema>;
export type PickerLocationInput = z.infer<typeof pickerLocationSchema>;
export type ScanPackageInput = z.infer<typeof scanPackageSchema>;
export type CompletePickupInput = z.infer<typeof completePickupSchema>;
