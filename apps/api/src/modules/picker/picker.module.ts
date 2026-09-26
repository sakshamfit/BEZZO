import { Module } from '@nestjs/common';
import { PickerController } from './picker.controller';
import { PickerService } from './picker.service';

@Module({ controllers: [PickerController], providers: [PickerService] })
export class PickerModule {}
