import { Module } from '@nestjs/common';
import { EventsModule } from './events/events.module.js';
import { PendenciesModule } from './pendencies/pendencies.module.js';
import { UsersModule } from './users/users.module.js';

@Module({ imports: [UsersModule, PendenciesModule, EventsModule] })
export class AppModule {}
