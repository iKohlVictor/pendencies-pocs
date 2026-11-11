import type { ReleaseStatus } from './event-release.machine.js';

/** Derived, never stored: it is always a function of the event's pendencies. */
export type PendenciesStatus = 'ok' | 'pending';

export interface PendenciesSummary {
  status: PendenciesStatus;
  total: number;
  resolved: number;
}

/** OK when every pendency is resolved. An event with no pendencies is OK. */
export function summarizePendencies(resolvedFlags: readonly boolean[]): PendenciesSummary {
  const resolved = resolvedFlags.filter(Boolean).length;
  return {
    status: resolved === resolvedFlags.length ? 'ok' : 'pending',
    total: resolvedFlags.length,
    resolved,
  };
}

/**
 * Completed = scheduled AND all pendencies resolved. Scheduling already requires
 * resolved pendencies, but a pendency opened afterwards makes it incomplete again.
 */
export function isEventCompleted(release: ReleaseStatus, pendencies: PendenciesStatus): boolean {
  return release === 'scheduled' && pendencies === 'ok';
}
