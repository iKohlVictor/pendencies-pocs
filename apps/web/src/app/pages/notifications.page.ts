import { Component, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { AppNotification, ROLE_LABEL, ROLES, Role } from '../core/models';

@Component({
  selector: 'app-notifications-page',
  imports: [DatePipe, RouterLink],
  template: `
    <h1>Notificações</h1>
    <div class="row">
      <label>
        Papel
        <select (change)="role.set($any($event.target).value)">
          <option value="">todos</option>
          @for (r of roles; track r) {
            <option [value]="r">{{ roleLabel[r] }}</option>
          }
        </select>
      </label>
    </div>
    <section class="card">
      <table>
        <thead><tr><th>Quando</th><th>Pendência</th><th>Papel</th><th>Mensagem</th></tr></thead>
        <tbody>
          @for (n of items(); track $index) {
            <tr>
              <td>{{ n.at | date: 'HH:mm:ss' }}</td>
              <td><a [routerLink]="['/pendencias', n.pendencyId]"><code>{{ n.pendencyId }}</code></a></td>
              <td><span class="badge role-{{ n.role }}">{{ roleLabel[n.role] }}</span></td>
              <td>{{ n.message }}</td>
            </tr>
          } @empty {
            <tr><td colspan="4" class="muted">Nenhuma notificação.</td></tr>
          }
        </tbody>
      </table>
    </section>
  `,
})
export class NotificationsPage {
  private readonly api = inject(Api);
  protected readonly roleLabel = ROLE_LABEL;
  protected readonly roles = ROLES;
  protected readonly role = signal<Role | ''>('');
  protected readonly items = signal<AppNotification[]>([]);

  constructor() {
    effect(() => {
      const role = this.role();
      this.api.changes();
      const q = role ? `?role=${role}` : '';
      void this.api.get<AppNotification[]>(`/notifications${q}`).then((r) => r.ok && this.items.set(r.body));
    });
  }
}
