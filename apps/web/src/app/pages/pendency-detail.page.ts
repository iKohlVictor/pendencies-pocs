import { DatePipe } from '@angular/common';
import { Component, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api, Session } from '../core/api';
import { PENDENCY_ACTION_LABEL, Pendency, PendencyAction } from '../core/models';
import { HistoryTable, WhoCanAct } from '../core/shared';

@Component({
  selector: 'app-pendency-detail-page',
  imports: [DatePipe, FormsModule, RouterLink, HistoryTable, WhoCanAct],
  template: `
    @if (pendency(); as p) {
      <a [routerLink]="['/eventos', p.eventId]" class="back">← evento {{ p.eventId }}</a>
      <h1>{{ p.title }} <code>{{ p.id }}</code></h1>
      <div class="row">
        <span class="badge st-{{ p.status }}" [class.ok]="p.resolved">{{ p.statusLabel }}</span>
        <span class="badge">tipo: <code>{{ p.type }}</code></span>
        <a class="badge" [routerLink]="['/fluxos', p.flow]" [queryParams]="{ v: p.flowVersion, atual: p.status }"
          title="Ver o grafo da versão em que esta pendência roda">
          fluxo: {{ p.flow }} v{{ p.flowVersion }}
        </a>
        <span class="muted small" title="Contador de lock otimista">rev {{ p.version }}</span>
      </div>

      <dl class="facts">
        @if (p.paymentDueAt) {
          <dt>Vencimento do pagamento</dt>
          <dd>
            {{ p.paymentDueAt | date: 'dd/MM/yyyy HH:mm' }}
            <span class="muted small">
              ({{ withinPaymentWindow(p.paymentDueAt) ? 'dentro de 48h: análise + programação' : 'fora de 48h: só análise' }})
            </span>
          </dd>
        }
        <dt>Documentos</dt><dd>{{ p.documents.length ? p.documents.join(', ') : '—' }}</dd>
        <dt>Comentário</dt><dd>{{ p.resolutionComment ?? '—' }}</dd>
        <dt>Justificativa da exceção</dt><dd>{{ p.exceptionJustification ?? '—' }}</dd>
        <dt>Motivo da rejeição</dt><dd>{{ p.rejectionReason ?? '—' }}</dd>
      </dl>

      <section class="card">
        <h2>Ações</h2>
        <p class="muted small">
          Destacadas: o que <strong>{{ session.currentUser()?.name ?? 'o usuário atual' }}</strong> pode
          fazer agora. As demais podem ser disparadas para conferir o erro.
        </p>
        <div class="actions-grid">
          <div class="action">
            <button [class.primary]="can('ATTACH_DOCUMENT')" (click)="attach()">{{ actionLabel.ATTACH_DOCUMENT }}</button>
            <input [(ngModel)]="documentId" placeholder="documentId" />
          </div>
          <div class="action">
            <button [class.primary]="can('RESOLVE_WITH_COMMENT')" (click)="resolve()">{{ actionLabel.RESOLVE_WITH_COMMENT }}</button>
            <input [(ngModel)]="comment" placeholder="comentário" />
          </div>
          <div class="action">
            <button [class.primary]="can('REQUEST_EXCEPTION')" (click)="requestException()">{{ actionLabel.REQUEST_EXCEPTION }}</button>
            <input [(ngModel)]="justification" placeholder="justificativa" />
          </div>
          <div class="action">
            <button [class.primary]="can('APPROVE')" (click)="approve()">{{ actionLabel.APPROVE }}</button>
          </div>
          <div class="action">
            <button [class.primary]="can('REJECT')" (click)="reject()">{{ actionLabel.REJECT }}</button>
            <input [(ngModel)]="reason" placeholder="motivo (vazio = testa o 422)" />
          </div>
        </div>
        <h3>Quem pode agir</h3>
        <app-who-can-act [path]="'/pendencies/' + p.id + '/actions'" [labels]="actionLabel" />
      </section>

      <section class="card">
        <h2>Histórico</h2>
        <app-history [entries]="p.history" />
      </section>
    } @else if (notFound()) {
      <a routerLink="/pendencias" class="back">← pendências</a>
      <div class="alert error">Pendência {{ id() }} não encontrada.</div>
    }
  `,
})
export class PendencyDetailPage {
  readonly id = input.required<string>();

  private readonly api = inject(Api);
  protected readonly session = inject(Session);
  protected readonly actionLabel = PENDENCY_ACTION_LABEL;

  protected readonly pendency = signal<Pendency | null>(null);
  protected readonly notFound = signal(false);
  protected readonly available = signal<string[]>([]);

  documentId = 'DOC-1';
  comment = '';
  justification = '';
  reason = '';

  constructor() {
    effect(() => {
      const id = this.id();
      this.api.changes();
      void this.api.get<Pendency>(`/pendencies/${id}`).then((r) => {
        this.notFound.set(!r.ok);
        this.pendency.set(r.ok ? r.body : null);
      });
    });
    effect(() => {
      const id = this.id();
      const user = this.session.userId();
      this.api.changes();
      if (!user) return this.available.set([]);
      void this.api
        .get<{ actions: string[] }>(`/pendencies/${id}/actions`)
        .then((r) => this.available.set(r.ok ? r.body.actions : []));
    });
  }

  /** Mesmo critério do guard da API (decidido no momento em que a análise aprova). */
  withinPaymentWindow(dueAt: string) {
    return Date.parse(dueAt) - Date.now() <= 48 * 60 * 60 * 1000;
  }

  can(a: PendencyAction) {
    return this.available().includes(a);
  }

  private path(action: string) {
    return `/pendencies/${this.id()}/${action}`;
  }

  async attach() {
    await this.api.post(this.path('attach-document'), { documentId: this.documentId });
  }

  async resolve() {
    const r = await this.api.post(this.path('resolve'), { comment: this.comment });
    if (r.ok) this.comment = '';
  }

  async requestException() {
    const r = await this.api.post(this.path('request-exception'), { justification: this.justification });
    if (r.ok) this.justification = '';
  }

  async approve() {
    await this.api.post(this.path('approve'));
  }

  async reject() {
    const body = this.reason.trim() ? { reason: this.reason.trim() } : {};
    const r = await this.api.post(this.path('reject'), body);
    if (r.ok) this.reason = '';
  }
}
