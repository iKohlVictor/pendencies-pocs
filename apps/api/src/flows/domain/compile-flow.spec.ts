import { transition } from 'machine-flow';
import { compileFlow, InvalidFlowDefinitionError, validateFlow } from './compile-flow.js';
import type { FlowDefinition } from './flow-definition.js';
import { SEED_FLOWS } from './seeds.js';

const minimal = (): FlowDefinition => ({
  initial: 'open',
  states: {
    open: { label: 'Aberta', transitions: [{ actions: ['APPROVE'], to: 'done', roles: ['documentation_analysis'] }] },
    done: { label: 'Concluída', final: true },
  },
});

const messages = (def: FlowDefinition) => validateFlow(def).map((i) => i.message);

describe('compileFlow', () => {
  it.each(SEED_FLOWS)('compiles the seed $id', ({ id, definition }) => {
    const flow = compileFlow(id, 1, definition);
    expect(flow.machine.id).toBe(`pendency-${id}@v1`);
    expect(flow.labels.completed).toBe('Concluída');
  });

  it('collects the facts its guards need', () => {
    const [standard, , payment] = SEED_FLOWS.map((s) => compileFlow(s.id, 1, s.definition));
    expect(standard!.requiredFacts).toEqual([]);
    expect(payment!.requiredFacts).toEqual(['paymentDueAt']);
  });

  it('accepts a minimal flow', () => {
    expect(validateFlow(minimal())).toEqual([]);
  });

  it('rejects unknown blocks', () => {
    const def = minimal();
    def.states.open!.transitions = [
      { actions: ['FLY'], to: 'done', roles: ['pilot'], guards: ['moon-is-full'], notify: ['nobody'] },
    ] as never;
    expect(messages(def)).toEqual([
      'Ação desconhecida "FLY"',
      'Role desconhecida "pilot"',
      'Role de notificação desconhecida "nobody"',
      'Guard desconhecido "moon-is-full"',
    ]);
  });

  it('rejects missing targets, roles, final states and unreachable states', () => {
    const def: FlowDefinition = {
      initial: 'open',
      states: {
        open: { label: 'Aberta', transitions: [{ actions: ['APPROVE'], to: 'nowhere', roles: [] }] },
        orphan: { label: 'Órfão' },
      },
    };
    expect(messages(def)).toEqual([
      'O fluxo precisa de ao menos um estado final',
      '"open" --APPROVE--> destino "nowhere" não existe',
      '"open" --APPROVE--> precisa de ao menos uma role',
      'Estado "orphan" não é alcançável a partir do inicial',
    ]);
    expect(() => compileFlow('x', 1, def)).toThrow(InvalidFlowDefinitionError);
  });

  it('a final state cannot have transitions', () => {
    const def = minimal();
    def.states.done!.transitions = [{ actions: ['REJECT'], to: 'open', roles: ['branch'] }];
    expect(messages(def)).toContain('Estado final "done" não pode ter transições');
  });

  it('a transition needs at least one action and cannot repeat one', () => {
    const def = minimal();
    def.states.open!.transitions = [
      { actions: [], to: 'done', roles: ['branch'] },
      { actions: ['APPROVE', 'APPROVE'], to: 'done', roles: ['branch'] },
    ];
    expect(messages(def)).toEqual([
      '"open" --?--> precisa de ao menos uma ação',
      '"open" --APPROVE | APPROVE--> repete a ação "APPROVE"',
    ]);
  });

  it('flags the old "on" format instead of silently ignoring it', () => {
    const def = minimal();
    (def.states.open as unknown as Record<string, unknown>).on = { APPROVE: [] };
    expect(messages(def)).toContain('Estado "open" usa o formato antigo "on"; use "transitions"');
  });

  it('any action of a grouped transition takes it, and order sets priority', () => {
    const def: FlowDefinition = {
      initial: 'open',
      states: {
        open: {
          label: 'Aberta',
          transitions: [
            { actions: ['ATTACH_DOCUMENT', 'RESOLVE_WITH_COMMENT'], to: 'review', roles: ['branch'] },
            { actions: ['RESOLVE_WITH_COMMENT'], to: 'done', roles: ['branch'] },
          ],
        },
        review: { label: 'Revisão', transitions: [{ actions: ['APPROVE'], to: 'done', roles: ['documentation_analysis'] }] },
        done: { label: 'Concluída', final: true },
      },
    };
    const { machine } = compileFlow('grouped', 1, def);
    const ctx = { actor: { id: 'b', roles: ['branch'] }, data: { now: new Date() } } as never;
    for (const action of ['ATTACH_DOCUMENT', 'RESOLVE_WITH_COMMENT'] as const) {
      expect(transition(machine, 'open', action, ctx)).toMatchObject({ ok: true, to: 'review' });
    }
  });
});
