import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { PENDENCY_STATUS_LABEL, Pendency, PendencyStatus } from '../core/models';

@Component({
  selector: 'app-pendencies-page',
  imports: [RouterLink],
  template: `
    <h1>Pendências</h1>
    <div class="row">
      <label>
        Status
        <select (change)="filter.set($any($event.target).value)">
          <option value="">todos</option>
          @for (s of statuses; track s) {
            <option [value]="s">{{ statusLabel[s] }}</option>
          }
        </select>
      </label>
    </div>
    <section class="card">
      <table>
        <thead><tr><th>Id</th><th>Evento</th><th>Título</th><th>Tipo</th><th>Fluxo</th><th>Status</th></tr></thead>
        <tbody>
          @for (p of visible(); track p.id) {
            <tr class="clickable" [routerLink]="['/pendencias', p.id]">
              <td><code>{{ p.id }}</code></td>
              <td><code>{{ p.eventId }}</code></td>
              <td>{{ p.title }}</td>
              <td><code>{{ p.type }}</code></td>
              <td>{{ p.flow }}</td>
              <td><span class="badge st-{{ p.status }}">{{ statusLabel[p.status] }}</span></td>
            </tr>
          } @empty {
            <tr><td colspan="6" class="muted">Nenhuma pendência.</td></tr>
          }
        </tbody>
      </table>
    </section>
  `,
})
export class PendenciesPage {
  private readonly api = inject(Api);
  protected readonly statusLabel = PENDENCY_STATUS_LABEL;
  protected readonly statuses = Object.keys(PENDENCY_STATUS_LABEL) as PendencyStatus[];
  protected readonly pendencies = signal<Pendency[]>([]);
  protected readonly filter = signal('');
  protected readonly visible = computed(() =>
    this.filter() ? this.pendencies().filter((p) => p.status === this.filter()) : this.pendencies(),
  );

  constructor() {
    effect(() => {
      this.api.changes();
      void this.api.get<Pendency[]>('/pendencies').then((r) => r.ok && this.pendencies.set(r.body));
    });
  }
}
