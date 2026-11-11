import { Module } from '@nestjs/common';
import { PendenciesModule } from '../pendencies/pendencies.module.js';
import { EventsService } from './application/events.service.js';
import { EVENT_REPOSITORY } from './domain/event.repository.js';
import { EventsController } from './http/events.controller.js';
import { InMemoryEventRepository } from './infrastructure/in-memory-event.repository.js';

/** Depends on pendencies (one direction only): events know pendencies, not the other way around. */
@Module({
  imports: [PendenciesModule],
  controllers: [EventsController],
  providers: [EventsService, { provide: EVENT_REPOSITORY, useClass: InMemoryEventRepository }],
})
export class EventsModule {}
