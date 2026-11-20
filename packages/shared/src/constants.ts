export const TICK_RATE = 20;
export const MAX_PLAYERS = 15;
export const MIN_PLAYERS = 4;

export const SPEED = 230; // px por segundo, com velocidade 1x
export const PLAYER_RADIUS = 14;
export const USE_RANGE = 85;
export const REPORT_RANGE = 120;
export const VISION_BASE = 320; // raio de visão com multiplicador 1x
export const LIGHTS_FACTOR = 0.3;
export const KILL_RANGES = { short: 60, medium: 95, long: 135 } as const;

export const DOOR_LOCK_MS = 10_000;
export const DOOR_COOLDOWN_MS = 30_000;
export const SABOTAGE_COOLDOWN_MS = 30_000;
export const CRITICAL_MS = 45_000;
export const PANEL_HOLD_MS = 2_000;
export const RESULT_MS = 6_000;
export const CHAT_MAX = 200;

export const COLORS = [
  '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231',
  '#911eb4', '#42d4f4', '#f032e6', '#bfef45', '#fabed4',
  '#469990', '#dcbeff', '#9a6324', '#aaffc3', '#ffffff',
] as const;

export const LANGS = ['pt', 'en'] as const;
export type Lang = (typeof LANGS)[number];

export function isLang(value: unknown): value is Lang {
  return value === 'pt' || value === 'en';
}

/** Temas disponíveis. O conteúdo de cada um vive no servidor; os nomes estão nas traduções do cliente. */
export const THEMES = [
  { id: 'ia-sociedade', name: 'IA na sociedade' },
  { id: 'none', name: 'Sem tema (clássico)' },
] as const;

export type KillDistance = keyof typeof KILL_RANGES;
export type TaskBarMode = 'always' | 'meetings' | 'never';

export interface Settings {
  theme: string;
  /** Decisões desalinhadas que dão a vitória aos Desalinhados (0 = sem limite). */
  badDecisions: number;
  impostors: number;
  killCooldown: number; // segundos
  killDistance: KillDistance;
  playerSpeed: number; // multiplicador
  crewVision: number; // multiplicador
  impostorVision: number; // multiplicador
  emergencyMeetings: number;
  emergencyCooldown: number; // segundos
  votingSec: number;
  anonymousVotes: boolean;
  confirmEjects: boolean;
  commonTasks: number;
  longTasks: number;
  shortTasks: number;
  taskBar: TaskBarMode;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'ia-sociedade',
  badDecisions: 3,
  impostors: 1,
  killCooldown: 30,
  killDistance: 'medium',
  playerSpeed: 1,
  crewVision: 1,
  impostorVision: 1.5,
  emergencyMeetings: 1,
  emergencyCooldown: 15,
  votingSec: 120,
  anonymousVotes: false,
  confirmEjects: true,
  commonTasks: 1,
  longTasks: 1,
  shortTasks: 2,
  taskBar: 'always',
};

type NumericKey = {
  [K in keyof Settings]: Settings[K] extends number ? K : never;
}[keyof Settings];

/** [mínimo, máximo, passo] de cada definição numérica. */
export const SETTINGS_LIMITS: Record<NumericKey, [number, number, number]> = {
  impostors: [1, 3, 1],
  badDecisions: [0, 5, 1],
  killCooldown: [10, 60, 2.5],
  playerSpeed: [0.5, 3, 0.25],
  crewVision: [0.25, 5, 0.25],
  impostorVision: [0.25, 5, 0.25],
  emergencyMeetings: [0, 9, 1],
  emergencyCooldown: [0, 60, 5],
  votingSec: [15, 300, 15],
  commonTasks: [0, 2, 1],
  longTasks: [0, 3, 1],
  shortTasks: [0, 5, 1],
};

export function clampSettings(current: Settings, patch: unknown): Settings {
  const next = { ...current };
  if (!patch || typeof patch !== 'object') return next;
  const p = patch as Record<string, unknown>;
  for (const key of Object.keys(SETTINGS_LIMITS) as NumericKey[]) {
    const v = p[key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      const [min, max, step] = SETTINGS_LIMITS[key];
      next[key] = Math.max(min, Math.min(max, Math.round(v / step) * step));
    }
  }
  if (typeof p.anonymousVotes === 'boolean') next.anonymousVotes = p.anonymousVotes;
  if (typeof p.confirmEjects === 'boolean') next.confirmEjects = p.confirmEjects;
  if (p.killDistance === 'short' || p.killDistance === 'medium' || p.killDistance === 'long') {
    next.killDistance = p.killDistance;
  }
  if (p.taskBar === 'always' || p.taskBar === 'meetings' || p.taskBar === 'never') next.taskBar = p.taskBar;
  if (typeof p.theme === 'string' && THEMES.some((t) => t.id === p.theme)) next.theme = p.theme;
  return next;
}

export function visionRadius(settings: Settings, impostor: boolean, lightsOut: boolean): number {
  const base = VISION_BASE * (impostor ? settings.impostorVision : settings.crewVision);
  return Math.round(lightsOut && !impostor ? base * LIGHTS_FACTOR : base);
}
