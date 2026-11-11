import { createParamDecorator, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { Actor } from 'machine-flow';

/** A request after the users module resolved who is calling. */
export type ActorRequest = Request & { actor?: Actor };

/**
 * Demo-only identity: the caller sends only their user id (`x-user-id: USR-1`).
 * The users module's ActorGuard looks the user up and fills in the roles of their profile.
 * In a real app the id comes from the authenticated session/JWT, never from the client.
 */
export const CurrentActor = createParamDecorator((_: unknown, ctx: ExecutionContext): Actor => {
  const actor = ctx.switchToHttp().getRequest<ActorRequest>().actor;
  if (!actor) throw new UnauthorizedException('Missing x-user-id header');
  return actor;
});
