import { Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { UsersService } from '../application/users.service.js';
import type { ActorRequest } from '../../shared/http/current-actor.decorator.js';

/**
 * Global guard: turns the `x-user-id` header into an Actor (id + roles of the
 * user's profile) and puts it on the request for @CurrentActor().
 * No header: the request goes on anonymous (catalogs, GETs); actions then answer 401.
 * Unknown user: 401 right away.
 */
@Injectable()
export class ActorGuard implements CanActivate {
  constructor(private readonly users: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ActorRequest>();
    const userId = request.header('x-user-id')?.trim();
    if (!userId) return true;

    const actor = await this.users.resolveActor(userId);
    if (!actor) throw new UnauthorizedException(`Unknown user ${userId}`);
    request.actor = actor;
    return true;
  }
}
