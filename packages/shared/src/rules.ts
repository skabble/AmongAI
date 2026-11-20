import type { Role, WinReason } from './protocol';

export type Rng = () => number;

export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Máximo de Impostores que mantém o jogo equilibrado para `playerCount` jogadores. */
export function maxImpostors(playerCount: number): number {
  if (playerCount >= 10) return 3;
  if (playerCount >= 7) return 2;
  return 1;
}

export function assignRoles(ids: readonly string[], impostors: number, rng: Rng = Math.random): Map<string, Role> {
  const count = Math.max(1, Math.min(impostors, maxImpostors(ids.length)));
  const chosen = new Set(shuffle(ids, rng).slice(0, count));
  return new Map(ids.map((id) => [id, chosen.has(id) ? 'impostor' : 'crew'] as const));
}

export interface VoteResult {
  ejected: string | null;
  tie: boolean;
  counts: Record<string, number>;
}

/**
 * `votes`: votante -> alvo ou 'skip'. Só contam votos de `eligible` em alvos de `eligible`.
 * Expulsa o mais votado apenas se tiver estritamente mais votos do que qualquer outra opção (incluindo saltar).
 */
export function tallyVotes(votes: Readonly<Record<string, string>>, eligible: readonly string[]): VoteResult {
  const valid = new Set(eligible);
  const counts: Record<string, number> = {};
  for (const [voter, target] of Object.entries(votes)) {
    if (!valid.has(voter)) continue;
    if (target !== 'skip' && !valid.has(target)) continue;
    counts[target] = (counts[target] ?? 0) + 1;
  }
  let best: string | null = null;
  let bestCount = 0;
  let tie = false;
  for (const [target, count] of Object.entries(counts)) {
    if (count > bestCount) {
      best = target;
      bestCount = count;
      tie = false;
    } else if (count === bestCount) {
      tie = true;
    }
  }
  if (tie || best === null || best === 'skip') return { ejected: null, tie, counts };
  return { ejected: best, tie: false, counts };
}

export interface WinInput {
  crewAlive: number;
  impostorsAlive: number;
  tasksDone: number;
  tasksTotal: number;
}

export function checkWin(s: WinInput): { winner: Role; reason: WinReason } | null {
  if (s.impostorsAlive === 0) return { winner: 'crew', reason: 'ejected' };
  if (s.impostorsAlive >= s.crewAlive) return { winner: 'impostor', reason: 'outnumbered' };
  if (s.tasksTotal > 0 && s.tasksDone >= s.tasksTotal) return { winner: 'crew', reason: 'tasks' };
  return null;
}

/**
 * Decisão do laboratório: `picks` é jogador -> índice da opção. Ganha a opção mais escolhida;
 * empate, nenhuma escolha ou índices fora de `0..optionCount-1` não contam (resultado `null`).
 */
export function tallyDecision(picks: Readonly<Record<string, number>>, optionCount: number): number | null {
  const counts = new Array<number>(optionCount).fill(0);
  for (const option of Object.values(picks)) {
    if (Number.isInteger(option) && option >= 0 && option < optionCount) counts[option]!++;
  }
  const best = Math.max(0, ...counts);
  if (best === 0) return null;
  const winners = counts.flatMap((n, i) => (n === best ? [i] : []));
  return winners.length === 1 ? winners[0]! : null;
}
