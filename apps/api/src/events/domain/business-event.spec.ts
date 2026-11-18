import type { Actor } from 'machine-flow';
import { ActionDeniedError } from '../../shared/domain/domain-error.js';
import { ROLE } from '../../shared/domain/roles.js';
import { BusinessEvent } from './business-event.js';
import { isEventCompleted, summarizePendencies } from './event-completion.js';

const scheduling: Actor = { id: 'paula', roles: [ROLE.paymentScheduling] };
const branch: Actor = { id: 'ana', roles: [ROLE.branch] };

const open = () => BusinessEvent.open('EVT-1', 'resolve_documentation', scheduling);

const denial = (fn: () => void) => {
  try {
    fn();
  } catch (error) {
    if (error instanceof ActionDeniedError) return error.reason;
    throw error;
  }
  throw new Error('expected the action to be denied');
};

describe('BusinessEvent payment due date', () => {
  it('is optional, validated and normalized to UTC', () => {
    expect(open().toSnapshot()).not.toHaveProperty('paymentDueAt');
    const event = BusinessEvent.open('EVT-1', 'ad_hoc', scheduling, undefined, '2026-11-20T10:00:00-03:00');
    expect(event.paymentDueAt).toBe('2026-11-20T13:00:00.000Z');
    expect(() => BusinessEvent.open('EVT-1', 'ad_hoc', scheduling, undefined, 'soon')).toThrow('paymentDueAt');
  });
});

describe('BusinessEvent release workflow', () => {
  it('is born not scheduled, named after its type', () => {
    expect(open().toSnapshot()).toMatchObject({
      releaseStatus: 'not_scheduled',
      type: 'resolve_documentation',
      name: 'Resolve documentation',
    });
    expect(BusinessEvent.open('EVT-2', 'ad_hoc', scheduling, 'March closing').toSnapshot().name).toBe('March closing');
  });

  it('payment scheduling analyses and schedules when pendencies are resolved', () => {
    const event = open();
    event.startAnalysis(scheduling, 'ok');
    expect(event.releaseStatus).toBe('in_analysis');
    event.schedule(scheduling, 'ok');
    expect(event.releaseStatus).toBe('scheduled');
  });

  it('cannot be scheduled while a pendency is open', () => {
    const event = open();
    event.startAnalysis(scheduling, 'pending'); // analysis itself does not depend on pendencies

    expect(denial(() => event.schedule(scheduling, 'pending'))).toEqual({
      code: 'GUARD_FAILED',
      state: 'in_analysis',
      event: 'SCHEDULE',
      failed: ['pendencies-resolved'],
    });
    expect(event.releaseStatus).toBe('in_analysis');

    event.schedule(scheduling, 'ok'); // once they are resolved it goes through
    expect(event.releaseStatus).toBe('scheduled');
  });

  it('only offers SCHEDULE when pendencies are resolved', () => {
    const event = open();
    event.startAnalysis(scheduling, 'pending');
    expect(event.availableActions(scheduling, 'pending')).toEqual(['RETURN']);
    expect(event.availableActions(scheduling, 'ok')).toEqual(['RETURN', 'SCHEDULE']);
  });

  it('payment scheduling can return it to not scheduled and start again', () => {
    const event = open();
    event.startAnalysis(scheduling, 'pending');
    event.returnToNotScheduled(scheduling, 'pending', 'waiting for the bank file');
    expect(event.releaseStatus).toBe('not_scheduled');
    expect(event.toSnapshot().history.at(-1)).toMatchObject({ action: 'RETURN', detail: 'waiting for the bank file' });

    event.startAnalysis(scheduling, 'pending');
    expect(event.releaseStatus).toBe('in_analysis');
  });

  it('only payment scheduling acts on it', () => {
    const event = open();
    expect(denial(() => event.startAnalysis(branch, 'ok')).code).toBe('FORBIDDEN');
    expect(event.availableActions(branch, 'ok')).toEqual([]);
    expect(event.availableActions(scheduling, 'ok')).toEqual(['START_ANALYSIS']);
  });

  it('cannot skip the analysis, and scheduled is final', () => {
    const event = open();
    expect(denial(() => event.schedule(scheduling, 'ok')).code).toBe('INVALID_EVENT');

    event.startAnalysis(scheduling, 'ok');
    event.schedule(scheduling, 'ok');
    expect(denial(() => event.returnToNotScheduled(scheduling, 'ok')).code).toBe('FINAL_STATE');
    expect(event.availableActions(scheduling, 'ok')).toEqual([]);
  });
});

describe('event completion', () => {
  it('pendencies are OK only when all are resolved (an empty event is OK)', () => {
    expect(summarizePendencies([])).toEqual({ status: 'ok', total: 0, resolved: 0 });
    expect(summarizePendencies([true, true])).toEqual({ status: 'ok', total: 2, resolved: 2 });
    expect(summarizePendencies([true, false])).toEqual({ status: 'pending', total: 2, resolved: 1 });
  });

  it('completed = scheduled AND pendencies OK', () => {
    expect(isEventCompleted('scheduled', 'ok')).toBe(true);
    expect(isEventCompleted('scheduled', 'pending')).toBe(false); // pendency opened after scheduling
    expect(isEventCompleted('in_analysis', 'ok')).toBe(false);
    expect(isEventCompleted('not_scheduled', 'ok')).toBe(false);
  });
});
