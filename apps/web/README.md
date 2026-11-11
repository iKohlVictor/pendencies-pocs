# web

Front Angular para exercitar os fluxos da API de pendências.

```bash
pnpm dev       # na raiz: API em :3000
pnpm dev:web   # na raiz: front em http://localhost:4200
```

As chamadas vão para `/api/*`, e o dev server repassa para `http://localhost:3000` (`proxy.conf.json`).

- **Atuando como** (topo): define o `x-user-id` de todas as chamadas.
- **Usuários**: cria perfis/usuários; botão para criar Ana, Paula e Diego.
- **Eventos / Pendências**: abre eventos, dispara as ações (as disponíveis para o usuário atual ficam destacadas; as outras podem ser disparadas para ver o 403/409/422) e mostra "quem pode agir" para cada usuário.
- **Roteiro**: executa o mesmo roteiro de `apps/api/requests.http` validando os status esperados.
- Painel **Chamadas**: request/response de cada mutação e de cada erro.
