import { Module } from '@nestjs/common';
import { HubReceivingController } from './hub-receiving.controller';
import { HubReceivingService } from './hub-receiving.service';

@Module({ controllers: [HubReceivingController], providers: [HubReceivingService] })
export class HubReceivingModule {}
