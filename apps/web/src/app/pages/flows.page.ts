import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmLabel } from '@spartan-ng/helm/label';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';
import { Api } from '../core/api';
import { ApiError, Flow, FlowSummary, PendencyTypeInfo } from '../core/models';

@Component({
  selector: 'app-flows-page',
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    HlmAlertImports,
    HlmBadge,
    HlmButton,
    HlmCardImports,
    HlmInput,
    HlmLabel,
    HlmNativeSelectImports,
  ],
  template: `
    <div class="spartan flex flex-col gap-4">
      <div>
        <h1 class="text-2xl font-semibold">Fluxos</h1>
        <p class="text-muted-foreground text-sm">
          Cada fluxo é um JSON versionado. Você edita um rascunho e publica como uma nova versão imutável.
          Pendências já abertas continuam na versão em que começaram.
        </p>
      </div>

      @if (error(); as e) {
        <div hlmAlert variant="destructive">
          <p hlmAlertTitle>{{ e }}</p>
        </div>
      }

      <section hlmCard>
        <div hlmCardHeader>
          <h2 hlmCardTitle>Fluxos cadastrados</h2>
          <p hlmCardDescription>Clique para abrir o editor.</p>
        </div>
        <div hlmCardContent>
          <table class="w-full text-sm">
            <thead>
              <tr class="text-muted-foreground border-b text-left">
                <th class="py-2 font-medium">Fluxo</th>
                <th class="py-2 font-medium">Última versão</th>
                <th class="py-2 font-medium">Versões</th>
                <th class="py-2 font-medium">Rascunho</th>
              </tr>
            </thead>
            <tbody>
              @for (f of flows(); track f.id) {
                <tr class="hover:bg-muted/50 cursor-pointer border-b" [routerLink]="['/fluxos', f.id]">
                  <td class="py-2">
                    <span class="font-medium">{{ f.name }}</span>
                    <code class="text-muted-foreground ml-2 text-xs">{{ f.id }}</code>
                  </td>
                  <td class="py-2">
                    @if (f.latestVersion) {
                      <span hlmBadge variant="secondary">v{{ f.latestVersion }}</span>
                      <span class="text-muted-foreground ml-2 text-xs">
                        {{ f.versions[f.versions.length - 1].publishedAt | date: 'dd/MM HH:mm' }}
                      </span>
                    } @else {
                      <span class="text-muted-foreground">nunca publicado</span>
                    }
                  </td>
                  <td class="py-2">
                    @for (v of f.versions; track v.version) {
                      <span hlmBadge variant="outline" class="mr-1">v{{ v.version }}</span>
                    }
                  </td>
                  <td class="py-2">
                    @if (f.hasDraft) {
                      <span hlmBadge>rascunho pendente</span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div hlmCardFooter class="flex flex-wrap items-end gap-3">
          <div class="flex flex-col gap-1.5">
            <label hlmLabel for="new-flow-id">Id</label>
            <input hlmInput id="new-flow-id" class="w-48" [(ngModel)]="newId" placeholder="ex.: aprovacao_rapida" />
          </div>
          <div class="flex flex-col gap-1.5">
            <label hlmLabel for="new-flow-name">Nome</label>
            <input hlmInput id="new-flow-name" class="w-64" [(ngModel)]="newName" placeholder="Aprovação rápida" />
          </div>
          <button hlmBtn (click)="create()" [disabled]="!newId.trim()">Novo fluxo</button>
        </div>
      </section>

      <section hlmCard>
        <div hlmCardHeader>
          <h2 hlmCardTitle>Tipos de pendência</h2>
          <p hlmCardDescription>
            Qual fluxo cada tipo usa. "Sempre a última" acompanha cada publicação; fixar uma versão congela o
            tipo nela. Só vale para pendências novas.
          </p>
        </div>
        <div hlmCardContent>
          <table class="w-full text-sm">
            <thead>
              <tr class="text-muted-foreground border-b text-left">
                <th class="py-2 font-medium">Tipo</th>
                <th class="py-2 font-medium">Fluxo</th>
                <th class="py-2 font-medium">Versão</th>
                <th class="py-2 font-medium">Novas pendências em</th>
              </tr>
            </thead>
            <tbody>
              @for (t of types(); track t.id) {
                <tr class="border-b">
                  <td class="py-2">
                    <span class="font-medium">{{ t.name }}</span>
                    <code class="text-muted-foreground ml-2 text-xs">{{ t.id }}</code>
                  </td>
                  <td class="py-2 pr-2">
                    <hlm-native-select size="sm" [ngModel]="t.flowId" (ngModelChange)="bind(t, $event, null)">
                      @for (f of publishedFlows(); track f.id) {
                        <option hlmNativeSelectOption [value]="f.id">{{ f.name }} ({{ f.id }})</option>
                      }
                    </hlm-native-select>
                  </td>
                  <td class="py-2 pr-2">
                    <hlm-native-select
                      size="sm"
                      [ngModel]="t.pinnedVersion === null ? '' : '' + t.pinnedVersion"
                      (ngModelChange)="bind(t, t.flowId, $event === '' ? null : +$event)"
                    >
                      <option hlmNativeSelectOption value="">Sempre a última</option>
                      @for (v of versionsOf(t.flowId); track v) {
                        <option hlmNativeSelectOption [value]="'' + v">v{{ v }}</option>
                      }
                    </hlm-native-select>
                  </td>
                  <td class="py-2">
                    <a [routerLink]="['/fluxos', t.flowId]" [queryParams]="{ v: t.effectiveVersion }">
                      <span hlmBadge variant="secondary">{{ t.flowId }} v{{ t.effectiveVersion }}</span>
                    </a>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `,
})
export class FlowsPage {
  private readonly api = inject(Api);
  private readonly router = inject(Router);

  protected readonly flows = signal<FlowSummary[]>([]);
  protected readonly types = signal<PendencyTypeInfo[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly publishedFlows = computed(() => this.flows().filter((f) => f.latestVersion > 0));

  newId = '';
  newName = '';

  constructor() {
    effect(() => {
      this.api.changes();
      void this.load();
    });
  }

  private async load() {
    const [flows, types] = await Promise.all([
      this.api.get<FlowSummary[]>('/flows'),
      this.api.get<PendencyTypeInfo[]>('/pendency-types'),
    ]);
    if (flows.ok) this.flows.set(flows.body);
    if (types.ok) this.types.set(types.body);
  }

  versionsOf(flowId: string): number[] {
    return (this.flows().find((f) => f.id === flowId)?.versions ?? []).map((v) => v.version);
  }

  async bind(type: PendencyTypeInfo, flowId: string, version: number | null) {
    const res = await this.api.put<PendencyTypeInfo | ApiError>(`/pendency-types/${type.id}/flow`, { flowId, version });
    this.error.set(res.ok ? null : (res.body as ApiError).message);
  }

  async create() {
    const res = await this.api.post<Flow | ApiError>('/flows', { id: this.newId.trim(), name: this.newName.trim() });
    if (!res.ok) return this.error.set((res.body as ApiError).message);
    this.error.set(null);
    await this.router.navigate(['/fluxos', (res.body as Flow).id]);
  }
}
