import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';

/** Default profiles seeded by the users module. */
export const PROFILE = { branch: 'PRF-1', documentation: 'PRF-2', scheduling: 'PRF-3' } as const;

export type Identity = { 'x-user-id': string };

/** Creates one user per default profile and returns the header each one sends. */
export async function seedUsers(app: INestApplication<App>) {
  const create = async (name: string, profileId: string): Promise<Identity> => {
    const res = await request(app.getHttpServer()).post('/users').send({ name, profileId }).expect(201);
    return { 'x-user-id': res.body.id };
  };

  return {
    BRANCH: await create('Ana', PROFILE.branch),
    SCHEDULING: await create('Paula', PROFILE.scheduling),
    DOCUMENTATION: await create('Diego', PROFILE.documentation),
  };
}
