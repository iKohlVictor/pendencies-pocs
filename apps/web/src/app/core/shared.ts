import { Component, effect, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Api, Session } from './api';
import { HistoryEntry } from './models';

/** Tabela de histórico (evento ou pendência). */
@Component({
  selector: 'app-history',
  imports: [DatePipe],
  template: `
    <table>
      <thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>De → Para</th><th>Detalhe</th></tr></thead>
      <tbody>
        @for (h of entries(); track $index) {
          <tr>
            <td>{{ h.at | date: 'HH:mm:ss' }}</td>
            <td>{{ session.userName(h.actorId) }}</td>
            <td><code>{{ h.action }}</code></td>
            <td><code>{{ h.from ?? '∅' }}</code> → <code>{{ h.to }}</code></td>
            <td>{{ h.detail ?? '' }}</td>
          </tr>
        }
      </tbody>
    </table>
  `,
})
export class HistoryTable {
  readonly entries = input.required<HistoryEntry[]>();
  protected readonly session = inject(Session);
}

/** Para cada usuário, consulta o endpoint de ações e mostra quem pode fazer o quê agora. */
@Component({
  selector: 'app-who-can-act',
  template: `
    <table class="compact">
      <thead><tr><th>Usuário</th><th>Perfil</th><th>Ações disponíveis</th></tr></thead>
      <tbody>
        @for (row of rows(); track row.id) {
          <tr [class.selected]="row.id === session.userId()">
            <td>
              <button class="link" (click)="session.setUser(row.id)" title="atuar como">
                {{ row.name }} <small>{{ row.id }}</small>
              </button>
            </td>
            <td>{{ row.profile }}</td>
            <td>
              @for (a of row.actions; track a) {
                <span class="badge ok">{{ labels()[a] ?? a }}</span>
              } @empty {
                <span class="muted">nenhuma</span>
              }
            </td>
          </tr>
        } @empty {
          <tr><td colspan="3" class="muted">Crie usuários em "Usuários".</td></tr>
        }
      </tbody>
    </table>
  `,
})
export class WhoCanAct {
  readonly path = input.required<string>();
  readonly labels = input<Record<string, string>>({});
  readonly refresh = input(0);

  protected readonly api = inject(Api);
  protected readonly session = inject(Session);
  protected readonly rows = signal<{ id: string; name: string; profile: string; actions: string[] }[]>(
    [],
  );

  constructor() {
    effect(() => {
      const path = this.path();
      const users = this.session.users();
      this.refresh();
      this.api.changes();
      void Promise.all(
        users.map(async (u) => {
          const res = await this.api.get<{ actions: string[] }>(path, { userId: u.id });
          return {
            id: u.id,
            name: u.name,
            profile: u.profile.name,
            actions: res.ok ? res.body.actions : [],
          };
        }),
      ).then((rows) => this.rows.set(rows));
    });
  }
}
