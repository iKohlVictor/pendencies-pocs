import { Module } from '@nestjs/common';
import { EventsModule } from './events/events.module.js';
import { PendenciesModule } from './pendencies/pendencies.module.js';

@Module({ imports: [PendenciesModule, EventsModule] })
export class AppModule {}
