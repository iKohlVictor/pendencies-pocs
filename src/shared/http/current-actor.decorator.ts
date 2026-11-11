import { createParamDecorator, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { Actor } from 'machine-flow';

/**
 * Demo-only identity: the caller says who they are through headers.
 *   x-user-id: ana
 *   x-user-roles: branch            (comma-separated)
 * In a real app this comes from the authenticated session/JWT, never from the client.
 */
export const CurrentActor = createParamDecorator((_: unknown, ctx: ExecutionContext): Actor => {
  const request = ctx.switchToHttp().getRequest<Request>();
  const id = request.header('x-user-id')?.trim();
  if (!id) throw new UnauthorizedException('Missing x-user-id header');

  const roles = (request.header('x-user-roles') ?? '')
    .split(',')
    .map((role) => role.trim())
    .filter(Boolean);

  return { id, roles };
});
