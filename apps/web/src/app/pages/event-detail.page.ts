import { DatePipe } from '@angular/common';
import { Component, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api, Session } from '../core/api';
import {
  AppEvent,
  Pendency,
  PendencyType,
  PendencyTypeInfo,
  RELEASE_ACTION_LABEL,
  RELEASE_STATUS_LABEL,
  ReleaseAction,
} from '../core/models';
import { HistoryTable, WhoCanAct } from '../core/shared';

@Component({
  selector: 'app-event-detail-page',
  imports: [DatePipe, FormsModule, RouterLink, HistoryTable, WhoCanAct],
  template: `
    <a routerLink="/eventos" class="back">← eventos</a>
    @if (event(); as e) {
      <h1>{{ e.name }} <code>{{ e.id }}</code></h1>
      <div class="row">
        <span class="badge">tipo: <code>{{ e.type }}</code></span>
        <span class="badge rs-{{ e.releaseStatus }}">{{ releaseLabel[e.releaseStatus] }}</span>
        <span class="badge" [class.ok]="e.pendencies.status === 'ok'">
          pendências {{ e.pendencies.status }} · {{ e.pendencies.resolved }}/{{ e.pendencies.total }}
        </span>
        <span class="badge" [class.ok]="e.completed">completed: {{ e.completed }}</span>
        @if (e.paymentDueAt) {
          <span class="badge">pagamento: {{ e.paymentDueAt | date: 'dd/MM/yyyy HH:mm' }}</span>
        }
        <span class="muted small">v{{ e.version }}</span>
      </div>

      <section class="card">
        <h2>Liberação</h2>
        <p class="muted small">
          Destacadas: ações que <strong>{{ session.currentUser()?.name ?? 'o usuário atual' }}</strong>
          pode executar agora. As outras também podem ser disparadas, para ver o erro (403/409/422).
        </p>
        <div class="row">
          @for (a of releaseActions; track a) {
            <button [class.primary]="available().includes(a)" [class.ghost]="!available().includes(a)" (click)="act(a)">
              {{ releaseActionLabel[a] }}
            </button>
          }
          <input [(ngModel)]="returnReason" placeholder="motivo da devolução (opcional)" />
        </div>
        <h3>Quem pode agir</h3>
        <app-who-can-act [path]="'/events/' + e.id + '/actions'" [labels]="releaseActionLabel" />
      </section>

      <section class="card">
        <h2>Pendências</h2>
        <table>
          <thead><tr><th>Id</th><th>Título</th><th>Tipo</th><th>Fluxo</th><th>Status</th></tr></thead>
          <tbody>
            @for (p of pendencies(); track p.id) {
              <tr class="clickable" [routerLink]="['/pendencias', p.id]">
                <td><code>{{ p.id }}</code></td>
                <td>{{ p.title }}</td>
                <td><code>{{ p.type }}</code></td>
                <td>{{ p.flow }} <span class="muted small">v{{ p.flowVersion }}</span></td>
                <td><span class="badge st-{{ p.status }}" [class.ok]="p.resolved">{{ p.statusLabel }}</span></td>
              </tr>
            } @empty {
              <tr><td colspan="5" class="muted">Sem pendências.</td></tr>
            }
          </tbody>
        </table>
        <form class="row" (ngSubmit)="addPendency(e.id)">
          <select name="ptype" [(ngModel)]="newType">
            @for (t of pendencyTypes(); track t.id) {
              <option [value]="t.id">{{ t.name }} ({{ t.flowId }} v{{ t.effectiveVersion }})</option>
            }
          </select>
          <input name="ptitle" [(ngModel)]="newTitle" placeholder="Título (opcional)" />
          @if (newType === 'payment' && !e.paymentDueAt) {
            <label class="small">
              Vencimento do pagamento
              <input name="pdue" type="datetime-local" [(ngModel)]="newPaymentDueAt" />
            </label>
          } @else if (newType === 'payment') {
            <span class="muted small">segue a data de pagamento do evento</span>
          }
          <button type="submit">Adicionar pendência</button>
        </form>
      </section>

      <section class="card">
        <h2>Histórico</h2>
        <app-history [entries]="e.history" />
      </section>
    } @else if (notFound()) {
      <div class="alert error">Evento {{ id() }} não encontrado.</div>
    }
  `,
})
export class EventDetailPage {
  readonly id = input.required<string>();

  private readonly api = inject(Api);
  protected readonly session = inject(Session);
  protected readonly releaseLabel = RELEASE_STATUS_LABEL;
  protected readonly releaseActionLabel = RELEASE_ACTION_LABEL;
  protected readonly releaseActions: ReleaseAction[] = ['START_ANALYSIS', 'RETURN', 'SCHEDULE'];

  protected readonly event = signal<AppEvent | null>(null);
  protected readonly notFound = signal(false);
  protected readonly pendencies = signal<Pendency[]>([]);
  protected readonly pendencyTypes = signal<PendencyTypeInfo[]>([]);
  protected readonly available = signal<string[]>([]);

  returnReason = '';
  newType: PendencyType = 'missing_invoice';
  newTitle = '';
  /** datetime-local (hora local). Vazio = testa o 422 da API. */
  newPaymentDueAt = '';

  constructor() {
    void this.api.get<PendencyTypeInfo[]>('/pendency-types').then((r) => r.ok && this.pendencyTypes.set(r.body));
    effect(() => {
      const id = this.id();
      this.api.changes();
      void this.load(id);
    });
    effect(() => {
      const id = this.id();
      const user = this.session.userId();
      this.api.changes();
      void this.loadActions(id, user);
    });
  }

  async load(id: string) {
    const [e, p] = await Promise.all([
      this.api.get<AppEvent>(`/events/${id}`),
      this.api.get<Pendency[]>(`/events/${id}/pendencies`),
    ]);
    this.notFound.set(!e.ok);
    this.event.set(e.ok ? e.body : null);
    if (p.ok) this.pendencies.set(p.body);
  }

  async loadActions(id: string, user: string | null) {
    if (!user) return this.available.set([]);
    const res = await this.api.get<{ actions: string[] }>(`/events/${id}/actions`);
    this.available.set(res.ok ? res.body.actions : []);
  }

  async act(a: ReleaseAction) {
    const id = this.id();
    const path = { START_ANALYSIS: 'start-analysis', RETURN: 'return', SCHEDULE: 'schedule' }[a];
    const body = a === 'RETURN' && this.returnReason.trim() ? { reason: this.returnReason.trim() } : {};
    const res = await this.api.post(`/events/${id}/${path}`, body);
    if (res.ok) this.returnReason = '';
  }

  async addPendency(eventId: string) {
    const body: Record<string, string> = { type: this.newType };
    if (this.newTitle.trim()) body['title'] = this.newTitle.trim();
    if (this.newType === 'payment' && this.newPaymentDueAt) {
      body['paymentDueAt'] = new Date(this.newPaymentDueAt).toISOString();
    }
    const res = await this.api.post(`/events/${eventId}/pendencies`, body);
    if (res.ok) {
      this.newTitle = '';
      this.newPaymentDueAt = '';
    }
  }
}
