import { describe, expect, it } from 'vitest';
import { availableEvents, transition } from '../src';
import type { Actor } from '../src';
import { PERFIL, pendencia } from '../examples/pendencia';
import type { AcaoPendencia, Entrada, StatusPendencia } from '../examples/pendencia';

const filial: Actor = { id: 'filial-1', roles: [PERFIL.filial] };
const programacao: Actor = { id: 'paula', roles: [PERFIL.programacao] };
const documentacao: Actor = { id: 'diego', roles: [PERFIL.documentacao] };

const ctx = (actor: Actor, entrada: Entrada = {}) => ({ actor, data: { pendencia: { id: 'PEND-1' }, entrada } });

/** Aplica uma sequência de ações e devolve o estado final; falha se alguma for negada. */
function percorrer(passos: Array<[AcaoPendencia, Actor, Entrada?]>): StatusPendencia {
  let status: StatusPendencia = pendencia.initial;
  for (const [acao, actor, entrada] of passos) {
    const r = transition(pendencia, status, acao, ctx(actor, entrada));
    if (!r.ok) throw new Error(`${acao} negada em ${status}: ${JSON.stringify(r.error)}`);
    status = r.to;
  }
  return status;
}

describe('pendência', () => {
  it('nasce pendente com a filial', () => {
    expect(pendencia.initial).toBe('pendente_filial');
  });

  it.each<[AcaoPendencia, Entrada]>([
    ['ANEXAR_DOCUMENTO', { documentoId: 'DOC-1' }],
    ['RESOLVER_COM_COMENTARIO', { comentario: 'já regularizado' }],
  ])('%s leva direto para a análise de documentação', (acao, entrada) => {
    expect(percorrer([[acao, filial, entrada]])).toBe('em_analise_documentacao');
  });

  it('caminho feliz: anexa, documentação aprova, conclui', () => {
    expect(percorrer([['ANEXAR_DOCUMENTO', filial, { documentoId: 'DOC-1' }], ['APROVAR', documentacao]])).toBe('concluida');
  });

  it('exceção passa pela programação antes da documentação', () => {
    const excecao: [AcaoPendencia, Actor, Entrada] = ['SOLICITAR_EXCECAO', filial, { justificativa: 'prazo do fornecedor' }];
    expect(percorrer([excecao])).toBe('em_analise_programacao');
    expect(percorrer([excecao, ['APROVAR', programacao]])).toBe('em_analise_documentacao');
    expect(percorrer([excecao, ['APROVAR', programacao], ['APROVAR', documentacao]])).toBe('concluida');
  });

  it('documentação não pula a fila da programação', () => {
    const r = transition(pendencia, 'em_analise_programacao', 'APROVAR', ctx(documentacao));
    expect(r).toMatchObject({ ok: false, error: { code: 'FORBIDDEN', failed: [`role:${PERFIL.programacao}`] } });
  });

  it.each<[StatusPendencia, Actor]>([
    ['em_analise_programacao', programacao],
    ['em_analise_documentacao', documentacao],
  ])('rejeição em %s volta para a filial com o motivo', (status, actor) => {
    const r = transition(pendencia, status, 'REJEITAR', ctx(actor, { motivo: 'documento ilegível' }));
    expect(r).toMatchObject({ ok: true, to: 'pendente_filial' });
    if (r.ok) {
      expect(r.effects).toContainEqual({
        type: 'notificar',
        pendenciaId: 'PEND-1',
        perfil: PERFIL.filial,
        motivo: 'documento ilegível',
      });
    }
  });

  it('rejeitar exige motivo', () => {
    const r = transition(pendencia, 'em_analise_documentacao', 'REJEITAR', ctx(documentacao, { motivo: '  ' }));
    expect(r).toMatchObject({ ok: false, error: { code: 'GUARD_FAILED', failed: ['motivo-informado'] } });
  });

  it('depois de rejeitada, a filial atua de novo e o ciclo continua', () => {
    expect(
      percorrer([
        ['RESOLVER_COM_COMENTARIO', filial, { comentario: 'ok' }],
        ['REJEITAR', documentacao, { motivo: 'falta anexo' }],
        ['ANEXAR_DOCUMENTO', filial, { documentoId: 'DOC-2' }],
        ['APROVAR', documentacao],
      ]),
    ).toBe('concluida');
  });

  it('cada perfil só vê as próprias ações', () => {
    expect(availableEvents(pendencia, 'pendente_filial', ctx(filial, { documentoId: 'D', comentario: 'c', justificativa: 'j' }))).toEqual([
      'ANEXAR_DOCUMENTO',
      'RESOLVER_COM_COMENTARIO',
      'SOLICITAR_EXCECAO',
    ]);
    expect(availableEvents(pendencia, 'pendente_filial', ctx(documentacao))).toEqual([]);
    expect(availableEvents(pendencia, 'em_analise_programacao', ctx(filial))).toEqual([]);
    expect(availableEvents(pendencia, 'em_analise_documentacao', ctx(documentacao))).toEqual(['APROVAR']);
  });

  it('concluída não aceita mais nada', () => {
    const r = transition(pendencia, 'concluida', 'REJEITAR', ctx(documentacao, { motivo: 'x' }));
    expect(r).toMatchObject({ ok: false, error: { code: 'FINAL_STATE' } });
  });
});
