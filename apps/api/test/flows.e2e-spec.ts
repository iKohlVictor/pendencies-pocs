import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { STANDARD_FLOW } from '../src/flows/domain/seeds.js';
import { seedUsers, type Identity } from './support/users.js';

let BRANCH: Identity;
let DOCUMENTATION: Identity;

describe('Flows API (e2e)', () => {
  let app: INestApplication<App>;
  const http = () => request(app.getHttpServer());

  const open = async (type = 'missing_invoice') => {
    const event = await http().post('/events').set(DOCUMENTATION).send({ type: 'ad_hoc' }).expect(201);
    const res = await http().post(`/events/${event.body.id}/pendencies`).set(DOCUMENTATION).send({ type }).expect(201);
    return res.body as { id: string; flow: string; flowVersion: number };
  };

  /** standard v2: same as v1 without the exception path. */
  const publishStandardWithoutException = async () => {
    const draft = structuredClone(STANDARD_FLOW);
    draft.states.pending_branch!.transitions = draft.states.pending_branch!.transitions!.filter(
      (t) => !t.actions.includes('REQUEST_EXCEPTION'),
    );
    delete draft.states.in_payment_scheduling_review;
    await http().put('/flows/standard/draft').set(DOCUMENTATION).send({ definition: draft }).expect(200);
    const res = await http().post('/flows/standard/publish').set(DOCUMENTATION).expect(200);
    expect(res.body).toMatchObject({ version: 2 });
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ({ BRANCH, DOCUMENTATION } = await seedUsers(app));
  });

  afterEach(async () => {
    await app.close();
  });

  it('starts with the original flows published as v1', async () => {
    const res = await http().get('/flows').expect(200);
    expect(res.body.map((f: { id: string; latestVersion: number }) => [f.id, f.latestVersion])).toEqual([
      ['standard', 1],
      ['direct', 1],
      ['payment', 1],
    ]);
    const catalog = await http().get('/flow-catalog').expect(200);
    expect(catalog.body.actions).toHaveLength(5);
    expect(catalog.body.guards.map((g: { id: string }) => g.id)).toEqual(['payment-due-within-48h']);
  });

  it('a running pendency finishes on its version; new ones take the latest', async () => {
    const old = await open();
    expect(old).toMatchObject({ flow: 'standard', flowVersion: 1 });

    await publishStandardWithoutException();
    const fresh = await open();
    expect(fresh.flowVersion).toBe(2);

    await http()
      .post(`/pendencies/${old.id}/request-exception`)
      .set(BRANCH)
      .send({ justification: 'supplier deadline' })
      .expect(200);
    const denied = await http()
      .post(`/pendencies/${fresh.id}/request-exception`)
      .set(BRANCH)
      .send({ justification: 'supplier deadline' })
      .expect(409);
    expect(denied.body.reason.code).toBe('INVALID_EVENT');
  });

  it('a type pinned to a version keeps opening pendencies on it', async () => {
    await publishStandardWithoutException();
    const pinned = await http()
      .put('/pendency-types/missing_invoice/flow')
      .set(DOCUMENTATION)
      .send({ flowId: 'standard', version: 1 })
      .expect(200);
    expect(pinned.body).toMatchObject({ flowId: 'standard', pinnedVersion: 1, effectiveVersion: 1 });
    expect((await open()).flowVersion).toBe(1);

    await http().put('/pendency-types/missing_invoice/flow').set(DOCUMENTATION).send({ flowId: 'standard', version: null });
    expect((await open()).flowVersion).toBe(2);

    await http()
      .put('/pendency-types/missing_invoice/flow')
      .set(DOCUMENTATION)
      .send({ flowId: 'standard', version: 9 })
      .expect(404);
  });

  it('builds a new flow, publishes it and points a type at it', async () => {
    await http().post('/flows').set(DOCUMENTATION).send({ id: 'quick', name: 'Rápido' }).expect(201);
    await http().post('/flows').set(DOCUMENTATION).send({ id: 'quick' }).expect(409);
    // a flow with no published version cannot be used yet
    await http().put('/pendency-types/unsigned_contract/flow').set(DOCUMENTATION).send({ flowId: 'quick' }).expect(422);

    const definition = {
      initial: 'waiting',
      states: {
        waiting: {
          label: 'Aguardando filial',
          transitions: [
            { actions: ['RESOLVE_WITH_COMMENT'], to: 'closed', roles: ['branch'], notify: ['documentation_analysis'] },
          ],
        },
        closed: { label: 'Encerrada', final: true },
      },
    };
    await http().put('/flows/quick/draft').set(DOCUMENTATION).send({ definition }).expect(200);
    await http().post('/flows/quick/publish').set(DOCUMENTATION).expect(200);
    await http().put('/pendency-types/unsigned_contract/flow').set(DOCUMENTATION).send({ flowId: 'quick' }).expect(200);

    const p = await open('unsigned_contract');
    expect(p).toMatchObject({ flow: 'quick', flowVersion: 1, status: 'waiting', statusLabel: 'Aguardando filial' });
    const done = await http().post(`/pendencies/${p.id}/resolve`).set(BRANCH).send({ comment: 'ok' }).expect(200);
    expect(done.body).toMatchObject({ status: 'closed', resolved: true });
  });

  it('refuses to publish an invalid draft and reports every issue', async () => {
    await http().post('/flows').set(DOCUMENTATION).send({ id: 'broken' }).expect(201);
    const definition = { initial: 'a', states: { a: { label: 'A', transitions: [{ actions: ['APPROVE'], to: 'b', roles: [] }] } } };
    const check = await http().post('/flows/validate').send({ definition }).expect(200);
    expect(check.body.valid).toBe(false);

    await http().put('/flows/broken/draft').set(DOCUMENTATION).send({ definition }).expect(200);
    const res = await http().post('/flows/broken/publish').set(DOCUMENTATION).expect(422);
    expect(res.body.issues.length).toBeGreaterThan(1);
  });
});
