import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, Session } from '../core/api';
import { Profile, ROLE_LABEL, ROLES, Role, User } from '../core/models';

@Component({
  selector: 'app-users-page',
  imports: [FormsModule],
  template: `
    <h1>Usuários e perfis</h1>
    <p class="muted">
      O front manda só o <code>x-user-id</code>; os papéis vêm do perfil do usuário. Escolha quem está
      atuando no seletor do topo.
    </p>

    <section class="card">
      <div class="row between">
        <h2>Usuários</h2>
        <button (click)="seedDefaults()" [disabled]="busy()">Criar Ana, Paula e Diego</button>
      </div>
      <table>
        <thead>
          <tr><th>Id</th><th>Nome</th><th>Perfil</th><th>Papéis</th><th>Trocar perfil</th><th></th></tr>
        </thead>
        <tbody>
          @for (u of session.users(); track u.id) {
            <tr [class.selected]="u.id === session.userId()">
              <td><code>{{ u.id }}</code></td>
              <td>{{ u.name }}</td>
              <td>{{ u.profile.name }} <small class="muted">{{ u.profile.id }}</small></td>
              <td>
                @for (r of u.profile.roles; track r) {
                  <span class="badge role-{{ r }}">{{ roleLabel[r] }}</span>
                }
              </td>
              <td>
                <select #sel [value]="u.profile.id">
                  @for (p of profiles(); track p.id) {
                    <option [value]="p.id">{{ p.name }}</option>
                  }
                </select>
                <button class="ghost small" (click)="assign(u, sel.value)">salvar</button>
              </td>
              <td>
                <button class="small" (click)="session.setUser(u.id)" [disabled]="u.id === session.userId()">
                  atuar como
                </button>
              </td>
            </tr>
          } @empty {
            <tr><td colspan="6" class="muted">Nenhum usuário ainda.</td></tr>
          }
        </tbody>
      </table>

      <form class="row" (ngSubmit)="createUser()">
        <input name="userName" [(ngModel)]="userName" placeholder="Nome" required />
        <select name="userProfile" [(ngModel)]="userProfile" required>
          @for (p of profiles(); track p.id) {
            <option [value]="p.id">{{ p.name }} ({{ p.id }})</option>
          }
        </select>
        <button type="submit" [disabled]="busy()">Criar usuário</button>
      </form>
    </section>

    <section class="card">
      <h2>Perfis</h2>
      <table>
        <thead><tr><th>Id</th><th>Nome</th><th>Papéis</th></tr></thead>
        <tbody>
          @for (p of profiles(); track p.id) {
            <tr>
              <td><code>{{ p.id }}</code></td>
              <td>{{ p.name }}</td>
              <td>
                @for (r of p.roles; track r) {
                  <span class="badge role-{{ r }}">{{ roleLabel[r] }}</span>
                }
              </td>
            </tr>
          }
        </tbody>
      </table>

      <form class="row" (ngSubmit)="createProfile()">
        <input name="profileName" [(ngModel)]="profileName" placeholder="Nome do perfil" />
        @for (r of roles; track r) {
          <label class="check">
            <input type="checkbox" [checked]="profileRoles.has(r)" (change)="toggleRole(r)" />
            {{ roleLabel[r] }}
          </label>
        }
        <button type="submit" [disabled]="busy()">Criar perfil</button>
      </form>
    </section>
  `,
})
export class UsersPage {
  private readonly api = inject(Api);
  protected readonly session = inject(Session);
  protected readonly roleLabel = ROLE_LABEL;
  protected readonly roles = ROLES;

  protected readonly profiles = signal<Profile[]>([]);
  protected readonly busy = signal(false);

  userName = '';
  userProfile = 'PRF-1';
  profileName = '';
  profileRoles = new Set<Role>();

  constructor() {
    effect(() => {
      this.api.changes();
      void this.load();
    });
  }

  async load() {
    const res = await this.api.get<Profile[]>('/profiles');
    if (res.ok) this.profiles.set(res.body);
  }

  toggleRole(r: Role) {
    if (this.profileRoles.has(r)) this.profileRoles.delete(r);
    else this.profileRoles.add(r);
  }

  async createUser() {
    await this.run(() => this.api.post('/users', { name: this.userName, profileId: this.userProfile }));
    this.userName = '';
  }

  async createProfile() {
    await this.run(() =>
      this.api.post('/profiles', { name: this.profileName, roles: [...this.profileRoles] }),
    );
    this.profileName = '';
    this.profileRoles = new Set();
  }

  async assign(u: User, profileId: string) {
    await this.run(() => this.api.put(`/users/${u.id}/profile`, { profileId }));
  }

  /** Cria os três usuários do roteiro, um por perfil padrão. */
  async seedDefaults() {
    const byRole = (role: Role) =>
      this.profiles().find((p) => p.roles.length === 1 && p.roles[0] === role)?.id;
    await this.run(async () => {
      await this.api.post('/users', { name: 'Ana', profileId: byRole('branch') });
      await this.api.post('/users', { name: 'Paula', profileId: byRole('payment_scheduling') });
      await this.api.post('/users', { name: 'Diego', profileId: byRole('documentation_analysis') });
    });
  }

  private async run(fn: () => Promise<unknown>) {
    this.busy.set(true);
    try {
      await fn();
    } finally {
      this.busy.set(false);
    }
  }
}
