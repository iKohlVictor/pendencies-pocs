import type { Actor } from 'machine-flow';
import { Pendency } from './pendency.js';
import { ActionDeniedError, MissingFieldError } from '../../shared/domain/domain-error.js';
import { ROLE } from '../../shared/domain/roles.js';
import { compileFlow } from '../../flows/domain/compile-flow.js';
import { DIRECT_FLOW, PAYMENT_FLOW, STANDARD_FLOW } from '../../flows/domain/seeds.js';

const standard = compileFlow('standard', 1, STANDARD_FLOW);
const direct = compileFlow('direct', 1, DIRECT_FLOW);
const payment = compileFlow('payment', 1, PAYMENT_FLOW);

const branch: Actor = { id: 'ana', roles: [ROLE.branch] };
const scheduling: Actor = { id: 'paula', roles: [ROLE.paymentScheduling] };
const documentation: Actor = { id: 'diego', roles: [ROLE.documentationAnalysis] };

const open = () => Pendency.open('PEND-1', 'EVT-1', 'missing_invoice', documentation, standard);

describe('Pendency', () => {
  it('is born pending with the branch, named after its type', () => {
    expect(open().toSnapshot()).toMatchObject({
      status: 'pending_branch',
      type: 'missing_invoice',
      flow: 'standard',
      flowVersion: 1,
      resolved: false,
      title: 'Missing invoice',
    });
  });

  it('keeps running on the version it was opened on', () => {
    const p = open();
    const v2 = compileFlow('standard', 2, DIRECT_FLOW);
    expect(() => Pendency.restore(p.toSnapshot(), v2)).toThrow('standard@v1');
    const restored = Pendency.restore(p.toSnapshot(), standard);
    expect(restored.availableActions(branch)).toContain('REQUEST_EXCEPTION');
  });

  it('is resolved once it reaches a final state', () => {
    const p = open();
    p.attachDocument(branch, 'DOC-1');
    p.approve(documentation);
    expect(p.toSnapshot().resolved).toBe(true);
    expect(p.statusLabel).toBe('Concluída');
  });

  it('accepts a custom title', () => {
    const p = Pendency.open('PEND-1', 'EVT-1', 'missing_invoice', documentation, standard, 'Invoice 4411 missing');
    expect(p.toSnapshot().title).toBe('Invoice 4411 missing');
  });

  it('a direct-flow type has no exception path', () => {
    const p = Pendency.open('PEND-1', 'EVT-1', 'registration_update', documentation, direct);
    expect(p.toSnapshot().flow).toBe('direct');
    expect(p.availableActions(branch)).toEqual(['ATTACH_DOCUMENT', 'RESOLVE_WITH_COMMENT']);

    try {
      p.requestException(branch, 'supplier deadline');
      throw new Error('expected a denial');
    } catch (error) {
      expect(error).toBeInstanceOf(ActionDeniedError);
      expect((error as ActionDeniedError).reason.code).toBe('INVALID_EVENT');
    }

    p.resolveWithComment(branch, 'updated in the registry');
    p.approve(documentation);
    expect(p.status).toBe('completed');
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

  describe('payment flow', () => {
    const HOUR = 60 * 60 * 1000;
    const dueIn = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString();
    const openPayment = (paymentDueAt?: string) =>
      Pendency.open('PEND-1', 'EVT-1', 'payment', documentation, payment, undefined, paymentDueAt);

    it('requires a valid due date', () => {
      expect(() => openPayment()).toThrow(MissingFieldError);
      expect(() => openPayment('tomorrow-ish')).toThrow('paymentDueAt');
      expect(openPayment(dueIn(72)).toSnapshot()).toMatchObject({ flow: 'payment', title: 'Payment' });
    });

    it('due in more than 48h: documentation analysis alone approves', () => {
      const p = openPayment(dueIn(72));
      expect(p.availableActions(branch)).toEqual(['ATTACH_DOCUMENT', 'RESOLVE_WITH_COMMENT']);
      p.attachDocument(branch, 'DOC-1');

      expect(p.approve(documentation)).toEqual([]);
      expect(p.status).toBe('completed');
    });

    it('due within 48h: documentation analysis, then payment scheduling', () => {
      const p = openPayment(dueIn(24));
      p.attachDocument(branch, 'DOC-1');
      expect(() => p.approve(scheduling)).toThrow(ActionDeniedError); // analysis goes first

      expect(p.approve(documentation)).toEqual([{ type: 'notify', role: ROLE.paymentScheduling }]);
      expect(p.status).toBe('in_payment_scheduling_review');
      expect(p.availableActions(documentation)).toEqual([]);

      p.approve(scheduling);
      expect(p.status).toBe('completed');
    });

    it('overdue counts as within 48h', () => {
      const p = openPayment(dueIn(-5));
      p.resolveWithComment(branch, 'paid late, receipt attached');
      p.approve(documentation);
      expect(p.status).toBe('in_payment_scheduling_review');
    });

    it('payment scheduling can send it back to the branch', () => {
      const p = openPayment(dueIn(1));
      p.attachDocument(branch, 'DOC-1');
      p.approve(documentation);
      expect(p.reject(scheduling, 'bank details missing')).toEqual([{ type: 'notify', role: ROLE.branch }]);
      expect(p.toSnapshot()).toMatchObject({ status: 'pending_branch', rejectionReason: 'bank details missing' });
    });

    it('other types carry no due date', () => {
      expect(Pendency.open('PEND-1', 'EVT-1', 'missing_invoice', documentation, standard, undefined, dueIn(1)).toSnapshot())
        .not.toHaveProperty('paymentDueAt');
    });
  });
});
