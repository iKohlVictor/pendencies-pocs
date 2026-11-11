import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';

const as = (id: string, role: string) => ({ 'x-user-id': id, 'x-user-roles': role });
const BRANCH = as('ana', 'branch');
const SCHEDULING = as('paula', 'payment_scheduling');
const DOCUMENTATION = as('diego', 'documentation_analysis');

describe('Events API (e2e)', () => {
  let app: INestApplication<App>;
  const http = () => request(app.getHttpServer());

  const openEvent = async () => {
    const res = await http().post('/events').set(SCHEDULING).send({ name: 'Resolve documentation' }).expect(201);
    return res.body.id as string;
  };

  const openPendency = async (eventId: string, title: string) => {
    const res = await http().post(`/events/${eventId}/pendencies`).set(DOCUMENTATION).send({ title }).expect(201);
    return res.body.id as string;
  };

  /** Branch attaches a document and documentation approves. */
  const resolvePendency = async (id: string) => {
    await http().post(`/pendencies/${id}/attach-document`).set(BRANCH).send({ documentId: 'DOC-1' }).expect(200);
    await http().post(`/pendencies/${id}/approve`).set(DOCUMENTATION).expect(200);
  };

  const schedule = async (eventId: string) => {
    await http().post(`/events/${eventId}/start-analysis`).set(SCHEDULING).expect(200);
    return http().post(`/events/${eventId}/schedule`).set(SCHEDULING).expect(200);
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('is born not scheduled, with pendencies OK while it has none', async () => {
    const res = await http().post('/events').set(SCHEDULING).send({ name: 'Resolve documentation' }).expect(201);
    expect(res.body).toMatchObject({
      id: 'EVT-1',
      name: 'Resolve documentation',
      releaseStatus: 'not_scheduled',
      pendencies: { status: 'ok', total: 0, resolved: 0 },
      completed: false,
    });
  });

  it('groups its pendencies and derives the pendencies status from them', async () => {
    const eventId = await openEvent();
    const first = await openPendency(eventId, 'Missing invoice');
    await openPendency(eventId, 'Unsigned contract');

    const list = await http().get(`/events/${eventId}/pendencies`).expect(200);
    expect(list.body.map((p: { title: string }) => p.title)).toEqual(['Missing invoice', 'Unsigned contract']);

    let event = await http().get(`/events/${eventId}`).expect(200);
    expect(event.body.pendencies).toEqual({ status: 'pending', total: 2, resolved: 0 });

    await resolvePendency(first);
    event = await http().get(`/events/${eventId}`).expect(200);
    expect(event.body.pendencies).toEqual({ status: 'pending', total: 2, resolved: 1 });
  });

  it('pendencies of another event do not count', async () => {
    const a = await openEvent();
    const b = await openEvent();
    await openPendency(b, 'Missing invoice');

    expect((await http().get(`/events/${a}`)).body.pendencies.status).toBe('ok');
    expect((await http().get(`/events/${b}`)).body.pendencies.status).toBe('pending');
  });

  it('release workflow: analysis, return, analysis again, schedule', async () => {
    const eventId = await openEvent();

    const analysing = await http().post(`/events/${eventId}/start-analysis`).set(SCHEDULING).expect(200);
    expect(analysing.body.releaseStatus).toBe('in_analysis');

    const returned = await http().post(`/events/${eventId}/return`).set(SCHEDULING).send({ reason: 'bank file pending' }).expect(200);
    expect(returned.body.releaseStatus).toBe('not_scheduled');

    const scheduled = await schedule(eventId);
    expect(scheduled.body.releaseStatus).toBe('scheduled');
    expect(scheduled.body.history.map((h: { action: string }) => h.action)).toEqual([
      'OPEN',
      'START_ANALYSIS',
      'RETURN',
      'START_ANALYSIS',
      'SCHEDULE',
    ]);
  });

  it('only payment scheduling moves the release', async () => {
    const eventId = await openEvent();

    const denied = await http().post(`/events/${eventId}/start-analysis`).set(BRANCH).expect(403);
    expect(denied.body.reason).toMatchObject({ code: 'FORBIDDEN', failed: ['role:payment_scheduling'] });

    expect((await http().get(`/events/${eventId}/actions`).set(BRANCH)).body.actions).toEqual([]);
    expect((await http().get(`/events/${eventId}/actions`).set(SCHEDULING)).body.actions).toEqual(['START_ANALYSIS']);
  });

  it('cannot schedule without analysis, and scheduled is final', async () => {
    const eventId = await openEvent();

    const skipped = await http().post(`/events/${eventId}/schedule`).set(SCHEDULING).expect(409);
    expect(skipped.body.reason.code).toBe('INVALID_EVENT');

    await schedule(eventId);
    const again = await http().post(`/events/${eventId}/return`).set(SCHEDULING).expect(409);
    expect(again.body.reason.code).toBe('FINAL_STATE');
  });

  it('cannot schedule while a pendency is open; resolving it unlocks scheduling and completes the event', async () => {
    const eventId = await openEvent();
    const pendencyId = await openPendency(eventId, 'Missing invoice');

    // analysis does not depend on pendencies
    await http().post(`/events/${eventId}/start-analysis`).set(SCHEDULING).expect(200);

    const blocked = await http().post(`/events/${eventId}/schedule`).set(SCHEDULING).expect(422);
    expect(blocked.body.reason).toEqual({
      code: 'GUARD_FAILED',
      state: 'in_analysis',
      event: 'SCHEDULE',
      failed: ['pendencies-resolved'],
    });
    expect((await http().get(`/events/${eventId}/actions`).set(SCHEDULING)).body.actions).toEqual(['RETURN']);

    await resolvePendency(pendencyId);
    expect((await http().get(`/events/${eventId}/actions`).set(SCHEDULING)).body.actions).toEqual(['RETURN', 'SCHEDULE']);

    const done = await http().post(`/events/${eventId}/schedule`).set(SCHEDULING).expect(200);
    expect(done.body).toMatchObject({ releaseStatus: 'scheduled', pendencies: { status: 'ok' }, completed: true });
  });

  it('a pendency opened after scheduling makes the event incomplete again', async () => {
    const eventId = await openEvent();
    await schedule(eventId);
    await openPendency(eventId, 'Unsigned contract');

    const res = await http().get(`/events/${eventId}`).expect(200);
    expect(res.body).toMatchObject({ releaseStatus: 'scheduled', pendencies: { status: 'pending' }, completed: false });
  });

  it('all pendencies resolved but not scheduled is NOT completed', async () => {
    const eventId = await openEvent();
    await resolvePendency(await openPendency(eventId, 'Missing invoice'));

    const res = await http().get(`/events/${eventId}`).expect(200);
    expect(res.body).toMatchObject({ releaseStatus: 'not_scheduled', pendencies: { status: 'ok' }, completed: false });
  });

  it('404 for unknown events, including when opening a pendency', async () => {
    await http().get('/events/EVT-999').expect(404);
    await http().post('/events/EVT-999/pendencies').set(DOCUMENTATION).send({ title: 'x' }).expect(404);
  });

  it('requires a name', async () => {
    const res = await http().post('/events').set(SCHEDULING).send({}).expect(422);
    expect(res.body.field).toBe('name');
  });
});
