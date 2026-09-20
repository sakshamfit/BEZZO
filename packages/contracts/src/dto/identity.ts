/**
 * Identity / authentication contracts.
 * Source: Bezzo_api_implementation_endpoint_by_endpoint_engineering_spec_v1.0.md §12–§15,
 *         Bezzo_identity_authentication_user_account_spec_v1.0.md.
 */
import type { ClientPlatform, OrganizationType, RoleCode, UserStatus } from '../domain/enums';

export interface RegisterRequest {
  /** Either email or phone (E.164 for phone) must be supplied. */
  email?: string;
  phone?: string;
  password: string;
  displayName: string;
  accountType: 'BUYER' | 'SUPPLIER' | 'PICKER';
  /** Required for BUYER / SUPPLIER onboarding continuation. */
  businessName?: string;
  clientPlatform?: ClientPlatform;
  acceptedTermsVersion?: string;
}

export interface RegisterResponse {
  userId: string;
  status: UserStatus;
  verificationRequired: boolean;
  /** Only present when OTP delivery cannot reach the user (non-production and AUTH_OTP_DEV_ECHO). */
  devOtp?: string;
}

export interface RequestOtpRequest {
  identifier: string;
  purpose: 'LOGIN' | 'PHONE_VERIFY' | 'EMAIL_VERIFY' | 'PASSWORD_RESET';
}

export interface RequestOtpResponse {
  challengeId: string;
  expiresInSeconds: number;
  destinationMasked: string;
  devOtp?: string;
}

export interface VerifyOtpRequest {
  challengeId: string;
  code: string;
  deviceName?: string;
  deviceType?: ClientPlatform;
}

export interface LoginRequest {
  identifier: string;
  password: string;
  deviceName?: string;
  deviceType?: ClientPlatform;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresIn: number;
  tokenType: 'Bearer';
}

export interface AuthenticatedPrincipal {
  userId: string;
  sessionId: string;
  roles: RoleCode[];
  permissions: string[];
  organizationId: string | null;
  organizationType: OrganizationType | null;
  /** Present when the account has a supplier/buyer/picker profile attached. */
  supplierId?: string | null;
  buyerId?: string | null;
  pickerId?: string | null;
  hubId?: string | null;
}

export interface LoginResponse extends AuthTokens {
  principal: AuthenticatedPrincipal;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface MeResponse {
  id: string;
  email: string | null;
  phone: string | null;
  displayName: string;
  status: UserStatus;
  emailVerified: boolean;
  phoneVerified: boolean;
  roles: RoleCode[];
  permissions: string[];
  organization: { id: string; type: OrganizationType; name: string } | null;
  supplierId: string | null;
  buyerId: string | null;
  pickerId: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface SessionSummary {
  id: string;
  deviceName: string | null;
  deviceType: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  authenticationMethod: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  current: boolean;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface UpdateProfileRequest {
  displayName?: string;
  email?: string;
  phone?: string;
}
