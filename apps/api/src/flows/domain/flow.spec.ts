import type { Actor } from 'machine-flow';
import { InvalidFlowDefinitionError } from './compile-flow.js';
import { Flow, NothingToPublishError } from './flow.js';
import { DIRECT_FLOW, STANDARD_FLOW } from './seeds.js';

const admin: Actor = { id: 'ana', roles: [] };

describe('Flow', () => {
  it('publishing freezes the draft as the next version', () => {
    const flow = Flow.create('standard', 'Padrão', STANDARD_FLOW);
    expect(flow.publish(admin).version).toBe(1);
    expect(flow.toSnapshot().draft).toBeNull();
    expect(() => flow.publish(admin)).toThrow(NothingToPublishError);

    flow.saveDraft(DIRECT_FLOW);
    expect(flow.publish(admin)).toMatchObject({ version: 2, publishedBy: 'ana' });
    expect(flow.latestVersion()).toBe(2);
  });

  it('a published version does not change when the draft is edited', () => {
    const flow = Flow.create('standard', 'Padrão', STANDARD_FLOW);
    flow.publish(admin);
    const draft = structuredClone(STANDARD_FLOW);
    draft.states.pending_branch!.transitions = draft.states.pending_branch!.transitions!.filter(
      (t) => !t.actions.includes('REQUEST_EXCEPTION'),
    );
    flow.saveDraft(draft);

    expect(flow.version(1).definition.states.pending_branch!.transitions).toContainEqual(
      expect.objectContaining({ actions: ['REQUEST_EXCEPTION'] }),
    );
  });

  it('an invalid draft cannot be published', () => {
    const flow = Flow.create('broken', 'Quebrado', { initial: 'x', states: {} });
    expect(() => flow.publish(admin)).toThrow(InvalidFlowDefinitionError);
    expect(flow.latestVersion()).toBe(0);
  });

  it('ids are slugs', () => {
    expect(() => Flow.create('Not Valid', 'x')).toThrow('id');
  });
});
