import { Component, inject, signal } from '@angular/core';
import { JsonPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Api, ApiResult } from '../core/api';
import { AppEvent, Pendency, Profile, Role, User } from '../core/models';

/** Ids descobertos durante a execução (a API é in-memory, então não dá para assumir USR-1/EVT-1). */
interface Ctx {
  profiles: Partial<Record<Role, string>>;
  ana?: string;
  paula?: string;
  diego?: string;
  evt1?: string;
  pend1?: string;
  pend2?: string;
  evt2?: string;
  pend3?: string;
  evt3?: string;
}

interface Step {
  section?: string;
  title: string;
  expect: number;
  run: (api: Api, c: Ctx) => Promise<ApiResult<any>>;
  /** Captura ids e faz checagens extras; devolve mensagem de erro ou nada. */
  after?: (res: ApiResult<any>, c: Ctx, api: Api) => Promise<string | void> | string | void;
}

type StepState = { status: 'idle' | 'running' | 'pass' | 'fail'; got?: number; note?: string; body?: unknown };

const pendByType = async (api: Api, eventId: string, type: string) => {
  const r = await api.get<Pendency[]>(`/events/${eventId}/pendencies`);
  return r.ok ? r.body.find((p) => p.type === type)?.id : undefined;
};

const STEPS: Step[] = [
  {
    section: 'Parte 0 · perfis e usuários',
    title: 'Lista perfis padrão',
    expect: 200,
    run: (api) => api.get('/profiles'),
    after: (res, c) => {
      for (const p of res.body as Profile[]) if (p.roles.length === 1) c.profiles[p.roles[0]] ??= p.id;
      if (!c.profiles.branch || !c.profiles.payment_scheduling || !c.profiles.documentation_analysis)
        return 'perfis padrão não encontrados';
      return undefined;
    },
  },
  {
    title: 'Cria Ana (filial)',
    expect: 201,
    run: (api, c) => api.post('/users', { name: 'Ana', profileId: c.profiles.branch }),
    after: (r, c) => void (c.ana = (r.body as User).id),
  },
  {
    title: 'Cria Paula (programação de pagamento)',
    expect: 201,
    run: (api, c) => api.post('/users', { name: 'Paula', profileId: c.profiles.payment_scheduling }),
    after: (r, c) => void (c.paula = (r.body as User).id),
  },
  {
    title: 'Cria Diego (análise de documentação)',
    expect: 201,
    run: (api, c) => api.post('/users', { name: 'Diego', profileId: c.profiles.documentation_analysis }),
    after: (r, c) => void (c.diego = (r.body as User).id),
  },
  {
    section: 'Parte 1 · evento tipado e suas pendências',
    title: '1. Paula abre evento resolve_documentation',
    expect: 201,
    run: (api, c) => api.post('/events', { type: 'resolve_documentation' }, { userId: c.paula }),
    after: async (r, c, api) => {
      c.evt1 = (r.body as AppEvent).id;
      c.pend1 = await pendByType(api, c.evt1, 'missing_invoice');
      c.pend2 = await pendByType(api, c.evt1, 'unsigned_contract');
      if (!c.pend1 || !c.pend2) return 'evento não nasceu com missing_invoice + unsigned_contract';
      return undefined;
    },
  },
  {
    title: '2. Pendências criadas junto com o evento',
    expect: 200,
    run: (api, c) => api.get(`/events/${c.evt1}/pendencies`),
    after: (r) => ((r.body as Pendency[]).length !== 2 ? 'esperava 2 pendências' : undefined),
  },
  {
    title: '3. Ações da filial na PEND missing_invoice',
    expect: 200,
    run: (api, c) => api.get(`/pendencies/${c.pend1}/actions`, { userId: c.ana }),
    after: (r) =>
      (r.body as { actions: string[] }).actions.includes('REQUEST_EXCEPTION') ? undefined : 'sem REQUEST_EXCEPTION',
  },
  {
    title: '4. Filial solicita exceção → programação',
    expect: 200,
    run: (api, c) =>
      api.post(`/pendencies/${c.pend1}/request-exception`, { justification: 'fornecedor só emite a nota dia 20' }, { userId: c.ana }),
    after: (r) => expectStatus(r, 'in_payment_scheduling_review'),
  },
  {
    title: '5. Documentação tenta aprovar antes da hora → 403',
    expect: 403,
    run: (api, c) => api.post(`/pendencies/${c.pend1}/approve`, {}, { userId: c.diego }),
  },
  {
    title: '6. Programação aprova a exceção → documentação',
    expect: 200,
    run: (api, c) => api.post(`/pendencies/${c.pend1}/approve`, {}, { userId: c.paula }),
    after: (r) => expectStatus(r, 'in_documentation_review'),
  },
  {
    title: '7. Documentação rejeita sem motivo → 422',
    expect: 422,
    run: (api, c) => api.post(`/pendencies/${c.pend1}/reject`, {}, { userId: c.diego }),
  },
  {
    title: '8. Documentação rejeita com motivo → volta para a filial',
    expect: 200,
    run: (api, c) => api.post(`/pendencies/${c.pend1}/reject`, { reason: 'falta o comprovante' }, { userId: c.diego }),
    after: (r) => expectStatus(r, 'pending_branch'),
  },
  {
    title: '9. Filial anexa documento → documentação',
    expect: 200,
    run: (api, c) => api.post(`/pendencies/${c.pend1}/attach-document`, { documentId: 'DOC-9' }, { userId: c.ana }),
    after: (r) => expectStatus(r, 'in_documentation_review'),
  },
  {
    title: '10. Documentação aprova → concluída',
    expect: 200,
    run: (api, c) => api.post(`/pendencies/${c.pend1}/approve`, {}, { userId: c.diego }),
    after: (r) => expectStatus(r, 'completed'),
  },
  {
    title: '11. Qualquer ação depois disso → 409 FINAL_STATE',
    expect: 409,
    run: (api, c) => api.post(`/pendencies/${c.pend1}/approve`, {}, { userId: c.diego }),
  },
  {
    section: 'Parte 2 · liberação do evento',
    title: '12. Evento com 1 de 2 resolvidas → pending',
    expect: 200,
    run: (api, c) => api.get(`/events/${c.evt1}`),
    after: (r) => {
      const e = r.body as AppEvent;
      if (e.pendencies.status !== 'pending' || e.pendencies.resolved !== 1) return 'esperava pending 1/2';
      return undefined;
    },
  },
  {
    title: '13. Filial tenta iniciar análise → 403',
    expect: 403,
    run: (api, c) => api.post(`/events/${c.evt1}/start-analysis`, {}, { userId: c.ana }),
  },
  {
    title: '14. Programação inicia a análise → in_analysis',
    expect: 200,
    run: (api, c) => api.post(`/events/${c.evt1}/start-analysis`, {}, { userId: c.paula }),
    after: (r) => ((r.body as AppEvent).releaseStatus === 'in_analysis' ? undefined : 'não foi para in_analysis'),
  },
  {
    title: '15. Programar com pendência aberta → 422 GUARD_FAILED',
    expect: 422,
    run: (api, c) => api.post(`/events/${c.evt1}/schedule`, {}, { userId: c.paula }),
  },
  {
    title: '16. Ações disponíveis: só RETURN',
    expect: 200,
    run: (api, c) => api.get(`/events/${c.evt1}/actions`, { userId: c.paula }),
    after: (r) => {
      const a = (r.body as { actions: string[] }).actions;
      if (a.length !== 1 || a[0] !== 'RETURN') return `esperava [RETURN], veio ${JSON.stringify(a)}`;
      return undefined;
    },
  },
  {
    title: '17. Filial resolve a unsigned_contract com comentário',
    expect: 200,
    run: (api, c) => api.post(`/pendencies/${c.pend2}/resolve`, { comment: 'contrato assinado e enviado' }, { userId: c.ana }),
  },
  {
    title: '18. Documentação aprova',
    expect: 200,
    run: (api, c) => api.post(`/pendencies/${c.pend2}/approve`, {}, { userId: c.diego }),
    after: (r) => expectStatus(r, 'completed'),
  },
  {
    title: '19. Programa → scheduled e completed: true',
    expect: 200,
    run: (api, c) => api.post(`/events/${c.evt1}/schedule`, {}, { userId: c.paula }),
    after: (r) => {
      const e = r.body as AppEvent;
      if (e.releaseStatus !== 'scheduled' || !e.completed) return 'esperava scheduled + completed';
      return undefined;
    },
  },
  {
    section: 'Parte 3 · outros tipos',
    title: '20. Evento supplier_onboarding',
    expect: 201,
    run: (api, c) => api.post('/events', { type: 'supplier_onboarding' }, { userId: c.paula }),
    after: async (r, c, api) => {
      c.evt2 = (r.body as AppEvent).id;
      c.pend3 = await pendByType(api, c.evt2, 'registration_update');
      if (!c.pend3) return 'sem pendência registration_update';
      return undefined;
    },
  },
  {
    title: '21. Fluxo direct não tem exceção → 409 INVALID_EVENT',
    expect: 409,
    run: (api, c) =>
      api.post(`/pendencies/${c.pend3}/request-exception`, { justification: 'não se aplica' }, { userId: c.ana }),
  },
  {
    title: '22. Evento ad_hoc com nome próprio',
    expect: 201,
    run: (api, c) => api.post('/events', { type: 'ad_hoc', name: 'Fechamento de março' }, { userId: c.paula }),
    after: (r, c) => {
      const e = r.body as AppEvent;
      c.evt3 = e.id;
      if (e.pendencies.total !== 0) return 'ad_hoc deveria nascer sem pendências';
      return undefined;
    },
  },
  {
    title: '23. Pendência adicionada à mão',
    expect: 201,
    run: (api, c) =>
      api.post(`/events/${c.evt3}/pendencies`, { type: 'missing_invoice', title: 'Nota 4411 ausente' }, { userId: c.diego }),
  },
  {
    title: 'Notificações geradas',
    expect: 200,
    run: (api) => api.get('/notifications'),
  },
];

function expectStatus(r: ApiResult<any>, status: string) {
  const got = (r.body as Pendency).status;
  return got === status ? undefined : `status ${got}, esperava ${status}`;
}

@Component({
  selector: 'app-scenario-page',
  imports: [JsonPipe, RouterLink],
  template: `
    <div class="row between">
      <h1>Roteiro de testes</h1>
      <div class="row">
        <button class="primary" (click)="runAll()" [disabled]="running()">Executar tudo</button>
        <button class="ghost" (click)="reset()" [disabled]="running()">Limpar</button>
      </div>
    </div>
    <p class="muted">
      Mesmo roteiro do <code>apps/api/requests.http</code>. Cria usuários e eventos novos a cada execução e
      descobre os ids pelas respostas, então pode rodar quantas vezes quiser sem reiniciar a API.
    </p>

    @if (summary(); as s) {
      <div class="alert" [class.error]="s.fail > 0" [class.success]="s.fail === 0">
        {{ s.pass }} ok · {{ s.fail }} falha(s)
        @if (ctx.evt1) {
          · <a [routerLink]="['/eventos', ctx.evt1]">abrir {{ ctx.evt1 }}</a>
        }
      </div>
    }

    <section class="card">
      <table class="steps">
        <tbody>
          @for (step of steps; track $index; let i = $index) {
            @if (step.section) {
              <tr class="section"><td colspan="4">{{ step.section }}</td></tr>
            }
            <tr [class]="'step-' + state()[i].status">
              <td class="icon">{{ icon(state()[i].status) }}</td>
              <td>{{ step.title }}</td>
              <td><span class="badge">espera {{ step.expect }}</span></td>
              <td>
                @if (state()[i].got !== undefined) {
                  <span class="status s{{ cls(state()[i].got!) }}">{{ state()[i].got }}</span>
                }
                @if (state()[i].note) {
                  <span class="note">{{ state()[i].note }}</span>
                }
                @if (state()[i].body !== undefined) {
                  <details><summary>resposta</summary><pre>{{ state()[i].body | json }}</pre></details>
                }
              </td>
            </tr>
          }
        </tbody>
      </table>
    </section>
  `,
})
export class ScenarioPage {
  private readonly api = inject(Api);
  protected readonly steps = STEPS;
  protected readonly state = signal<StepState[]>(STEPS.map(() => ({ status: 'idle' })));
  protected readonly running = signal(false);
  protected readonly summary = signal<{ pass: number; fail: number } | null>(null);
  protected ctx: Ctx = { profiles: {} };

  reset() {
    this.ctx = { profiles: {} };
    this.summary.set(null);
    this.state.set(STEPS.map(() => ({ status: 'idle' })));
  }

  async runAll() {
    this.reset();
    this.running.set(true);
    let pass = 0;
    let fail = 0;
    for (let i = 0; i < STEPS.length; i++) {
      const step = STEPS[i];
      this.patch(i, { status: 'running' });
      let res: ApiResult<any>;
      try {
        res = await step.run(this.api, this.ctx);
      } catch (e) {
        this.patch(i, { status: 'fail', note: String(e) });
        fail++;
        continue;
      }
      let note: string | void = undefined;
      if (res.status !== step.expect) note = `esperava ${step.expect}`;
      else if (step.after) {
        try {
          note = await step.after(res, this.ctx, this.api);
        } catch (e) {
          note = String(e);
        }
      }
      if (note) fail++;
      else pass++;
      this.patch(i, { status: note ? 'fail' : 'pass', got: res.status, note: note || undefined, body: res.body });
    }
    this.summary.set({ pass, fail });
    this.running.set(false);
  }

  private patch(i: number, s: StepState) {
    this.state.update((all) => all.map((x, j) => (j === i ? s : x)));
  }

  icon(s: StepState['status']) {
    return { idle: '·', running: '…', pass: '✅', fail: '❌' }[s];
  }

  cls(status: number) {
    return Math.floor(status / 100);
  }
}
