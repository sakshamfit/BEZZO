import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission } from '@bezzo/contracts';
import {
  Audited,
  CurrentActor,
  Idempotent,
  RequirePermissions,
  Roles,
} from '../../common/decorators';
import type { AuthenticatedActor } from '../../common/context/request-context';
import { PickerService } from './picker.service';
import { UuidParamPipe, validate } from '../../common/pipes/zod-validation.pipe';
import {
  pickerHeartbeatSchema,
  pickerLocationSchema,
  completePickupSchema,
  scanPackageSchema,
  type PickerHeartbeatInput,
  type PickerLocationInput,
  type ScanPackageInput,
  type CompletePickupInput,
} from './picker.schemas';

@ApiTags('picker')
@Controller('picker')
@Roles('PICKER')
export class PickerController {
  constructor(private readonly picker: PickerService) {}

  @Get('tasks')
  @RequirePermissions(Permission.PICKER_TASK_READ)
  @ApiOperation({ summary: 'List available collection tasks and the picker’s active tasks' })
  async tasks(@CurrentActor() actor: AuthenticatedActor) {
    return this.picker.listTasks(actor);
  }

  @Post('heartbeat')
  @HttpCode(200)
  @RequirePermissions(Permission.PICKER_TASK_EXECUTE)
  @ApiOperation({ summary: 'Update picker availability and current location' })
  async heartbeat(
    @CurrentActor() actor: AuthenticatedActor,
    @Body(validate(pickerHeartbeatSchema)) body: PickerHeartbeatInput,
  ) {
    return this.picker.heartbeat(actor, body);
  }

  @Post('tasks/:taskId/accept')
  @Idempotent('picker.task_accept')
  @HttpCode(200)
  @RequirePermissions(Permission.PICKER_TASK_EXECUTE)
  @Audited('picker.task_accepted', 'pickup_task')
  @ApiOperation({ summary: 'Atomically claim a collection task' })
  async accept(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('taskId', new UuidParamPipe('taskId')) taskId: string,
  ) {
    return this.picker.acceptTask(actor, taskId);
  }

  @Post('tasks/:taskId/arrive')
  @Idempotent('picker.task_arrive')
  @HttpCode(200)
  @RequirePermissions(Permission.PICKER_TASK_EXECUTE)
  @Audited('picker.task_arrived', 'pickup_task')
  @ApiOperation({ summary: 'Confirm arrival at the supplier pickup location' })
  async arrive(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('taskId', new UuidParamPipe('taskId')) taskId: string,
    @Body(validate(pickerLocationSchema)) body: PickerLocationInput,
  ) {
    return this.picker.arrive(actor, taskId, body);
  }

  @Post('tasks/:taskId/start-collection')
  @Idempotent('picker.collection_start')
  @HttpCode(200)
  @RequirePermissions(Permission.PICKER_TASK_EXECUTE)
  @Audited('picker.collection_started', 'pickup_task')
  @ApiOperation({ summary: 'Start scanning packages at the supplier' })
  async startCollection(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('taskId', new UuidParamPipe('taskId')) taskId: string,
  ) {
    return this.picker.startCollection(actor, taskId);
  }

  @Get('tasks/:taskId/packages')
  @RequirePermissions(Permission.PICKER_TASK_READ)
  @ApiOperation({ summary: 'List task packages and current pickup reconciliation' })
  async packages(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('taskId', new UuidParamPipe('taskId')) taskId: string,
  ) {
    return this.picker.listPackages(actor, taskId);
  }

  @Post('tasks/:taskId/packages/scan')
  @Idempotent('picker.package_scan')
  @HttpCode(200)
  @RequirePermissions(Permission.PICKER_PACKAGE_SCAN)
  @Audited('picker.package_scanned', 'pickup_package')
  @ApiOperation({ summary: 'Scan an expected sealed package for supplier pickup' })
  async scanPackage(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('taskId', new UuidParamPipe('taskId')) taskId: string,
    @Body(validate(scanPackageSchema)) body: ScanPackageInput,
  ) {
    return this.picker.scanPackage(actor, taskId, body);
  }

  @Post('tasks/:taskId/complete')
  @Idempotent('picker.task_complete')
  @HttpCode(200)
  @RequirePermissions(Permission.PICKER_TASK_EXECUTE)
  @Audited('picker.task_completed', 'pickup_task')
  @ApiOperation({ summary: 'Reconcile and complete a full or partial supplier pickup' })
  async completePickup(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('taskId', new UuidParamPipe('taskId')) taskId: string,
    @Body(validate(completePickupSchema)) body: CompletePickupInput,
  ) {
    return this.picker.completePickup(actor, taskId, body);
  }
}
