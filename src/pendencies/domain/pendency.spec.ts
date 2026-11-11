import type { Actor } from 'machine-flow';
import { Pendency } from './pendency.js';
import { ActionDeniedError, MissingFieldError } from '../../shared/domain/domain-error.js';
import { ROLE } from '../../shared/domain/roles.js';

const branch: Actor = { id: 'ana', roles: [ROLE.branch] };
const scheduling: Actor = { id: 'paula', roles: [ROLE.paymentScheduling] };
const documentation: Actor = { id: 'diego', roles: [ROLE.documentationAnalysis] };

const open = () => Pendency.open('PEND-1', 'EVT-1', 'Missing invoice', documentation);

describe('Pendency', () => {
  it('is born pending with the branch', () => {
    expect(open().status).toBe('pending_branch');
  });

  it('attach or resolve goes straight to documentation review', () => {
    const a = open();
    a.attachDocument(branch, 'DOC-1');
    expect(a.status).toBe('in_documentation_review');
    expect(a.toSnapshot().documents).toEqual(['DOC-1']);

    const b = open();
    b.resolveWithComment(branch, 'already settled');
    expect(b.status).toBe('in_documentation_review');
  });

  it('an exception goes through payment scheduling, then documentation', () => {
    const p = open();
    expect(p.requestException(branch, 'supplier deadline')).toEqual([{ type: 'notify', role: ROLE.paymentScheduling }]);
    expect(p.status).toBe('in_payment_scheduling_review');

    expect(() => p.approve(documentation)).toThrow(ActionDeniedError); // not their turn yet

    p.approve(scheduling);
    expect(p.status).toBe('in_documentation_review');
    p.approve(documentation);
    expect(p.status).toBe('completed');
  });

  it('a rejection returns to the branch with the reason, cleared when the branch acts again', () => {
    const p = open();
    p.attachDocument(branch, 'DOC-1');
    p.reject(documentation, 'unreadable scan');
    expect(p.status).toBe('pending_branch');
    expect(p.toSnapshot().rejectionReason).toBe('unreadable scan');

    p.attachDocument(branch, 'DOC-2');
    expect(p.toSnapshot().rejectionReason).toBeUndefined();
  });

  it('refuses without mutating anything', () => {
    const p = open();
    p.attachDocument(branch, 'DOC-1');
    const before = p.toSnapshot();

    expect(() => p.reject(documentation, '  ')).toThrow(MissingFieldError);
    expect(() => p.approve(branch)).toThrow(ActionDeniedError);
    expect(p.toSnapshot()).toEqual(before);
  });

  it('tells each actor what they can do right now', () => {
    const p = open();
    expect(p.availableActions(branch)).toEqual(['ATTACH_DOCUMENT', 'RESOLVE_WITH_COMMENT', 'REQUEST_EXCEPTION']);
    expect(p.availableActions(documentation)).toEqual([]);

    p.requestException(branch, 'supplier deadline');
    expect(p.availableActions(scheduling)).toEqual(['APPROVE', 'REJECT']);
    expect(p.availableActions(documentation)).toEqual([]);
  });

  it('records every step in the history', () => {
    const p = open();
    p.requestException(branch, 'supplier deadline');
    p.reject(scheduling, 'no budget this month');
    expect(p.toSnapshot().history.map((h) => [h.action, h.from, h.to, h.actorId, h.detail])).toEqual([
      ['OPEN', null, 'pending_branch', 'diego', undefined],
      ['REQUEST_EXCEPTION', 'pending_branch', 'in_payment_scheduling_review', 'ana', 'supplier deadline'],
      ['REJECT', 'in_payment_scheduling_review', 'pending_branch', 'paula', 'no budget this month'],
    ]);
  });
});
