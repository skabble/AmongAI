import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ROOMS, SETTINGS_LIMITS, TASKS, THEMES, type EventCode, type SabotageKind } from '@desalinhados/shared';
import { en, pt } from './messages';

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

/** Chaves usadas literalmente no código do cliente: t('…'), t("…") e títulos de mini-jogo. */
function literalKeys(): string[] {
  const root = path.dirname(fileURLToPath(import.meta.url));
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.test.ts') && entry.name !== 'messages.ts') files.push(full);
    }
  };
  walk(root);
  const keys = new Set<string>();
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const m of source.matchAll(/\b(?:t|translate\(\w+,)\s*\(?\s*'([a-zA-Z]+\.[\w-]+)'/g)) keys.add(m[1]!);
    for (const m of source.matchAll(/'([a-z]+\.[a-zA-Z]+)'\s*[:)]/g)) if (m[1]!.split('.')[0]! in GROUPS) keys.add(m[1]!);
  }
  return [...keys];
}

const GROUPS: Record<string, true> = { hud: true, meet: true, role: true, act: true, end: true, mg: true, lobby: true, home: true };

describe('traduções', () => {
  it('português e inglês têm exatamente as mesmas chaves e os mesmos marcadores', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
    for (const key of Object.keys(pt)) expect(placeholders(en[key]!), key).toEqual(placeholders(pt[key]!));
    for (const [key, value] of Object.entries(en)) expect(value.trim(), key).not.toBe('');
  });

  it('cobrem todos os nomes vindos do jogo (salas, tarefas, sabotagens, temas, definições, avisos)', () => {
    const events: EventCode[] = ['killed', 'noMeetings', 'buttonCooldown', 'critical', 'tasksHidden', 'minPlayers', 'clueGoal'];
    const dynamic = [
      ...ROOMS.map((r) => `room.${r.id}`),
      'room.corridor',
      ...TASKS.map((x) => `task.${x.id}`),
      ...(Object.keys({ injection: 1, blackout: 1, guardrails: 1, cooling: 1, doors: 1 } satisfies Record<SabotageKind, 1>)).map((k) => `sab.${k}`),
      ...['injection', 'blackout', 'guardrails', 'cooling'].map((k) => `sabHelp.${k}`),
      ...THEMES.map((x) => `theme.${x.id}`),
      ...Object.keys(SETTINGS_LIMITS).map((k) => `set.${k}`),
      ...['tasks', 'ejected', 'outnumbered', 'sabotage', 'decisions'].map((r) => `reason.${r}`),
      ...['notFound', 'full', 'started', 'left', 'generic'].map((e) => `err.${e}`),
      ...events.map((e) => `ev.${e}`),
      ...['impostor', 'crew'].flatMap((r) => [`reveal.${r}Themed`, `reveal.${r}Classic`]),
    ];
    for (const key of dynamic) expect(pt, key).toHaveProperty([key]);
  });

  it('todas as chaves usadas no código existem', () => {
    const keys = literalKeys();
    expect(keys.length).toBeGreaterThan(80);
    for (const key of keys) expect(pt, key).toHaveProperty([key]);
  });
});
