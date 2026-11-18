import type { FlowDefinition, FlowStateSpec, PendencyAction, TransitionSpec } from './models';

/**
 * Pure, immutable helpers the editor uses to change a FlowDefinition.
 * Every function returns a new definition; the input is never mutated.
 */

/** Points at one transition: the index-th way out of `from`. */
export interface TransitionRef {
  from: string;
  index: number;
}

/** One arrow on the canvas: every transition from `from` to `to`. */
export interface Edge {
  id: string;
  from: string;
  to: string;
  items: { ref: TransitionRef; spec: TransitionSpec }[];
}

type ListField = 'actions' | 'roles' | 'guards' | 'notify';

const clone = <T>(value: T): T => structuredClone(value);

export function edgesOf(def: FlowDefinition): Edge[] {
  const edges = new Map<string, Edge>();
  for (const [from, state] of Object.entries(def.states)) {
    (state.transitions ?? []).forEach((spec, index) => {
      const id = `${from}->${spec.to}`;
      const edge = edges.get(id) ?? { id, from, to: spec.to, items: [] };
      edge.items.push({ ref: { from, index }, spec });
      edges.set(id, edge);
    });
  }
  // Arrows to a state that no longer exists are not drawn (validation reports them).
  return [...edges.values()].filter((e) => def.states[e.to]);
}

export function getTransition(def: FlowDefinition, ref: TransitionRef): TransitionSpec | undefined {
  return def.states[ref.from]?.transitions?.[ref.index];
}

/** Actions of `ref` that another transition of the same state also listens to (priority decides). */
export function sharedActions(def: FlowDefinition, ref: TransitionRef): PendencyAction[] {
  const all = def.states[ref.from]?.transitions ?? [];
  const mine = all[ref.index]?.actions ?? [];
  return mine.filter((action) => all.some((t, i) => i !== ref.index && t.actions.includes(action)));
}

/** Turns a label into a snake_case id that is not taken yet. */
export function newStateId(def: FlowDefinition, label: string): string {
  const base =
    label
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/^(\d)/, 's_$1') || 'estado';
  let id = base;
  for (let n = 2; def.states[id]; n++) id = `${base}_${n}`;
  return id;
}

export function addState(
  def: FlowDefinition,
  label: string,
  position: { x: number; y: number },
  final = false,
): { def: FlowDefinition; id: string } {
  const next = clone(def);
  const id = newStateId(def, label);
  next.states[id] = { label, position, ...(final ? { final: true } : {}) };
  if (!next.initial || !next.states[next.initial]) next.initial = id;
  return { def: next, id };
}

export function updateState(def: FlowDefinition, id: string, patch: Partial<FlowStateSpec>): FlowDefinition {
  const next = clone(def);
  const state = { ...next.states[id]!, ...patch };
  if (state.final) delete state.transitions; // a final state has no way out
  if (!state.final) delete state.final;
  next.states[id] = state;
  return next;
}

/** Renames a state id and every reference to it. */
export function renameState(def: FlowDefinition, from: string, to: string): FlowDefinition {
  if (from === to || def.states[to]) return def;
  const next: FlowDefinition = { initial: def.initial === from ? to : def.initial, states: {} };
  for (const [id, state] of Object.entries(clone(def.states))) {
    for (const transition of state.transitions ?? []) if (transition.to === from) transition.to = to;
    next.states[id === from ? to : id] = state;
  }
  return next;
}

/** Removes the state and every transition that pointed at it. */
export function deleteState(def: FlowDefinition, id: string): FlowDefinition {
  const next = clone(def);
  delete next.states[id];
  for (const state of Object.values(next.states)) {
    if (!state.transitions) continue;
    state.transitions = state.transitions.filter((t) => t.to !== id);
    if (state.transitions.length === 0) delete state.transitions;
  }
  if (next.initial === id) next.initial = Object.keys(next.states)[0] ?? '';
  return next;
}

export function addTransition(
  def: FlowDefinition,
  from: string,
  to: string,
  actions: PendencyAction[],
  spec: Partial<TransitionSpec> = {},
): { def: FlowDefinition; ref: TransitionRef } {
  const next = clone(def);
  const transitions = (next.states[from]!.transitions ??= []);
  transitions.push({ actions, to, roles: [], ...spec });
  return { def: next, ref: { from, index: transitions.length - 1 } };
}

export function deleteTransition(def: FlowDefinition, ref: TransitionRef): FlowDefinition {
  const next = clone(def);
  const state = next.states[ref.from];
  if (!state?.transitions?.[ref.index]) return def;
  state.transitions.splice(ref.index, 1);
  if (state.transitions.length === 0) delete state.transitions;
  return next;
}

export function updateTransition(def: FlowDefinition, ref: TransitionRef, patch: Partial<TransitionSpec>): FlowDefinition {
  const current = getTransition(def, ref);
  if (!current) return def;
  const spec: TransitionSpec = { ...clone(current), ...patch };
  for (const key of ['guards', 'notify'] as const) if (spec[key]?.length === 0) delete spec[key];
  const next = clone(def);
  next.states[ref.from]!.transitions![ref.index] = spec;
  return next;
}

/** Moves a transition up (-1) or down (+1) in its state's priority list. */
export function moveTransition(
  def: FlowDefinition,
  ref: TransitionRef,
  delta: -1 | 1,
): { def: FlowDefinition; ref: TransitionRef } {
  const target = ref.index + delta;
  const length = def.states[ref.from]?.transitions?.length ?? 0;
  if (target < 0 || target >= length) return { def, ref };
  const next = clone(def);
  const list = next.states[ref.from]!.transitions!;
  [list[ref.index], list[target]] = [list[target]!, list[ref.index]!];
  return { def: next, ref: { ...ref, index: target } };
}

/** Adds a value to a list field of a transition (actions, roles, guards, notify) if it is not there. */
export function addToTransition(def: FlowDefinition, ref: TransitionRef, field: ListField, value: string): FlowDefinition {
  const spec = getTransition(def, ref);
  if (!spec) return def;
  const list = (spec[field] ?? []) as string[];
  if (list.includes(value)) return def;
  return updateTransition(def, ref, { [field]: [...list, value] });
}

export const sameRef = (a: TransitionRef | null | undefined, b: TransitionRef | null | undefined) =>
  !!a && !!b && a.from === b.from && a.index === b.index;
