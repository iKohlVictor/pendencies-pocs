import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PROFILE } from './support/users.js';

describe('Users & profiles API (e2e)', () => {
  let app: INestApplication<App>;
  const http = () => request(app.getHttpServer());

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('starts with one profile per workflow role', async () => {
    const res = await http().get('/profiles').expect(200);
    expect(res.body).toEqual([
      { id: 'PRF-1', name: 'Filial', roles: ['branch'] },
      { id: 'PRF-2', name: 'Análise de documentação', roles: ['documentation_analysis'] },
      { id: 'PRF-3', name: 'Programação de pagamento', roles: ['payment_scheduling'] },
    ]);
  });

  it('creates a profile, validating its roles', async () => {
    const created = await http()
      .post('/profiles')
      .send({ name: 'Supervisor', roles: ['documentation_analysis', 'payment_scheduling'] })
      .expect(201);
    expect(created.body).toEqual({
      id: 'PRF-4',
      name: 'Supervisor',
      roles: ['documentation_analysis', 'payment_scheduling'],
    });

    const invalid = await http().post('/profiles').send({ name: 'X', roles: ['admin'] }).expect(422);
    expect(invalid.body).toMatchObject({ error: 'InvalidValueError', field: 'roles' });
    await http().post('/profiles').send({ name: 'X', roles: [] }).expect(422);
  });

  it('creates a user in a profile and moves it to another one', async () => {
    const created = await http().post('/users').send({ name: 'Ana', profileId: PROFILE.branch }).expect(201);
    expect(created.body).toEqual({ id: 'USR-1', name: 'Ana', profile: { id: 'PRF-1', name: 'Filial', roles: ['branch'] } });

    await http().post('/users').send({ name: 'Ana', profileId: 'PRF-99' }).expect(404);
    await http().post('/users').send({ profileId: PROFILE.branch }).expect(422);

    const moved = await http().put('/users/USR-1/profile').send({ profileId: PROFILE.documentation }).expect(200);
    expect(moved.body.profile.roles).toEqual(['documentation_analysis']);

    const byProfile = await http().get('/users').query({ profileId: PROFILE.documentation }).expect(200);
    expect(byProfile.body.map((u: { id: string }) => u.id)).toEqual(['USR-1']);
  });

  it('the caller sends only the user id; the roles come from the profile', async () => {
    await http().post('/users').send({ name: 'Ana', profileId: PROFILE.branch }).expect(201);
    const event = await http().post('/events').set('x-user-id', 'USR-1').send({ type: 'ad_hoc' }).expect(201);
    const pendency = await http()
      .post(`/events/${event.body.id}/pendencies`)
      .set('x-user-id', 'USR-1')
      .send({ type: 'missing_invoice' })
      .expect(201);
    const id = pendency.body.id as string;

    const asBranch = await http().get(`/pendencies/${id}/actions`).set('x-user-id', 'USR-1').expect(200);
    expect(asBranch.body.actions).toEqual(['ATTACH_DOCUMENT', 'RESOLVE_WITH_COMMENT', 'REQUEST_EXCEPTION']);

    // Changing the profile changes what the same user may do.
    await http().put('/users/USR-1/profile').send({ profileId: PROFILE.scheduling }).expect(200);
    const asScheduling = await http().get(`/pendencies/${id}/actions`).set('x-user-id', 'USR-1').expect(200);
    expect(asScheduling.body.actions).toEqual([]);

    const attached = await http()
      .post(`/pendencies/${id}/attach-document`)
      .set('x-user-id', 'USR-1')
      .send({ documentId: 'DOC-1' })
      .expect(403);
    expect(attached.body.reason.failed).toEqual(['role:branch']);
  });

  it('rejects unknown users', async () => {
    await http().post('/events').set('x-user-id', 'USR-404').send({ type: 'ad_hoc' }).expect(401);
  });
});
