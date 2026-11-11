/**
 * Exemplo: pendência com três perfis.
 *
 *   filial ──(anexar | resolver)──────────────► análise de documentação ──aprovar──► concluída
 *      │                                              ▲          │
 *      └──(solicitar exceção)──► programação ──aprovar┘          │
 *                                    │                           │
 *      ◄──────────rejeitar (com motivo)──────────────────────────┘
 *
 * Rodar: npm run example:pendencia
 */
import { availableEvents, defineMachine, guard, hasRole, transition } from '../src';
import type { Actor, EventsOf, StatesOf } from '../src';

export const PERFIL = {
  filial: 'filial',
  documentacao: 'analise_documentacao',
  programacao: 'programacao_pagamento',
} as const;

export interface Pendencia {
  id: string;
}

/** Dados que chegam junto com a ação (body do request). */
export interface Entrada {
  documentoId?: string;
  comentario?: string;
  justificativa?: string;
  motivo?: string;
}

/** O que as regras enxergam: a entidade + a entrada da ação. */
export interface Dados {
  pendencia: Pendencia;
  entrada: Entrada;
}

export type Efeito =
  | { type: 'registrar_historico'; pendenciaId: string; acao: string; por: string; detalhe?: string }
  | { type: 'notificar'; pendenciaId: string; perfil: string; motivo?: string };

const preenchido = (valor?: string) => (valor ?? '').trim().length > 0;

const documentoInformado = guard<Dados>('documento-informado', ({ data }) => preenchido(data.entrada.documentoId));
const comentarioInformado = guard<Dados>('comentario-informado', ({ data }) => preenchido(data.entrada.comentario));
const justificativaInformada = guard<Dados>('justificativa-informada', ({ data }) => preenchido(data.entrada.justificativa));
const motivoInformado = guard<Dados>('motivo-informado', ({ data }) => preenchido(data.entrada.motivo));

const define = defineMachine<Dados, Actor, Efeito>();

/** Rejeição é igual nos dois estados de análise: volta para a filial com o motivo. */
const rejeitarPara = (perfil: string) => ({
  to: 'pendente_filial' as const,
  policies: [hasRole(perfil)],
  guards: [motivoInformado],
  effects: ({ data, actor }: { data: Dados; actor: Actor }): Efeito[] => [
    { type: 'registrar_historico', pendenciaId: data.pendencia.id, acao: 'rejeitada', por: actor.id, detalhe: data.entrada.motivo },
    { type: 'notificar', pendenciaId: data.pendencia.id, perfil: PERFIL.filial, motivo: data.entrada.motivo },
  ],
});

const historico = (acao: string, detalhe: (e: Entrada) => string | undefined = () => undefined) =>
  ({ data, actor }: { data: Dados; actor: Actor }): Efeito => ({
    type: 'registrar_historico',
    pendenciaId: data.pendencia.id,
    acao,
    por: actor.id,
    detalhe: detalhe(data.entrada),
  });

const notificar = (perfil: string) =>
  ({ data }: { data: Dados }): Efeito => ({ type: 'notificar', pendenciaId: data.pendencia.id, perfil });

export const pendencia = define({
  id: 'pendencia',
  initial: 'pendente_filial',
  states: {
    pendente_filial: {
      on: {
        ANEXAR_DOCUMENTO: {
          to: 'em_analise_documentacao',
          policies: [hasRole(PERFIL.filial)],
          guards: [documentoInformado],
          effects: (ctx) => [historico('documento_anexado', (e) => e.documentoId)(ctx), notificar(PERFIL.documentacao)(ctx)],
        },
        RESOLVER_COM_COMENTARIO: {
          to: 'em_analise_documentacao',
          policies: [hasRole(PERFIL.filial)],
          guards: [comentarioInformado],
          effects: (ctx) => [historico('resolvida_com_comentario', (e) => e.comentario)(ctx), notificar(PERFIL.documentacao)(ctx)],
        },
        // Exceção passa primeiro pela programação de pagamento.
        SOLICITAR_EXCECAO: {
          to: 'em_analise_programacao',
          policies: [hasRole(PERFIL.filial)],
          guards: [justificativaInformada],
          effects: (ctx) => [historico('excecao_solicitada', (e) => e.justificativa)(ctx), notificar(PERFIL.programacao)(ctx)],
        },
      },
    },
    em_analise_programacao: {
      on: {
        // Exceção aceita: segue para a análise de documentação.
        APROVAR: {
          to: 'em_analise_documentacao',
          policies: [hasRole(PERFIL.programacao)],
          effects: (ctx) => [historico('excecao_aprovada')(ctx), notificar(PERFIL.documentacao)(ctx)],
        },
        REJEITAR: rejeitarPara(PERFIL.programacao),
      },
    },
    em_analise_documentacao: {
      on: {
        APROVAR: {
          to: 'concluida',
          policies: [hasRole(PERFIL.documentacao)],
          effects: (ctx) => [historico('aprovada')(ctx)],
        },
        REJEITAR: rejeitarPara(PERFIL.documentacao),
      },
    },
    concluida: { final: true },
  },
});

export type StatusPendencia = StatesOf<typeof pendencia>;
export type AcaoPendencia = EventsOf<typeof pendencia>;

// --- Simulação ---
if (import.meta.url === `file://${process.argv[1]}`) {
  const filial: Actor = { id: 'filial-uberaba', roles: [PERFIL.filial] };
  const programacao: Actor = { id: 'paula', roles: [PERFIL.programacao] };
  const documentacao: Actor = { id: 'diego', roles: [PERFIL.documentacao] };

  const p: Pendencia = { id: 'PEND-1' };
  let status: StatusPendencia = pendencia.initial;

  const passos: Array<[AcaoPendencia, Actor, Entrada]> = [
    ['SOLICITAR_EXCECAO', filial, { justificativa: 'fornecedor sem nota até dia 20' }],
    ['APROVAR', documentacao, {}], // ainda não é a vez dele
    ['APROVAR', programacao, {}],
    ['REJEITAR', documentacao, {}], // sem motivo
    ['REJEITAR', documentacao, { motivo: 'falta o comprovante' }],
    ['ANEXAR_DOCUMENTO', filial, { documentoId: 'DOC-9' }],
    ['APROVAR', documentacao, {}],
  ];

  for (const [acao, actor, entrada] of passos) {
    const ctx = { actor, data: { pendencia: p, entrada } };
    const r = transition(pendencia, status, acao, ctx);
    if (r.ok) {
      console.log(`✔ ${actor.id} ${acao}: ${r.from} -> ${r.to}`);
      r.effects.forEach((e) => console.log('    efeito:', JSON.stringify(e)));
      status = r.to;
    } else {
      console.log(`✘ ${actor.id} ${acao}:`, JSON.stringify(r.error));
    }
  }
  console.log('status final:', status, '| ações da filial:', availableEvents(pendencia, status, { actor: filial, data: { pendencia: p, entrada: {} } }));
}
