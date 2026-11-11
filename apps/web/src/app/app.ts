import { Component, effect, inject, signal } from '@angular/core';
import { JsonPipe, DatePipe } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Api, Session } from './core/api';
import { ROLE_LABEL, User } from './core/models';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, JsonPipe, DatePipe],
  template: `
    <header class="topbar">
      <strong class="brand">Pendências · teste de fluxo</strong>
      <nav>
        <a routerLink="/eventos" routerLinkActive="active">Eventos</a>
        <a routerLink="/pendencias" routerLinkActive="active">Pendências</a>
        <a routerLink="/notificacoes" routerLinkActive="active">Notificações</a>
        <a routerLink="/usuarios" routerLinkActive="active">Usuários</a>
        <a routerLink="/roteiro" routerLinkActive="active">Roteiro</a>
      </nav>
      <label class="actor">
        Atuando como
        <select [value]="session.userId() ?? ''" (change)="pickUser($any($event.target).value)">
          <option value="">(sem x-user-id)</option>
          @for (u of session.users(); track u.id) {
            <option [value]="u.id">{{ u.name }} · {{ u.id }} · {{ u.profile.name }}</option>
          }
        </select>
      </label>
      @if (session.currentUser(); as u) {
        <span class="roles">
          @for (r of u.profile.roles; track r) {
            <span class="badge role-{{ r }}">{{ roleLabel[r] }}</span>
          }
        </span>
      }
    </header>

    <div class="layout">
      <main>
        @if (apiDown()) {
          <div class="alert error">
            Não consegui falar com a API. Suba com <code>pnpm dev</code> na raiz (porta 3000).
          </div>
        }
        <router-outlet />
      </main>

      <aside class="log">
        <div class="log-head">
          <strong>Chamadas</strong>
          <button class="ghost small" (click)="api.clearLog()">limpar</button>
        </div>
        @for (e of api.log(); track e.id) {
          <details class="log-entry" [class.fail]="!e.ok" [open]="$first">
            <summary>
              <span class="status s{{ statusClass(e.status) }}">{{ e.status || 'ERR' }}</span>
              <code>{{ e.method }} {{ e.path }}</code>
              <small>{{ e.userId ?? 'sem usuário' }} · {{ e.at | date: 'HH:mm:ss' }}</small>
            </summary>
            @if (e.requestBody !== undefined) {
              <div class="muted small">request</div>
              <pre>{{ e.requestBody | json }}</pre>
            }
            <div class="muted small">response</div>
            <pre>{{ e.body | json }}</pre>
          </details>
        } @empty {
          <p class="muted small">As mutações e os erros aparecem aqui.</p>
        }
      </aside>
    </div>
  `,
})
export class App {
  protected readonly api = inject(Api);
  protected readonly session = inject(Session);
  protected readonly roleLabel = ROLE_LABEL;
  protected readonly apiDown = signal(false);

  constructor() {
    // Recarrega usuários depois de qualquer mutação (criar usuário, trocar perfil...).
    effect(() => {
      this.api.changes();
      void this.loadUsers();
    });
  }

  async loadUsers() {
    const res = await this.api.get<User[]>('/users', { userId: null });
    this.apiDown.set(!res.ok && (res.status === 0 || res.status >= 500));
    if (res.ok) this.session.users.set(res.body);
  }

  pickUser(id: string) {
    this.session.setUser(id || null);
  }

  statusClass(status: number) {
    return Math.floor(status / 100);
  }
}
