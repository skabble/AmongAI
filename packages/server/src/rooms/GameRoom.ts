import { Room, type Client } from 'colyseus';
import { MAX_PLAYERS, MIN_PLAYERS, TICK_RATE } from '@amongai/shared';
import { Game } from '../game/Game';

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sem I e O, para evitar confusões
const activeCodes = new Set<string>();

function newCode(): string {
  for (;;) {
    let code = '';
    for (let i = 0; i < 5; i++) code += LETTERS[Math.floor(Math.random() * LETTERS.length)];
    if (!activeCodes.has(code)) {
      activeCodes.add(code);
      return code;
    }
  }
}

function envMinPlayers(): number {
  const raw = Number(process.env.MIN_PLAYERS);
  return Number.isInteger(raw) && raw >= 2 ? raw : MIN_PLAYERS;
}

export class GameRoom extends Room {
  maxClients = MAX_PLAYERS;
  private game!: Game;

  onCreate(): void {
    this.roomId = newCode();
    this.game = new Game(
      this.roomId,
      (playerId, type, payload) => this.clients.getById(playerId)?.send(type, payload),
      { minPlayers: envMinPlayers() },
    );
    this.onMessage('*', (client, type, message) => {
      this.game.handle(client.sessionId, String(type), message, Date.now());
    });
    this.setTimestep(() => this.game.tick(Date.now()), 1000 / TICK_RATE);
  }

  onJoin(client: Client, options?: { name?: unknown; lang?: unknown }): void {
    // O erro é um código (started, full) que o cliente traduz.
    const error = this.game.addPlayer(client.sessionId, options?.name, options?.lang);
    if (error) throw new Error(error);
  }

  async onDrop(client: Client): Promise<void> {
    this.game.setConnected(client.sessionId, false);
    try {
      await this.allowReconnection(client, this.game.phase === 'lobby' ? 20 : 90);
    } catch {
      // Não voltou a tempo: onLeave trata da saída definitiva.
    }
  }

  onReconnect(client: Client): void {
    this.game.setConnected(client.sessionId, true);
  }

  onLeave(client: Client): void {
    this.game.removePlayer(client.sessionId, Date.now());
  }

  onDispose(): void {
    activeCodes.delete(this.roomId);
  }
}
