import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { UsersService } from './application/users.service.js';
import { PROFILE_REPOSITORY, USER_REPOSITORY } from './domain/users.repository.js';
import { ActorGuard } from './http/actor.guard.js';
import { ProfilesController, UsersController } from './http/users.controller.js';
import { InMemoryProfileRepository, InMemoryUserRepository } from './infrastructure/in-memory-users.repository.js';

/** Who the caller is. Every other module only sees the resolved Actor, never users or profiles. */
@Module({
  controllers: [ProfilesController, UsersController],
  exports: [UsersService],
  providers: [
    UsersService,
    { provide: PROFILE_REPOSITORY, useClass: InMemoryProfileRepository },
    { provide: USER_REPOSITORY, useClass: InMemoryUserRepository },
    { provide: APP_GUARD, useClass: ActorGuard },
  ],
})
export class UsersModule {}
