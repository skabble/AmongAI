// Arte 2.5D desenhada por código: vista de cima com perspetiva oblíqua (as paredes viradas a sul mostram a face).
import Phaser from 'phaser';
import { DOORS, ROOMS, WORLD, isWalkablePoint, type DecorKind } from '@amongai/shared';
import { t } from '../i18n';

/** Altura máxima da face visível das paredes, em px. */
export const WALL_H = 56;
/** O sprite do robô tem os pés nesta linha (de 64 px de altura). */
export const BOT_FEET = 60;
/** Distância entre o centro de colisão do jogador e os pés do sprite. */
export const FEET_OFFSET = 10;

const CELL = 10;
const SPACE = 0x05070d;
const HULL = 0x1b2130;
const RIM = 0x7a86a3;

const FLOORS: Record<string, number> = {
  datacenter: 0x2f3d5c,
  treino: 0x3d3552,
  avaliacao: 0x2d4a48,
  redteam: 0x4c3038,
  arrefecimento: 0x2c4658,
  reunioes: 0x5a6070,
  etica: 0x4c4434,
  arquivo: 0x413c34,
  rotulagem: 0x34473a,
  cafetaria: 0x5c4b3a,
  seguranca: 0x2f3644,
};
const CORRIDOR = 0x3a4256;

export function shade(color: number, amount: number): number {
  const c = Phaser.Display.Color.IntegerToColor(color);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + amount)));
  return Phaser.Display.Color.GetColor(f(c.red), f(c.green), f(c.blue));
}

export function colorOf(hex: string): number {
  return Phaser.Display.Color.HexStringToColor(hex).color;
}

// ---------------------------------------------------------------- mapa

/** Desenha chão, paredes e casco num RenderTexture estático. Devolve os letreiros das salas (por id). */
export function drawWorld(scene: Phaser.Scene): Map<string, Phaser.GameObjects.Text> {
  const cols = WORLD.w / CELL;
  const rows = WORLD.h / CELL;
  const walk: boolean[][] = [];
  for (let j = 0; j < rows; j++) {
    walk.push([]);
    for (let i = 0; i < cols; i++) walk[j]!.push(isWalkablePoint(i * CELL + CELL / 2, j * CELL + CELL / 2));
  }
  const at = (i: number, j: number) => j >= 0 && j < rows && i >= 0 && i < cols && walk[j]![i]!;

  const g = scene.make.graphics({ x: 0, y: 0 }, false);

  // Espaço com estrelas e casco do laboratório.
  g.fillStyle(SPACE);
  g.fillRect(0, 0, WORLD.w, WORLD.h);
  const rng = new Phaser.Math.RandomDataGenerator(['atlas']);
  for (let k = 0; k < 220; k++) {
    g.fillStyle(0xffffff, rng.realInRange(0.15, 0.7));
    g.fillCircle(rng.between(0, WORLD.w), rng.between(0, WORLD.h), rng.realInRange(0.6, 1.6));
  }
  g.fillStyle(shade(HULL, -6));
  g.fillRoundedRect(46, 30, WORLD.w - 92, WORLD.h - 52, 60);
  g.fillStyle(HULL);
  g.fillRoundedRect(50, 26, WORLD.w - 100, WORLD.h - 60, 56);

  // Chão: corredores e portas com placas metálicas, salas com azulejos.
  const corridorRects = [...DOORS.map((d) => d.rect)];
  g.fillStyle(CORRIDOR);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) if (walk[j]![i]) g.fillRect(i * CELL, j * CELL, CELL, CELL);
  g.lineStyle(1, shade(CORRIDOR, -14), 0.8);
  for (let x = 0; x < WORLD.w; x += 30) {
    for (let j = 0; j < rows; j++) {
      const i = Math.floor(x / CELL);
      if (at(i, j) && !ROOMS.some((r) => inside(x, j * CELL + 1, r.rect))) g.lineBetween(x, j * CELL, x, j * CELL + CELL);
    }
  }
  void corridorRects;

  for (const room of ROOMS) {
    const r = room.rect;
    const base = FLOORS[room.id] ?? 0x333a4a;
    g.fillStyle(base);
    g.fillRect(r.x, r.y, r.w, r.h);
    const tile = room.id === 'reunioes' ? 50 : 40;
    for (let y = r.y; y < r.y + r.h; y += tile) {
      for (let x = r.x; x < r.x + r.w; x += tile) {
        const odd = (Math.floor((x - r.x) / tile) + Math.floor((y - r.y) / tile)) % 2 === 1;
        if (odd) {
          g.fillStyle(shade(base, room.id === 'reunioes' ? 14 : 6));
          g.fillRect(x, y, Math.min(tile, r.x + r.w - x), Math.min(tile, r.y + r.h - y));
        }
      }
    }
    g.lineStyle(1, shade(base, -16), 0.7);
    for (let x = r.x + tile; x < r.x + r.w; x += tile) g.lineBetween(x, r.y, x, r.y + r.h);
    for (let y = r.y + tile; y < r.y + r.h; y += tile) g.lineBetween(r.x, y, r.x + r.w, y);
  }

  // Faces das paredes viradas a sul (a única face visível nesta perspetiva) e a sua sombra no chão.
  for (let j = 1; j < rows; j++) {
    let i = 0;
    while (i < cols) {
      if (!at(i, j) || at(i, j - 1)) {
        i++;
        continue;
      }
      let span = 0;
      while (j - 1 - span >= 0 && !at(i, j - 1 - span)) span++;
      const h = Math.max(12, Math.min(WALL_H, span * CELL - 8));
      let end = i;
      while (end < cols && at(end, j) && !at(end, j - 1)) {
        let s = 0;
        while (j - 1 - s >= 0 && !at(end, j - 1 - s)) s++;
        if (Math.max(12, Math.min(WALL_H, s * CELL - 8)) !== h) break;
        end++;
      }
      drawWallFace(g, i * CELL, j * CELL, (end - i) * CELL, h);
      i = end;
    }
  }

  // Rebordo claro no topo das paredes à volta de todas as zonas transitáveis.
  g.lineStyle(2, RIM, 0.9);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      if (!walk[j]![i]) continue;
      const x = i * CELL;
      const y = j * CELL;
      if (!at(i - 1, j)) g.lineBetween(x - 1, y - (at(i, j - 1) ? 0 : faceHeight(at, i, j)), x - 1, y + CELL);
      if (!at(i + 1, j)) g.lineBetween(x + CELL + 1, y - (at(i, j - 1) ? 0 : faceHeight(at, i, j)), x + CELL + 1, y + CELL);
      if (!at(i, j + 1)) g.lineBetween(x - 1, y + CELL + 1, x + CELL + 1, y + CELL + 1);
      if (!at(i, j - 1)) {
        const top = y - faceHeight(at, i, j);
        g.lineBetween(x - 1, top - 1, x + CELL + 1, top - 1);
      }
    }
  }

  const rt = scene.add.renderTexture(0, 0, WORLD.w, WORLD.h).setOrigin(0, 0).setDepth(-100);
  rt.draw(g);
  g.destroy();

  // Nome de cada sala pintado na parede do fundo; se a parede tiver porta, fica no troço da esquerda.
  const labels = new Map<string, Phaser.GameObjects.Text>();
  for (const room of ROOMS) {
    const r = room.rect;
    const door = DOORS.find((d) => d.roomId === room.id && d.rect.y < r.y);
    const left = r.x;
    const right = door ? door.rect.x : r.x + r.w;
    const label = scene.add
      .text((left + right) / 2, r.y - 26, t(`room.${room.id}`).toUpperCase(), {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '13px',
        fontStyle: 'bold',
        color: '#d6def0',
        align: 'center',
        wordWrap: { width: right - left - 24 },
      })
      .setOrigin(0.5)
      .setAlpha(0.6)
      .setDepth(-90);
    labels.set(room.id, label);
  }
  return labels;
}

function inside(x: number, y: number, r: { x: number; y: number; w: number; h: number }): boolean {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

function faceHeight(at: (i: number, j: number) => boolean, i: number, j: number): number {
  let span = 0;
  while (j - 1 - span >= 0 && !at(i, j - 1 - span)) span++;
  return Math.max(12, Math.min(WALL_H, span * CELL - 8));
}

function drawWallFace(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
  const top = y - h;
  g.fillStyle(0x47526c);
  g.fillRect(x, top, w, h);
  g.fillStyle(0x5d6a88);
  g.fillRect(x, top, w, 7);
  g.fillStyle(0x3b4560);
  g.fillRect(x, top + h * 0.55, w, h * 0.45);
  g.fillStyle(0x232a3a);
  g.fillRect(x, y - 6, w, 6);
  // Juntas verticais dos painéis.
  g.lineStyle(1, 0x2e3649, 0.9);
  for (let px = Math.ceil(x / 60) * 60; px < x + w; px += 60) g.lineBetween(px, top + 7, px, y - 6);
  // Sombra da parede projetada no chão.
  g.fillStyle(0x000000, 0.22);
  g.fillRect(x, y, w, 6);
  g.fillStyle(0x000000, 0.12);
  g.fillRect(x, y + 6, w, 8);
}

// ---------------------------------------------------------------- texturas de objetos

function texture(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void): string {
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
  return key;
}

/** Consola de trabalho: secretária com monitor. Origem nos pés (0.5, 1). */
export function consoleTexture(scene: Phaser.Scene): string {
  return texture(scene, 'prop-console', 52, 58, (g) => {
    g.fillStyle(0x000000, 0.3);
    g.fillEllipse(26, 54, 50, 8);
    g.fillStyle(0x27304a);
    g.fillRect(4, 34, 44, 20);
    g.fillStyle(0x46557a);
    g.fillRect(4, 26, 44, 10);
    g.fillStyle(0x6a7aa2);
    g.fillRect(4, 26, 44, 2);
    g.fillStyle(0x1f2638);
    g.fillRect(8, 40, 14, 3);
    g.fillRect(30, 40, 14, 3);
    g.fillStyle(0x161b28);
    g.fillRect(23, 16, 6, 12);
    g.fillRoundedRect(8, 0, 36, 20, 3);
    g.fillStyle(0x4fd1ff, 0.9);
    g.fillRect(11, 3, 30, 14);
    g.fillStyle(0xffffff, 0.35);
    g.fillRect(13, 5, 10, 2);
    g.fillStyle(0x0d3a4a, 0.6);
    g.fillRect(13, 9, 20, 2);
    g.fillRect(13, 13, 14, 2);
  });
}

/** Armário de controlo usado para reparar sabotagens. */
export function panelTexture(scene: Phaser.Scene): string {
  return texture(scene, 'prop-panel', 38, 66, (g) => {
    g.fillStyle(0x000000, 0.3);
    g.fillEllipse(19, 62, 36, 8);
    g.fillStyle(0x5a4526);
    g.fillRect(4, 14, 30, 48);
    g.fillStyle(0x7c6236);
    g.fillRect(4, 6, 30, 10);
    g.fillStyle(0x9a7c46);
    g.fillRect(4, 6, 30, 2);
    g.fillStyle(0x2a2016);
    g.fillRoundedRect(8, 20, 22, 18, 2);
    g.fillStyle(0xffb347);
    g.fillCircle(13, 26, 3);
    g.fillStyle(0x5cff8f);
    g.fillCircle(19, 26, 3);
    g.fillStyle(0xff4d5e);
    g.fillCircle(25, 26, 3);
    g.fillStyle(0x8a99b8);
    g.fillRect(11, 32, 16, 2);
    for (let k = 0; k < 5; k++) {
      g.fillStyle(k % 2 ? 0x1a1a1a : 0xffcc33);
      g.fillRect(4 + k * 6, 54, 6, 8);
    }
  });
}

/** Grelha de conduta no chão. */
export function ventTexture(scene: Phaser.Scene): string {
  return texture(scene, 'prop-vent', 50, 34, (g) => {
    g.fillStyle(0x0f131d);
    g.fillRoundedRect(1, 1, 48, 32, 5);
    g.lineStyle(2, 0x56617c);
    g.strokeRoundedRect(1, 1, 48, 32, 5);
    g.lineStyle(3, 0x3a4258);
    for (let y = 8; y <= 26; y += 6) g.lineBetween(8, y, 42, y);
    g.fillStyle(0x8a95b0);
    for (const [x, y] of [[5, 5], [45, 5], [5, 29], [45, 29]] as const) g.fillCircle(x, y, 1.5);
  });
}

/** Mesa redonda com o botão de emergência. */
export function buttonTableTexture(scene: Phaser.Scene): string {
  return texture(scene, 'prop-button', 120, 84, (g) => {
    g.fillStyle(0x000000, 0.3);
    g.fillEllipse(60, 74, 116, 18);
    g.fillStyle(0x2a3248);
    g.fillEllipse(60, 52, 110, 48);
    g.fillRect(5, 38, 110, 14);
    g.fillStyle(0x4f5c7c);
    g.fillEllipse(60, 38, 110, 48);
    g.lineStyle(2, 0x7a86a3);
    g.strokeEllipse(60, 38, 110, 48);
    g.fillStyle(0x3f4a66);
    g.fillEllipse(60, 38, 70, 30);
    g.fillStyle(0x7a0f1c);
    g.fillEllipse(60, 36, 30, 16);
    g.fillStyle(0xd7263d);
    g.fillEllipse(60, 30, 26, 18);
    g.fillStyle(0xffffff, 0.45);
    g.fillEllipse(55, 26, 8, 5);
  });
}

export function decorTexture(scene: Phaser.Scene, kind: DecorKind): string {
  switch (kind) {
    case 'rack':
      return texture(scene, 'decor-rack', 42, 86, (g) => {
        g.fillStyle(0x000000, 0.3);
        g.fillEllipse(21, 82, 40, 8);
        g.fillStyle(0x1b2030);
        g.fillRect(3, 10, 36, 72);
        g.fillStyle(0x343c52);
        g.fillRect(3, 4, 36, 8);
        for (let y = 16; y < 76; y += 9) {
          g.fillStyle(0x262d40);
          g.fillRect(6, y, 30, 7);
          g.fillStyle(y % 2 ? 0x5cff8f : 0x4fd1ff);
          g.fillRect(9, y + 2, 3, 3);
          g.fillStyle(0xffb347);
          g.fillRect(14, y + 2, 2, 3);
        }
      });
    case 'table':
      return texture(scene, 'decor-table', 80, 56, (g) => {
        g.fillStyle(0x000000, 0.3);
        g.fillEllipse(40, 48, 78, 14);
        g.fillStyle(0x5a3f28);
        g.fillEllipse(40, 32, 74, 30);
        g.fillRect(3, 24, 74, 8);
        g.fillStyle(0x8a643f);
        g.fillEllipse(40, 24, 74, 30);
        g.fillStyle(0xffffff);
        g.fillEllipse(28, 22, 10, 6);
        g.fillStyle(0x6b4a2a);
        g.fillEllipse(50, 20, 8, 5);
      });
    case 'plant':
      return texture(scene, 'decor-plant', 36, 58, (g) => {
        g.fillStyle(0x000000, 0.3);
        g.fillEllipse(18, 54, 28, 7);
        g.fillStyle(0x9a5a3a);
        g.fillRect(9, 36, 18, 18);
        g.fillStyle(0xb8704a);
        g.fillRect(7, 33, 22, 5);
        g.fillStyle(0x2f7a4a);
        g.fillEllipse(12, 22, 14, 22);
        g.fillEllipse(24, 20, 14, 24);
        g.fillStyle(0x45a066);
        g.fillEllipse(18, 14, 14, 24);
      });
  }
}

// ---------------------------------------------------------------- personagem

/** Robô de laboratório na cor do jogador. 48x64, virado para a direita, pés na linha BOT_FEET. */
export function botTexture(scene: Phaser.Scene, hex: string): string {
  const color = colorOf(hex);
  const light = shade(color, 28);
  const dark = shade(color, -45);
  const outline = 0x0a0d16;
  return texture(scene, `bot-${hex}`, 48, 64, (g) => {
    // Pés
    g.fillStyle(0x1c2232);
    g.fillRoundedRect(13, 52, 10, 9, 3);
    g.fillRoundedRect(26, 52, 10, 9, 3);
    // Braços
    g.fillStyle(dark);
    g.fillRoundedRect(5, 36, 6, 13, 3);
    g.fillRoundedRect(37, 36, 6, 13, 3);
    // Corpo
    g.fillStyle(outline);
    g.fillRoundedRect(8, 30, 32, 26, 8);
    g.fillStyle(color);
    g.fillRoundedRect(10, 32, 28, 22, 7);
    g.fillStyle(dark);
    g.fillRoundedRect(10, 46, 28, 8, { tl: 0, tr: 0, bl: 7, br: 7 });
    g.fillStyle(light);
    g.fillRect(13, 35, 3, 10);
    // Cartão de acesso
    g.fillStyle(0xf2f5fb);
    g.fillRect(25, 37, 9, 7);
    g.fillStyle(0x4fd1ff);
    g.fillRect(26, 38, 3, 3);
    g.fillStyle(0x8a95b0);
    g.fillRect(30, 39, 3, 1);
    g.fillRect(26, 42, 7, 1);
    // Pescoço
    g.fillStyle(0x1c2232);
    g.fillRect(20, 28, 8, 4);
    // Cabeça
    g.fillStyle(outline);
    g.fillRoundedRect(6, 8, 36, 24, 9);
    g.fillStyle(light);
    g.fillRoundedRect(8, 10, 32, 20, 8);
    g.fillStyle(color);
    g.fillRoundedRect(8, 22, 32, 8, { tl: 0, tr: 0, bl: 8, br: 8 });
    // Ecrã da cara, deslocado para a frente (direita)
    g.fillStyle(0x101626);
    g.fillRoundedRect(15, 13, 23, 13, 4);
    g.fillStyle(0x6ff0ff);
    g.fillRoundedRect(22, 17, 4, 5, 1);
    g.fillRoundedRect(31, 17, 4, 5, 1);
    g.fillStyle(0xffffff, 0.25);
    g.fillRect(17, 14, 8, 2);
    // Antena
    g.lineStyle(2, outline);
    g.lineBetween(20, 9, 18, 3);
    g.fillStyle(0xffe45c);
    g.fillCircle(18, 3, 3);
  });
}

/** Robô desligado no chão, com o ecrã partido. Origem nos pés (0.5, 1). */
export function deadBotTexture(scene: Phaser.Scene, hex: string): string {
  const color = colorOf(hex);
  const dark = shade(color, -45);
  return texture(scene, `bot-dead-${hex}`, 64, 40, (g) => {
    g.fillStyle(0x000000, 0.35);
    g.fillEllipse(32, 34, 60, 10);
    // Corpo deitado
    g.fillStyle(0x0a0d16);
    g.fillRoundedRect(4, 14, 32, 22, 7);
    g.fillStyle(color);
    g.fillRoundedRect(6, 16, 28, 18, 6);
    g.fillStyle(dark);
    g.fillRoundedRect(6, 27, 28, 7, { tl: 0, tr: 0, bl: 6, br: 6 });
    g.fillStyle(0x1c2232);
    g.fillRoundedRect(0, 18, 6, 6, 2);
    g.fillRoundedRect(0, 26, 6, 6, 2);
    // Cabeça solta
    g.fillStyle(0x0a0d16);
    g.fillRoundedRect(36, 10, 26, 24, 8);
    g.fillStyle(shade(color, 28));
    g.fillRoundedRect(38, 12, 22, 20, 7);
    g.fillStyle(0x101626);
    g.fillRoundedRect(42, 15, 16, 12, 3);
    g.lineStyle(2, 0xff4d5e);
    g.lineBetween(45, 18, 49, 23);
    g.lineBetween(49, 18, 45, 23);
    g.lineBetween(51, 18, 55, 23);
    g.lineBetween(55, 18, 51, 23);
    // Faíscas
    g.fillStyle(0xffe45c);
    g.fillCircle(36, 10, 2);
    g.fillCircle(40, 5, 1.5);
  });
}

/** Poça de sangue irregular, desenhada por baixo de um corpo (origem ao centro). */
export function bloodPoolTexture(scene: Phaser.Scene): string {
  return texture(scene, 'blood-pool', 96, 40, (g) => {
    g.fillStyle(0x4a0710, 0.85);
    g.fillEllipse(48, 21, 86, 30);
    g.fillEllipse(20, 26, 30, 16);
    g.fillEllipse(76, 14, 28, 14);
    g.fillStyle(0x7a0c18, 0.9);
    g.fillEllipse(46, 20, 70, 22);
    g.fillEllipse(70, 26, 22, 10);
    g.fillStyle(0xa3121f, 0.85);
    g.fillEllipse(42, 18, 44, 12);
    // Reflexo
    g.fillStyle(0xffffff, 0.18);
    g.fillEllipse(34, 15, 14, 4);
    // Salpicos
    g.fillStyle(0x7a0c18, 0.9);
    for (const [x, y, r] of [[6, 18, 2.5], [90, 22, 2], [84, 32, 1.6], [12, 34, 1.8], [60, 4, 1.5]] as const) g.fillCircle(x, y, r);
  });
}
