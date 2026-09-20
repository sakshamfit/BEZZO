/**
 * Zod validation pipe.
 *
 * Request bodies, queries and params are validated with a schema before a controller runs. This is a
 * trust boundary: nothing downstream may rely on client-supplied shape or authorisation claims
 * (project rule §24, §37).
 */
import { Injectable, type ArgumentMetadata, type PipeTransform } from '@nestjs/common';
import { ZodError, type ZodSchema } from 'zod';
import { ErrorCode, type FieldError } from '@bezzo/contracts';
import { DomainError } from '../errors/domain-error';

export function formatZodError(error: ZodError): FieldError[] {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || 'request',
    code: ErrorCode.VALIDATION_FAILED,
    message: issue.message,
  }));
}

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown, _metadata: ArgumentMetadata): unknown {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Request validation failed', {
        httpStatus: 422,
        fieldErrors: formatZodError(result.error),
        details: { issues: result.error.issues.map((issue) => ({ path: issue.path, message: issue.message })) },
      });
    }
    return result.data;
  }
}

/** Factory used by controllers: `@Body(validate(createOrderSchema)) payload: CreateOrderInput`. */
export const validate = (schema: ZodSchema) => new ZodValidationPipe(schema);

/** Fastify gives query/params as unknown objects; parse with explicit schema + coercion. */
export function parseWithSchema<T>(schema: ZodSchema<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Request validation failed', {
      httpStatus: 422,
      fieldErrors: formatZodError(result.error),
    });
  }
  return result.data;
}
