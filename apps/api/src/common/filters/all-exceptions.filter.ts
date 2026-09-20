/**
 * Global exception filter.
 *
 * Converts every failure into the BEZZO error envelope so that clients only ever parse one shape
 * (API spec §8). Internal details, stack traces and SQL are never leaked to callers.
 */
import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import {
  ErrorCode,
  IllegalStateTransitionError,
  type ErrorEnvelope,
  type FieldError,
} from '@bezzo/contracts';
import { DomainError } from '../errors/domain-error';
import { getRequestContext } from '../context/request-context';

interface NormalizedError {
  status: number;
  code: string;
  message: string;
  details: Record<string, unknown> | null;
  fieldErrors: FieldError[];
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<FastifyReply>();
    const request = host.switchToHttp().getRequest<{ method: string; url: string }>();
    const requestId = getRequestContext()?.requestId ?? 'unknown';

    const normalized = this.normalize(exception);

    if (normalized.status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${normalized.status} ${normalized.code} [${requestId}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(
        `${request.method} ${request.url} -> ${normalized.status} ${normalized.code} [${requestId}] ${normalized.message}`,
      );
    }

    const envelope: ErrorEnvelope = {
      success: false,
      error: {
        code: normalized.code,
        message: normalized.message,
        details: normalized.details,
        fieldErrors: normalized.fieldErrors,
      },
      meta: { requestId },
    };

    void response.status(normalized.status).send(envelope);
  }

  private normalize(exception: unknown): NormalizedError {
    if (exception instanceof DomainError) {
      return {
        status: exception.httpStatus,
        code: exception.code,
        message: exception.message,
        details: exception.details,
        fieldErrors: exception.fieldErrors,
      };
    }

    if (exception instanceof IllegalStateTransitionError) {
      return {
        status: HttpStatus.CONFLICT,
        code: ErrorCode.INVALID_STATE_TRANSITION,
        message: exception.message,
        details: { entity: exception.entity, from: exception.from, to: exception.to },
        fieldErrors: [],
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const payloadObject = typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};

      // ValidationPipe / framework validation errors arrive as a message array.
      const rawMessages = Array.isArray(payloadObject.message)
        ? (payloadObject.message as string[])
        : typeof payloadObject.message === 'string'
          ? [payloadObject.message]
          : [exception.message];

      const isValidation = status === HttpStatus.BAD_REQUEST || status === HttpStatus.UNPROCESSABLE_ENTITY;
      const fieldErrors: FieldError[] = isValidation
        ? rawMessages.map((message) => ({ field: 'request', code: ErrorCode.VALIDATION_FAILED, message }))
        : [];

      return {
        status,
        code: this.codeForStatus(status, payloadObject),
        message: isValidation ? 'Request validation failed' : rawMessages[0] ?? exception.message,
        details: isValidation ? { messages: rawMessages } : null,
        fieldErrors,
      };
    }

    if (this.isPostgresError(exception)) {
      const error = exception as { code?: string; constraint?: string };
      // Translate the most common integrity violations instead of leaking database internals.
      if (error.code === '23505' || error.code === '23p01') {
        return {
          status: HttpStatus.CONFLICT,
          code: ErrorCode.CONFLICT,
          message: 'The operation conflicts with existing data',
          details: error.constraint ? { constraint: error.constraint } : null,
          fieldErrors: [],
        };
      }
      if (error.code === '23514' || error.code === '23503') {
        return {
          status: HttpStatus.CONFLICT,
          code: ErrorCode.CONFLICT,
          message: 'The operation would violate a data integrity rule',
          details: error.constraint ? { constraint: error.constraint } : null,
          fieldErrors: [],
        };
      }
      // 22P02 = invalid_text_representation: a value that is not castable to the column type (for
      // example a non-UUID identifier). That is a request-shape problem, never an internal failure.
      if (error.code === '22P02') {
        return {
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Request validation failed',
          details: { reason: 'malformed_identifier' },
          fieldErrors: [
            { field: 'request', code: ErrorCode.VALIDATION_FAILED, message: 'An identifier in the request is malformed' },
          ],
        };
      }
      if (error.code === '40001' || error.code === '40P01') {
        return {
          status: HttpStatus.CONFLICT,
          code: ErrorCode.CONFLICT,
          message: 'The operation conflicted with a concurrent update — please retry',
          details: { retryable: true },
          fieldErrors: [],
        };
      }
      if (error.code === '57014') {
        return {
          status: HttpStatus.SERVICE_UNAVAILABLE,
          code: ErrorCode.SERVICE_UNAVAILABLE,
          message: 'The request took too long to process',
          details: null,
          fieldErrors: [],
        };
      }
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.INTERNAL_ERROR,
      message: 'An unexpected error occurred',
      details: null,
      fieldErrors: [],
    };
  }

  private codeForStatus(status: number, payload: Record<string, unknown>): string {
    if (typeof payload.code === 'string' && payload.code.length > 0 && payload.code !== 'HttpException') {
      return payload.code;
    }
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ErrorCode.INVALID_REQUEST;
      case HttpStatus.UNAUTHORIZED:
        return ErrorCode.AUTH_REQUIRED;
      case HttpStatus.FORBIDDEN:
        return ErrorCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ErrorCode.RESOURCE_NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ErrorCode.CONFLICT;
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return ErrorCode.VALIDATION_FAILED;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ErrorCode.RATE_LIMIT_EXCEEDED;
      case HttpStatus.BAD_GATEWAY:
        return ErrorCode.UPSTREAM_INVALID_RESPONSE;
      case HttpStatus.SERVICE_UNAVAILABLE:
        return ErrorCode.SERVICE_UNAVAILABLE;
      default:
        return ErrorCode.INTERNAL_ERROR;
    }
  }

  private isPostgresError(exception: unknown): boolean {
    return (
      typeof exception === 'object' &&
      exception !== null &&
      'code' in exception &&
      typeof (exception as { code?: unknown }).code === 'string' &&
      /^[0-9A-Z]{5}$/.test((exception as { code: string }).code)
    );
  }
}
