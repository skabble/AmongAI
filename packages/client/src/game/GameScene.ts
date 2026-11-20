import Phaser from 'phaser';
import {
  DECOR,
  DOORS,
  EMERGENCY_BUTTON,
  KILL_RANGES,
  PANELS,
  REPORT_RANGE,
  SPEED,
  STATIONS,
  USE_RANGE,
  VENTS,
  WORLD,
  moveGhost,
  moveWithCollision,
  roomAt,
  taskDef,
  visionRadius,
  type Snap,
  type TaskView,
  type View,
} from '@desalinhados/shared';
import { translate } from '../i18n';
import { getState, live, send, setState, type Nearby } from '../store';
import {
  BOT_FEET,
  FEET_OFFSET,
  botTexture,
  buttonTableTexture,
  consoleTexture,
  bloodPoolTexture,
  deadBotTexture,
  decorTexture,
  drawWorld,
  panelTexture,
  ventTexture,
} from './art';

const FOG_ALPHA = 0.93;
const FOG_COLOR = 0x05070d;
/** Margem do nevoeiro para lá do ecrã, para cobrir o desvio da câmara em relação ao jogador. */
const FOG_PAD = 192;
/** Os outros jogadores são desenhados com este atraso, interpolando entre snapshots (sem solavancos). */
const INTERP_DELAY_MS = 110;
/** Intervalo mínimo entre envios da posição ao servidor. */
const MOVE_SEND_MS = 50;
/** Saltos maiores do que isto (condutas, reuniões) não são interpolados. */
const JUMP_PX = 150;
/** Profundidades fixas; tudo o que tem volume usa a coordenada y dos pés. */
const DEPTH = { floorFx: -50, vent: -40, door: -30, label: 950, marker: 900, fog: 1000 };

interface Sample {
  t: number;
  x: number;
  y: number;
}

interface Avatar {
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Ellipse;
  label: Phaser.GameObjects.Text;
  color: string;
  samples: Sample[];
  phase: number;
}

export class GameScene extends Phaser.Scene {
  private me = { x: EMERGENCY_BUTTON.x, y: EMERGENCY_BUTTON.y, ready: false };
  /** Último contador de teletransporte recebido (Snap.w). */
  private warp = -1;
  private sent = { x: NaN, y: NaN, at: 0 };
  /** Relógio do servidor estimado a partir do último snapshot. */
  private clock = { t: 0, at: 0 };
  private meAvatar!: Avatar;
  private others = new Map<string, Avatar>();
  private bodies = new Map<string, { body: Phaser.GameObjects.Image; pool: Phaser.GameObjects.Image }>();
  /** Corpos já vistos: a poça de sangue só se espalha (animada) da primeira vez. */
  private bodiesSeen = new Set<string>();
  private floorFx!: Phaser.GameObjects.Graphics;
  private doors!: Phaser.GameObjects.Graphics;
  private markers!: Phaser.GameObjects.Graphics;
  private fog!: Phaser.GameObjects.Graphics;
  private fogImage!: Phaser.GameObjects.Image;
  private fogKey = '';
  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;
  private nearbyAt = 0;
  private nearbyKey = '';
  private roomLabels = new Map<string, Phaser.GameObjects.Text>();
  private labelLang = getState().lang;

  constructor() {
    super('game');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(FOG_COLOR);
    this.roomLabels = drawWorld(this);
    this.placeProps();

    this.floorFx = this.add.graphics().setDepth(DEPTH.floorFx);
    this.doors = this.add.graphics().setDepth(DEPTH.door);
    this.markers = this.add.graphics().setDepth(DEPTH.marker);
    this.fog = this.add.graphics().setDepth(DEPTH.fog);
    this.fogImage = this.add.image(0, 0, '__WHITE').setDepth(DEPTH.fog).setVisible(false);

    this.meAvatar = this.makeAvatar('', '#ffffff');
    this.cameras.main.setRoundPixels(true);
    this.cameras.main.startFollow(this.meAvatar.container, true, 0.2, 0.2, 0, 24);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys(
      { up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT', w: 'W', a: 'A', s: 'S', d: 'D' },
      false,
    ) as GameScene['keys'];

    const onBlur = () => kb.resetKeys();
    window.addEventListener('blur', onBlur);
    live.onSnap = (snap) => this.applySnap(snap);
    if (live.snap) this.applySnap(live.snap);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('blur', onBlur);
      live.onSnap = undefined;
      setState({ nearby: {} });
    });
  }

  // ---------------------------------------------------------------- objetos do mapa

  /** Coloca um objeto com volume: a origem fica nos pés e a profundidade segue o y. */
  private prop(key: string, x: number, footY: number): Phaser.GameObjects.Image {
    return this.add.image(x, footY, key).setOrigin(0.5, 1).setDepth(footY);
  }

  private placeProps(): void {
    for (const v of VENTS) this.add.image(v.x, v.y, ventTexture(this)).setDepth(DEPTH.vent);
    for (const s of STATIONS) this.prop(consoleTexture(this), s.x, s.y + 24);
    for (const p of PANELS) this.prop(panelTexture(this), p.x, p.y + 26);
    this.prop(buttonTableTexture(this), EMERGENCY_BUTTON.x, EMERGENCY_BUTTON.y + 40);
    for (const d of DECOR) this.prop(decorTexture(this, d.kind), d.x, d.y);
  }

  /**
   * Textura do nevoeiro que cobre o ecrã inteiro (mais uma margem), com o buraco da visão no centro.
   * Uma só imagem evita as costuras que apareciam entre o círculo e os retângulos à volta.
   * Só é refeita quando o raio ou o tamanho do ecrã mudam.
   */
  private fogTexture(radius: number): string {
    const cam = this.cameras.main;
    const round = (v: number) => Math.ceil(v / 64) * 64;
    const w = round(Math.max(cam.width, radius * 2) + FOG_PAD * 2);
    const h = round(Math.max(cam.height, radius * 2) + FOG_PAD * 2);
    const key = `fog-${radius}-${w}x${h}`;
    if (key === this.fogKey) return key;
    if (this.fogKey && this.textures.exists(this.fogKey)) {
      this.fogImage.setTexture('__WHITE');
      this.textures.remove(this.fogKey);
    }
    this.fogKey = key;
    const texture = this.textures.createCanvas(key, w, h)!;
    const ctx = texture.getContext();
    const gradient = ctx.createRadialGradient(w / 2, h / 2, radius * 0.55, w / 2, h / 2, radius);
    gradient.addColorStop(0, 'rgba(5,7,13,0)');
    gradient.addColorStop(1, `rgba(5,7,13,${FOG_ALPHA})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    texture.refresh();
    return key;
  }

  // ---------------------------------------------------------------- personagens

  private makeAvatar(name: string, color: string): Avatar {
    const shadow = this.add.ellipse(0, FEET_OFFSET, 30, 10, 0x000000, 0.35);
    const sprite = this.add.image(0, FEET_OFFSET, botTexture(this, color)).setOrigin(0.5, BOT_FEET / 64);
    const container = this.add.container(0, 0, [shadow, sprite]);
    const label = this.add
      .text(0, 0, name, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '13px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#0a0d16',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.label);
    return { container, sprite, shadow, label, color, samples: [], phase: 0 };
  }

  private setColor(avatar: Avatar, color: string): void {
    if (avatar.color === color) return;
    avatar.color = color;
    avatar.sprite.setTexture(botTexture(this, color));
  }

  /** Posiciona, ordena em profundidade e anima (passo, virar, flutuar) um avatar. */
  private animate(avatar: Avatar, x: number, y: number, dirX: number, moving: boolean, ghost: boolean, time: number, deltaMs: number): void {
    const { container, sprite, shadow, label } = avatar;
    container.setPosition(x, y).setDepth(y + FEET_OFFSET);
    if (dirX !== 0) sprite.setFlipX(dirX < 0);
    let lift = 0;
    if (ghost) {
      lift = 6 + Math.sin(time / 320) * 3;
      sprite.setAngle(Math.sin(time / 500) * 4);
    } else if (moving) {
      avatar.phase += deltaMs * 0.018;
      lift = Math.abs(Math.sin(avatar.phase)) * 3;
      sprite.setAngle(Math.sin(avatar.phase) * 5);
    } else {
      avatar.phase = 0;
      sprite.setAngle(0);
    }
    sprite.y = FEET_OFFSET - lift;
    shadow.setVisible(!ghost).setScale(1 - lift * 0.03);
    label.setPosition(x, y + FEET_OFFSET - lift - 58).setVisible(container.visible).setAlpha(container.alpha);
  }

  // ---------------------------------------------------------------- rede

  private applySnap(snap: Snap): void {
    const view = getState().view;
    if (!view) return;

    this.clock = { t: snap.t, at: performance.now() };

    // O próprio jogador move-se localmente e o servidor confirma; a posição do servidor só se impõe
    // quando há um teletransporte (início, reunião, conduta ou movimento recusado).
    if (!this.me.ready || snap.w !== this.warp) {
      this.me.x = snap.x;
      this.me.y = snap.y;
      this.me.ready = true;
      this.warp = snap.w;
      this.sent = { x: snap.x, y: snap.y, at: 0 };
    }

    const seen = new Set<string>();
    for (const [id, x, y, ghost] of snap.players) {
      seen.add(id);
      const info = view.players.find((p) => p.id === id);
      let avatar = this.others.get(id);
      if (!avatar) {
        avatar = this.makeAvatar(info?.name ?? '?', info?.color ?? '#ffffff');
        this.others.set(id, avatar);
      }
      if (info) this.setColor(avatar, info.color);
      // Os Desalinhados veem os aliados com o nome a vermelho.
      avatar.label.setColor(info?.role === 'impostor' ? '#ff8a95' : '#ffffff');
      const last = avatar.samples[avatar.samples.length - 1];
      // Reaparecer ou saltar (conduta, reunião): começa de novo, sem deslizar pelo mapa.
      if (!avatar.container.visible || !last || Math.hypot(x - last.x, y - last.y) > JUMP_PX) {
        avatar.samples = [];
        avatar.container.setPosition(x, y);
      }
      avatar.samples.push({ t: snap.t, x, y });
      if (avatar.samples.length > 20) avatar.samples.shift();
      avatar.container.setVisible(true).setAlpha(ghost ? 0.4 : 1);
      avatar.container.setData('ghost', !!ghost);
    }
    // Fora do campo de visão: esconde o boneco e o nome (o nome é um objeto à parte, não segue o contentor).
    for (const [id, avatar] of this.others) {
      if (seen.has(id)) continue;
      avatar.container.setVisible(false);
      avatar.label.setVisible(false);
    }

    const bodyIds = new Set(snap.bodies.map((b) => b[0]));
    for (const [id, x, y] of snap.bodies) {
      if (this.bodies.has(id)) continue;
      const color = view.players.find((p) => p.id === id)?.color ?? '#ffffff';
      const footY = y + FEET_OFFSET + 4;
      // Poça de sangue por baixo do corpo: espalha-se da primeira vez que o corpo é visto.
      const pool = this.add.image(x + 4, footY - 8, bloodPoolTexture(this)).setDepth(DEPTH.floorFx + 1);
      if (!this.bodiesSeen.has(id)) {
        this.bodiesSeen.add(id);
        pool.setScale(0.15);
        this.tweens.add({ targets: pool, scale: 1, duration: 1800, ease: 'Cubic.easeOut' });
      }
      this.bodies.set(id, { body: this.prop(deadBotTexture(this, color), x, footY), pool });
    }
    for (const [id, body] of this.bodies) {
      if (!bodyIds.has(id)) {
        body.body.destroy();
        body.pool.destroy();
        this.bodies.delete(id);
      }
    }
  }

  // ---------------------------------------------------------------- ciclo

  update(time: number, deltaMs: number): void {
    const { view, activeGame, lang } = getState();
    if (!view) return;
    if (lang !== this.labelLang) {
      this.labelLang = lang;
      for (const [id, label] of this.roomLabels) label.setText(translate(lang, `room.${id}`).toUpperCase());
    }
    const playing = view.phase === 'playing';
    const locked = new Set(view.lockedRooms);

    let dx = 0;
    let dy = 0;
    if (playing && !activeGame && !view.you.inVent) {
      const k = this.keys;
      if (k.left.isDown || k.a.isDown) dx -= 1;
      if (k.right.isDown || k.d.isDown) dx += 1;
      if (k.up.isDown || k.w.isDown) dy -= 1;
      if (k.down.isDown || k.s.isDown) dy += 1;
      if (dx !== 0 && dy !== 0) {
        dx *= Math.SQRT1_2;
        dy *= Math.SQRT1_2;
      }
    }
    const before = { x: this.me.x, y: this.me.y };
    if (playing && this.me.ready && (dx !== 0 || dy !== 0)) {
      const step = (SPEED * view.settings.playerSpeed * Math.min(deltaMs, 100)) / 1000;
      const next = view.you.alive
        ? moveWithCollision(this.me.x, this.me.y, dx * step, dy * step, locked)
        : moveGhost(this.me.x, this.me.y, dx * step, dy * step);
      this.me.x = next.x;
      this.me.y = next.y;
    }
    this.sendPosition(playing && !view.you.inVent);

    const self = view.players.find((p) => p.id === view.you.id);
    if (self) {
      this.setColor(this.meAvatar, self.color);
      this.meAvatar.label.setText(self.name);
    }
    const moved = Math.hypot(this.me.x - before.x, this.me.y - before.y) > 0.1;
    this.meAvatar.container.setAlpha(view.you.inVent ? 0.25 : view.you.alive ? 1 : 0.45);
    this.animate(this.meAvatar, this.me.x, this.me.y, dx, moved, !view.you.alive, time, deltaMs);

    const renderAt = this.clock.t + (performance.now() - this.clock.at) - INTERP_DELAY_MS;
    for (const avatar of this.others.values()) {
      const c = avatar.container;
      if (!c.visible) continue;
      const ox = c.x;
      const oy = c.y;
      const { x: nx, y: ny } = sampleAt(avatar.samples, renderAt) ?? { x: ox, y: oy };
      const vx = nx - ox;
      const moving = Math.hypot(vx, ny - oy) > 0.3;
      this.animate(avatar, nx, ny, Math.abs(vx) > 0.2 ? Math.sign(vx) : 0, moving, !!c.getData('ghost'), time, deltaMs);
    }

    this.drawDynamic(view, locked, time);
    this.drawFog(view);
    if (time - this.nearbyAt > 100) {
      this.nearbyAt = time;
      this.updateNearby(view);
    }
  }

  /** Envia a posição prevista ao servidor, no máximo a cada MOVE_SEND_MS, e só quando mudou. */
  private sendPosition(active: boolean): void {
    if (!active || !this.me.ready) return;
    const x = Math.round(this.me.x * 10) / 10;
    const y = Math.round(this.me.y * 10) / 10;
    if (x === this.sent.x && y === this.sent.y) return;
    const now = performance.now();
    if (now - this.sent.at < MOVE_SEND_MS) return;
    this.sent = { x, y, at: now };
    send('move', { x, y, w: this.warp });
  }

  private drawDynamic(view: View, locked: Set<string>, time: number): void {
    const floor = this.floorFx;
    const marks = this.markers;
    const doors = this.doors;
    floor.clear();
    marks.clear();
    doors.clear();
    const pulse = 0.5 + 0.5 * Math.sin(time / 180);
    const bounce = Math.abs(Math.sin(time / 260)) * 6;

    // Portas trancadas: persianas metálicas com luz vermelha.
    for (const d of DOORS) {
      if (!locked.has(d.roomId)) continue;
      const r = d.rect;
      doors.fillStyle(0x5a6378);
      doors.fillRect(r.x, r.y, r.w, r.h);
      doors.lineStyle(2, 0x3a4258);
      for (let y = r.y + 8; y < r.y + r.h; y += 8) doors.lineBetween(r.x, y, r.x + r.w, y);
      doors.fillStyle(0xd7263d, 0.6 + 0.4 * pulse);
      doors.fillRect(r.x, r.y, r.w, 5);
      doors.fillRect(r.x, r.y + r.h - 5, r.w, 5);
    }

    // Tarefas por fazer: aro no chão e seta a saltar por cima da consola.
    if (view.you.role === 'crew') {
      for (const task of view.you.tasks) {
        if (task.done) continue;
        const s = this.nextStation(task);
        if (!s) continue;
        floor.lineStyle(3, 0xffe45c, 0.5 + 0.5 * pulse);
        floor.strokeEllipse(s.x, s.y + 20, 76, 26);
        this.arrow(marks, s.x, s.y - 52 - bounce, 0xffe45c);
      }
    }

    // Só os Desalinhados sabem em que consolas há evidências escondidas (para as destruírem).
    for (const id of view.evidence) {
      const s = STATIONS.find((x) => x.id === id);
      if (!s) continue;
      floor.lineStyle(3, 0xb07cff, 0.4 + 0.5 * pulse);
      floor.strokeEllipse(s.x, s.y + 20, 84, 30);
      this.arrow(marks, s.x + 20, s.y - 50 - bounce, 0xb07cff);
    }

    if (view.sabotage) {
      for (const p of PANELS) {
        if (p.kind !== view.sabotage.kind) continue;
        const active = view.sabotage.activePanels.includes(p.id);
        floor.lineStyle(4, active ? 0x5cff8f : 0xff4d5e, 0.5 + 0.5 * pulse);
        floor.strokeEllipse(p.x, p.y + 24, 70, 24);
        if (!active) this.arrow(marks, p.x, p.y - 56 - bounce, 0xff4d5e);
      }
    }

    if (view.you.role === 'impostor' && view.you.alive) {
      floor.lineStyle(2, 0xb07cff, 0.8);
      for (const v of VENTS) floor.strokeRoundedRect(v.x - 29, v.y - 21, 58, 42, 7);
    }
  }

  private arrow(g: Phaser.GameObjects.Graphics, x: number, y: number, color: number): void {
    g.fillStyle(0x0a0d16, 0.9);
    g.fillTriangle(x - 11, y - 2, x + 11, y - 2, x, y + 13);
    g.fillStyle(color);
    g.fillTriangle(x - 8, y, x + 8, y, x, y + 10);
  }

  private nextStation(task: TaskView) {
    const step = taskDef(task.defId)?.steps[task.step];
    return step && STATIONS.find((s) => s.id === step.stationId);
  }

  private visionRadius(view: View): number {
    return visionRadius(view.settings, view.you.role === 'impostor', view.sabotage?.kind === 'blackout');
  }

  private drawFog(view: View): void {
    const g = this.fog;
    g.clear();
    if (!view.you.alive) {
      this.fogImage.setVisible(false);
      return;
    }
    const radius = this.visionRadius(view);
    const x = Math.round(this.me.x);
    const y = Math.round(this.me.y);
    this.fogImage.setVisible(true).setTexture(this.fogTexture(radius)).setPosition(x, y);
    // Por segurança (câmara ainda a alcançar o jogador depois de um salto), tapa o que fica fora da imagem.
    // Estes retângulos ficam fora do ecrã em condições normais, por isso não se vê a junção.
    const hw = this.fogImage.width / 2;
    const hh = this.fogImage.height / 2;
    const far = 4000;
    g.fillStyle(FOG_COLOR, FOG_ALPHA);
    g.fillRect(x - far, y - far, far * 2, far - hh);
    g.fillRect(x - far, y + hh, far * 2, far - hh);
    g.fillRect(x - far, y - hh, far - hw, hh * 2);
    g.fillRect(x + hw, y - hh, far - hw, hh * 2);
  }

  private updateNearby(view: View): void {
    const nearby: Nearby = {};
    if (view.phase === 'playing' && this.me.ready) {
      const { x, y } = this.me;
      const d = (ox: number, oy: number) => Math.hypot(ox - x, oy - y);
      const you = view.you;
      nearby.room = roomAt(x, y)?.id ?? 'corridor';

      let best = USE_RANGE;
      for (const task of you.role === 'crew' ? you.tasks : []) {
        if (task.done) continue;
        const s = this.nextStation(task);
        if (s && d(s.x, s.y) <= best) {
          best = d(s.x, s.y);
          nearby.taskId = task.id;
        }
      }
      // Os Desalinhados vivos destroem as evidências escondidas nas consolas (a Equipa encontra-as nas tarefas).
      if (!you.inVent && you.alive && you.role === 'impostor') {
        nearby.evidenceId = view.evidence.find((id) => {
          const s = STATIONS.find((x) => x.id === id);
          return !!s && d(s.x, s.y) <= USE_RANGE;
        });
      }
      if (you.alive && !you.inVent) {
        if (view.sabotage) {
          nearby.panelId = PANELS.find((p) => p.kind === view.sabotage!.kind && d(p.x, p.y) <= USE_RANGE)?.id;
        }
        nearby.button = d(EMERGENCY_BUTTON.x, EMERGENCY_BUTTON.y) <= USE_RANGE;
        const snap = live.snap;
        if (snap) {
          let bodyBest = REPORT_RANGE;
          for (const [id, bx, by] of snap.bodies) {
            if (d(bx, by) <= bodyBest) {
              bodyBest = d(bx, by);
              nearby.bodyId = id;
            }
          }
          if (you.role === 'impostor') {
            let killBest: number = KILL_RANGES[view.settings.killDistance];
            for (const [id, px, py, ghost] of snap.players) {
              if (ghost) continue;
              if (view.players.find((p) => p.id === id)?.role === 'impostor') continue;
              if (d(px, py) <= killBest) {
                killBest = d(px, py);
                nearby.killTarget = id;
              }
            }
          }
        }
        if (you.role === 'impostor') nearby.ventId = VENTS.find((v) => d(v.x, v.y) <= USE_RANGE)?.id;
      }
    }
    const key = JSON.stringify(nearby);
    if (key !== this.nearbyKey) {
      this.nearbyKey = key;
      setState({ nearby });
    }
  }
}

/** Posição interpolada no instante `t` (relógio do servidor); fica na última conhecida se `t` passar dela. */
function sampleAt(samples: Sample[], t: number): { x: number; y: number } | undefined {
  if (samples.length === 0) return undefined;
  const first = samples[0]!;
  if (t <= first.t) return first;
  for (let i = 1; i < samples.length; i++) {
    const b = samples[i]!;
    if (t <= b.t) {
      const a = samples[i - 1]!;
      const k = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1;
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
  }
  return samples[samples.length - 1];
}

export function createGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#05070d',
    scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
    scene: [GameScene],
    banner: false,
    input: { keyboard: { capture: [] } },
  });
}

export { WORLD };
