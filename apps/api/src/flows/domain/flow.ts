import type { Actor } from 'machine-flow';
import { DomainError, InvalidValueError, NotFoundError } from '../../shared/domain/domain-error.js';
import { compileFlow, InvalidFlowDefinitionError, validateFlow } from './compile-flow.js';
import type { FlowDefinition } from './flow-definition.js';

export interface FlowVersion {
  version: number;
  definition: FlowDefinition;
  publishedAt: string;
  publishedBy: string;
}

export interface FlowSnapshot {
  id: string;
  name: string;
  /** Work in progress. Null once published until someone edits again. */
  draft: FlowDefinition | null;
  /** Immutable, oldest first. Pendencies point at one of these. */
  versions: FlowVersion[];
  /** Optimistic-locking counter. */
  revision: number;
}

export class NothingToPublishError extends DomainError {
  constructor(public readonly flowId: string) {
    super(`Flow ${flowId} has no draft to publish`);
  }
}

/**
 * A workflow and its history. Editing happens on the draft; publishing freezes
 * it as the next version, so pendencies already running keep their own.
 */
export class Flow {
  private constructor(private state: FlowSnapshot) {}

  static create(id: string | undefined, name: string | undefined, definition?: FlowDefinition): Flow {
    const flowId = (id ?? '').trim();
    if (!/^[a-z][a-z0-9_-]*$/.test(flowId)) throw new InvalidValueError('id', id, ['kebab/snake-case id']);
    return new Flow({
      id: flowId,
      name: name?.trim() || flowId,
      draft: definition ?? emptyDefinition(),
      versions: [],
      revision: 0,
    });
  }

  static restore(snapshot: FlowSnapshot): Flow {
    return new Flow(structuredClone(snapshot));
  }

  get id(): string {
    return this.state.id;
  }

  saveDraft(definition: FlowDefinition, name?: string): void {
    if (!definition || typeof definition !== 'object') throw new InvalidFlowDefinitionError([{ message: 'Definição vazia' }]);
    this.state.draft = structuredClone(definition);
    if (name?.trim()) this.state.name = name.trim();
  }

  discardDraft(): void {
    this.state.draft = null;
  }

  /** Validates and freezes the draft as the next version. */
  publish(actor: Actor): FlowVersion {
    const draft = this.state.draft;
    if (!draft) throw new NothingToPublishError(this.state.id);
    const version = this.latestVersion() + 1;
    compileFlow(this.state.id, version, draft); // throws with every issue found
    const published: FlowVersion = {
      version,
      definition: structuredClone(draft),
      publishedAt: new Date().toISOString(),
      publishedBy: actor.id,
    };
    this.state.versions.push(published);
    this.state.draft = null;
    return structuredClone(published);
  }

  validateDraft() {
    return this.state.draft ? validateFlow(this.state.draft) : [];
  }

  latestVersion(): number {
    return this.state.versions.at(-1)?.version ?? 0;
  }

  version(n: number): FlowVersion {
    const found = this.state.versions.find((v) => v.version === n);
    if (!found) throw new NotFoundError('Flow version', `${this.state.id}@v${n}`);
    return structuredClone(found);
  }

  toSnapshot(): FlowSnapshot {
    return structuredClone(this.state);
  }
}

function emptyDefinition(): FlowDefinition {
  return {
    initial: 'start',
    states: {
      start: { label: 'Início', position: { x: 40, y: 120 } },
      done: { label: 'Concluída', final: true, position: { x: 400, y: 120 } },
    },
  };
}
