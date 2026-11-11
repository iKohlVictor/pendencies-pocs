import { Module } from '@nestjs/common';
import { NOTIFICATION_OUTBOX } from './application/notification-outbox.js';
import { PendenciesService } from './application/pendencies.service.js';
import { PENDENCY_REPOSITORY } from './domain/pendency.repository.js';
import { NotificationsController, PendenciesController } from './http/pendencies.controller.js';
import { InMemoryNotificationOutbox } from './infrastructure/in-memory-notification.outbox.js';
import { InMemoryPendencyRepository } from './infrastructure/in-memory-pendency.repository.js';

@Module({
  controllers: [PendenciesController, NotificationsController],
  exports: [PendenciesService],
  providers: [
    PendenciesService,
    // Swap these two lines for real adapters (TypeORM, SQS...) and nothing else changes.
    { provide: PENDENCY_REPOSITORY, useClass: InMemoryPendencyRepository },
    { provide: NOTIFICATION_OUTBOX, useClass: InMemoryNotificationOutbox },
  ],
})
export class PendenciesModule {}
