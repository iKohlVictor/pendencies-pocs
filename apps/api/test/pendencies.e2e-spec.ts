import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { seedUsers, type Identity } from './support/users.js';

let BRANCH: Identity;
let SCHEDULING: Identity;
let DOCUMENTATION: Identity;

describe('Pendencies API (e2e)', () => {
  let app: INestApplication<App>;
  const http = () => request(app.getHttpServer());

  /** Pendencies live inside an event, so every test starts by creating one. */
  const open = async (type = 'missing_invoice', extra: Record<string, string> = {}) => {
    const event = await http().post('/events').set(DOCUMENTATION).send({ type: 'ad_hoc' }).expect(201);
    const res = await http()
      .post(`/events/${event.body.id}/pendencies`)
      .set(DOCUMENTATION)
      .send({ type, ...extra })
      .expect(201);
    return res.body.id as string;
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

  it('opens a pendency, pending with the branch', async () => {
    const id = await open();
    const res = await http().get(`/pendencies/${id}`).expect(200);
    expect(res.body).toMatchObject({
      id: 'PEND-1',
      eventId: 'EVT-1',
      type: 'missing_invoice',
      flow: 'standard',
      flowVersion: 1,
      title: 'Missing invoice',
      status: 'pending_branch',
      statusLabel: 'Pendente com a filial',
      resolved: false,
      documents: [],
      version: 1,
    });
  });

  it('requires an identity', async () => {
    await http().post('/events').send({ type: 'ad_hoc' }).expect(401);
  });

  it('happy path: branch attaches, documentation approves', async () => {
    const id = await open();

    const attached = await http().post(`/pendencies/${id}/attach-document`).set(BRANCH).send({ documentId: 'DOC-1' }).expect(200);
    expect(attached.body).toMatchObject({ status: 'in_documentation_review', documents: ['DOC-1'] });

    const approved = await http().post(`/pendencies/${id}/approve`).set(DOCUMENTATION).expect(200);
    expect(approved.body.status).toBe('completed');
  });

  it('exception path: payment scheduling first, then documentation', async () => {
    const id = await open();

    const requested = await http()
      .post(`/pendencies/${id}/request-exception`)
      .set(BRANCH)
      .send({ justification: 'supplier deadline' })
      .expect(200);
    expect(requested.body.status).toBe('in_payment_scheduling_review');

    // documentation cannot jump the queue
    const denied = await http().post(`/pendencies/${id}/approve`).set(DOCUMENTATION).expect(403);
    expect(denied.body.reason).toEqual({
      code: 'FORBIDDEN',
      state: 'in_payment_scheduling_review',
      event: 'APPROVE',
      failed: ['role:payment_scheduling'],
    });

    await http().post(`/pendencies/${id}/approve`).set(SCHEDULING).expect(200);
    const done = await http().post(`/pendencies/${id}/approve`).set(DOCUMENTATION).expect(200);
    expect(done.body.status).toBe('completed');
  });

  it('rejection needs a reason and sends it back to the branch', async () => {
    const id = await open();
    await http().post(`/pendencies/${id}/resolve`).set(BRANCH).send({ comment: 'already settled' }).expect(200);

    const missing = await http().post(`/pendencies/${id}/reject`).set(DOCUMENTATION).send({}).expect(422);
    expect(missing.body).toMatchObject({ error: 'MissingFieldError', field: 'reason' });

    const rejected = await http().post(`/pendencies/${id}/reject`).set(DOCUMENTATION).send({ reason: 'proof is missing' }).expect(200);
    expect(rejected.body).toMatchObject({ status: 'pending_branch', rejectionReason: 'proof is missing' });

    const inbox = await http().get('/notifications').query({ role: 'branch' }).expect(200);
    expect(inbox.body).toHaveLength(1);
    expect(inbox.body[0].message).toContain('Reason: proof is missing');
  });

  it('lists the actions available to each profile', async () => {
    const id = await open();

    const forBranch = await http().get(`/pendencies/${id}/actions`).set(BRANCH).expect(200);
    expect(forBranch.body.actions).toEqual(['ATTACH_DOCUMENT', 'RESOLVE_WITH_COMMENT', 'REQUEST_EXCEPTION']);

    const forDocs = await http().get(`/pendencies/${id}/actions`).set(DOCUMENTATION).expect(200);
    expect(forDocs.body.actions).toEqual([]);
  });

  it('maps workflow errors to HTTP', async () => {
    const id = await open();

    // action that does not exist in the current state
    const invalid = await http().post(`/pendencies/${id}/approve`).set(DOCUMENTATION).expect(409);
    expect(invalid.body.reason.code).toBe('INVALID_EVENT');

    await http().post(`/pendencies/${id}/attach-document`).set(BRANCH).send({ documentId: 'DOC-1' }).expect(200);
    await http().post(`/pendencies/${id}/approve`).set(DOCUMENTATION).expect(200);

    // workflow already finished
    const final = await http().post(`/pendencies/${id}/reject`).set(DOCUMENTATION).send({ reason: 'x' }).expect(409);
    expect(final.body.reason.code).toBe('FINAL_STATE');

    await http().get('/pendencies/PEND-999').expect(404);
  });

  it('a direct-flow type has no exception path', async () => {
    const id = await open('registration_update');

    const actions = await http().get(`/pendencies/${id}/actions`).set(BRANCH).expect(200);
    expect(actions.body.actions).toEqual(['ATTACH_DOCUMENT', 'RESOLVE_WITH_COMMENT']);

    const denied = await http()
      .post(`/pendencies/${id}/request-exception`)
      .set(BRANCH)
      .send({ justification: 'supplier deadline' })
      .expect(409);
    expect(denied.body.reason.code).toBe('INVALID_EVENT');

    await http().post(`/pendencies/${id}/resolve`).set(BRANCH).send({ comment: 'updated' }).expect(200);
    const done = await http().post(`/pendencies/${id}/approve`).set(DOCUMENTATION).expect(200);
    expect(done.body.status).toBe('completed');
  });

  it('exposes the catalog of pendency types', async () => {
    const res = await http().get('/pendency-types').expect(200);
    expect(res.body).toEqual([
      { id: 'missing_invoice', name: 'Missing invoice', flowId: 'standard', pinnedVersion: null, effectiveVersion: 1 },
      { id: 'unsigned_contract', name: 'Unsigned contract', flowId: 'standard', pinnedVersion: null, effectiveVersion: 1 },
      { id: 'registration_update', name: 'Registration update', flowId: 'direct', pinnedVersion: null, effectiveVersion: 1 },
      { id: 'payment', name: 'Payment', flowId: 'payment', pinnedVersion: null, effectiveVersion: 1 },
    ]);
  });

  it('keeps the full history', async () => {
    const id = await open();
    await http().post(`/pendencies/${id}/request-exception`).set(BRANCH).send({ justification: 'supplier deadline' });
    await http().post(`/pendencies/${id}/reject`).set(SCHEDULING).send({ reason: 'no budget' });

    const res = await http().get(`/pendencies/${id}`).expect(200);
    expect(res.body.history.map((h: { action: string }) => h.action)).toEqual(['OPEN', 'REQUEST_EXCEPTION', 'REJECT']);
    expect(res.body.version).toBe(3);
  });

  describe('payment pendency', () => {
    const dueIn = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

    it('refuses to open without a due date', async () => {
      const event = await http().post('/events').set(DOCUMENTATION).send({ type: 'ad_hoc' }).expect(201);
      const res = await http().post(`/events/${event.body.id}/pendencies`).set(DOCUMENTATION).send({ type: 'payment' }).expect(422);
      expect(res.body.field).toBe('paymentDueAt');
    });

    it('due in more than 48h: completed by documentation analysis', async () => {
      const paymentDueAt = dueIn(72);
      const id = await open('payment', { paymentDueAt });
      await http().post(`/pendencies/${id}/attach-document`).set(BRANCH).send({ documentId: 'DOC-1' }).expect(200);

      const approved = await http().post(`/pendencies/${id}/approve`).set(DOCUMENTATION).expect(200);
      expect(approved.body).toMatchObject({ flow: 'payment', paymentDueAt, status: 'completed' });
    });

    it('due within 48h: documentation analysis, then payment scheduling', async () => {
      const id = await open('payment', { paymentDueAt: dueIn(10) });
      await http().post(`/pendencies/${id}/attach-document`).set(BRANCH).send({ documentId: 'DOC-1' }).expect(200);

      const first = await http().post(`/pendencies/${id}/approve`).set(DOCUMENTATION).expect(200);
      expect(first.body.status).toBe('in_payment_scheduling_review');
      await http().post(`/pendencies/${id}/approve`).set(DOCUMENTATION).expect(403);

      const notified = await http().get('/notifications?role=payment_scheduling').expect(200);
      expect(notified.body.map((n: { pendencyId: string }) => n.pendencyId)).toContain(id);

      const done = await http().post(`/pendencies/${id}/approve`).set(SCHEDULING).expect(200);
      expect(done.body.status).toBe('completed');
    });
  });
});
