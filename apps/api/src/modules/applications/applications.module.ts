/**
 * Partner applications module.
 *
 * Public intake plus the operations triage queue. Uses only infrastructure modules (database, config,
 * audit, events, notifications): applications never touch accounts, orders or inventory — verification
 * is a human gate.
 */
import { Module } from '@nestjs/common';
import { AdminApplicationsController, ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';

@Module({
  controllers: [ApplicationsController, AdminApplicationsController],
  providers: [ApplicationsService],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}
