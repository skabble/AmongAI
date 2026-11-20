import {
  CHAT_MAX,
  COLORS,
  CRITICAL_MS,
  DEFAULT_SETTINGS,
  DOOR_COOLDOWN_MS,
  DOOR_LOCK_MS,
  DOORS,
  EMERGENCY_BUTTON,
  KILL_RANGES,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PANEL_HOLD_MS,
  PANELS,
  REPORT_RANGE,
  RESULT_MS,
  SABOTAGE_COOLDOWN_MS,
  SPEED,
  STATIONS,
  TASKS,
  TICK_RATE,
  USE_RANGE,
  VENTS,
  assignRoles,
  checkWin,
  clampSettings,
  isLang,
  WORLD,
  canStand,
  canTravel,
  lineOfSight,
  moveGhost,
  moveWithCollision,
  shuffle,
  spawnPoint,
  tallyDecision,
  tallyVotes,
  taskDef,
  visionRadius,
  type DecisionView,
  type EventCode,
  type Lang,
  type MeetingStage,
  type PublicPlayer,
  type Rng,
  type RoundView,
  type Role,
  type SabotageKind,
  type Settings,
  type Snap,
  type View,
  type WinReason,
} from '@desalinhados/shared';
import { GOAL_COUNT, THEME_CONTENT, type QuestionItem } from '@desalinhados/shared/content';

export type Send = (playerId: string, type: string, payload: unknown) => void;

interface Task {
  id: string;
  defId: string;
  step: number;
  done: boolean;
}

interface Player {
  id: string;
  name: string;
  color: string;
  connected: boolean;
  left: boolean;
  x: number;
  y: number;
  dx: number;
  dy: number;
  alive: boolean;
  role: Role;
  tasks: Task[];
  killReadyAt: number;
  emergencyLeft: number;
  inVent?: string;
  lang: Lang;
  /** Opções que este jogador da Equipa já viu excluídas pelas evidências nesta ronda. */
  hints: number[];
  /** Incrementado sempre que o servidor impõe a posição (ver Snap.w). */
  warp: number;
  /** O cliente envia a posição (`move`) em vez da direção (`input`). */
  clientMoves: boolean;
  /** Distância que o cliente ainda pode percorrer (balde que enche com o tempo). */
  moveBudget: number;
  moveAt: number;
}

interface Body {
  id: string;
  x: number;
  y: number;
}

interface Meeting {
  stage: MeetingStage;
  endsAt: number;
  reason: 'body' | 'emergency';
  callerId: string;
  victimId?: string;
  participants: string[];
  /** jogador -> opção escolhida na decisão do laboratório. */
  picks: Record<string, number>;
  /** Preenchida quando a fase de decisão fecha. */
  decision?: DecisionView;
  /** A decisão atingiu o limite de decisões desalinhadas: o jogo acaba no fim do resultado. */
  decisionLoss?: boolean;
  votes: Record<string, string>;
  ejectedId?: string | null;
  ejectedWasImpostor?: boolean;
  impostorsLeft?: number;
}

interface Sabotage {
  kind: Exclude<SabotageKind, 'doors'>;
  endsAt?: number;
  /** painel -> instante até ao qual está ativo */
  panels: Map<string, number>;
}

export interface GameOptions {
  minPlayers?: number;
  rng?: Rng;
}

const DT = 1 / TICK_RATE;
/** Folga na velocidade aceite e máximo acumulado no balde (em segundos de movimento), para absorver atrasos da rede. */
const MOVE_SLACK = 1.25;
const MOVE_BURST_S = 1;
/** Multiplicadores do tempo até à próxima eliminação, conforme a decisão do laboratório. */
export const GOOD_DECISION_KILL_FACTOR = 1.5;
export const BAD_DECISION_KILL_FACTOR = 0.5;
const CRITICAL: ReadonlySet<string> = new Set(['guardrails', 'cooling']);

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

export class Game {
  phase: View['phase'] = 'lobby';
  hostId = '';
  settings: Settings = { ...DEFAULT_SETTINGS };
  readonly players = new Map<string, Player>();
  readonly minPlayers: number;

  private readonly rng: Rng;
  private bodies: Body[] = [];
  private knownDead = new Set<string>();
  private meeting?: Meeting;
  private sabotage: Sabotage | null = null;
  private sabotageReadyAt = 0;
  private emergencyReadyAt = 0;
  private lockedUntil = new Map<string, number>();
  private doorReadyAt = new Map<string, number>();
  /** Pergunta da ronda e opções que os Desalinhados querem que o laboratório escolha. */
  private round: { item: QuestionItem; goal: number[] } | null = null;
  private usedItems = new Set<QuestionItem>();
  /** consola -> opção que a evidência revela (uma das que os Desalinhados querem); no máximo uma por ronda */
  private evidence = new Map<string, number>();
  private badDecisions = 0;
  /** Progresso mostrado quando a barra só atualiza nas reuniões. */
  private shownProgress = 0;
  private winner?: Role;
  private winReason?: WinReason;
  private dirty = true;

  constructor(
    readonly code: string,
    private readonly send: Send,
    options: GameOptions = {},
  ) {
    this.minPlayers = options.minPlayers ?? MIN_PLAYERS;
    this.rng = options.rng ?? Math.random;
  }

  // ---------------------------------------------------------------- jogadores

  /** Devolve uma mensagem de erro, ou null se o jogador entrou. */
  addPlayer(id: string, rawName: unknown, rawLang?: unknown): string | null {
    if (this.phase !== 'lobby') return 'started';
    if (this.players.size >= MAX_PLAYERS) return 'full';
    let name = typeof rawName === 'string' ? rawName.trim().slice(0, 16) : '';
    if (!name) name = 'Jogador';
    const taken = new Set([...this.players.values()].map((p) => p.name));
    let unique = name;
    for (let i = 2; taken.has(unique); i++) unique = `${name} ${i}`;
    const usedColors = new Set([...this.players.values()].map((p) => p.color));
    const color = COLORS.find((c) => !usedColors.has(c)) ?? COLORS[0];
    this.players.set(id, {
      id,
      name: unique,
      color,
      connected: true,
      left: false,
      x: EMERGENCY_BUTTON.x,
      y: EMERGENCY_BUTTON.y,
      dx: 0,
      dy: 0,
      alive: true,
      role: 'crew',
      tasks: [],
      killReadyAt: 0,
      emergencyLeft: 0,
      lang: isLang(rawLang) ? rawLang : 'pt',
      hints: [],
      warp: 0,
      clientMoves: false,
      moveBudget: 0,
      moveAt: 0,
    });
    if (!this.hostId) this.hostId = id;
    this.dirty = true;
    return null;
  }

  removePlayer(id: string, now: number): void {
    const p = this.players.get(id);
    if (!p) return;
    if (this.phase === 'lobby') {
      this.players.delete(id);
    } else {
      p.left = true;
      p.connected = false;
      p.dx = p.dy = 0;
      if (p.alive) {
        p.alive = false;
        this.knownDead.add(id);
      }
      if (this.phase === 'playing') this.evaluateWin();
      else if (this.phase === 'meeting') this.maybeFinishVoting(now);
    }
    this.migrateHost();
    this.dirty = true;
  }

  setConnected(id: string, connected: boolean): void {
    const p = this.players.get(id);
    if (!p || p.left) return;
    p.connected = connected;
    if (!connected) p.dx = p.dy = 0;
    this.migrateHost();
    this.dirty = true;
  }

  private migrateHost(): void {
    const host = this.players.get(this.hostId);
    if (host && host.connected && !host.left) return;
    const next = [...this.players.values()].find((p) => p.connected && !p.left);
    if (next) this.hostId = next.id;
  }

  private active(): Player[] {
    return [...this.players.values()].filter((p) => !p.left);
  }

  private alive(): Player[] {
    return this.active().filter((p) => p.alive);
  }

  // ---------------------------------------------------------------- mensagens

  handle(id: string, type: string, raw: unknown, now: number): void {
    const p = this.players.get(id);
    if (!p || p.left) return;
    const msg = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    switch (type) {
      case 'input':
        return this.onInput(p, msg);
      case 'move':
        return this.onMove(p, msg, now);
      case 'color':
        return this.onColor(p, msg);
      case 'lang':
        if (isLang(msg.lang) && msg.lang !== p.lang) {
          p.lang = msg.lang;
          this.dirty = true;
        }
        return;
      case 'settings':
        if (id === this.hostId && this.phase === 'lobby') {
          this.settings = clampSettings(this.settings, msg);
          this.dirty = true;
        }
        return;
      case 'start':
        if (id === this.hostId) this.start(now, p);
        return;
      case 'kill':
        return this.onKill(p, msg, now);
      case 'report':
        return this.onReport(p, msg);
      case 'emergency':
        return this.onEmergency(p, now);
      case 'taskStep':
        return this.onTaskStep(p, msg);
      case 'evidence':
        return this.onEvidence(p, msg);
      case 'sabotage':
        return this.onSabotage(p, msg, now);
      case 'fix':
        return this.onFix(p, msg, now);
      case 'vent':
        return this.onVent(p, msg);
      case 'decide':
        return this.onDecide(p, msg);
      case 'vote':
        return this.onVote(p, msg, now);
      case 'openVoting':
        if (id === this.hostId) this.openVoting(now);
        return;
      case 'chat':
        return this.onChat(p, msg);
      case 'playAgain':
        if (id === this.hostId && this.phase === 'ended') this.resetToLobby();
        return;
      case 'toLobby':
        if (id === this.hostId && this.phase !== 'lobby') this.resetToLobby();
        return;
    }
  }

  private error(p: Player, code: EventCode, params?: Record<string, number>): void {
    this.send(p.id, 'event', { type: 'error', code, params });
  }

  private onInput(p: Player, msg: Record<string, unknown>): void {
    let dx = typeof msg.dx === 'number' && Number.isFinite(msg.dx) ? msg.dx : 0;
    let dy = typeof msg.dy === 'number' && Number.isFinite(msg.dy) ? msg.dy : 0;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    p.dx = dx;
    p.dy = dy;
  }

  /**
   * O cliente move-se localmente e envia a posição; o servidor aceita-a se a velocidade e as colisões
   * baterem certo. Assim não há "puxões" para trás por causa da latência. Se recusar, teletransporta
   * o jogador para a última posição válida.
   */
  private onMove(p: Player, msg: Record<string, unknown>, now: number): void {
    if (this.phase !== 'playing' || p.inVent) return;
    const x = msg.x;
    const y = msg.y;
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return;
    // Posição calculada antes do último teletransporte: já não vale.
    if (msg.w !== p.warp) return;
    p.clientMoves = true;
    p.dx = p.dy = 0;

    const speed = SPEED * this.settings.playerSpeed;
    const cap = speed * MOVE_BURST_S;
    p.moveBudget = Math.min(cap, p.moveBudget + ((now - p.moveAt) / 1000) * speed * MOVE_SLACK);
    p.moveAt = now;

    const d = dist(p.x, p.y, x, y);
    const locked = new Set(this.lockedUntil.keys());
    const ok =
      d <= p.moveBudget + 1 &&
      (!p.alive
        ? x >= 0 && y >= 0 && x <= WORLD.w && y <= WORLD.h
        : // Se a posição atual já é inválida (porta trancou em cima do jogador), deixa sair.
          !canStand(p.x, p.y, locked) || canTravel(p.x, p.y, x, y, locked));
    if (!ok) {
      this.teleport(p, p.x, p.y);
      return;
    }
    p.moveBudget = Math.max(0, p.moveBudget - d);
    p.x = x;
    p.y = y;
  }

  /** Impõe uma posição ao jogador; o cliente deixa de usar a que tinha previsto. */
  private teleport(p: Player, x: number, y: number): void {
    p.x = x;
    p.y = y;
    p.dx = p.dy = 0;
    p.warp++;
  }

  private onColor(p: Player, msg: Record<string, unknown>): void {
    if (this.phase !== 'lobby') return;
    const color = msg.color;
    if (typeof color !== 'string' || !(COLORS as readonly string[]).includes(color)) return;
    if (this.active().some((o) => o.id !== p.id && o.color === color)) return;
    p.color = color;
    this.dirty = true;
  }

  // ---------------------------------------------------------------- início

  private start(now: number, host: Player): void {
    if (this.phase !== 'lobby') return;
    const players = this.active().filter((p) => p.connected);
    if (players.length < this.minPlayers) {
      return this.error(host, 'minPlayers', { n: this.minPlayers });
    }
    // Quem estava desligado no lobby fica de fora.
    for (const p of [...this.players.values()]) if (!p.connected) this.players.delete(p.id);

    const s = this.settings;
    const roles = assignRoles(
      players.map((p) => p.id),
      s.impostors,
      this.rng,
    );
    const pick = (kind: 'common' | 'short' | 'long', count: number) =>
      shuffle(
        TASKS.filter((t) => t.kind === kind),
        this.rng,
      ).slice(0, count);
    const common = pick('common', s.commonTasks);

    players.forEach((p, i) => {
      const spawn = spawnPoint(i, players.length);
      p.role = roles.get(p.id) ?? 'crew';
      p.alive = true;
      this.teleport(p, spawn.x, spawn.y);
      p.inVent = undefined;
      p.killReadyAt = now + 10_000;
      p.emergencyLeft = s.emergencyMeetings;
      // Os Desalinhados recebem uma lista igual à dos outros, só para fingir.
      p.tasks = [...common, ...pick('long', s.longTasks), ...pick('short', s.shortTasks)].map((def) => ({
        id: `${p.id}:${def.id}`,
        defId: def.id,
        step: 0,
        done: false,
      }));
    });

    this.phase = 'playing';
    this.bodies = [];
    this.knownDead = new Set();
    this.meeting = undefined;
    this.sabotage = null;
    this.sabotageReadyAt = now + 15_000;
    this.emergencyReadyAt = now + s.emergencyCooldown * 1000;
    this.lockedUntil.clear();
    this.doorReadyAt.clear();
    this.shownProgress = 0;
    this.winner = undefined;
    this.winReason = undefined;
    this.usedItems.clear();
    this.badDecisions = 0;
    this.nextRound();
    this.dirty = true;
  }

  private resetToLobby(): void {
    for (const p of [...this.players.values()]) {
      if (p.left) this.players.delete(p.id);
      else {
        p.alive = true;
        p.role = 'crew';
        p.tasks = [];
        p.inVent = undefined;
        p.hints = [];
        p.dx = p.dy = 0;
      }
    }
    this.phase = 'lobby';
    this.bodies = [];
    this.knownDead = new Set();
    this.meeting = undefined;
    this.sabotage = null;
    this.round = null;
    this.evidence.clear();
    this.lockedUntil.clear();
    this.winner = undefined;
    this.winReason = undefined;
    this.dirty = true;
  }

  // ---------------------------------------------------------------- tema

  /**
   * Sorteia o dilema da ronda (sem repetir até esgotar o tema) e o objetivo dos Desalinhados:
   * 2 das 4 opções, ao acaso.
   * Esconde uma evidência numa consola onde a Equipa tem tarefas por fazer: diz uma das opções que os
   * Desalinhados querem.
   * Quem conclui um passo de tarefa nessa consola encontra a pista (só ele a vê).
   */
  private nextRound(): void {
    for (const p of this.players.values()) p.hints = [];
    this.evidence.clear();
    const items = THEME_CONTENT[this.settings.theme]?.items;
    if (!items || items.length === 0) {
      this.round = null;
      return;
    }
    if (this.usedItems.size >= items.length) this.usedItems.clear();
    const pool = items.filter((item) => !this.usedItems.has(item));
    const item = pool[Math.floor(this.rng() * pool.length)];
    if (!item) {
      this.round = null;
      return;
    }
    this.usedItems.add(item);
    const all = item.pt.options.map((_, i) => i);
    const goal: number[] = [];
    while (goal.length < GOAL_COUNT && all.length > 0) goal.push(all.splice(Math.floor(this.rng() * all.length), 1)[0]!);
    goal.sort((a, b) => a - b);
    this.round = { item, goal };

    // Uma evidência por ronda, com uma opção do objetivo dos Desalinhados.
    const stations = this.pendingTaskStations();
    const station = stations[Math.floor(this.rng() * stations.length)];
    if (station) this.evidence.set(station, goal[Math.floor(this.rng() * goal.length)]!);
  }

  /** Consolas onde algum jogador vivo da Equipa ainda tem um passo de tarefa por fazer. */
  private pendingTaskStations(): string[] {
    const stations = new Set<string>();
    for (const p of this.alive()) {
      if (p.role !== 'crew') continue;
      for (const task of p.tasks) {
        if (task.done) continue;
        for (const step of taskDef(task.defId)?.steps.slice(task.step) ?? []) stations.add(step.stationId);
      }
    }
    return [...stations].sort();
  }

  /** Um jogador vivo da Equipa concluiu um passo nesta consola: se lá houver uma evidência, fica com a pista. */
  private findEvidence(p: Player, stationId: string): void {
    const hint = this.evidence.get(stationId);
    if (!p.alive || hint === undefined || !this.round || p.hints.includes(hint)) return;
    p.hints.push(hint);
    const option = `${String.fromCharCode(65 + hint)} · ${this.round.item[p.lang].options[hint]}`;
    this.send(p.id, 'event', {
      type: 'info',
      code: 'clueGoal',
      params: { option },
    });
  }

  private roundFor(p: Player, inGame: boolean): RoundView | null {
    if (!inGame || !this.round) return null;
    const { item, goal } = this.round;
    const text = item[p.lang];
    return {
      question: text.question,
      options: text.options,
      goal: p.role === 'impostor' ? goal : undefined,
      hints: p.role === 'crew' ? [...p.hints].sort((a, b) => a - b) : [],
    };
  }

  /** Um Desalinhado vivo destrói a evidência escondida numa consola: deixa de poder ser encontrada. */
  private onEvidence(p: Player, msg: Record<string, unknown>): void {
    if (this.phase !== 'playing' || p.role !== 'impostor' || p.inVent || !p.alive) return;
    const station = STATIONS.find((s) => s.id === msg.stationId);
    if (!station || !this.evidence.has(station.id) || dist(p.x, p.y, station.x, station.y) > USE_RANGE) return;
    this.evidence.delete(station.id);
    this.dirty = true;
  }

  // ---------------------------------------------------------------- ações em jogo

  private onKill(p: Player, msg: Record<string, unknown>, now: number): void {
    if (this.phase !== 'playing' || !p.alive || p.role !== 'impostor' || p.inVent) return;
    if (now < p.killReadyAt) return;
    const target = typeof msg.target === 'string' ? this.players.get(msg.target) : undefined;
    if (!target || target.left || !target.alive || target.role === 'impostor') return;
    if (dist(p.x, p.y, target.x, target.y) > KILL_RANGES[this.settings.killDistance]) return;
    target.alive = false;
    target.dx = target.dy = 0;
    this.bodies.push({ id: target.id, x: target.x, y: target.y });
    this.teleport(p, target.x, target.y);
    p.killReadyAt = now + this.settings.killCooldown * 1000;
    this.send(target.id, 'event', { type: 'killed', code: 'killed' });
    this.dirty = true;
    this.evaluateWin();
  }

  private onReport(p: Player, msg: Record<string, unknown>): void {
    if (this.phase !== 'playing' || !p.alive || p.inVent) return;
    const body = this.bodies.find((b) => b.id === msg.body);
    if (!body || dist(p.x, p.y, body.x, body.y) > REPORT_RANGE) return;
    this.startMeeting('body', p.id, body.id);
  }

  private onEmergency(p: Player, now: number): void {
    if (this.phase !== 'playing' || !p.alive || p.inVent) return;
    if (dist(p.x, p.y, EMERGENCY_BUTTON.x, EMERGENCY_BUTTON.y) > USE_RANGE) return;
    if (p.emergencyLeft <= 0) return this.error(p, 'noMeetings');
    if (now < this.emergencyReadyAt) return this.error(p, 'buttonCooldown');
    if (this.sabotage && CRITICAL.has(this.sabotage.kind)) {
      return this.error(p, 'critical');
    }
    p.emergencyLeft--;
    this.startMeeting('emergency', p.id);
  }

  private onVent(p: Player, msg: Record<string, unknown>): void {
    if (this.phase !== 'playing' || !p.alive || p.role !== 'impostor') return;
    const place = (ventId: string) => {
      const vent = VENTS.find((v) => v.id === ventId)!;
      p.inVent = vent.id;
      this.teleport(p, vent.x, vent.y);
    };
    if (msg.action === 'enter' && !p.inVent) {
      const vent = VENTS.find((v) => dist(p.x, p.y, v.x, v.y) <= USE_RANGE);
      if (vent) place(vent.id);
    } else if (msg.action === 'move' && p.inVent) {
      const from = VENTS.find((v) => v.id === p.inVent);
      if (typeof msg.to === 'string' && from?.links.includes(msg.to)) place(msg.to);
    } else if (msg.action === 'exit' && p.inVent) {
      p.inVent = undefined;
    } else return;
    this.dirty = true;
  }

  // ---------------------------------------------------------------- tarefas

  private tasksHidden(p: Player): boolean {
    return this.sabotage?.kind === 'injection' && p.role === 'crew';
  }

  private onTaskStep(p: Player, msg: Record<string, unknown>): void {
    // Os Desalinhados não fazem tarefas; os fantasmas da Equipa continuam a fazê-las.
    if (this.phase !== 'playing' || p.role !== 'crew') return;
    if (this.tasksHidden(p)) return this.error(p, 'tasksHidden');
    const task = p.tasks.find((t) => t.id === msg.taskId && !t.done);
    const step = task && taskDef(task.defId)?.steps[task.step];
    const station = step && STATIONS.find((s) => s.id === step.stationId);
    if (!task || !station || dist(p.x, p.y, station.x, station.y) > USE_RANGE) return;
    task.step++;
    if (task.step >= taskDef(task.defId)!.steps.length) task.done = true;
    this.findEvidence(p, station.id);
    this.dirty = true;
    if (task.done) this.evaluateWin();
  }

  private taskCounts(): { done: number; total: number } {
    let done = 0;
    let total = 0;
    for (const p of this.active()) {
      if (p.role !== 'crew') continue;
      total += p.tasks.length;
      done += p.tasks.filter((t) => t.done).length;
    }
    return { done, total };
  }

  private progress(): number {
    const { done, total } = this.taskCounts();
    return total > 0 ? done / total : 0;
  }

  // ---------------------------------------------------------------- sabotagens

  private onSabotage(p: Player, msg: Record<string, unknown>, now: number): void {
    // Como no género, os Desalinhados eliminados continuam a poder sabotar.
    if (this.phase !== 'playing' || p.role !== 'impostor') return;
    const kind = msg.kind;
    if (kind === 'doors') {
      const roomId = msg.roomId;
      if (typeof roomId !== 'string' || !DOORS.some((d) => d.roomId === roomId)) return;
      if (now < (this.doorReadyAt.get(roomId) ?? 0)) return;
      this.lockedUntil.set(roomId, now + DOOR_LOCK_MS);
      this.doorReadyAt.set(roomId, now + DOOR_COOLDOWN_MS);
      this.dirty = true;
      return;
    }
    if (kind !== 'injection' && kind !== 'blackout' && kind !== 'guardrails' && kind !== 'cooling') return;
    if (this.sabotage || now < this.sabotageReadyAt) return;
    this.sabotage = {
      kind,
      endsAt: CRITICAL.has(kind) ? now + CRITICAL_MS : undefined,
      panels: new Map(),
    };
    this.dirty = true;
  }

  private onFix(p: Player, msg: Record<string, unknown>, now: number): void {
    if (this.phase !== 'playing' || !p.alive || p.inVent || !this.sabotage) return;
    const panel = PANELS.find((x) => x.id === msg.panelId);
    if (!panel || panel.kind !== this.sabotage.kind) return;
    if (dist(p.x, p.y, panel.x, panel.y) > USE_RANGE) return;
    // Guardrails: os dois painéis têm de estar premidos ao mesmo tempo.
    // Arrefecimento: cada painel fica resolvido depois de introduzido o código.
    const until = panel.kind === 'guardrails' ? now + PANEL_HOLD_MS : Number.POSITIVE_INFINITY;
    this.sabotage.panels.set(panel.id, until);
    const needed = PANELS.filter((x) => x.kind === panel.kind);
    if (needed.every((x) => (this.sabotage!.panels.get(x.id) ?? 0) > now)) {
      this.sabotage = null;
      this.sabotageReadyAt = now + SABOTAGE_COOLDOWN_MS;
    }
    this.dirty = true;
  }

  // ---------------------------------------------------------------- reuniões

  private startMeeting(reason: Meeting['reason'], callerId: string, victimId?: string): void {
    for (const p of this.active()) {
      if (!p.alive) this.knownDead.add(p.id);
      p.dx = p.dy = 0;
      p.inVent = undefined;
    }
    this.bodies = [];
    this.sabotage = null;
    this.lockedUntil.clear();
    this.shownProgress = this.progress();

    const alive = this.alive();
    alive.forEach((p, i) => {
      const spawn = spawnPoint(i, alive.length);
      this.teleport(p, spawn.x, spawn.y);
    });

    // Fala primeiro quem convocou a reunião; os restantes vivos falam por ordem sorteada.
    const others = shuffle(
      alive.filter((p) => p.id !== callerId),
      this.rng,
    ).map((p) => p.id);
    this.meeting = {
      stage: 'speaking',
      endsAt: 0,
      reason,
      callerId,
      victimId,
      participants: alive.some((p) => p.id === callerId) ? [callerId, ...others] : others,
      picks: {},
      votes: {},
    };
    this.phase = 'meeting';
    this.dirty = true;
  }

  /** O anfitrião termina a discussão: fecha as escolhas e abre a votação. */
  private openVoting(now: number): void {
    const m = this.meeting;
    if (this.phase !== 'meeting' || !m || m.stage !== 'speaking') return;
    this.advanceMeeting(now);
  }

  private advanceMeeting(now: number): void {
    const m = this.meeting;
    if (!m) return;
    if (m.stage === 'speaking') {
      // Fim da discussão: conta-se a decisão do laboratório e passa-se à votação de expulsão.
      this.closeDecision(m);
      if (m.decisionLoss) {
        // Limite de decisões desalinhadas atingido: não há expulsão, mostra-se o resultado e o jogo acaba.
        m.stage = 'result';
        m.endsAt = now + RESULT_MS;
      } else {
        m.stage = 'voting';
        m.endsAt = now + this.settings.votingSec * 1000;
      }
    } else if (m.stage === 'voting') {
      const result = tallyVotes(
        m.votes,
        this.alive().map((p) => p.id),
      );
      m.ejectedId = result.ejected;
      if (result.ejected) {
        const ejected = this.players.get(result.ejected)!;
        ejected.alive = false;
        this.knownDead.add(ejected.id);
        if (this.settings.confirmEjects) m.ejectedWasImpostor = ejected.role === 'impostor';
      }
      if (this.settings.confirmEjects) {
        m.impostorsLeft = this.alive().filter((p) => p.role === 'impostor').length;
      }
      m.stage = 'result';
      m.endsAt = now + RESULT_MS;
    } else {
      this.endMeeting(now);
    }
    this.dirty = true;
  }

  /** Conta a decisão do laboratório (só escolhas de vivos) e atualiza o contador de decisões desalinhadas. */
  private closeDecision(m: Meeting): void {
    if (!this.round) return;
    const alive = new Set(this.alive().map((p) => p.id));
    const picks = Object.fromEntries(Object.entries(m.picks).filter(([id]) => alive.has(id)));
    const chosen = tallyDecision(picks, this.round.item.pt.options.length);
    const goal = this.round.goal;
    m.picks = picks;
    m.decision = { chosen, goal };
    if (chosen !== null && goal.includes(chosen)) {
      this.badDecisions++;
      const limit = this.settings.badDecisions;
      if (limit > 0 && this.badDecisions >= limit) m.decisionLoss = true;
    }
  }

  /** Um jogador vivo escolhe a opção que defende; pode mudar até o anfitrião abrir a votação. */
  private onDecide(p: Player, msg: Record<string, unknown>): void {
    const m = this.meeting;
    if (this.phase !== 'meeting' || !m || m.stage !== 'speaking' || !p.alive || !this.round) return;
    const option = msg.option;
    if (typeof option !== 'number' || !Number.isInteger(option)) return;
    if (option < 0 || option >= this.round.item.pt.options.length) return;
    m.picks[p.id] = option;
    this.dirty = true;
  }

  private onVote(p: Player, msg: Record<string, unknown>, now: number): void {
    const m = this.meeting;
    if (this.phase !== 'meeting' || !m || m.stage !== 'voting' || !p.alive) return;
    if (m.votes[p.id] !== undefined) return;
    const target = msg.target;
    if (typeof target !== 'string') return;
    if (target !== 'skip') {
      const t = this.players.get(target);
      if (!t || t.left || !t.alive) return;
    }
    m.votes[p.id] = target;
    this.dirty = true;
    this.maybeFinishVoting(now);
  }

  /** Fecha a votação mais cedo quando todos os vivos ligados já votaram. */
  private maybeFinishVoting(now: number): void {
    const m = this.meeting;
    if (!m || m.stage !== 'voting') return;
    const voters = this.alive().filter((p) => p.connected);
    if (voters.every((p) => m.votes[p.id] !== undefined)) this.advanceMeeting(now);
  }

  private onChat(p: Player, msg: Record<string, unknown>): void {
    if (this.phase !== 'meeting') return;
    const text = typeof msg.text === 'string' ? msg.text.replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX) : '';
    if (!text) return;
    // As mensagens dos fantasmas só chegam a outros fantasmas.
    for (const o of this.active()) {
      if (!o.connected || (!p.alive && o.alive)) continue;
      this.send(o.id, 'chat', { from: p.id, text, ghost: !p.alive });
    }
  }

  private endMeeting(now: number): void {
    const m = this.meeting;
    if (m?.decisionLoss) {
      this.end('impostor', 'decisions');
      return;
    }
    this.meeting = undefined;
    this.phase = 'playing';
    this.sabotageReadyAt = now + 15_000;
    this.emergencyReadyAt = now + this.settings.emergencyCooldown * 1000;
    // A decisão do laboratório pesa no tempo até à próxima eliminação.
    const d = m?.decision;
    const factor =
      !d || d.chosen === null ? 1 : d.goal.includes(d.chosen) ? BAD_DECISION_KILL_FACTOR : GOOD_DECISION_KILL_FACTOR;
    for (const p of this.active()) {
      if (p.role === 'impostor') p.killReadyAt = now + this.settings.killCooldown * 1000 * factor;
    }
    this.nextRound();
    this.dirty = true;
    this.evaluateWin();
  }

  // ---------------------------------------------------------------- vitória

  private evaluateWin(): void {
    if (this.phase !== 'playing') return;
    const alive = this.alive();
    const { done, total } = this.taskCounts();
    const result = checkWin({
      crewAlive: alive.filter((p) => p.role === 'crew').length,
      impostorsAlive: alive.filter((p) => p.role === 'impostor').length,
      tasksDone: done,
      tasksTotal: total,
    });
    if (result) this.end(result.winner, result.reason);
  }

  private end(winner: Role, reason: WinReason): void {
    this.phase = 'ended';
    this.winner = winner;
    this.winReason = reason;
    this.meeting = undefined;
    this.sabotage = null;
    this.round = null;
    this.evidence.clear();
    this.lockedUntil.clear();
    this.bodies = [];
    for (const p of this.players.values()) p.dx = p.dy = 0;
    this.dirty = true;
  }

  // ---------------------------------------------------------------- ciclo

  tick(now: number): void {
    if (this.phase === 'playing') {
      this.tickPlaying(now);
    } else if (this.phase === 'meeting' && this.meeting && this.meeting.stage !== 'speaking' && now >= this.meeting.endsAt) {
      this.advanceMeeting(now);
    }
    if (this.dirty) {
      this.dirty = false;
      for (const p of this.active()) if (p.connected) this.send(p.id, 'view', this.viewFor(p, now));
    }
  }

  private tickPlaying(now: number): void {
    for (const [roomId, until] of this.lockedUntil) {
      if (now >= until) {
        this.lockedUntil.delete(roomId);
        this.dirty = true;
      }
    }
    if (this.sabotage) {
      for (const [panelId, until] of this.sabotage.panels) {
        if (now >= until) {
          this.sabotage.panels.delete(panelId);
          this.dirty = true;
        }
      }
      if (this.sabotage.endsAt !== undefined && now >= this.sabotage.endsAt) {
        this.end('impostor', 'sabotage');
        return;
      }
    }

    const locked = new Set(this.lockedUntil.keys());
    const step = SPEED * this.settings.playerSpeed * DT;
    const players = this.active();
    for (const p of players) {
      if ((p.dx === 0 && p.dy === 0) || p.inVent || p.clientMoves) continue;
      const next = p.alive
        ? moveWithCollision(p.x, p.y, p.dx * step, p.dy * step, locked)
        : moveGhost(p.x, p.y, p.dx * step, p.dy * step);
      p.x = next.x;
      p.y = next.y;
    }
    for (const p of players) if (p.connected) this.send(p.id, 'snap', this.snapFor(p, players, locked, now));
  }

  // ---------------------------------------------------------------- vistas

  private snapFor(viewer: Player, players: Player[], locked: Set<string>, now: number): Snap {
    const radius = visionRadius(this.settings, viewer.role === 'impostor', this.sabotage?.kind === 'blackout');
    const sees = (x: number, y: number) =>
      !viewer.alive ||
      (dist(viewer.x, viewer.y, x, y) <= radius && lineOfSight(viewer.x, viewer.y, x, y, locked));

    const snap: Snap = {
      t: now,
      x: Math.round(viewer.x),
      y: Math.round(viewer.y),
      w: viewer.warp,
      players: [],
      bodies: [],
    };
    for (const o of players) {
      if (o.id === viewer.id) continue;
      // Os vivos nunca veem fantasmas nem quem está dentro de uma conduta.
      if (viewer.alive && (!o.alive || o.inVent)) continue;
      if (!sees(o.x, o.y)) continue;
      snap.players.push([o.id, Math.round(o.x), Math.round(o.y), o.alive ? 0 : 1]);
    }
    for (const b of this.bodies) {
      if (sees(b.x, b.y)) snap.bodies.push([b.id, Math.round(b.x), Math.round(b.y)]);
    }
    return snap;
  }

  viewFor(viewer: Player, now: number): View {
    const ended = this.phase === 'ended';
    const players: PublicPlayer[] = this.active().map((p) => {
      const showRole = ended || (viewer.role === 'impostor' && p.role === 'impostor' && this.phase !== 'lobby');
      return {
        id: p.id,
        name: p.name,
        color: p.color,
        connected: p.connected,
        dead: this.knownDead.has(p.id) || (ended && !p.alive),
        role: showRole ? p.role : undefined,
      };
    });
    const inGame = this.phase !== 'lobby';
    const impostor = inGame && viewer.role === 'impostor';
    const m = this.meeting;
    const bar = this.settings.taskBar;
    const result = m?.stage === 'result';

    let ballots: Record<string, string[]> | undefined;
    if (m && (result || m.stage === 'voting')) {
      ballots = {};
      for (const [voter, target] of Object.entries(m.votes)) {
        (ballots[target] ??= []).push(this.settings.anonymousVotes ? '' : voter);
      }
    }

    return {
      code: this.code,
      phase: this.phase,
      hostId: this.hostId,
      serverNow: now,
      minPlayers: this.minPlayers,
      settings: this.settings,
      players,
      you: {
        id: viewer.id,
        role: inGame ? viewer.role : undefined,
        alive: viewer.alive,
        tasks: this.tasksHidden(viewer) ? [] : viewer.tasks.map((t) => ({ ...t })),
        killReadyAt: impostor ? viewer.killReadyAt : 0,
        emergencyLeft: viewer.emergencyLeft,
        sabotageReadyAt: impostor ? this.sabotageReadyAt : 0,
        doorReadyAt: impostor ? Object.fromEntries(this.doorReadyAt) : {},
        inVent: viewer.inVent,
      },
      round: this.roundFor(viewer, inGame),
      badDecisions: inGame && this.round ? { count: this.badDecisions, limit: this.settings.badDecisions } : null,
      taskProgress: bar === 'never' ? null : bar === 'meetings' ? this.shownProgress : this.progress(),
      emergencyReadyAt: this.emergencyReadyAt,
      sabotage: this.sabotage
        ? { kind: this.sabotage.kind, endsAt: this.sabotage.endsAt, activePanels: [...this.sabotage.panels.keys()] }
        : null,
      evidence: impostor ? [...this.evidence.keys()] : [],
      evidenceLeft: this.evidence.size,
      lockedRooms: [...this.lockedUntil.keys()],
      meeting: m
        ? {
            stage: m.stage,
            endsAt: m.endsAt,
            reason: m.reason,
            callerId: m.callerId,
            victimId: m.victimId,
            participants: m.participants,
            picks: m.picks,
            decision: m.decision,
            decisionLoss: m.decisionLoss,
            voted: Object.keys(m.votes),
            yourVote: m.votes[viewer.id],
            ballots,
            ejectedId: result ? m.ejectedId : undefined,
            ejectedWasImpostor: result ? m.ejectedWasImpostor : undefined,
            impostorsLeft: result ? m.impostorsLeft : undefined,
          }
        : undefined,
      winner: this.winner,
      winReason: this.winReason,
    };
  }
}
