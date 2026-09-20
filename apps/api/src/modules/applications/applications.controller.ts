import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission } from '@bezzo/contracts';
import { CurrentActor, Idempotent, Public, RequirePermissions } from '../../common/decorators';
import type { AuthenticatedActor } from '../../common/context/request-context';
import { getRequestContext } from '../../common/context/request-context';
import { validate } from '../../common/pipes/zod-validation.pipe';
import {
  ApplicationsService,
  applicationListQuerySchema,
  createApplicationSchema,
  updateApplicationSchema,
} from './applications.service';
import type { ApplicationListQuery, CreateApplicationInput, UpdateApplicationInput } from './applications.service';

interface RawRequest {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Public partner intake ("Apply" forms).
 *
 * Public on purpose — an applicant has no account yet — but not unprotected: validation is strict, the
 * global idempotency interceptor makes a retried submission safe, and the response always names the
 * operations line that receives the application.
 */
@ApiTags('applications')
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  @Post()
  @Public()
  @HttpCode(201)
  @Idempotent('application.submit')
  @ApiOperation({ summary: 'Submit a partner application (supplier, picker, retailer or other)' })
  async submit(@Req() request: RawRequest, @Body(validate(createApplicationSchema)) body: CreateApplicationInput) {
    const context = getRequestContext();
    return this.applications.submit(body, {
      requestId: context?.requestId ?? null,
      ip: request.ip ?? null,
      userId: context?.actor?.userId ?? null,
    });
  }

  @Get('routing')
  @Public()
  @ApiOperation({ summary: 'Where applications are delivered (WhatsApp business line)' })
  routing() {
    return this.applications.routing();
  }
}

@ApiTags('admin-applications')
@Controller('admin/applications')
export class AdminApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  @Get()
  @RequirePermissions(Permission.ADMIN_APPLICATION_READ)
  @ApiOperation({ summary: 'Partner application queue with status counts' })
  async list(@Query(validate(applicationListQuerySchema)) query: ApplicationListQuery) {
    return this.applications.list(query);
  }

  @Get('summary')
  @RequirePermissions(Permission.ADMIN_APPLICATION_READ)
  @ApiOperation({ summary: 'Application counters for the operations queue header' })
  async summary() {
    return this.applications.summary();
  }

  @Patch(':applicationId')
  @RequirePermissions(Permission.ADMIN_APPLICATION_WRITE)
  @ApiOperation({ summary: 'Triage a partner application' })
  async update(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('applicationId') applicationId: string,
    @Body(validate(updateApplicationSchema)) body: UpdateApplicationInput,
  ) {
    return this.applications.update(applicationId, body, { userId: actor.userId });
  }
}
