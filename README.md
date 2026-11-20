# Desalinhados

Jogo de dedução social no browser, até 15 jogadores, pensado para pôr grupos a discutir temas de AI.
Um laboratório está prestes a lançar um modelo: a Equipa conclui tarefas de validação, os Desalinhados sabotam.
A voz fica fora do jogo (Teams, Discord, etc.).

## Correr

```
npm install
npm run dev        # servidor em :2567, cliente em http://localhost:5173
```

Produção, num único serviço:

```
npm run build      # compila o cliente para packages/client/dist
npm start          # serve o cliente e os WebSockets em PORT (por omissão 2567)
```

## Testar

```
npm test           # regras, temas, tarefas, mapa e simulação de partidas
npm run typecheck
npm run bots       # 15 clientes simulados contra um servidor em execução
```

`MIN_PLAYERS=2 npm start` baixa o mínimo de jogadores para testes manuais com poucos separadores.

## Estrutura

- `packages/shared`: mapa, protocolo, regras puras e conteúdo.
- `packages/server`: sala Colyseus e estado autoritativo do jogo (`src/game/Game.ts`).
- `packages/client`: React para os ecrãs, Phaser para o mapa.

## Temas

O anfitrião escolhe o tema no lobby. Em cada ronda há um dilema sobre IA, igual para todos, com 4 opções
defensáveis. Os Desalinhados têm um objetivo secreto: querem que o laboratório escolha uma de 2 opções sorteadas.
Numa das consolas de tarefas está escondida uma evidência que revela uma dessas opções a quem a encontrar; os Desalinhados veem onde está e tentam destruí-la antes.

A reunião tem dois passos:

1. Discussão: falam livremente na chamada e cada jogador vivo escolhe uma opção, podendo mudar até o anfitrião
   abrir a votação. As escolhas são públicas e aparecem ao vivo.
2. Votação: revela-se a decisão do laboratório e o objetivo dos Desalinhados (quem o escolheu fica destacado) e
   vota-se a expulsão.

Uma decisão desalinhada encurta o tempo até à próxima eliminação e conta para o limite de decisões desalinhadas
(definição do lobby); ao chegar ao limite, os Desalinhados ganham. Uma decisão acertada dá mais tempo à Equipa.

Para acrescentar um tema:

1. Criar `packages/shared/src/content/temas/<id>.json` com `id` e pelo menos 6 `items`. Cada item tem `pt`/`en`,
   cada um com `question` e 4 `options`, todas defensáveis (o objetivo dos Desalinhados é sorteado em cada jogo).
2. Importá-lo em `packages/shared/src/content/index.ts`.
3. Acrescentar `{ id, name }` a `THEMES` em `packages/shared/src/constants.ts` e o nome do tema (`theme.<id>`) às traduções.

As perguntas são validadas no arranque do servidor e em `npm test`. Só o servidor as importa, para que a resposta
certa e o objetivo dos Desalinhados não cheguem ao browser de quem não os deve ver.

As tarefas (comuns, curtas e longas) estão em `packages/shared/src/tasks.ts` e os mini-jogos em
`packages/client/src/ui/MiniGames.tsx`.

## Idiomas

A interface está em português e inglês; o botão PT/EN no canto superior direito muda a língua de cada jogador,
que fica guardada no browser. Cada jogador recebe a pergunta e as opções na sua língua, mesmo na mesma sala.
Os textos estão em `packages/client/src/messages.ts`; `npm test` confirma que as duas línguas têm as mesmas chaves
e que todas as chaves usadas no código existem.

## Nota sobre o caminho do projeto

Os scripts chamam as ferramentas com `node` em vez dos atalhos de `node_modules/.bin`, porque esses atalhos falham no Windows quando o caminho da pasta contém `&`.

## Deploy (Render)

O `render.yaml` define um serviço web Node que compila o cliente e arranca o servidor, que serve as duas partes no
mesmo endereço. No Render: New → Blueprint, escolher o repositório e confirmar. No plano gratuito o serviço adormece
após 15 minutos sem uso (o primeiro acesso demora cerca de 30 s) e as salas, que vivem em memória, perdem-se quando
reinicia.
