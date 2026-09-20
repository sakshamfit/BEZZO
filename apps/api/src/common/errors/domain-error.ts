/**
 * Domain errors.
 *
 * Every expected failure is expressed as a `DomainError` carrying a stable BEZZO error code from
 * `@bezzo/contracts`. The global exception filter converts it into the standard error envelope
 * (API spec §8) so clients always receive a machine-readable `code`.
 */
import { ErrorCode, httpStatusForErrorCode, type FieldError } from '@bezzo/contracts';

export class DomainError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly details: Record<string, unknown> | null;
  readonly fieldErrors: FieldError[];

  constructor(
    code: string,
    message: string,
    options: {
      httpStatus?: number;
      details?: Record<string, unknown> | null;
      fieldErrors?: FieldError[];
      cause?: unknown;
    } = {},
  ) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'DomainError';
    this.code = code;
    this.httpStatus = options.httpStatus ?? httpStatusForErrorCode(code);
    this.details = options.details ?? null;
    this.fieldErrors = options.fieldErrors ?? [];
  }

  static notFound(code: string, message: string, details?: Record<string, unknown>): DomainError {
    return new DomainError(code, message, { httpStatus: 404, details });
  }

  static conflict(code: string, message: string, details?: Record<string, unknown>): DomainError {
    return new DomainError(code, message, { httpStatus: 409, details });
  }

  static forbidden(code: string, message: string, details?: Record<string, unknown>): DomainError {
    return new DomainError(code, message, { httpStatus: 403, details });
  }

  static unprocessable(code: string, message: string, details?: Record<string, unknown>): DomainError {
    return new DomainError(code, message, { httpStatus: 422, details });
  }

  static badRequest(code: string, message: string, details?: Record<string, unknown>): DomainError {
    return new DomainError(code, message, { httpStatus: 400, details });
  }
}

export const notFound = (code: string, message: string, details?: Record<string, unknown>) =>
  DomainError.notFound(code, message, details);
export const conflict = (code: string, message: string, details?: Record<string, unknown>) =>
  DomainError.conflict(code, message, details);
export const forbidden = (code: string, message: string, details?: Record<string, unknown>) =>
  DomainError.forbidden(code, message, details);
export const unprocessable = (code: string, message: string, details?: Record<string, unknown>) =>
  DomainError.unprocessable(code, message, details);
export const badRequest = (code: string, message: string, details?: Record<string, unknown>) =>
  DomainError.badRequest(code, message, details);

/** Re-exported for convenience so services do not need to import from two places. */
export { ErrorCode };
