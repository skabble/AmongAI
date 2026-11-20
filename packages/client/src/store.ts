import { Client, type Room } from '@colyseus/sdk';
import { useSyncExternalStore } from 'react';
import type { ChatMessage, ClientMessages, EventCode, GameEvent, Lang, MiniGame, Snap, View } from '@desalinhados/shared';

/** O que está ao alcance do jogador neste momento (calculado pela cena do jogo). */
export interface Nearby {
  taskId?: string;
  panelId?: string;
  /** Consola com uma evidência escondida (só para Desalinhados, que a podem destruir). */
  evidenceId?: string;
  button?: boolean;
  bodyId?: string;
  killTarget?: string;
  ventId?: string;
  /** Id da sala onde o jogador está, ou 'corridor'. */
  room?: string;
}

export interface Toast {
  id: number;
  code: EventCode;
  params?: GameEvent['params'];
  kind: GameEvent['type'];
}

/** Mini-jogo aberto: um passo de tarefa, uma reparação ou uma evidência. `title` é uma chave de tradução. */
export type ActiveGame =
  | { kind: 'task'; taskId: string; game: MiniGame; title: string }
  | { kind: 'fix'; panelId: string; game: MiniGame; title: string }
  | { kind: 'evidence'; stationId: string; game: MiniGame; title: string };

export interface State {
  screen: 'home' | 'connecting' | 'game';
  lang: Lang;
  /** Chave de tradução do último erro de ligação. */
  error?: string;
  view?: View;
  activeGame?: ActiveGame;
  chat: ChatMessage[];
  toasts: Toast[];
  nearby: Nearby;
  /** Relógio do servidor menos relógio local, em ms. */
  offset: number;
}

export const LANG_KEY = 'desalinhados:lang';

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'pt' || saved === 'en') return saved;
  } catch {
    // sem armazenamento: usa a língua do browser
  }
  return navigator.language?.toLowerCase().startsWith('en') ? 'en' : 'pt';
}

let state: State = { screen: 'home', lang: initialLang(), toasts: [], chat: [], nearby: {}, offset: 0 };
const listeners = new Set<() => void>();

export function getState(): State {
  return state;
}

export function setState(patch: Partial<State>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state));
}

/** Estado de alta frequência, fora do React. */
export const live: { snap: Snap | null; onSnap?: (snap: Snap) => void } = { snap: null };

export function serverNow(): number {
  return Date.now() + state.offset;
}

// ---------------------------------------------------------------- rede

const TOKEN_KEY = 'desalinhados:reconnect';
const endpoint = import.meta.env.DEV ? `http://${location.hostname}:2567` : location.origin;
const client = new Client(endpoint);
let room: Room | undefined;
let toastId = 0;

function toast(event: GameEvent): void {
  const id = ++toastId;
  setState({ toasts: [...state.toasts, { id, code: event.code, params: event.params, kind: event.type }] });
  setTimeout(() => setState({ toasts: state.toasts.filter((t) => t.id !== id) }), 5000);
}

function saveToken(value?: string): void {
  try {
    if (value) sessionStorage.setItem(TOKEN_KEY, value);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // armazenamento indisponível: fica sem reentrada automática
  }
}

function loadToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function attach(r: Room): void {
  room = r;
  saveToken(r.reconnectionToken);
  r.onMessage('view', (view: View) => {
    const previous = state.view;
    const patch: Partial<State> = { view, screen: 'game', offset: view.serverNow - Date.now() };
    if (view.phase !== 'playing') patch.activeGame = undefined;
    if (previous?.phase !== view.phase) {
      live.snap = null;
      if (view.phase === 'meeting') patch.chat = [];
    }
    setState(patch);
  });
  r.onMessage('snap', (snap: Snap) => {
    live.snap = snap;
    live.onSnap?.(snap);
  });
  r.onMessage('chat', (message: ChatMessage) => setState({ chat: [...state.chat, message].slice(-100) }));
  r.onMessage('event', (event: GameEvent) => toast(event));
  r.onReconnect(() => saveToken(r.reconnectionToken));
  r.onLeave(() => {
    if (room !== r) return;
    room = undefined;
    saveToken();
    live.snap = null;
    setState({ screen: 'home', view: undefined, activeGame: undefined, error: 'err.left' });
  });
}

/** Converte o erro de ligação numa chave de tradução. */
function messageOf(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  if (/started/.test(text)) return 'err.started';
  if (/not found|no rooms/i.test(text)) return 'err.notFound';
  if (/locked|full/i.test(text)) return 'err.full';
  return 'err.generic';
}

async function connect(join: () => Promise<Room>): Promise<void> {
  setState({ screen: 'connecting', error: undefined });
  try {
    attach(await join());
  } catch (err) {
    setState({ screen: 'home', error: messageOf(err) });
  }
}

export function createRoom(name: string): Promise<void> {
  return connect(() => client.create('game', { name, lang: state.lang }));
}

export function joinRoom(code: string, name: string): Promise<void> {
  return connect(() => client.joinById(code.trim().toUpperCase(), { name, lang: state.lang }));
}

/** Tenta voltar à sala depois de recarregar a página. */
export async function tryResume(): Promise<void> {
  const token = loadToken();
  if (!token) return;
  setState({ screen: 'connecting' });
  try {
    attach(await client.reconnect(token));
    // A língua pode ter mudado enquanto a página estava fechada.
    send('lang', { lang: state.lang });
  } catch {
    saveToken();
    setState({ screen: 'home' });
  }
}

export function send<K extends keyof ClientMessages>(type: K, message?: ClientMessages[K]): void {
  room?.send(type, message ?? {});
}

export function leaveRoom(): void {
  const r = room;
  room = undefined;
  saveToken();
  live.snap = null;
  setState({ screen: 'home', view: undefined, activeGame: undefined, error: undefined });
  void r?.leave(true);
}
