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

export type PickerHeartbeatInput = z.infer<typeof pickerHeartbeatSchema>;
