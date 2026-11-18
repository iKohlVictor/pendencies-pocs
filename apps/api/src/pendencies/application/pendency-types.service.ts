import { Inject, Injectable } from '@nestjs/common';
import { FlowsService } from '../../flows/application/flows.service.js';
import { InvalidValueError } from '../../shared/domain/domain-error.js';
import { PENDENCY_TYPES, parsePendencyType, type PendencyTypeId } from '../domain/pendency-type.js';

/** Which flow a type uses. Without a pinned version it follows the latest published one. */
export interface PendencyTypeBinding {
  flowId: string;
  pinnedVersion: number | null;
}

export interface PendencyTypeView extends PendencyTypeBinding {
  id: PendencyTypeId;
  name: string;
  /** Version new pendencies of this type start on right now. */
  effectiveVersion: number;
}

/** In memory, seeded from the type catalog. In a real system, a column on the types table. */
@Injectable()
export class PendencyTypesService {
  private readonly bindings = new Map<PendencyTypeId, PendencyTypeBinding>(
    Object.entries(PENDENCY_TYPES).map(([id, type]) => [id as PendencyTypeId, { flowId: type.flow, pinnedVersion: null }]),
  );

  constructor(@Inject(FlowsService) private readonly flows: FlowsService) {}

  async list(): Promise<PendencyTypeView[]> {
    return Promise.all(Object.keys(PENDENCY_TYPES).map((id) => this.get(id as PendencyTypeId)));
  }

  async get(id: PendencyTypeId): Promise<PendencyTypeView> {
    const binding = this.bindings.get(id)!;
    return { id, name: PENDENCY_TYPES[id].name, ...binding, effectiveVersion: await this.effectiveVersion(binding) };
  }

  /** The flow version a new pendency of this type starts on. */
  async resolveFor(id: PendencyTypeId) {
    const binding = this.bindings.get(id)!;
    return this.flows.resolve(binding.flowId, await this.effectiveVersion(binding));
  }

  /** version null = always the latest published one. */
  async bind(rawId: string, flowId: string | undefined, version: number | null | undefined): Promise<PendencyTypeView> {
    const id = parsePendencyType(rawId);
    const flow = (flowId ?? '').trim();
    const latest = await this.flows.latestVersion(flow); // 404 if the flow does not exist
    if (latest === 0) throw new InvalidValueError('flowId', flow, ['a flow with at least one published version']);
    const pinned = version ?? null;
    if (pinned !== null) await this.flows.version(flow, pinned); // 404 if the version does not exist
    this.bindings.set(id, { flowId: flow, pinnedVersion: pinned });
    return this.get(id);
  }

  private async effectiveVersion(binding: PendencyTypeBinding): Promise<number> {
    return binding.pinnedVersion ?? (await this.flows.latestVersion(binding.flowId));
  }
}
