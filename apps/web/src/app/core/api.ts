import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { User } from './models';

export interface ApiResult<T = unknown> {
  ok: boolean;
  status: number;
  body: T;
}

export interface LogEntry {
  id: number;
  at: Date;
  method: string;
  path: string;
  userId: string | null;
  requestBody?: unknown;
  status: number;
  ok: boolean;
  body: unknown;
}

const USER_KEY = 'pendencies.userId';

function readStoredUser(): string | null {
  try {
    return localStorage.getItem(USER_KEY);
  } catch {
    return null;
  }
}

/** Usuário atual (vai no header x-user-id) e lista de usuários conhecidos. */
@Injectable({ providedIn: 'root' })
export class Session {
  readonly userId = signal<string | null>(readStoredUser());
  readonly users = signal<User[]>([]);
  readonly currentUser = computed(() => this.users().find((u) => u.id === this.userId()) ?? null);

  setUser(id: string | null) {
    this.userId.set(id);
    try {
      if (id) localStorage.setItem(USER_KEY, id);
      else localStorage.removeItem(USER_KEY);
    } catch {
      /* ignore */
    }
  }

  userName(id: string | null | undefined): string {
    if (!id) return '—';
    const u = this.users().find((x) => x.id === id);
    return u ? `${u.name} (${id})` : id;
  }
}

/** Cliente da API. Toda chamada passa pelo proxy /api -> http://localhost:3000. */
@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);
  private readonly session = inject(Session);
  private seq = 0;

  readonly log = signal<LogEntry[]>([]);
  /** Incrementado a cada mutação, para as telas recarregarem. */
  readonly changes = signal(0);

  get<T>(path: string, opts: { userId?: string | null; log?: boolean } = {}) {
    return this.request<T>('GET', path, undefined, opts);
  }

  post<T>(path: string, body?: unknown, opts: { userId?: string | null } = {}) {
    return this.request<T>('POST', path, body ?? {}, { ...opts, log: true });
  }

  put<T>(path: string, body?: unknown, opts: { userId?: string | null } = {}) {
    return this.request<T>('PUT', path, body ?? {}, { ...opts, log: true });
  }

  del<T>(path: string, opts: { userId?: string | null } = {}) {
    return this.request<T>('DELETE', path, undefined, { ...opts, log: true });
  }

  clearLog() {
    this.log.set([]);
  }

  async request<T>(
    method: string,
    path: string,
    body: unknown,
    opts: { userId?: string | null; log?: boolean } = {},
  ): Promise<ApiResult<T>> {
    const userId = opts.userId === undefined ? this.session.userId() : opts.userId;
    let headers = new HttpHeaders();
    if (userId) headers = headers.set('x-user-id', userId);

    let result: ApiResult<T>;
    try {
      const res = await firstValueFrom(
        this.http.request<T>(method, `/api${path}`, { body, headers, observe: 'response' }),
      );
      result = { ok: true, status: res.status, body: res.body as T };
    } catch (e) {
      if (!(e instanceof HttpErrorResponse)) throw e;
      result = { ok: false, status: e.status, body: (e.error ?? e.message) as T };
    }

    if (opts.log || !result.ok) {
      const entry: LogEntry = {
        id: ++this.seq,
        at: new Date(),
        method,
        path,
        userId,
        requestBody: method === 'GET' ? undefined : body,
        status: result.status,
        ok: result.ok,
        body: result.body,
      };
      this.log.update((l) => [entry, ...l].slice(0, 200));
    }
    if (method !== 'GET' && result.ok) this.changes.update((n) => n + 1);
    return result;
  }
}
