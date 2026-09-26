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
import { pickerHeartbeatSchema, type PickerHeartbeatInput } from './picker.schemas';

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
}
