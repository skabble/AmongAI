import { describe, expect, it } from 'vitest';
import { THEMES } from './constants';
import { THEME_CONTENT } from './content';
import { USE_RANGE } from './constants';
import {
  DOORS,
  EMERGENCY_BUTTON,
  PANELS,
  ROOMS,
  STATIONS,
  VENTS,
  canStand,
  canTravel,
  lineOfSight,
  spawnPoint,
} from './map';
import { assignRoles, checkWin, maxImpostors, tallyDecision, tallyVotes } from './rules';
import { FIX_GAMES, TASKS } from './tasks';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);

describe('assignRoles', () => {
  it('limita os Impostores ao número de jogadores', () => {
    expect(maxImpostors(4)).toBe(1);
    expect(maxImpostors(7)).toBe(2);
    expect(maxImpostors(15)).toBe(3);
    for (const [n, asked, expected] of [[4, 3, 1], [8, 3, 2], [15, 3, 3], [15, 1, 1]] as const) {
      const roles = assignRoles(ids(n), asked);
      expect(roles.size).toBe(n);
      expect([...roles.values()].filter((r) => r === 'impostor')).toHaveLength(expected);
    }
  });
});

describe('tallyVotes', () => {
  const eligible = ['a', 'b', 'c', 'd'];
  it('expulsa o mais votado', () => {
    expect(tallyVotes({ a: 'b', c: 'b', d: 'a' }, eligible).ejected).toBe('b');
  });
  it('não expulsa em caso de empate', () => {
    const r = tallyVotes({ a: 'b', b: 'a' }, eligible);
    expect(r.ejected).toBeNull();
    expect(r.tie).toBe(true);
  });
  it('não expulsa quando saltar ganha ou empata', () => {
    expect(tallyVotes({ a: 'skip', b: 'skip', c: 'a' }, eligible).ejected).toBeNull();
    expect(tallyVotes({ a: 'skip', c: 'a' }, eligible).ejected).toBeNull();
  });
  it('ignora votos de e em jogadores não elegíveis', () => {
    expect(tallyVotes({ x: 'a', y: 'a', b: 'c', d: 'z' }, eligible).ejected).toBe('c');
    expect(tallyVotes({}, eligible).ejected).toBeNull();
  });
});

describe('checkWin', () => {
  it('cobre todas as condições', () => {
    expect(checkWin({ crewAlive: 3, impostorsAlive: 0, tasksDone: 0, tasksTotal: 9 })).toEqual({ winner: 'crew', reason: 'ejected' });
    expect(checkWin({ crewAlive: 1, impostorsAlive: 1, tasksDone: 0, tasksTotal: 9 })).toEqual({ winner: 'impostor', reason: 'outnumbered' });
    expect(checkWin({ crewAlive: 3, impostorsAlive: 1, tasksDone: 9, tasksTotal: 9 })).toEqual({ winner: 'crew', reason: 'tasks' });
    expect(checkWin({ crewAlive: 3, impostorsAlive: 1, tasksDone: 8, tasksTotal: 9 })).toBeNull();
  });
});

describe('conteúdo', () => {
  it('todos os temas com perguntas têm itens válidos nas duas línguas, sem repetições', () => {
    for (const theme of THEMES) {
      if (theme.id === 'none') continue;
      const content = THEME_CONTENT[theme.id];
      expect(content, theme.id).toBeDefined();
      for (const lang of ['pt', 'en'] as const) {
        expect(new Set(content!.items.map((i) => i[lang].question)).size).toBe(content!.items.length);
        for (const item of content!.items) {
          expect(new Set(item[lang].options).size, item[lang].question).toBe(item[lang].options.length);
        }
      }
    }
  });
});

describe('tallyDecision', () => {
  it('escolhe a opção mais votada; empate ou sem escolhas não decide', () => {
    expect(tallyDecision({ a: 0, b: 1, c: 1 }, 3)).toBe(1);
    expect(tallyDecision({ a: 0, b: 1 }, 3)).toBeNull();
    expect(tallyDecision({}, 3)).toBeNull();
  });
  it('ignora índices inválidos', () => {
    expect(tallyDecision({ a: 5, b: -1, c: 2, d: 1.5 }, 3)).toBe(2);
  });
});


describe('tarefas', () => {
  it('o catálogo usa estações existentes, sem repetições, e cobre os três tipos', () => {
    const used = TASKS.flatMap((t) => t.steps.map((s) => s.stationId));
    for (const id of used) expect(STATIONS.some((s) => s.id === id), id).toBe(true);
    expect(new Set(used).size).toBe(used.length);
    expect(new Set(TASKS.map((t) => t.id)).size).toBe(TASKS.length);
    expect(TASKS.filter((t) => t.kind === 'common').length).toBeGreaterThanOrEqual(2);
    expect(TASKS.filter((t) => t.kind === 'long').length).toBeGreaterThanOrEqual(3);
    expect(TASKS.filter((t) => t.kind === 'short').length).toBeGreaterThanOrEqual(5);
    for (const t of TASKS.filter((x) => x.kind === 'long')) expect(t.steps.length).toBeGreaterThan(1);
  });
  it('todas as sabotagens têm painéis e mini-jogo de reparação', () => {
    for (const kind of Object.keys(FIX_GAMES)) expect(PANELS.some((p) => p.kind === kind), kind).toBe(true);
  });
});

/** Células (grelha de 10 px) onde se chega a andar a partir do primeiro ponto inicial. */
function reachableCells(): Set<string> {
  const start = spawnPoint(0, 15);
  const key = (i: number, j: number) => `${i},${j}`;
  const seen = new Set<string>();
  const queue: [number, number][] = [[Math.round(start.x / 10), Math.round(start.y / 10)]];
  seen.add(key(...queue[0]!));
  while (queue.length > 0) {
    const [i, j] = queue.pop()!;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const ni = i + di;
      const nj = j + dj;
      if (seen.has(key(ni, nj)) || !canStand(ni * 10, nj * 10)) continue;
      seen.add(key(ni, nj));
      queue.push([ni, nj]);
    }
  }
  return seen;
}

describe('mapa', () => {
  it('consolas, painéis, condutas e o botão estão ao alcance de quem anda pelo mapa', () => {
    const cells = reachableCells();
    const reachable = (x: number, y: number) => {
      const r = USE_RANGE - 10;
      for (let i = Math.floor((x - r) / 10); i <= Math.ceil((x + r) / 10); i++) {
        for (let j = Math.floor((y - r) / 10); j <= Math.ceil((y + r) / 10); j++) {
          if (Math.hypot(i * 10 - x, j * 10 - y) <= r && cells.has(`${i},${j}`)) return true;
        }
      }
      return false;
    };
    for (const s of STATIONS) expect(reachable(s.x, s.y), s.id).toBe(true);
    for (const p of PANELS) expect(reachable(p.x, p.y), p.id).toBe(true);
    for (const v of VENTS) expect(reachable(v.x, v.y), v.id).toBe(true);
    expect(reachable(EMERGENCY_BUTTON.x, EMERGENCY_BUTTON.y)).toBe(true);
    // Todas as salas continuam acessíveis (nenhum objeto tapa uma porta).
    for (const room of ROOMS) {
      const c = { x: room.rect.x + room.rect.w / 2, y: room.rect.y + room.rect.h / 2 + 40 };
      expect(reachable(c.x, c.y), room.id).toBe(true);
    }
  });
  it('os objetos têm colisão e não se atravessam', () => {
    for (const s of STATIONS) expect(canStand(s.x, s.y + 12), s.id).toBe(false);
    expect(canStand(EMERGENCY_BUTTON.x, EMERGENCY_BUTTON.y)).toBe(false);
    const s = STATIONS[0]!;
    expect(canTravel(s.x, s.y - 60, s.x, s.y + 60)).toBe(false);
    expect(canTravel(s.x - 60, s.y + 60, s.x + 60, s.y + 60)).toBe(true);
  });
  it('condutas e pontos iniciais estão em zonas transitáveis', () => {
    for (const v of VENTS) {
      expect(canStand(v.x, v.y), v.id).toBe(true);
      for (const l of v.links) expect(VENTS.some((o) => o.id === l)).toBe(true);
    }
    for (let i = 0; i < 15; i++) {
      const p = spawnPoint(i, 15);
      expect(canStand(p.x, p.y)).toBe(true);
    }
  });
  it('todas as salas têm porta e trancá-la bloqueia a passagem', () => {
    for (const room of ROOMS) {
      const door = DOORS.find((d) => d.roomId === room.id);
      expect(door, room.id).toBeDefined();
      const cx = door!.rect.x + door!.rect.w / 2;
      const cy = door!.rect.y + door!.rect.h / 2;
      expect(canStand(cx, cy)).toBe(true);
      expect(canStand(cx, cy, new Set([room.id]))).toBe(false);
    }
  });
  it('as paredes bloqueiam a linha de visão', () => {
    expect(lineOfSight(300, 250, 400, 300)).toBe(true); // dentro do Datacenter
    expect(lineOfSight(300, 250, 900, 250)).toBe(false); // Datacenter -> Sala de Treino
  });
});
