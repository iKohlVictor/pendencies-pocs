import { Inject, Injectable } from '@nestjs/common';
import type { Actor } from 'machine-flow';
import type { CompiledFlow } from '../../pendencies/domain/pendency.machine.js';
import { AlreadyExistsError, NotFoundError } from '../../shared/domain/domain-error.js';
import { compileFlow, validateFlow } from '../domain/compile-flow.js';
import { flowCatalog } from '../domain/flow-catalog.js';
import type { FlowDefinition } from '../domain/flow-definition.js';
import { Flow, type FlowSnapshot } from '../domain/flow.js';
import { FLOW_REPOSITORY, type FlowRepository } from '../domain/flow.repository.js';

/** Summary row for listings: no definitions, just where each flow stands. */
export interface FlowSummary {
  id: string;
  name: string;
  latestVersion: number;
  hasDraft: boolean;
  versions: { version: number; publishedAt: string; publishedBy: string }[];
}

@Injectable()
export class FlowsService {
  /** Published versions never change, so compiled machines are cached forever. */
  private readonly compiled = new Map<string, CompiledFlow>();

  constructor(@Inject(FLOW_REPOSITORY) private readonly flows: FlowRepository) {}

  catalog() {
    return flowCatalog();
  }

  async list(): Promise<FlowSummary[]> {
    return (await this.flows.findAll()).map((flow) => summarize(flow.toSnapshot()));
  }

  async get(id: string): Promise<FlowSnapshot> {
    return (await this.load(id)).toSnapshot();
  }

  async create(id?: string, name?: string, definition?: FlowDefinition): Promise<FlowSnapshot> {
    const flow = Flow.create(id, name, definition);
    if (await this.flows.findById(flow.id)) throw new AlreadyExistsError('Flow', flow.id);
    await this.flows.save(flow);
    return this.get(flow.id);
  }

  async saveDraft(id: string, definition: FlowDefinition, name?: string): Promise<FlowSnapshot> {
    const flow = await this.load(id);
    flow.saveDraft(definition, name);
    await this.flows.save(flow);
    return this.get(id);
  }

  async discardDraft(id: string): Promise<FlowSnapshot> {
    const flow = await this.load(id);
    flow.discardDraft();
    await this.flows.save(flow);
    return this.get(id);
  }

  /** Validates any definition (the builder calls it before saving). */
  validate(definition: FlowDefinition) {
    const issues = validateFlow(definition);
    return { valid: issues.length === 0, issues };
  }

  async publish(id: string, actor: Actor) {
    const flow = await this.load(id);
    const version = flow.publish(actor);
    await this.flows.save(flow);
    return version;
  }

  async version(id: string, version: number) {
    return (await this.load(id)).version(version);
  }

  async latestVersion(id: string): Promise<number> {
    return (await this.load(id)).latestVersion();
  }

  /** The runnable machine of one published version. */
  async resolve(id: string, version: number): Promise<CompiledFlow> {
    const key = `${id}@${version}`;
    const cached = this.compiled.get(key);
    if (cached) return cached;
    const published = (await this.load(id)).version(version);
    const compiled = compileFlow(id, version, published.definition);
    this.compiled.set(key, compiled);
    return compiled;
  }

  private async load(id: string): Promise<Flow> {
    const flow = await this.flows.findById(id);
    if (!flow) throw new NotFoundError('Flow', id);
    return flow;
  }
}

function summarize(snapshot: FlowSnapshot): FlowSummary {
  return {
    id: snapshot.id,
    name: snapshot.name,
    latestVersion: snapshot.versions.at(-1)?.version ?? 0,
    hasDraft: snapshot.draft !== null,
    versions: snapshot.versions.map(({ version, publishedAt, publishedBy }) => ({ version, publishedAt, publishedBy })),
  };
}
