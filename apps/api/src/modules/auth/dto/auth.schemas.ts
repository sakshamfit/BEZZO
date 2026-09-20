/**
 * Authentication DTO schemas (zod). These are the API trust boundary: every field is validated and
 * normalised before a service sees it.
 */
import { z } from 'zod';
import { ClientPlatform, RoleCode } from '@bezzo/contracts';

const email = z.string().trim().toLowerCase().email().max(254);
const phone = z
  .string()
  .trim()
  .regex(/^\+?[1-9]\d{7,14}$/, 'Phone must be in E.164 format (e.g. +919876543210)');

export const registerSchema = z
  .object({
    accountType: z.enum(['BUYER', 'SUPPLIER', 'PICKER']),
    email: email.optional(),
    phone: phone.optional(),
    password: z.string().min(8).max(128),
    displayName: z.string().trim().min(2).max(120),
    businessName: z.string().trim().min(2).max(200).optional(),
    clientPlatform: z.enum(['web', 'android', 'ios', 'admin']).optional(),
    acceptedTermsVersion: z.string().max(32).optional(),
    /** Picker accounts are created by operations; self-registration requires an employee code. */
    employeeCode: z.string().trim().max(32).optional(),
    inviteCode: z.string().trim().max(64).optional(),
  })
  .refine((value) => Boolean(value.email || value.phone), {
    message: 'Either email or phone is required',
    path: ['email'],
  })
  .refine((value) => value.accountType !== 'PICKER' || Boolean(value.employeeCode || value.inviteCode), {
    message: 'Picker registration requires an employee code or invite code issued by Bezzo operations',
    path: ['employeeCode'],
  });

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z
  .object({
    identifier: z.string().trim().min(3).max(254),
    password: z.string().min(1).max(128),
    deviceName: z.string().trim().max(120).optional(),
    deviceType: z.enum(['web', 'android', 'ios', 'admin']).optional(),
    deviceId: z.string().trim().max(128).optional(),
  })
  .passthrough();

export type LoginInput = z.infer<typeof loginSchema>;

export const requestOtpSchema = z.object({
  identifier: z.string().trim().min(3).max(254),
  purpose: z.enum(['LOGIN', 'PHONE_VERIFY', 'EMAIL_VERIFY', 'PASSWORD_RESET']),
  deviceType: z.enum(['web', 'android', 'ios', 'admin']).optional(),
});

export type RequestOtpInput = z.infer<typeof requestOtpSchema>;

export const verifyOtpSchema = z.object({
  challengeId: z.string().uuid(),
  code: z.string().trim().regex(/^\d{4,8}$/, 'OTP must be 4-8 digits'),
  deviceName: z.string().trim().max(120).optional(),
  deviceType: z.enum(['web', 'android', 'ios', 'admin']).optional(),
  deviceId: z.string().trim().max(128).optional(),
});

export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(20).max(512),
  deviceType: z.enum(['web', 'android', 'ios', 'admin']).optional(),
});

export type RefreshInput = z.infer<typeof refreshSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
});

export const updateProfileSchema = z
  .object({
    displayName: z.string().trim().min(2).max(120).optional(),
    email: email.optional(),
    phone: phone.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field must be provided' });

export const logoutSchema = z
  .object({
    refreshToken: z.string().min(20).max(512).optional(),
    allSessions: z.boolean().optional(),
  })
  .passthrough();

export const ROLE_FOR_ACCOUNT_TYPE: Record<'BUYER' | 'SUPPLIER' | 'PICKER', RoleCode> = {
  BUYER: RoleCode.BUYER_OWNER,
  SUPPLIER: RoleCode.SUPPLIER_OWNER,
  PICKER: RoleCode.PICKER,
};

export const PLATFORM_VALUES = Object.values(ClientPlatform);
