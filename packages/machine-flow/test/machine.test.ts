import { describe, expect, it } from 'vitest';
import {
  MachineDefinitionError,
  anyOf,
  availableEvents,
  can,
  defineMachine,
  guard,
  hasRole,
  policy,
  transition,
} from '../src';
import type { Actor } from '../src';
import { venda } from '../examples/venda';

const vendedor: Actor = { id: 'ana', roles: ['vendedor'] };
const gerente: Actor = { id: 'bruno', roles: ['gerente'] };
const diretor: Actor = { id: 'carla', roles: ['diretor'] };

const pedido = (total: number, itens = 1) => ({ id: 'P-1', total, itens });

describe('transition', () => {
  it('transitions and returns the effects', () => {
    const r = transition(venda, 'rascunho', 'ENVIAR', { actor: vendedor, data: pedido(500) });
    expect(r).toEqual({
      ok: true,
      from: 'rascunho',
      to: 'aguardando_gerente',
      event: 'ENVIAR',
      effects: [{ type: 'notificar', perfil: 'gerente', pedidoId: 'P-1' }],
    });
  });

  it('FORBIDDEN when the role is not allowed to act', () => {
    const r = transition(venda, 'aguardando_gerente', 'APROVAR', { actor: vendedor, data: pedido(500) });
    expect(r).toEqual({
      ok: false,
      error: { code: 'FORBIDDEN', state: 'aguardando_gerente', event: 'APROVAR', failed: ['role:gerente'] },
    });
  });

  it('GUARD_FAILED when the data does not allow it', () => {
    const r = transition(venda, 'rascunho', 'ENVIAR', { actor: vendedor, data: pedido(500, 0) });
    expect(r).toEqual({
      ok: false,
      error: { code: 'GUARD_FAILED', state: 'rascunho', event: 'ENVIAR', failed: ['tem-itens'] },
    });
  });

  it('INVALID_EVENT when the event does not exist in the state', () => {
    const r = transition(venda, 'rascunho', 'APROVAR', { actor: gerente, data: pedido(500) });
    expect(r).toEqual({ ok: false, error: { code: 'INVALID_EVENT', state: 'rascunho', event: 'APROVAR' } });
  });

  it('FINAL_STATE when the flow has already ended', () => {
    const r = transition(venda, 'aprovado', 'APROVAR', { actor: diretor, data: pedido(500) });
    expect(r).toEqual({ ok: false, error: { code: 'FINAL_STATE', state: 'aprovado', event: 'APROVAR' } });
  });

  it('UNKNOWN_STATE for a state that does not exist (e.g. dirty data in the database)', () => {
    const r = transition(venda, 'xpto', 'APROVAR', { actor: diretor, data: pedido(500) });
    expect(r).toEqual({ ok: false, error: { code: 'UNKNOWN_STATE', state: 'xpto' } });
  });

  it('does not mistake prototype keys for states or events', () => {
    const ctx = { actor: gerente, data: pedido(500) };
    expect(transition(venda, 'constructor', 'APROVAR', ctx)).toMatchObject({ error: { code: 'UNKNOWN_STATE' } });
    expect(transition(venda, 'rascunho', 'toString', ctx)).toMatchObject({ error: { code: 'INVALID_EVENT' } });
  });
});

describe('branching (approval limits)', () => {
  it('manager approves directly within the limit', () => {
    const r = transition(venda, 'aguardando_gerente', 'APROVAR', { actor: gerente, data: pedido(10_000) });
    expect(r).toMatchObject({ ok: true, to: 'aprovado' });
  });

  it('above the limit it escalates to the board', () => {
    const r = transition(venda, 'aguardando_gerente', 'APROVAR', { actor: gerente, data: pedido(10_001) });
    expect(r).toMatchObject({
      ok: true,
      to: 'aguardando_diretoria',
      effects: [{ type: 'notificar', perfil: 'diretor', pedidoId: 'P-1' }],
    });
  });

  it('only the director approves at board level', () => {
    const data = pedido(50_000);
    expect(can(venda, 'aguardando_diretoria', 'APROVAR', { actor: gerente, data })).toBe(false);
    expect(can(venda, 'aguardando_diretoria', 'APROVAR', { actor: diretor, data })).toBe(true);
  });
});

describe('availableEvents', () => {
  it('lists only what the actor can do right now', () => {
    const data = pedido(500);
    expect(availableEvents(venda, 'aguardando_gerente', { actor: gerente, data })).toEqual(['APROVAR', 'REJEITAR']);
    expect(availableEvents(venda, 'aguardando_gerente', { actor: vendedor, data })).toEqual([]);
    expect(availableEvents(venda, 'aprovado', { actor: diretor, data })).toEqual([]);
    expect(availableEvents(venda, 'xpto', { actor: diretor, data })).toEqual([]);
  });
});

describe('rules', () => {
  it('anyOf passes if any policy passes', () => {
    const owner = policy<{ ownerId: string }>('owner', ({ actor, data }) => actor.id === data.ownerId);
    const m = defineMachine<{ ownerId: string }>()({
      id: 'doc',
      initial: 'open',
      states: {
        open: { on: { CLOSE: { to: 'closed', policies: [anyOf(owner, hasRole('admin'))] } } },
        closed: { final: true },
      },
    });
    const data = { ownerId: 'ana' };
    expect(can(m, 'open', 'CLOSE', { actor: { id: 'ana', roles: [] }, data })).toBe(true);
    expect(can(m, 'open', 'CLOSE', { actor: { id: 'zeca', roles: ['admin'] }, data })).toBe(true);
    expect(can(m, 'open', 'CLOSE', { actor: { id: 'zeca', roles: [] }, data })).toBe(false);
  });

  it('all policies and guards must pass, and the error lists the ones that failed', () => {
    const m = defineMachine<{ n: number }>()({
      id: 'm',
      initial: 'a',
      states: {
        a: {
          on: {
            GO: {
              to: 'b',
              guards: [guard('positive', ({ data }) => data.n > 0), guard('even', ({ data }) => data.n % 2 === 0)],
            },
          },
        },
        b: {},
      },
    });
    const r = transition(m, 'a', 'GO', { actor: { id: 'x', roles: [] }, data: { n: -1 } });
    expect(r).toMatchObject({ error: { code: 'GUARD_FAILED', failed: ['positive', 'even'] } });
  });
});

describe('defineMachine', () => {
  it('rejects an inconsistent definition', () => {
    const invalid = () =>
      defineMachine()({
        id: 'broken',
        initial: 'a',
        states: {
          a: { on: { GO: { to: 'missing' as 'a' } } },
          end: { final: true, on: { BACK: { to: 'a' } } },
        },
      });
    expect(invalid).toThrow(MachineDefinitionError);
    expect(invalid).toThrow(/target state does not exist/);
    expect(invalid).toThrow(/final state "end" cannot have transitions/);
  });

  it('returns the frozen definition', () => {
    expect(Object.isFrozen(venda)).toBe(true);
    expect(Object.isFrozen(venda.states.rascunho)).toBe(true);
  });
});
