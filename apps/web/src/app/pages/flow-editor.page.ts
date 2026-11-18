import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  FCanvasComponent,
  FCreateConnectionEvent,
  FCreateNodeEvent,
  FFlowModule,
  FSelectionChangeEvent,
} from '@foblex/flow';
import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmCheckbox } from '@spartan-ng/helm/checkbox';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmLabel } from '@spartan-ng/helm/label';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';
import { HlmSeparator } from '@spartan-ng/helm/separator';
import { Api } from '../core/api';
import {
  addState,
  addToTransition,
  addTransition,
  deleteState,
  deleteTransition,
  edgesOf,
  getTransition,
  moveTransition,
  renameState,
  sameRef,
  sharedActions,
  updateState,
  updateTransition,
  type TransitionRef,
} from '../core/flow-graph';
import {
  ApiError,
  Flow,
  FlowCatalog,
  FlowDefinition,
  FlowIssue,
  FlowVersion,
  PendencyAction,
  Role,
  TransitionSpec,
} from '../core/models';

type Mode = 'draft' | number;
type Selection = { kind: 'state'; id: string } | { kind: 'transition'; ref: TransitionRef } | null;
/** What a palette block carries while it is dragged onto a transition. */
type Block = { field: 'actions' | 'roles' | 'notify' | 'guards'; value: string };

const BLOCK_MIME = 'application/x-flow-block';

@Component({
  selector: 'app-flow-editor-page',
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    FFlowModule,
    HlmAlertImports,
    HlmBadge,
    HlmButton,
    HlmCheckbox,
    HlmInput,
    HlmLabel,
    HlmNativeSelectImports,
    HlmSeparator,
  ],
  styles: `
    :host { display: block; }
    .editor { display: grid; grid-template-columns: 210px minmax(0, 1fr) 290px; gap: 12px; height: calc(100vh - 190px); min-height: 520px; }
    .panel { overflow: auto; }
    f-flow { display: block; height: 100%; width: 100%; }
    .flow-node {
      min-width: 150px; max-width: 220px; padding: 10px 14px; border-radius: 10px; position: relative;
      background: var(--card); border: 1.5px solid var(--border); box-shadow: 0 1px 2px rgb(0 0 0 / 0.06);
      font-size: 13px; cursor: grab; user-select: none;
    }
    .flow-node.final { border-style: double; border-width: 4px; }
    .flow-node.initial { border-color: oklch(0.55 0.15 250); }
    .flow-node.selected { box-shadow: 0 0 0 3px oklch(0.7 0.12 250 / 0.5); }
    .flow-node.current { background: oklch(0.95 0.06 145); border-color: oklch(0.6 0.15 145); }
    .flow-node.has-issue { border-color: var(--destructive); }
    .connector { position: absolute; top: 50%; width: 12px; height: 12px; margin-top: -6px; border-radius: 999px;
      background: var(--background); border: 2px solid oklch(0.55 0.15 250); }
    .connector.in { left: -7px; }
    .connector.out { right: -7px; cursor: crosshair; }
    .edge-label { display: flex; flex-direction: column; gap: 2px; align-items: center; pointer-events: all; }
    .chip { font-size: 11px; line-height: 1.2; padding: 2px 6px; border-radius: 6px; white-space: nowrap; cursor: pointer;
      background: var(--background); border: 1px solid var(--border); color: var(--foreground); }
    .chip.selected { border-color: oklch(0.55 0.15 250); background: oklch(0.95 0.03 250); }
    .chip.drop-over { outline: 2px dashed oklch(0.55 0.15 250); }
    .chip.invalid { border-color: var(--destructive); color: var(--destructive); }
    .block { display: block; width: 100%; text-align: left; font-size: 12px; padding: 5px 8px; border-radius: 6px;
      border: 1px solid var(--border); background: var(--background); cursor: grab; margin-bottom: 4px; }
    .block:hover { background: var(--muted); }
    .block.node { border-style: dashed; }
  `,
  template: `
    <div class="spartan flex flex-col gap-3">
      <div class="flex flex-wrap items-center gap-2">
        <a routerLink="/fluxos" class="text-muted-foreground text-xs">← fluxos</a>
      </div>

      @if (flow(); as f) {
        <div class="flex flex-wrap items-center gap-2">
          <h1 class="mr-2 text-xl font-semibold">{{ f.name }}</h1>
          <code class="text-muted-foreground text-xs">{{ f.id }}</code>

          <hlm-native-select size="sm" class="w-48" [ngModel]="'' + mode()" (ngModelChange)="pickMode($event)">
            @if (f.draft || mode() === 'draft') {
              <option hlmNativeSelectOption value="draft">Rascunho{{ dirty() ? ' (não salvo)' : '' }}</option>
            }
            @for (v of reversedVersions(); track v.version) {
              <option hlmNativeSelectOption [value]="'' + v.version">
                v{{ v.version }}{{ v.version === latest() ? ' (última)' : '' }}
              </option>
            }
          </hlm-native-select>

          <div class="ml-auto flex flex-wrap gap-2">
            @if (readonly()) {
              <button hlmBtn size="sm" (click)="editFrom(mode())">
                {{ f.draft ? 'Substituir rascunho por esta versão' : 'Editar (novo rascunho)' }}
              </button>
            } @else {
              <button hlmBtn size="sm" variant="outline" (click)="validate()">Validar</button>
              <button hlmBtn size="sm" variant="outline" (click)="save()" [disabled]="!dirty()">Salvar rascunho</button>
              <button hlmBtn size="sm" (click)="publish()">Publicar v{{ latest() + 1 }}</button>
              @if (f.draft) {
                <button hlmBtn size="sm" variant="ghost" (click)="discard()">Descartar rascunho</button>
              }
            }
          </div>
        </div>

        @if (readonly()) {
          <p class="text-muted-foreground text-xs">
            v{{ mode() }} é imutável: pendências abertas nela terminam nela. Publicada por
            {{ currentVersion()?.publishedBy }} em {{ currentVersion()?.publishedAt | date: 'dd/MM/yyyy HH:mm' }}.
            @if (currentState()) {
              Destacado: estado atual da pendência (<code>{{ currentState() }}</code>).
            }
          </p>
        }

        @if (message(); as m) {
          <div hlmAlert [variant]="m.kind === 'error' ? 'destructive' : 'default'">
            <p hlmAlertTitle>{{ m.text }}</p>
          </div>
        }

        <div class="editor">
          <!-- Paleta -->
          <aside class="panel rounded-lg border p-3">
            @if (catalog(); as c) {
              <p class="text-muted-foreground mb-2 text-xs font-medium uppercase">Estados</p>
              <div
                class="block node"
                fExternalItem
                [fData]="{ final: false }"
                [fDisabled]="readonly()"
              >
                ▭ Estado
              </div>
              <div class="block node" fExternalItem [fData]="{ final: true }" [fDisabled]="readonly()">◎ Estado final</div>
              <p class="text-muted-foreground mt-1 mb-3 text-[11px] leading-snug">
                Arraste para o canvas. Puxe da bolinha à direita de um estado até outro para criar uma transição.
              </p>

              <p class="text-muted-foreground mb-2 text-xs font-medium uppercase">Ações</p>
              @for (a of c.actions; track a.id) {
                <div class="block" [attr.draggable]="!readonly()" (dragstart)="dragBlock($event, { field: 'actions', value: a.id })"
                  (click)="applyBlock({ field: 'actions', value: a.id })" [title]="a.payload ? 'exige ' + a.payload : ''">
                  {{ a.label }}
                </div>
              }

              <p class="text-muted-foreground mt-3 mb-2 text-xs font-medium uppercase">Quem pode (role)</p>
              @for (r of c.roles; track r.id) {
                <div class="block" [attr.draggable]="!readonly()" (dragstart)="dragBlock($event, { field: 'roles', value: r.id })"
                  (click)="applyBlock({ field: 'roles', value: r.id })">
                  👤 {{ r.label }}
                </div>
              }

              <p class="text-muted-foreground mt-3 mb-2 text-xs font-medium uppercase">Guards</p>
              @for (g of c.guards; track g.id) {
                <div class="block" [attr.draggable]="!readonly()" (dragstart)="dragBlock($event, { field: 'guards', value: g.id })"
                  (click)="applyBlock({ field: 'guards', value: g.id })" [title]="g.description">
                  ⚑ {{ g.label }}
                </div>
              }

              <p class="text-muted-foreground mt-3 mb-2 text-xs font-medium uppercase">Notificar</p>
              @for (r of c.roles; track r.id) {
                <div class="block" [attr.draggable]="!readonly()" (dragstart)="dragBlock($event, { field: 'notify', value: r.id })"
                  (click)="applyBlock({ field: 'notify', value: r.id })">
                  🔔 {{ r.label }}
                </div>
              }
              <p class="text-muted-foreground mt-1 text-[11px] leading-snug">
                Arraste ações, roles, guards e notificações para cima de uma transição (ou selecione a transição e
                clique no bloco). Uma transição pode ter várias ações: qualquer uma delas dispara.
              </p>
            }
          </aside>

          <!-- Canvas -->
          <div class="bg-muted/40 overflow-hidden rounded-lg border">
            @if (definition(); as def) {
              <f-flow fDraggable (fCreateNode)="onCreateNode($event)" (fCreateConnection)="onCreateConnection($event)"
                (fSelectionChange)="onSelectionChange($event)" (fFullRendered)="fitView()">
                <f-canvas fZoom>
                  <ng-container ngProjectAs="[fConnections]">
                    @for (e of edges(); track e.id) {
                      <f-connection [fConnectionId]="e.id" [fSourceId]="'out-' + e.from" [fTargetId]="'in-' + e.to"
                        fType="bezier" fBehavior="fixed" [fReassignDisabled]="true" [fSelectionDisabled]="true">
                        <f-connection-marker-arrow type="f-connection-marker-end-all-states" />
                        <div fConnectionContent [position]="0.35" class="edge-label">
                          @for (item of e.items; track item.ref.index) {
                            <span class="chip" [class.selected]="isSelected(item.ref)"
                              [class.invalid]="item.spec.roles.length === 0 || item.spec.actions.length === 0"
                              (click)="selectTransition(item.ref); $event.stopPropagation()"
                              (dragover)="onDragOver($event)" (dragleave)="onDragLeave($event)" (drop)="onDrop($event, item.ref)"
                              [title]="describe(item.ref, item.spec)">
                              {{ actionsLabel(item.spec.actions) }}
                              @if (hasPriority(item.ref)) { <small>#{{ item.ref.index + 1 }}</small> }
                              · {{ rolesShort(item.spec.roles) }}
                              @if (item.spec.guards?.length) { ⚑ }
                              @if (item.spec.notify?.length) { 🔔 }
                            </span>
                          }
                        </div>
                      </f-connection>
                    }
                  </ng-container>
                  <f-connection-for-create fType="bezier" fBehavior="fixed">
                    <f-connection-marker-arrow type="f-connection-marker-end-all-states" />
                  </f-connection-for-create>

                  <ng-container ngProjectAs="[fNodes]">
                    @for (s of states(); track s.id) {
                      <div fNode fDragHandle [fNodeId]="s.id" [fNodePosition]="s.position" [fNodeDraggingDisabled]="readonly()"
                        (fNodePositionChange)="moveState(s.id, $event)" class="flow-node"
                        [class.final]="s.spec.final" [class.initial]="def.initial === s.id"
                        [class.selected]="selection()?.kind === 'state' && $any(selection()).id === s.id"
                        [class.current]="currentState() === s.id" [class.has-issue]="statesWithIssues().has(s.id)"
                        (click)="select({ kind: 'state', id: s.id })">
                        <div fConnector fConnectorType="target" [fConnectorId]="'in-' + s.id" fConnectorMultiple
                          [fConnectorDisabled]="readonly()" class="connector in"></div>
                        <div class="font-medium">{{ s.spec.label }}</div>
                        <div class="text-muted-foreground flex items-center gap-1 text-[11px]">
                          <code>{{ s.id }}</code>
                          @if (def.initial === s.id) { <span>· inicial</span> }
                          @if (s.spec.final) { <span>· final</span> }
                        </div>
                        @if (!s.spec.final) {
                          <div fConnector fConnectorType="source" [fConnectorId]="'out-' + s.id" fConnectorMultiple
                            fConnectorSelfConnectable [fConnectorDisabled]="readonly()" class="connector out"></div>
                        }
                      </div>
                    }
                  </ng-container>
                </f-canvas>
              </f-flow>
            }
          </div>

          <!-- Inspector -->
          <aside class="panel flex flex-col gap-3 rounded-lg border p-3 text-sm">
            @switch (selection()?.kind) {
              @case ('state') {
                @if (selectedState(); as s) {
                  <p class="text-muted-foreground text-xs font-medium uppercase">Estado</p>
                  <div class="flex flex-col gap-1.5">
                    <label hlmLabel for="st-label">Nome</label>
                    <input hlmInput id="st-label" [disabled]="readonly()" [ngModel]="s.spec.label"
                      (ngModelChange)="patchState(s.id, { label: $event })" />
                  </div>
                  <div class="flex flex-col gap-1.5">
                    <label hlmLabel for="st-id">Id (snake_case)</label>
                    <div class="flex gap-2">
                      <input hlmInput id="st-id" #idInput [disabled]="readonly()" [value]="s.id" />
                      <button hlmBtn size="sm" variant="outline" [disabled]="readonly()" (click)="rename(s.id, idInput.value)">
                        Renomear
                      </button>
                    </div>
                  </div>
                  <label class="flex items-center gap-2">
                    <hlm-checkbox [checked]="!!s.spec.final" [disabled]="readonly()"
                      (checkedChange)="patchState(s.id, { final: $event })" />
                    Estado final (encerra a pendência)
                  </label>
                  @if (definition()!.initial === s.id) {
                    <span hlmBadge variant="secondary" class="self-start">Estado inicial</span>
                  } @else {
                    <button hlmBtn size="sm" variant="outline" [disabled]="readonly()" (click)="setInitial(s.id)">
                      Tornar inicial
                    </button>
                  }
                  <hlm-separator />
                  <p class="text-muted-foreground text-xs font-medium uppercase">Saídas</p>
                  @for (t of outgoing(s.id); track t.ref.index) {
                    <button class="chip text-left whitespace-normal" (click)="selectTransition(t.ref)">
                      {{ actionsLabel(t.spec.actions) }} → {{ labelOf(t.spec.to) }}
                    </button>
                  } @empty {
                    <span class="text-muted-foreground text-xs">Nenhuma.</span>
                  }
                  @if (!readonly()) {
                    <button hlmBtn size="sm" variant="destructive" class="mt-2" (click)="removeState(s.id)">
                      Excluir estado
                    </button>
                  }
                }
              }
              @case ('transition') {
                @if (selectedTransition(); as t) {
                  <p class="text-muted-foreground text-xs font-medium uppercase">Transição</p>
                  <p>
                    <strong>{{ labelOf(t.ref.from) }}</strong> →
                  </p>
                  <div class="flex flex-col gap-1.5">
                    <label hlmLabel>Destino</label>
                    <hlm-native-select size="sm" [disabled]="readonly()" [ngModel]="t.spec.to"
                      (ngModelChange)="patchTransition({ to: $event })">
                      @for (s of states(); track s.id) {
                        <option hlmNativeSelectOption [value]="s.id">{{ s.spec.label }}</option>
                      }
                    </hlm-native-select>
                  </div>
                  <p class="text-muted-foreground mt-1 text-xs font-medium uppercase">Ações (qualquer uma dispara)</p>
                  @for (a of catalog()?.actions ?? []; track a.id) {
                    <label class="flex items-center gap-2" [title]="a.payload ? 'exige ' + a.payload : ''">
                      <hlm-checkbox [checked]="t.spec.actions.includes(a.id)" [disabled]="readonly()"
                        (checkedChange)="toggle('actions', a.id, $event)" />
                      {{ a.label }}
                    </label>
                  }
                  @if (t.spec.actions.length === 0) {
                    <p class="text-destructive text-xs">Escolha ao menos uma ação.</p>
                  }
                  @if (transitionCountOf(t.ref.from) > 1) {
                    <div class="flex items-center gap-2 text-xs">
                      <span>Prioridade {{ t.ref.index + 1 }} de {{ transitionCountOf(t.ref.from) }}</span>
                      <button hlmBtn size="xs" variant="outline" [disabled]="readonly() || t.ref.index === 0" (click)="reorder(-1)">↑</button>
                      <button hlmBtn size="xs" variant="outline" [disabled]="readonly() || t.ref.index === transitionCountOf(t.ref.from) - 1" (click)="reorder(1)">↓</button>
                    </div>
                    @if (shared(t.ref).length) {
                      <p class="text-muted-foreground text-[11px]">
                        {{ actionsLabel(shared(t.ref)) }} também está em outra saída deste estado: vence a primeira, na
                        ordem de prioridade, cujas regras passam.
                      </p>
                    }
                  }

                  <p class="text-muted-foreground mt-1 text-xs font-medium uppercase">Quem pode</p>
                  @for (r of catalog()?.roles ?? []; track r.id) {
                    <label class="flex items-center gap-2">
                      <hlm-checkbox [checked]="t.spec.roles.includes(r.id)" [disabled]="readonly()"
                        (checkedChange)="toggle('roles', r.id, $event)" />
                      {{ r.label }}
                    </label>
                  }
                  @if (t.spec.roles.length === 0) {
                    <p class="text-destructive text-xs">Escolha ao menos uma role.</p>
                  }

                  <p class="text-muted-foreground mt-1 text-xs font-medium uppercase">Guards</p>
                  @for (g of catalog()?.guards ?? []; track g.id) {
                    <label class="flex items-center gap-2" [title]="g.description">
                      <hlm-checkbox [checked]="!!t.spec.guards?.includes(g.id)" [disabled]="readonly()"
                        (checkedChange)="toggle('guards', g.id, $event)" />
                      {{ g.label }}
                    </label>
                  }

                  <p class="text-muted-foreground mt-1 text-xs font-medium uppercase">Notificar</p>
                  @for (r of catalog()?.roles ?? []; track r.id) {
                    <label class="flex items-center gap-2">
                      <hlm-checkbox [checked]="!!t.spec.notify?.includes(r.id)" [disabled]="readonly()"
                        (checkedChange)="toggle('notify', r.id, $event)" />
                      {{ r.label }}
                    </label>
                  }

                  @if (!readonly()) {
                    <button hlmBtn size="sm" variant="destructive" class="mt-2" (click)="removeTransition()">
                      Excluir transição
                    </button>
                  }
                }
              }
              @default {
                <p class="text-muted-foreground text-xs font-medium uppercase">Fluxo</p>
                <div class="flex flex-col gap-1.5">
                  <label hlmLabel for="flow-name">Nome</label>
                  <input hlmInput id="flow-name" [disabled]="readonly()" [ngModel]="name()" (ngModelChange)="rename$($event)" />
                </div>
                <p class="text-muted-foreground text-xs">
                  {{ states().length }} estados · {{ transitionCount() }} transições.
                  Clique num estado ou numa transição para editar.
                </p>
              }
            }

            @if (issues().length) {
              <hlm-separator />
              <p class="text-destructive text-xs font-medium uppercase">Problemas ({{ issues().length }})</p>
              @for (i of issues(); track $index) {
                <button class="chip invalid text-left whitespace-normal" (click)="i.state && select({ kind: 'state', id: i.state })">
                  {{ i.message }}
                </button>
              }
            } @else if (validated()) {
              <hlm-separator />
              <p class="text-xs text-green-700">Fluxo válido.</p>
            }
          </aside>
        </div>
      } @else if (notFound()) {
        <div hlmAlert variant="destructive"><p hlmAlertTitle>Fluxo {{ id() }} não encontrado.</p></div>
      }
    </div>
  `,
})
export class FlowEditorPage {
  /** Route param and query params (?v=2&atual=pending_branch). */
  readonly id = input.required<string>();
  readonly v = input<string>();
  readonly atual = input<string>();

  private readonly api = inject(Api);

  protected readonly catalog = signal<FlowCatalog | null>(null);
  protected readonly flow = signal<Flow | null>(null);
  protected readonly notFound = signal(false);
  protected readonly mode = signal<Mode>('draft');
  protected readonly definition = signal<FlowDefinition | null>(null);
  protected readonly name = signal('');
  protected readonly dirty = signal(false);
  protected readonly selection = signal<Selection>(null);
  protected readonly issues = signal<FlowIssue[]>([]);
  protected readonly validated = signal(false);
  protected readonly message = signal<{ kind: 'ok' | 'error'; text: string } | null>(null);

  private readonly canvas = viewChild(FCanvasComponent);

  protected readonly readonly = computed(() => this.mode() !== 'draft');
  protected readonly latest = computed(() => this.flow()?.versions.at(-1)?.version ?? 0);
  protected readonly reversedVersions = computed(() => [...(this.flow()?.versions ?? [])].reverse());
  protected readonly currentVersion = computed<FlowVersion | undefined>(() =>
    this.flow()?.versions.find((v) => v.version === this.mode()),
  );
  /** Highlighted state when coming from a pendency, only on the version it runs. */
  protected readonly currentState = computed(() =>
    this.readonly() && String(this.mode()) === this.v() ? (this.atual() ?? null) : null,
  );

  protected readonly states = computed(() =>
    Object.entries(this.definition()?.states ?? {}).map(([id, spec], i) => ({
      id,
      spec,
      position: spec.position ?? { x: 40 + (i % 4) * 260, y: 40 + Math.floor(i / 4) * 160 },
    })),
  );
  protected readonly edges = computed(() => (this.definition() ? edgesOf(this.definition()!) : []));
  protected readonly transitionCount = computed(() => this.edges().reduce((n, e) => n + e.items.length, 0));
  protected readonly statesWithIssues = computed(() => new Set(this.issues().map((i) => i.state).filter(Boolean)));

  protected readonly selectedState = computed(() => {
    const sel = this.selection();
    return sel?.kind === 'state' ? this.states().find((s) => s.id === sel.id) : undefined;
  });
  protected readonly selectedTransition = computed(() => {
    const sel = this.selection();
    if (sel?.kind !== 'transition' || !this.definition()) return undefined;
    const spec = getTransition(this.definition()!, sel.ref);
    return spec ? { ref: sel.ref, spec } : undefined;
  });

  constructor() {
    void this.api.get<FlowCatalog>('/flow-catalog').then((r) => r.ok && this.catalog.set(r.body));
    effect(() => {
      const id = this.id();
      const v = this.v();
      untracked(() => void this.load(id, v ? Number(v) : undefined));
    });
  }

  // --- loading and modes ---

  private async load(id: string, version?: number) {
    const res = await this.api.get<Flow>(`/flows/${id}`);
    this.notFound.set(!res.ok);
    if (!res.ok) return;
    this.flow.set(res.body);
    this.name.set(res.body.name);
    const latest = res.body.versions.at(-1)?.version;
    this.setMode(version ?? (res.body.draft ? 'draft' : (latest ?? 'draft')));
  }

  private setMode(mode: Mode) {
    const flow = this.flow();
    if (!flow) return;
    const def =
      mode === 'draft' ? flow.draft : (flow.versions.find((v) => v.version === mode)?.definition ?? null);
    this.mode.set(mode);
    this.definition.set(def ? structuredClone(def) : { initial: '', states: {} });
    this.dirty.set(false);
    this.selection.set(null);
    this.issues.set([]);
    this.validated.set(false);
    setTimeout(() => this.fitView(), 150);
  }

  pickMode(value: string) {
    if (this.dirty() && !confirm('Descartar as alterações não salvas do rascunho?')) return;
    this.message.set(null);
    this.setMode(value === 'draft' ? 'draft' : Number(value));
  }

  /** Starts a (local) draft from a published version. Saved on "Salvar rascunho". */
  editFrom(version: Mode) {
    const def = this.definition();
    this.mode.set('draft');
    this.definition.set(structuredClone(def));
    this.dirty.set(true);
    this.message.set({ kind: 'ok', text: `Rascunho criado a partir da v${version}. Salve para não perder.` });
  }

  fitView() {
    this.canvas()?.fitToScreen({ x: 60, y: 60 }, false);
  }

  // --- server calls ---

  async save(): Promise<boolean> {
    const res = await this.api.put<Flow | ApiError>(`/flows/${this.id()}/draft`, {
      definition: this.definition(),
      name: this.name(),
    });
    if (!res.ok) {
      this.message.set({ kind: 'error', text: (res.body as ApiError).message });
      return false;
    }
    this.flow.set(res.body as Flow);
    this.dirty.set(false);
    this.message.set({ kind: 'ok', text: 'Rascunho salvo.' });
    return true;
  }

  async validate() {
    const res = await this.api.post<{ valid: boolean; issues: FlowIssue[] }>('/flows/validate', {
      definition: this.definition(),
    });
    if (!res.ok) return;
    this.issues.set(res.body.issues);
    this.validated.set(true);
    this.message.set(null);
  }

  async publish() {
    if (this.dirty() && !(await this.save())) return;
    const res = await this.api.post<FlowVersion | ApiError>(`/flows/${this.id()}/publish`);
    if (!res.ok) {
      const error = res.body as ApiError;
      this.issues.set(error.issues ?? []);
      this.message.set({ kind: 'error', text: error.issues ? 'O rascunho tem problemas. Veja a lista à direita.' : error.message });
      return;
    }
    const version = (res.body as FlowVersion).version;
    await this.load(this.id(), version);
    this.message.set({
      kind: 'ok',
      text: `Publicado como v${version}. Novas pendências dos tipos que seguem a última versão já começam nela.`,
    });
  }

  async discard() {
    const res = await this.api.del<Flow>(`/flows/${this.id()}/draft`);
    if (res.ok) await this.load(this.id());
  }

  // --- canvas events ---

  onCreateNode(event: FCreateNodeEvent<{ final: boolean }>) {
    if (this.readonly()) return;
    const final = !!event.data?.final;
    const position = { x: Math.round(event.rect.x), y: Math.round(event.rect.y) };
    const { def, id } = addState(this.definition()!, final ? 'Concluída' : 'Novo estado', position, final);
    this.change(def);
    this.select({ kind: 'state', id });
  }

  onCreateConnection(event: FCreateConnectionEvent) {
    if (this.readonly() || !event.targetId) return;
    const from = event.sourceId.replace(/^out-/, '');
    const to = event.targetId.replace(/^in-/, '');
    const used = new Set((this.definition()!.states[from]?.transitions ?? []).flatMap((t) => t.actions));
    const action =
      this.catalog()?.actions.find((a) => !used.has(a.id))?.id ?? ('APPROVE' as PendencyAction);
    const { def, ref } = addTransition(this.definition()!, from, to, [action]);
    this.change(def);
    this.selectTransition(ref);
  }

  onSelectionChange(event: FSelectionChangeEvent) {
    const [nodeId] = event.nodeIds;
    if (nodeId) this.select({ kind: 'state', id: nodeId });
  }

  moveState(id: string, position: { x: number; y: number }) {
    if (this.readonly()) return;
    const current = this.definition()!.states[id]?.position;
    if (current && current.x === position.x && current.y === position.y) return;
    this.change(updateState(this.definition()!, id, { position: { x: Math.round(position.x), y: Math.round(position.y) } }));
  }

  // --- palette blocks (HTML5 drag and drop onto transition chips) ---

  dragBlock(event: DragEvent, block: Block) {
    if (this.readonly()) return event.preventDefault();
    event.dataTransfer?.setData(BLOCK_MIME, JSON.stringify(block));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
  }

  onDragOver(event: DragEvent) {
    if (this.readonly() || !event.dataTransfer?.types.includes(BLOCK_MIME)) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).classList.add('drop-over');
  }

  onDragLeave(event: DragEvent) {
    (event.currentTarget as HTMLElement).classList.remove('drop-over');
  }

  onDrop(event: DragEvent, ref: TransitionRef) {
    event.preventDefault();
    (event.currentTarget as HTMLElement).classList.remove('drop-over');
    const raw = event.dataTransfer?.getData(BLOCK_MIME);
    if (!raw) return;
    this.selectTransition(ref);
    this.applyBlock(JSON.parse(raw) as Block);
  }

  /** Applies a block to the selected transition (drop or click). */
  applyBlock(block: Block) {
    const sel = this.selection();
    if (this.readonly() || sel?.kind !== 'transition') {
      if (!this.readonly()) this.message.set({ kind: 'ok', text: 'Selecione (ou solte em cima de) uma transição primeiro.' });
      return;
    }
    this.change(addToTransition(this.definition()!, sel.ref, block.field, block.value));
  }

  // --- selection and edits ---

  select(selection: Selection) {
    this.selection.set(selection);
  }

  selectTransition(ref: TransitionRef) {
    this.selection.set({ kind: 'transition', ref });
  }

  isSelected(ref: TransitionRef) {
    const sel = this.selection();
    return sel?.kind === 'transition' && sameRef(sel.ref, ref);
  }

  patchState(id: string, patch: { label?: string; final?: boolean }) {
    if (this.readonly()) return;
    this.change(updateState(this.definition()!, id, patch));
  }

  setInitial(id: string) {
    this.change({ ...this.definition()!, initial: id });
  }

  rename(from: string, raw: string) {
    const to = raw.trim();
    if (!/^[a-z][a-z0-9_]*$/.test(to)) {
      return this.message.set({ kind: 'error', text: `Id "${to}" inválido: use snake_case.` });
    }
    if (this.definition()!.states[to] && to !== from) {
      return this.message.set({ kind: 'error', text: `Já existe um estado "${to}".` });
    }
    this.change(renameState(this.definition()!, from, to));
    this.select({ kind: 'state', id: to });
  }

  removeState(id: string) {
    this.change(deleteState(this.definition()!, id));
    this.select(null);
  }

  patchTransition(patch: Partial<TransitionSpec>) {
    const sel = this.selection();
    if (this.readonly() || sel?.kind !== 'transition') return;
    this.change(updateTransition(this.definition()!, sel.ref, patch));
  }

  toggle(field: 'actions' | 'roles' | 'guards' | 'notify', value: string, on: boolean) {
    const t = this.selectedTransition();
    if (!t) return;
    const list = ((t.spec[field] ?? []) as string[]).filter((v) => v !== value);
    this.patchTransition({ [field]: on ? [...list, value] : list });
  }

  reorder(delta: -1 | 1) {
    const sel = this.selection();
    if (sel?.kind !== 'transition') return;
    const { def, ref } = moveTransition(this.definition()!, sel.ref, delta);
    this.change(def);
    this.selectTransition(ref);
  }

  removeTransition() {
    const sel = this.selection();
    if (sel?.kind !== 'transition') return;
    this.change(deleteTransition(this.definition()!, sel.ref));
    this.select(null);
  }

  rename$(name: string) {
    this.name.set(name);
    this.dirty.set(true);
  }

  private change(def: FlowDefinition) {
    this.definition.set(def);
    this.dirty.set(true);
    this.validated.set(false);
  }

  // --- display helpers ---

  actionLabel(id: string) {
    return this.catalog()?.actions.find((a) => a.id === id)?.label ?? id;
  }

  actionsLabel(actions: readonly string[]) {
    return actions.length ? actions.map((a) => this.actionLabel(a)).join(' | ') : 'sem ação';
  }

  labelOf(state: string) {
    return this.definition()?.states[state]?.label ?? state;
  }

  rolesShort(roles: Role[]) {
    if (!roles.length) return 'sem role';
    const labels = this.catalog()?.roles ?? [];
    return roles.map((r) => labels.find((l) => l.id === r)?.label.split(' ').at(-1) ?? r).join(', ');
  }

  transitionCountOf(state: string) {
    return this.definition()?.states[state]?.transitions?.length ?? 0;
  }

  shared(ref: TransitionRef) {
    return this.definition() ? sharedActions(this.definition()!, ref) : [];
  }

  /** Priority only matters when another way out listens to the same action. */
  hasPriority(ref: TransitionRef) {
    return this.shared(ref).length > 0;
  }

  outgoing(state: string) {
    return this.edges()
      .filter((e) => e.from === state)
      .flatMap((e) => e.items);
  }

  describe(_ref: TransitionRef, spec: TransitionSpec) {
    const guards = spec.guards?.length ? ` · guards: ${spec.guards.join(', ')}` : '';
    const notify = spec.notify?.length ? ` · notifica: ${spec.notify.join(', ')}` : '';
    return `${this.actionsLabel(spec.actions)} → ${this.labelOf(spec.to)} · roles: ${spec.roles.join(', ') || '—'}${guards}${notify}`;
  }
}
