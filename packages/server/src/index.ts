import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import express from 'express';
import { GameRoom } from './rooms/GameRoom';

const port = Number(process.env.PORT) || 2567;
const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');

const server = new Server({
  transport: new WebSocketTransport(),
  greet: false,
  express: (app) => {
    app.get('/healthz', (_req, res) => {
      res.json({ ok: true });
    });
    // Em produção, o mesmo serviço serve o cliente já compilado.
    if (existsSync(clientDist)) {
      app.use(express.static(clientDist));
    }
  },
});

server.define('game', GameRoom);

await server.listen(port);
console.log(`Servidor do jogo em http://localhost:${port}`);
