import { PLAYER_RADIUS } from './constants';
import type { SabotageKind } from './protocol';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RoomDef {
  id: string;
  name: string;
  rect: Rect;
}

export interface DoorDef {
  id: string;
  roomId: string;
  rect: Rect;
}

export interface StationDef {
  id: string;
  roomId: string;
  x: number;
  y: number;
}

export interface PanelDef {
  id: string;
  roomId: string;
  x: number;
  y: number;
  kind: Exclude<SabotageKind, 'doors'>;
}

export interface VentDef {
  id: string;
  roomId: string;
  x: number;
  y: number;
  links: string[];
}

export const WORLD = { w: 2400, h: 1650 };

const ROW1 = { y: 100, h: 300 };
const ROW2 = { y: 650, h: 350 };
const ROW3 = { y: 1250, h: 300 };

export const ROOMS: RoomDef[] = [
  { id: 'datacenter', name: 'Datacenter', rect: { x: 100, w: 400, ...ROW1 } },
  { id: 'treino', name: 'Sala de Treino', rect: { x: 700, w: 400, ...ROW1 } },
  { id: 'avaliacao', name: 'Avaliação', rect: { x: 1300, w: 400, ...ROW1 } },
  { id: 'redteam', name: 'Red Team', rect: { x: 1900, w: 400, ...ROW1 } },
  { id: 'arrefecimento', name: 'Arrefecimento', rect: { x: 100, w: 400, ...ROW2 } },
  { id: 'reunioes', name: 'Sala de Reuniões', rect: { x: 900, w: 600, ...ROW2 } },
  { id: 'etica', name: 'Gabinete de Ética', rect: { x: 1900, w: 400, ...ROW2 } },
  { id: 'arquivo', name: 'Arquivo de Datasets', rect: { x: 100, w: 400, ...ROW3 } },
  { id: 'rotulagem', name: 'Rotulagem de Dados', rect: { x: 700, w: 400, ...ROW3 } },
  { id: 'cafetaria', name: 'Cafetaria', rect: { x: 1300, w: 400, ...ROW3 } },
  { id: 'seguranca', name: 'Segurança', rect: { x: 1900, w: 400, ...ROW3 } },
];

export const CORRIDORS: Rect[] = [
  { x: 100, y: 480, w: 2200, h: 90 },
  { x: 100, y: 1080, w: 2200, h: 90 },
  { x: 560, y: 570, w: 80, h: 510 },
  { x: 1760, y: 570, w: 80, h: 510 },
];

const DOOR_W = 100;

function buildDoors(): DoorDef[] {
  const doors: DoorDef[] = [];
  for (const room of ROOMS) {
    const cx = room.rect.x + room.rect.w / 2 - DOOR_W / 2;
    if (room.rect.y === ROW1.y) {
      doors.push({ id: `${room.id}-s`, roomId: room.id, rect: { x: cx, y: 400, w: DOOR_W, h: 80 } });
    } else if (room.rect.y === ROW2.y) {
      doors.push({ id: `${room.id}-n`, roomId: room.id, rect: { x: cx, y: 570, w: DOOR_W, h: 80 } });
      doors.push({ id: `${room.id}-s`, roomId: room.id, rect: { x: cx, y: 1000, w: DOOR_W, h: 80 } });
    } else {
      doors.push({ id: `${room.id}-n`, roomId: room.id, rect: { x: cx, y: 1170, w: DOOR_W, h: 80 } });
    }
  }
  return doors;
}

export const DOORS: DoorDef[] = buildDoors();

function buildStations(): StationDef[] {
  const stations: StationDef[] = [];
  for (const room of ROOMS) {
    const r = room.rect;
    stations.push({ id: `${room.id}-a`, roomId: room.id, x: r.x + 80, y: r.y + 70 });
    stations.push({ id: `${room.id}-b`, roomId: room.id, x: r.x + r.w - 80, y: r.y + r.h - 70 });
  }
  return stations;
}

export const STATIONS: StationDef[] = buildStations();

function roomById(id: string): RoomDef {
  const room = ROOMS.find((r) => r.id === id);
  if (!room) throw new Error(`Sala desconhecida: ${id}`);
  return room;
}

function panel(id: string, roomId: string, kind: PanelDef['kind']): PanelDef {
  const r = roomById(roomId).rect;
  return { id, roomId, kind, x: r.x + 60, y: r.y + r.h / 2 };
}

export const PANELS: PanelDef[] = [
  panel('p-injection', 'redteam', 'injection'),
  panel('p-blackout', 'datacenter', 'blackout'),
  panel('p-guardrails-1', 'etica', 'guardrails'),
  panel('p-guardrails-2', 'avaliacao', 'guardrails'),
  panel('p-cooling-1', 'arrefecimento', 'cooling'),
  panel('p-cooling-2', 'seguranca', 'cooling'),
];

function vent(roomId: string, links: string[]): VentDef {
  const r = roomById(roomId).rect;
  return { id: `v-${roomId}`, roomId, x: r.x + r.w - 70, y: r.y + 70, links: links.map((l) => `v-${l}`) };
}

export const VENTS: VentDef[] = [
  vent('datacenter', ['treino', 'arquivo']),
  vent('treino', ['datacenter', 'arquivo']),
  vent('arquivo', ['datacenter', 'treino']),
  vent('seguranca', ['cafetaria', 'etica']),
  vent('cafetaria', ['seguranca', 'etica']),
  vent('etica', ['seguranca', 'cafetaria']),
];

const MEETING_ROOM = roomById('reunioes').rect;
export const EMERGENCY_BUTTON = {
  x: MEETING_ROOM.x + MEETING_ROOM.w / 2,
  y: MEETING_ROOM.y + MEETING_ROOM.h / 2,
};

/** Posição inicial do jogador `index` de `total`, em círculo à volta do botão de emergência. */
export function spawnPoint(index: number, total: number): { x: number; y: number } {
  const angle = (index / Math.max(1, total)) * Math.PI * 2;
  return {
    x: EMERGENCY_BUTTON.x + Math.cos(angle) * 120,
    y: EMERGENCY_BUTTON.y + Math.sin(angle) * 110,
  };
}

function inRect(x: number, y: number, r: Rect): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

// ---------------------------------------------------------------- objetos com volume

export type DecorKind = 'rack' | 'table' | 'plant';

export interface DecorDef {
  kind: DecorKind;
  x: number;
  /** Linha dos pés do objeto (base do sprite). */
  y: number;
}

/** Decoração encostada às paredes ou nos cantos, sempre longe das portas. */
export const DECOR: DecorDef[] = (() => {
  const out: DecorDef[] = [];
  const room = (id: string) => roomById(id).rect;
  const cx = (id: string) => room(id).x + room(id).w / 2;
  // Racks no canto esquerdo da parede do fundo, para não taparem o nome da sala (pintado ao centro).
  for (const id of ['datacenter', 'treino']) {
    out.push({ kind: 'rack', x: room(id).x + 38, y: room(id).y + 34 });
    out.push({ kind: 'rack', x: room(id).x + 83, y: room(id).y + 34 });
  }
  out.push({ kind: 'rack', x: room('redteam').x + 38, y: room('redteam').y + 34 });
  const caf = room('cafetaria');
  out.push({ kind: 'table', x: cx('cafetaria') - 90, y: caf.y + 130 });
  out.push({ kind: 'table', x: cx('cafetaria') - 90, y: caf.y + 245 });
  for (const id of ['reunioes', 'etica', 'seguranca', 'arrefecimento']) {
    const r = room(id);
    out.push({ kind: 'plant', x: r.x + 26, y: r.y + r.h - 8 });
  }
  const meet = room('reunioes');
  out.push({ kind: 'plant', x: meet.x + meet.w - 26, y: meet.y + meet.h - 8 });
  return out;
})();

/** Base de cada tipo de decoração: meia largura e altura, a partir da linha dos pés. */
const DECOR_BASE: Record<DecorKind, { hw: number; h: number }> = {
  rack: { hw: 19, h: 22 },
  table: { hw: 36, h: 26 },
  plant: { hw: 12, h: 16 },
};

function footprint(x: number, footY: number, hw: number, h: number): Rect {
  return { x: x - hw, y: footY - h, w: hw * 2, h };
}

/**
 * Zonas ocupadas pelos objetos (consolas, painéis, mesa do botão, decoração). Só a base conta,
 * para o jogador poder passar "atrás" da parte de cima do sprite.
 */
export const OBSTACLES: Rect[] = [
  ...STATIONS.map((s) => footprint(s.x, s.y + 22, 24, 22)),
  ...PANELS.map((p) => footprint(p.x, p.y + 24, 16, 18)),
  footprint(EMERGENCY_BUTTON.x, EMERGENCY_BUTTON.y + 34, 54, 50),
  ...DECOR.map((d) => footprint(d.x, d.y - 2, DECOR_BASE[d.kind].hw, DECOR_BASE[d.kind].h)),
];

function hitsObstacle(x: number, y: number, r: number): boolean {
  for (const o of OBSTACLES) {
    if (x + r > o.x && x - r < o.x + o.w && y + r > o.y && y - r < o.y + o.h) return true;
  }
  return false;
}

const STATIC_WALKABLE: Rect[] = [...ROOMS.map((r) => r.rect), ...CORRIDORS];

export type LockedRooms = ReadonlySet<string> | undefined;

export function isWalkablePoint(x: number, y: number, locked?: LockedRooms): boolean {
  for (const r of STATIC_WALKABLE) if (inRect(x, y, r)) return true;
  for (const d of DOORS) {
    if (locked?.has(d.roomId)) continue;
    if (inRect(x, y, d.rect)) return true;
  }
  return false;
}

/** Verifica se um jogador (círculo aproximado pela caixa envolvente) cabe na posição. */
export function canStand(x: number, y: number, locked?: LockedRooms, r: number = PLAYER_RADIUS): boolean {
  return (
    !hitsObstacle(x, y, r) &&
    isWalkablePoint(x - r, y - r, locked) &&
    isWalkablePoint(x + r, y - r, locked) &&
    isWalkablePoint(x - r, y + r, locked) &&
    isWalkablePoint(x + r, y + r, locked)
  );
}

/**
 * Valida um movimento enviado pelo cliente: o destino tem de ser válido e o caminho reto não pode
 * atravessar paredes nem objetos. Pelo caminho a margem é menor, para tolerar o deslize em cantos.
 */
export function canTravel(ax: number, ay: number, bx: number, by: number, locked?: LockedRooms): boolean {
  if (!canStand(bx, by, locked)) return false;
  const steps = Math.ceil(Math.hypot(bx - ax, by - ay) / 6);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (!canStand(ax + (bx - ax) * t, ay + (by - ay) * t, locked, PLAYER_RADIUS - 6)) return false;
  }
  return true;
}

/** Move com deslize ao longo das paredes. Usado pelo servidor e pela predição do cliente. */
export function moveWithCollision(
  x: number,
  y: number,
  dx: number,
  dy: number,
  locked?: LockedRooms,
): { x: number; y: number } {
  // Se a posição atual já é inválida (ex.: porta trancou em cima do jogador), deixa sair.
  if (!canStand(x, y, locked)) {
    return { x: clamp(x + dx, 0, WORLD.w), y: clamp(y + dy, 0, WORLD.h) };
  }
  let nx = x;
  let ny = y;
  if (dx !== 0 && canStand(x + dx, y, locked)) nx = x + dx;
  if (dy !== 0 && canStand(nx, y + dy, locked)) ny = y + dy;
  return { x: nx, y: ny };
}

/** Movimento de fantasma: atravessa paredes, limitado ao mundo. */
export function moveGhost(x: number, y: number, dx: number, dy: number): { x: number; y: number } {
  return { x: clamp(x + dx, 0, WORLD.w), y: clamp(y + dy, 0, WORLD.h) };
}

export function lineOfSight(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  locked?: LockedRooms,
): boolean {
  const dist = Math.hypot(bx - ax, by - ay);
  const steps = Math.ceil(dist / 20);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (!isWalkablePoint(ax + (bx - ax) * t, ay + (by - ay) * t, locked)) return false;
  }
  return true;
}

export function roomAt(x: number, y: number): RoomDef | undefined {
  return ROOMS.find((r) => inRect(x, y, r.rect));
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
