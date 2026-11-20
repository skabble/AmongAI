import { useEffect, useState } from 'react';
import { COLORS, SETTINGS_LIMITS, THEMES, maxImpostors, type Settings } from '@desalinhados/shared';
import { useT } from '../i18n';
import { leaveRoom, send, useStore } from '../store';
import { Bot } from './common';

type NumericKey = keyof typeof SETTINGS_LIMITS;

const NUMBERS: [NumericKey, string][] = [
  ['impostors', ''],
  ['badDecisions', ''],
  ['killCooldown', 's'],
  ['playerSpeed', 'x'],
  ['crewVision', 'x'],
  ['impostorVision', 'x'],
  ['emergencyMeetings', ''],
  ['emergencyCooldown', 's'],
  ['votingSec', 's'],
  ['commonTasks', ''],
  ['longTasks', ''],
  ['shortTasks', ''],
];

interface StepperProps {
  k: NumericKey;
  label: string;
  unit: string;
  settings: Settings;
  disabled: boolean;
  decrease: string;
  increase: string;
}

function Stepper({ k, label, unit, settings, disabled, decrease, increase }: StepperProps) {
  const [min, max, step] = SETTINGS_LIMITS[k];
  // Valor otimista: cliques rápidos partem do último valor pedido, não do último confirmado pelo servidor.
  const [pending, setPending] = useState<number | null>(null);
  useEffect(() => {
    setPending(null);
  }, [settings[k]]);
  const value = pending ?? settings[k];
  const set = (next: number) => {
    const clamped = Math.max(min, Math.min(max, next));
    setPending(clamped);
    send('settings', { [k]: clamped });
  };
  return (
    <div className="setting">
      <span>{label}</span>
      <span className="stepper">
        <button disabled={disabled || value <= min} onClick={() => set(value - step)} aria-label={decrease}>
          −
        </button>
        <output>
          {value}
          {unit}
        </output>
        <button disabled={disabled || value >= max} onClick={() => set(value + step)} aria-label={increase}>
          +
        </button>
      </span>
    </div>
  );
}

export function Lobby() {
  const view = useStore((s) => s.view)!;
  const t = useT();
  const [copied, setCopied] = useState(false);
  const isHost = view.hostId === view.you.id;
  const s = view.settings;
  const connected = view.players.filter((p) => p.connected).length;
  const taken = new Set(view.players.filter((p) => p.id !== view.you.id).map((p) => p.color));
  const mine = view.players.find((p) => p.id === view.you.id)?.color;
  const link = `${location.origin}${location.pathname}?sala=${view.code}`;
  const effective = Math.min(s.impostors, maxImpostors(connected));

  return (
    <main className="center">
      <div className="card lobby">
        <header className="lobby-head">
          <div>
            <div className="muted small">{t('lobby.code')}</div>
            <div className="code">{view.code}</div>
          </div>
          <div className="row">
            <button
              onClick={() => {
                void navigator.clipboard?.writeText(link).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
              }}
            >
              {copied ? t('lobby.copied') : t('lobby.copy')}
            </button>
            <button onClick={leaveRoom}>{t('common.leave')}</button>
          </div>
        </header>

        <section className="theme">
          <label>
            <strong>{t('lobby.theme')}</strong>
            <select value={s.theme} disabled={!isHost} onChange={(e) => send('settings', { theme: e.target.value })}>
              {THEMES.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {t(`theme.${theme.id}`)}
                </option>
              ))}
            </select>
          </label>
          <p className="muted small">{s.theme === 'none' ? t('lobby.themeNone') : t('lobby.themeHelp')}</p>
        </section>

        <div className="lobby-body">
          <section>
            <h2>
              {t('lobby.players')} <span className="muted">({connected}/15)</span>
            </h2>
            <ul className="players">
              {view.players.map((p) => (
                <li key={p.id} className={p.connected ? '' : 'offline'}>
                  <Bot color={p.color} size={22} />
                  {p.name}
                  {p.id === view.hostId && <span className="tag">{t('tag.host')}</span>}
                  {p.id === view.you.id && <span className="tag">{t('tag.you')}</span>}
                  {!p.connected && <span className="tag">{t('tag.offline')}</span>}
                </li>
              ))}
            </ul>
            <h2>{t('lobby.color')}</h2>
            <div className="swatches">
              {COLORS.map((c) => (
                <button
                  key={c}
                  className={`swatch ${c === mine ? 'selected' : ''}`}
                  style={{ background: c }}
                  disabled={taken.has(c)}
                  onClick={() => send('color', { color: c })}
                  aria-label={t('lobby.colorAria', { c })}
                />
              ))}
            </div>
          </section>

          <section>
            <h2>
              {t('lobby.settings')} {!isHost && <span className="muted small">{t('lobby.hostOnly')}</span>}
            </h2>
            <div className="settings">
              {NUMBERS.map(([k, unit]) => {
                const label = t(`set.${k}`);
                return (
                  <Stepper
                    key={k}
                    k={k}
                    label={label}
                    unit={unit}
                    settings={s}
                    disabled={!isHost}
                    decrease={t('lobby.decrease', { label })}
                    increase={t('lobby.increase', { label })}
                  />
                );
              })}
              <label className="setting">
                <span>{t('set.killDistance')}</span>
                <select
                  value={s.killDistance}
                  disabled={!isHost}
                  onChange={(e) => send('settings', { killDistance: e.target.value as Settings['killDistance'] })}
                >
                  <option value="short">{t('dist.short')}</option>
                  <option value="medium">{t('dist.medium')}</option>
                  <option value="long">{t('dist.long')}</option>
                </select>
              </label>
              <label className="setting">
                <span>{t('set.taskBar')}</span>
                <select
                  value={s.taskBar}
                  disabled={!isHost}
                  onChange={(e) => send('settings', { taskBar: e.target.value as Settings['taskBar'] })}
                >
                  <option value="always">{t('bar.always')}</option>
                  <option value="meetings">{t('bar.meetings')}</option>
                  <option value="never">{t('bar.never')}</option>
                </select>
              </label>
              <label className="setting">
                <span>{t('set.confirmEjects')}</span>
                <input
                  type="checkbox"
                  checked={s.confirmEjects}
                  disabled={!isHost}
                  onChange={(e) => send('settings', { confirmEjects: e.target.checked })}
                />
              </label>
              <label className="setting">
                <span>{t('set.anonymousVotes')}</span>
                <input
                  type="checkbox"
                  checked={s.anonymousVotes}
                  disabled={!isHost}
                  onChange={(e) => send('settings', { anonymousVotes: e.target.checked })}
                />
              </label>
            </div>
            {effective < s.impostors && (
              <p className="muted small">
                {t('lobby.effective', {
                  n: connected,
                  k: effective,
                  role: t(effective > 1 ? 'role.impostors' : 'role.impostor'),
                })}
              </p>
            )}
          </section>
        </div>

        <footer>
          {isHost ? (
            <button className="primary" disabled={connected < view.minPlayers} onClick={() => send('start')}>
              {connected < view.minPlayers ? t('lobby.missing', { n: view.minPlayers - connected }) : t('lobby.start')}
            </button>
          ) : (
            <p className="muted">{t('lobby.waiting')}</p>
          )}
        </footer>
      </div>
    </main>
  );
}
