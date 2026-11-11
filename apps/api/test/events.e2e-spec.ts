import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { seedUsers, type Identity } from './support/users.js';

let BRANCH: Identity;
let SCHEDULING: Identity;
let DOCUMENTATION: Identity;

describe('Events API (e2e)', () => {
  let app: INestApplication<App>;
  const http = () => request(app.getHttpServer());

  /** `ad_hoc` creates no pendencies, which keeps the release tests focused. */
  const openEvent = async (type = 'ad_hoc') => {
    const res = await http().post('/events').set(SCHEDULING).send({ type }).expect(201);
    return res.body.id as string;
  };

  const openPendency = async (eventId: string, type: string) => {
    const res = await http().post(`/events/${eventId}/pendencies`).set(DOCUMENTATION).send({ type }).expect(201);
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
    ({ BRANCH, SCHEDULING, DOCUMENTATION } = await seedUsers(app));
  });

  afterEach(async () => {
    await app.close();
  });

  it('creating a typed event names it and creates the pendencies of its type', async () => {
    const res = await http().post('/events').set(SCHEDULING).send({ type: 'resolve_documentation' }).expect(201);
    expect(res.body).toMatchObject({
      id: 'EVT-1',
      type: 'resolve_documentation',
      name: 'Resolve documentation',
      releaseStatus: 'not_scheduled',
      pendencies: { status: 'pending', total: 2, resolved: 0 },
      completed: false,
    });

    const pendencies = await http().get('/events/EVT-1/pendencies').expect(200);
    expect(pendencies.body.map((p: Record<string, string>) => [p.id, p.type, p.title, p.flow, p.status])).toEqual([
      ['PEND-1', 'missing_invoice', 'Missing invoice', 'standard', 'pending_branch'],
      ['PEND-2', 'unsigned_contract', 'Unsigned contract', 'standard', 'pending_branch'],
    ]);
  });

  it('each event type brings its own pendencies and flows', async () => {
    const eventId = await openEvent('supplier_onboarding');
    const pendencies = await http().get(`/events/${eventId}/pendencies`).expect(200);
    expect(pendencies.body.map((p: Record<string, string>) => [p.type, p.flow])).toEqual([
      ['registration_update', 'direct'],
      ['unsigned_contract', 'standard'],
    ]);
  });

  it('a typed event completes once its predefined pendencies are resolved and it is scheduled', async () => {
    const eventId = await openEvent('resolve_documentation');
    await http().post(`/events/${eventId}/start-analysis`).set(SCHEDULING).expect(200);

    await resolvePendency('PEND-1');
    await http().post(`/events/${eventId}/schedule`).set(SCHEDULING).expect(422); // PEND-2 still open

    await resolvePendency('PEND-2');
    const done = await http().post(`/events/${eventId}/schedule`).set(SCHEDULING).expect(200);
    expect(done.body).toMatchObject({ pendencies: { status: 'ok', total: 2, resolved: 2 }, completed: true });
  });

  it('accepts a custom name and extra pendencies added by hand', async () => {
    const res = await http().post('/events').set(SCHEDULING).send({ type: 'ad_hoc', name: 'March closing' }).expect(201);
    expect(res.body).toMatchObject({ type: 'ad_hoc', name: 'March closing', pendencies: { total: 0 } });

    const extra = await http()
      .post(`/events/${res.body.id}/pendencies`)
      .set(DOCUMENTATION)
      .send({ type: 'missing_invoice', title: 'Invoice 4411 missing' })
      .expect(201);
    expect(extra.body).toMatchObject({ type: 'missing_invoice', title: 'Invoice 4411 missing' });
  });

  it('rejects unknown types', async () => {
    const event = await http().post('/events').set(SCHEDULING).send({ type: 'nope' }).expect(422);
    expect(event.body).toMatchObject({ error: 'InvalidValueError', field: 'type' });
    expect(event.body.allowed).toEqual(['resolve_documentation', 'supplier_onboarding', 'ad_hoc']);

    await http().post('/events').set(SCHEDULING).send({}).expect(422);

    const eventId = await openEvent();
    const pendency = await http().post(`/events/${eventId}/pendencies`).set(DOCUMENTATION).send({ type: 'nope' }).expect(422);
    expect(pendency.body.allowed).toEqual(['missing_invoice', 'unsigned_contract', 'registration_update']);
  });

  it('exposes the catalog of event types', async () => {
    const res = await http().get('/event-types').expect(200);
    expect(res.body).toContainEqual({
      id: 'resolve_documentation',
      name: 'Resolve documentation',
      pendencyTypes: ['missing_invoice', 'unsigned_contract'],
    });
  });

  it('an ad hoc event is born not scheduled, with pendencies OK while it has none', async () => {
    const res = await http().post('/events').set(SCHEDULING).send({ type: 'ad_hoc' }).expect(201);
    expect(res.body).toMatchObject({
      id: 'EVT-1',
      name: 'Ad hoc event',
      releaseStatus: 'not_scheduled',
      pendencies: { status: 'ok', total: 0, resolved: 0 },
      completed: false,
    });
  });

  it('groups its pendencies and derives the pendencies status from them', async () => {
    const eventId = await openEvent();
    const first = await openPendency(eventId, 'missing_invoice');
    await openPendency(eventId, 'unsigned_contract');

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
    await openPendency(b, 'missing_invoice');

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
    const pendencyId = await openPendency(eventId, 'missing_invoice');

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
    await openPendency(eventId, 'unsigned_contract');

    const res = await http().get(`/events/${eventId}`).expect(200);
    expect(res.body).toMatchObject({ releaseStatus: 'scheduled', pendencies: { status: 'pending' }, completed: false });
  });

  it('all pendencies resolved but not scheduled is NOT completed', async () => {
    const eventId = await openEvent();
    await resolvePendency(await openPendency(eventId, 'missing_invoice'));

    const res = await http().get(`/events/${eventId}`).expect(200);
    expect(res.body).toMatchObject({ releaseStatus: 'not_scheduled', pendencies: { status: 'ok' }, completed: false });
  });

  it('404 for unknown events, including when opening a pendency', async () => {
    await http().get('/events/EVT-999').expect(404);
    await http().post('/events/EVT-999/pendencies').set(DOCUMENTATION).send({ type: 'missing_invoice' }).expect(404);
  });

});
