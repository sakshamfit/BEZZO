import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission } from '@bezzo/contracts';
import { CurrentActor, Idempotent, RequirePermissions, Roles } from '../../common/decorators';
import type { AuthenticatedActor } from '../../common/context/request-context';
import { UuidParamPipe, validate } from '../../common/pipes/zod-validation.pipe';
import { HubReceivingService } from './hub-receiving.service';
import {
  completeReceivingSchema, scanHubPackageSchema, startReceivingSchema,
  type CompleteReceivingInput, type ScanHubPackageInput, type StartReceivingInput,
} from './hub-receiving.schemas';

@ApiTags('hub receiving')
@Controller('hubs/:hubId/receivings')
@Roles('OPERATIONS_AGENT', 'ADMIN', 'SUPER_ADMIN')
export class HubReceivingController {
  constructor(private readonly receiving: HubReceivingService) {}

  @Get()
  @RequirePermissions(Permission.HUB_RECEIVING_READ)
  @ApiOperation({ summary: 'List recent handovers received at a collection hub' })
  async list(@CurrentActor() actor: AuthenticatedActor, @Param('hubId', new UuidParamPipe('hubId')) hubId: string) {
    return this.receiving.list(actor, hubId);
  }

  @Post()
  @Idempotent('hub.receiving_start')
  @RequirePermissions(Permission.HUB_RECEIVING_EXECUTE)
  @ApiOperation({ summary: 'Open a receiving session for a collected pickup task' })
  async start(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('hubId', new UuidParamPipe('hubId')) hubId: string,
    @Body(validate(startReceivingSchema)) body: StartReceivingInput,
  ) {
    return this.receiving.start(actor, hubId, body);
  }

  @Post(':receivingId/scans')
  @Idempotent('hub.package_scan')
  @RequirePermissions(Permission.HUB_RECEIVING_EXECUTE)
  @ApiOperation({ summary: 'Scan and classify an expected, unexpected or damaged package' })
  async scan(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('receivingId', new UuidParamPipe('receivingId')) receivingId: string,
    @Body(validate(scanHubPackageSchema)) body: ScanHubPackageInput,
  ) {
    return this.receiving.scan(actor, receivingId, body);
  }

  @Post(':receivingId/complete')
  @Idempotent('hub.receiving_complete')
  @RequirePermissions(Permission.HUB_RECEIVING_EXECUTE)
  @ApiOperation({ summary: 'Reconcile missing packages and complete a hub handover' })
  async complete(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('receivingId', new UuidParamPipe('receivingId')) receivingId: string,
    @Body(validate(completeReceivingSchema)) body: CompleteReceivingInput,
  ) {
    return this.receiving.complete(actor, receivingId, body);
  }
}
