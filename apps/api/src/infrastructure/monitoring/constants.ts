/**
 * Shared operational constants.
 *
 * `SERVICE_UNAVAILABLE_DETAIL` is intentionally generic: an unauthenticated caller must not learn
 * which internal subsystem is missing.
 */
export const SERVICE_UNAVAILABLE_DETAIL =
  'This endpoint is not available in the current environment. Contact your BEZZO administrator.';

export const API_VERSION = 'v1';
export const API_PREFIX = '/api/v1';
