import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../core/api';
import {
  AppEvent,
  EventType,
  EventTypeInfo,
  PendencyTypeInfo,
  RELEASE_STATUS_LABEL,
} from '../core/models';

@Component({
  selector: 'app-events-page',
  imports: [FormsModule, RouterLink],
  template: `
    <h1>Eventos</h1>

    <section class="card">
      <h2>Abrir evento</h2>
      <form class="row" (ngSubmit)="open()">
        <select name="type" [(ngModel)]="type">
          @for (t of eventTypes(); track t.id) {
            <option [value]="t.id">{{ t.name }} ({{ t.id }})</option>
          }
        </select>
        <input name="name" [(ngModel)]="name" placeholder="Nome (opcional)" />
        <label class="small">
          Data de pagamento (opcional)
          <input name="due" type="datetime-local" [(ngModel)]="paymentDueAt" />
        </label>
        <button type="submit">Abrir</button>
      </form>
      <div class="catalog">
        @for (t of eventTypes(); track t.id) {
          <div>
            <strong>{{ t.name }}</strong> <code>{{ t.id }}</code> →
            @for (p of t.pendencyTypes; track p) {
              <span class="badge">{{ pendencyTypeName(p) }} · {{ pendencyFlow(p) }}</span>
            } @empty {
              <span class="muted">sem pendências pré-definidas</span>
            }
          </div>
        }
      </div>
    </section>

    <section class="card">
      <div class="row between">
        <h2>Todos os eventos</h2>
        <button class="ghost small" (click)="load()">recarregar</button>
      </div>
      <table>
        <thead>
          <tr><th>Id</th><th>Nome</th><th>Tipo</th><th>Liberação</th><th>Pendências</th><th>Concluído</th></tr>
        </thead>
        <tbody>
          @for (e of events(); track e.id) {
            <tr class="clickable" [routerLink]="['/eventos', e.id]">
              <td><code>{{ e.id }}</code></td>
              <td>{{ e.name }}</td>
              <td><code>{{ e.type }}</code></td>
              <td><span class="badge rs-{{ e.releaseStatus }}">{{ releaseLabel[e.releaseStatus] }}</span></td>
              <td>
                <span class="badge" [class.ok]="e.pendencies.status === 'ok'">
                  {{ e.pendencies.resolved }}/{{ e.pendencies.total }} resolvidas
                </span>
              </td>
              <td>{{ e.completed ? '✅' : '—' }}</td>
            </tr>
          } @empty {
            <tr><td colspan="6" class="muted">Nenhum evento. Abra um acima.</td></tr>
          }
        </tbody>
      </table>
    </section>
  `,
})
export class EventsPage {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  protected readonly releaseLabel = RELEASE_STATUS_LABEL;

  protected readonly events = signal<AppEvent[]>([]);
  protected readonly eventTypes = signal<EventTypeInfo[]>([]);
  protected readonly pendencyTypes = signal<PendencyTypeInfo[]>([]);

  type: EventType = 'resolve_documentation';
  name = '';
  /** datetime-local (hora local). Vazio = evento sem data de pagamento. */
  paymentDueAt = '';

  constructor() {
    void this.loadCatalog();
    effect(() => {
      this.api.changes();
      void this.load();
    });
  }

  async loadCatalog() {
    const [et, pt] = await Promise.all([
      this.api.get<EventTypeInfo[]>('/event-types'),
      this.api.get<PendencyTypeInfo[]>('/pendency-types'),
    ]);
    if (et.ok) this.eventTypes.set(et.body);
    if (pt.ok) this.pendencyTypes.set(pt.body);
  }

  async load() {
    const res = await this.api.get<AppEvent[]>('/events');
    if (res.ok) this.events.set(res.body);
  }

  pendencyTypeName(id: string) {
    return this.pendencyTypes().find((p) => p.id === id)?.name ?? id;
  }

  pendencyFlow(id: string) {
    const t = this.pendencyTypes().find((p) => p.id === id);
    return t ? `${t.flowId} v${t.effectiveVersion}` : '';
  }

  async open() {
    const body: Record<string, string> = { type: this.type };
    if (this.name.trim()) body['name'] = this.name.trim();
    if (this.paymentDueAt) body['paymentDueAt'] = new Date(this.paymentDueAt).toISOString();
    const res = await this.api.post<AppEvent>('/events', body);
    if (res.ok) {
      this.name = '';
      this.paymentDueAt = '';
      void this.router.navigate(['/eventos', res.body.id]);
    }
  }
}
