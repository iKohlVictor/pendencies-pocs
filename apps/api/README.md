# pendencies

Backend NestJS de demonstração que usa a lib [`machine-flow`](../../packages/machine-flow) para conduzir dois fluxos: a liberação de um **evento** e a análise de cada **pendência** dentro dele. Tudo em memória, sem banco.

## Modelo

### Tipos

Todo evento e toda pendência têm um tipo, vindo de um catálogo (`GET /event-types` e `GET /pendency-types`).

| Tipo de evento | Nome | Pendências criadas junto |
| --- | --- | --- |
| `resolve_documentation` | Resolve documentation | `missing_invoice`, `unsigned_contract` |
| `supplier_onboarding` | Supplier onboarding | `registration_update`, `unsigned_contract` |
| `ad_hoc` | Ad hoc event | nenhuma (adicionadas à mão) |

| Tipo de pendência | Nome | Fluxo |
| --- | --- | --- |
| `missing_invoice` | Missing invoice | `standard` |
| `unsigned_contract` | Unsigned contract | `standard` |
| `registration_update` | Registration update | `direct` |

- **Tipo de evento** define o nome do evento e quais pendências nascem com ele: `POST /events { "type": "resolve_documentation" }` já cria as duas pendências.
- **Tipo de pendência** define o nome e o fluxo: `standard` tem o caminho de exceção pela programação de pagamento; `direct` não tem.

O catálogo está em código (`event-type.ts` e `pendency-type.ts`); num sistema real seria uma tabela.

### Evento

Um **evento** agrupa pendências e tem duas dimensões independentes:

| Dimensão | Valores | De onde vem |
| --- | --- | --- |
| Liberação (`releaseStatus`) | `not_scheduled`, `in_analysis`, `scheduled` | máquina de estados, só a programação de pagamento atua |
| Pendências (`pendencies.status`) | `ok`, `pending` | derivado: `ok` quando todas as pendências do evento estão concluídas |

A análise da liberação e a resolução das pendências podem andar em qualquer ordem, mas **programar exige pendências `ok`**: é um guard (`pendencies-resolved`) na máquina do evento. Com pendência em aberto, `schedule` devolve 422 `GUARD_FAILED` e some de `/events/:id/actions`.

**Evento concluído (`completed`) = `scheduled` + pendências `ok`.** Uma pendência aberta depois de programado faz `completed` voltar a `false`.

### Liberação do evento

```
not_scheduled ──iniciar análise──► in_analysis ──programar (só com pendências ok)──► scheduled
      ▲                                 │
      └──────────── devolver ───────────┘
```

### Pendência (fluxo `standard`)

```
filial ──(anexar | resolver)────────────────► análise de documentação ──aprovar──► concluída
   │                                               ▲         │
   └──(solicitar exceção)──► programação ──aprovar─┘         │
                                  │                          │
   ◄───────────── rejeitar (com motivo) ─────────────────────┘
```

| Perfil | Valor em `x-user-roles` |
| --- | --- |
| Filial | `branch` |
| Análise de documentação | `documentation_analysis` |
| Programação de pagamento | `payment_scheduling` |

## Rodando

Este app faz parte de um monorepo pnpm e consome a lib via `workspace:*`. A lib é consumida pelo `dist`, então precisa estar buildada — os scripts da raiz já cuidam disso:

```bash
# na raiz do monorepo
pnpm install
pnpm dev               # builda machine-flow e sobe a API em http://localhost:3000
pnpm test              # builda machine-flow e roda os testes de todos os packages
```

## Testando na mão

- **Insomnia ou Postman**: importe o [`openapi.yaml`](openapi.yaml). As requisições já vêm com headers e corpos de exemplo.
- **VS Code ou JetBrains**: abra o [`requests.http`](requests.http) e execute de cima para baixo.
- **curl**:

```bash
# abre o evento: já cria PEND-1 (missing_invoice) e PEND-2 (unsigned_contract)
curl -X POST localhost:3000/events -H 'content-type: application/json' \
  -H 'x-user-id: paula' -H 'x-user-roles: payment_scheduling' \
  -d '{"type":"resolve_documentation"}'

# para cada pendência: filial anexa, documentação aprova -> pendências do evento ficam "ok"
for p in PEND-1 PEND-2; do
  curl -X POST localhost:3000/pendencies/$p/attach-document -H 'content-type: application/json' \
    -H 'x-user-id: ana' -H 'x-user-roles: branch' -d '{"documentId":"DOC-1"}'
  curl -X POST localhost:3000/pendencies/$p/approve \
    -H 'x-user-id: diego' -H 'x-user-roles: documentation_analysis'
done

# programação analisa e programa -> completed: true
curl -X POST localhost:3000/events/EVT-1/start-analysis -H 'x-user-id: paula' -H 'x-user-roles: payment_scheduling'
curl -X POST localhost:3000/events/EVT-1/schedule -H 'x-user-id: paula' -H 'x-user-roles: payment_scheduling'
```

A identidade vem dos headers `x-user-id` e `x-user-roles` só para facilitar o teste. Num sistema real ela sai do token autenticado.

## Endpoints

**Eventos**

| Método | Rota | Quem | Corpo |
| --- | --- | --- | --- |
| `GET` | `/event-types` e `/pendency-types` | qualquer um | catálogo de tipos |
| `POST` | `/events` | qualquer um | `{ type, name? }` (cria também as pendências do tipo) |
| `GET` | `/events` e `/events/:id` | qualquer um | devolve liberação, status das pendências e `completed` |
| `POST` | `/events/:id/pendencies` | qualquer um | `{ type, title? }` (pendência extra, adicionada à mão) |
| `GET` | `/events/:id/pendencies` | qualquer um | |
| `GET` | `/events/:id/actions` | qualquer um | ações de liberação disponíveis para quem chamou |
| `POST` | `/events/:id/start-analysis` | programação | |
| `POST` | `/events/:id/return` | programação | `{ reason }` opcional |
| `POST` | `/events/:id/schedule` | programação | exige todas as pendências resolvidas |

**Pendências**

| Método | Rota | Quem | Corpo |
| --- | --- | --- | --- |
| `GET` | `/pendencies` e `/pendencies/:id` | qualquer um | |
| `GET` | `/pendencies/:id/actions` | qualquer um | ações disponíveis para quem chamou |
| `POST` | `/pendencies/:id/attach-document` | filial | `{ documentId }` |
| `POST` | `/pendencies/:id/resolve` | filial | `{ comment }` |
| `POST` | `/pendencies/:id/request-exception` | filial | `{ justification }` (só no fluxo `standard`) |
| `POST` | `/pendencies/:id/approve` | quem está com a análise | |
| `POST` | `/pendencies/:id/reject` | quem está com a análise | `{ reason }` |
| `GET` | `/notifications?role=` | qualquer um | notificações que o fluxo geraria |

Erros dos dois fluxos viram HTTP em um único lugar (`shared/http/domain-error.filter.ts`):

| Situação | Código da lib | HTTP |
| --- | --- | --- |
| Perfil errado para o passo | `FORBIDDEN` | 403 |
| Ação não existe no estado atual | `INVALID_EVENT` | 409 |
| Fluxo já concluído | `FINAL_STATE` | 409 |
| Dados não permitem (ex.: programar com pendência aberta) | `GUARD_FAILED` | 422 |
| Campo obrigatório ausente ou tipo desconhecido | (domínio) | 422 |
| Alteração concorrente | (repositório) | 409 |

## Estrutura

```
src/
  shared/            erros de domínio, perfis, identidade por header, erro -> HTTP
  events/
    domain/
      event-type.ts              catálogo: nome e pendências de cada tipo de evento
      event-release.machine.ts   máquina da liberação
      business-event.ts          agregado do evento (guarda só a liberação)
      event-completion.ts        regras derivadas: status das pendências e "concluído"
    application/                 casos de uso; monta a visão com os dados derivados
    infrastructure/              repositório em memória
    http/                        controller
  pendencies/
    domain/
      pendency-type.ts           catálogo: nome e fluxo de cada tipo de pendência
      pendency.machine.ts        as máquinas da pendência (fluxos standard e direct)
      pendency.ts                agregado da pendência (aponta para o evento por eventId)
    application/ infrastructure/ http/
```

Decisões de modelagem:

- **Um agregado, vários fluxos.** A pendência guarda o `flow` do seu tipo e consulta a máquina correspondente. O fluxo `standard` é o superconjunto de estados e ações, garantido em tempo de compilação.
- **Dois agregados, duas máquinas.** Evento e pendência salvam de forma independente; a pendência só carrega o `eventId`. O módulo de eventos conhece o de pendências, nunca o contrário.
- **Status das pendências e `completed` não são gravados.** São calculados a cada leitura a partir das pendências, então nunca ficam desatualizados e não exigem sincronização entre agregados.
- **O guard recebe o status das pendências de fora.** O agregado do evento não conhece as pendências; o service calcula o status e passa para a máquina em `data`, mantendo a lib pura.
- **`BusinessEvent` em vez de `Event`** no código, para não confundir com os eventos da máquina de estados (aqui chamados de *actions*).

Onde a lib entra:

1. `*.machine.ts` declara cada fluxo com `defineMachine`.
2. Os agregados chamam `transition` antes de mudar qualquer coisa e `availableEvents` para listar ações.
3. Os efeitos devolvidos pela lib (`notify`, na pendência) sobem até o service, que os entrega depois de salvar.

Para trocar a memória por banco, basta implementar os repositórios e mudar os providers nos módulos.
