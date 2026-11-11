/**
 * Exemplo: aprovação de venda com alçadas.
 * Gerente aprova até R$ 10 mil; acima disso o pedido sobe para a diretoria.
 *
 * Rodar: npm run example
 */
import { availableEvents, defineMachine, guard, hasRole, transition } from '../src';
import type { Actor, StatesOf } from '../src';

interface Pedido {
  id: string;
  total: number;
  itens: number;
}

type Efeito =
  | { type: 'notificar'; perfil: string; pedidoId: string }
  | { type: 'auditar'; acao: string; pedidoId: string; por: string };

const LIMITE_GERENTE = 10_000;

const temItens = guard<Pedido>('tem-itens', ({ data }) => data.itens > 0);
const dentroDaAlcada = guard<Pedido>('dentro-da-alcada-gerente', ({ data }) => data.total <= LIMITE_GERENTE);
const acimaDaAlcada = guard<Pedido>('acima-da-alcada-gerente', ({ data }) => data.total > LIMITE_GERENTE);

export const venda = defineMachine<Pedido, Actor, Efeito>()({
  id: 'venda',
  initial: 'rascunho',
  states: {
    rascunho: {
      on: {
        ENVIAR: {
          to: 'aguardando_gerente',
          policies: [hasRole('vendedor')],
          guards: [temItens],
          effects: ({ data }) => [{ type: 'notificar', perfil: 'gerente', pedidoId: data.id }],
        },
      },
    },
    aguardando_gerente: {
      on: {
        // Ramificação: vence o primeiro ramo cujas regras passam.
        APROVAR: [
          {
            to: 'aprovado',
            policies: [hasRole('gerente')],
            guards: [dentroDaAlcada],
            effects: ({ data, actor }) => [
              { type: 'auditar', acao: 'aprovado', pedidoId: data.id, por: actor.id },
            ],
          },
          {
            to: 'aguardando_diretoria',
            policies: [hasRole('gerente')],
            guards: [acimaDaAlcada],
            effects: ({ data }) => [{ type: 'notificar', perfil: 'diretor', pedidoId: data.id }],
          },
        ],
        REJEITAR: { to: 'rejeitado', policies: [hasRole('gerente')] },
      },
    },
    aguardando_diretoria: {
      on: {
        APROVAR: {
          to: 'aprovado',
          policies: [hasRole('diretor')],
          effects: ({ data, actor }) => [
            { type: 'auditar', acao: 'aprovado', pedidoId: data.id, por: actor.id },
          ],
        },
        REJEITAR: { to: 'rejeitado', policies: [hasRole('diretor')] },
      },
    },
    aprovado: { final: true },
    rejeitado: { final: true },
  },
});

export type StatusVenda = StatesOf<typeof venda>;

// --- Simulação: o "banco" é só uma variável, a lib não guarda nada. ---
if (import.meta.url === `file://${process.argv[1]}`) {
  const vendedor: Actor = { id: 'ana', roles: ['vendedor'] };
  const gerente: Actor = { id: 'bruno', roles: ['gerente'] };
  const diretor: Actor = { id: 'carla', roles: ['diretor'] };

  const pedido: Pedido = { id: 'P-1', total: 25_000, itens: 3 };
  let status: StatusVenda = venda.initial;

  const passos: Array<[string, Actor]> = [
    ['APROVAR', gerente], // inválido em rascunho
    ['ENVIAR', vendedor],
    ['APROVAR', vendedor], // sem permissão
    ['APROVAR', gerente], // acima da alçada => sobe para diretoria
    ['APROVAR', diretor],
  ];

  for (const [evento, actor] of passos) {
    const ctx = { actor, data: pedido };
    const r = transition(venda, status, evento, ctx);
    if (r.ok) {
      console.log(`${actor.id} ${evento}: ${r.from} -> ${r.to}`, r.effects);
      status = r.to; // aqui a aplicação faria o UPDATE com lock otimista
    } else {
      console.log(`${actor.id} ${evento}: ERRO`, r.error);
    }
    console.log(`   ações de ${actor.id} agora:`, availableEvents(venda, status, ctx));
  }
}
