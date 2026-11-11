import { defineMachine, guard, hasRole } from 'machine-flow';
import type { Actor, EventsOf, StatesOf } from 'machine-flow';
import { ROLE } from '../../shared/domain/roles.js';
import type { PendenciesStatus } from './event-completion.js';

/**
 * Release workflow of an event (think "payment released"). Only payment
 * scheduling acts on it.
 *
 *   not_scheduled --start analysis--> in_analysis --schedule--> scheduled
 *         ^                                |
 *         +------------- return -----------+
 *
 * Analysis and pendency resolution can happen in any order, but SCHEDULE is
 * guarded: it only goes through once every pendency of the event is resolved.
 */

/** What the machine needs to know about the event to decide. Supplied by the caller. */
export interface ReleaseFacts {
  id: string;
  pendencies: PendenciesStatus;
}

const paymentScheduling = hasRole(ROLE.paymentScheduling);

const pendenciesResolved = guard<ReleaseFacts>('pendencies-resolved', ({ data }) => data.pendencies === 'ok');

export const eventReleaseMachine = defineMachine<ReleaseFacts, Actor>()({
  id: 'event-release',
  initial: 'not_scheduled',
  states: {
    not_scheduled: {
      on: { START_ANALYSIS: { to: 'in_analysis', policies: [paymentScheduling] } },
    },
    in_analysis: {
      on: {
        RETURN: { to: 'not_scheduled', policies: [paymentScheduling] },
        SCHEDULE: { to: 'scheduled', policies: [paymentScheduling], guards: [pendenciesResolved] },
      },
    },
    scheduled: { final: true },
  },
});

export type ReleaseStatus = StatesOf<typeof eventReleaseMachine>;
export type ReleaseAction = EventsOf<typeof eventReleaseMachine>;
