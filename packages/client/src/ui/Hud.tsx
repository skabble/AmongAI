import { useEffect, useState } from 'react';
import {
  DOORS,
  FIX_GAMES,
  HIDE_GAMES,
  PANELS,
  ROOMS,
  STATIONS,
  VENTS,
  taskDef,
  type RoundView,
  type SabotageKind,
  type TaskView,
  type View,
} from '@desalinhados/shared';
import { useT, type T } from '../i18n';
import { send, serverNow, setState, useStore } from '../store';
import { useCountdown } from './common';
import { BadDecisions, Question } from './Question';

const LOCKABLE = ROOMS.filter((r) => DOORS.some((d) => d.roomId === r.id));
const GLOBAL_SABOTAGES: Exclude<SabotageKind, 'doors'>[] = ['blackout', 'injection', 'guardrails', 'cooling'];
const stationRoomId = (stationId: string | undefined) => STATIONS.find((s) => s.id === stationId)?.roomId ?? '';

function TaskLine({ task, t }: { task: TaskView; t: T }) {
  const def = taskDef(task.defId);
  if (!def) return null;
  const next = def.steps[Math.min(task.step, def.steps.length - 1)];
  return (
    <li className={task.done ? 'done' : task.step > 0 ? 'started' : ''}>
      {t(`room.${stationRoomId(next?.stationId)}`)}: {t(`task.${def.id}`)}
      {def.steps.length > 1 && ` (${task.step}/${def.steps.length})`}
    </li>
  );
}

function RoundPanel({ round, impostor, bad, left, t }: { round: RoundView; impostor: boolean; bad: View['badDecisions']; left: number; t: T }) {
  return (
    <div className={`panel topic ${impostor ? 'topic-impostor' : ''}`}>
      <Question round={round} compact />
      <div className="small muted">
        {impostor
          ? t('hud.goalHelp')
          : left === 0
            ? t('hud.evidenceNone')
            : t('hud.evidence1')}
      </div>
      {impostor && left > 0 && <div className="small muted">{t('hud.destroyHelp')}</div>}
      <BadDecisions value={bad} />
    </div>
  );
}

export function Hud() {
  const view = useStore((s) => s.view)!;
  const nearby = useStore((s) => s.nearby);
  const modalOpen = useStore((s) => !!s.activeGame);
  const t = useT();
  const [menu, setMenu] = useState(false);
  const you = view.you;
  const impostor = you.role === 'impostor';

  const killIn = useCountdown(impostor ? you.killReadyAt : undefined);
  const sabotageIn = useCountdown(impostor ? you.sabotageReadyAt : undefined);
  const criticalIn = useCountdown(view.sabotage?.endsAt);
  const emergencyIn = useCountdown(view.emergencyReadyAt);

  const task = you.tasks.find((x) => x.id === nearby.taskId);
  const taskStep = task && taskDef(task.defId)?.steps[task.step];
  const panel = PANELS.find((p) => p.id === nearby.panelId);
  const emergencyReady = nearby.button && you.emergencyLeft > 0 && emergencyIn === 0;
  const evidenceIndex = STATIONS.findIndex((s) => s.id === nearby.evidenceId);

  // Os títulos dos mini-jogos são chaves de tradução, para mudarem com a língua.
  const use = () => {
    if (panel && view.sabotage) {
      setState({ activeGame: { kind: 'fix', panelId: panel.id, game: FIX_GAMES[panel.kind], title: `sab.${panel.kind}` } });
    } else if (evidenceIndex >= 0) {
      setState({
        activeGame: {
          kind: 'evidence',
          stationId: STATIONS[evidenceIndex]!.id,
          // Só os Desalinhados chegam aqui: destroem a evidência escondida na consola.
          game: HIDE_GAMES[evidenceIndex % HIDE_GAMES.length]!,
          title: 'hud.destroyTitle',
        },
      });
    } else if (task && taskStep) {
      setState({ activeGame: { kind: 'task', taskId: task.id, game: taskStep.game, title: `task.${task.defId}` } });
    } else if (emergencyReady) send('emergency');
  };
  const useLabel = panel
    ? t('act.repair')
    : evidenceIndex >= 0
      ? t('act.destroy')
      : task
        ? t('act.use')
        : nearby.button
          ? emergencyIn > 0
            ? t('act.meetingWait', { n: emergencyIn })
            : t('act.meeting', { n: you.emergencyLeft })
          : t('act.use');
  const canUse = !!(panel || evidenceIndex >= 0 || task || emergencyReady);
  const canKill = impostor && you.alive && !you.inVent && killIn === 0 && !!nearby.killTarget;
  const kill = () => canKill && send('kill', { target: nearby.killTarget! });
  const report = () => nearby.bodyId && send('report', { body: nearby.bodyId });
  const vent = VENTS.find((v) => v.id === (you.inVent ?? nearby.ventId));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (modalOpen || e.repeat) return;
      const key = e.key.toLowerCase();
      if (key === 'e' || key === ' ') use();
      else if (key === 'q') kill();
      else if (key === 'r') report();
      else if (key === 'escape') setMenu(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const done = you.tasks.filter((x) => x.done).length;

  return (
    <div className="hud">
      <div className="hud-top">
        <div className="panel tasks">
          {view.taskProgress !== null && (
            <div className="progress" title={t('hud.progress')}>
              <div style={{ width: `${Math.round(view.taskProgress * 100)}%` }} />
            </div>
          )}
          <div className="row between">
            <strong className={impostor ? 'text-impostor' : 'text-crew'}>
              {t(impostor ? 'role.impostor' : 'role.crew')}
              {!you.alive && t('hud.ghost')}
            </strong>
            <span className="muted small">{nearby.room && t(`room.${nearby.room}`)}</span>
          </div>
          {view.sabotage?.kind === 'injection' && !impostor ? (
            <p className="glitch">{t('hud.glitch')}</p>
          ) : (
            <>
              <div className="muted small">
                {impostor ? t('hud.fakeTasks') : t('hud.tasks', { done, total: you.tasks.length })}
              </div>
              <ul>
                {you.tasks.map((x) => (
                  <TaskLine key={x.id} task={x} t={t} />
                ))}
              </ul>
            </>
          )}
        </div>

        {view.round && (
          <RoundPanel round={view.round} impostor={impostor} bad={view.badDecisions} left={view.evidenceLeft} t={t} />
        )}

        {view.sabotage && (
          <div className="panel alert">
            <strong>
              {t(`sab.${view.sabotage.kind}`)}
              {view.sabotage.endsAt ? ` — ${criticalIn}s` : ''}
            </strong>
            <div className="small">{t(`sabHelp.${view.sabotage.kind}`)}</div>
          </div>
        )}
      </div>

      {menu && impostor && (
        <div className="panel menu">
          <div className="muted small">
            {t('hud.sabotages')} {sabotageIn > 0 && t('hud.sabotagesIn', { n: sabotageIn })}
          </div>
          <div className="menu-grid">
            {GLOBAL_SABOTAGES.map((kind) => (
              <button
                key={kind}
                disabled={!!view.sabotage || sabotageIn > 0}
                onClick={() => {
                  send('sabotage', { kind });
                  setMenu(false);
                }}
              >
                {t(`sab.${kind}`)}
              </button>
            ))}
          </div>
          <div className="muted small">{t('hud.lockDoors')}</div>
          <div className="menu-grid">
            {LOCKABLE.map((room) => (
              <button
                key={room.id}
                disabled={(you.doorReadyAt[room.id] ?? 0) > serverNow()}
                onClick={() => send('sabotage', { kind: 'doors', roomId: room.id })}
              >
                {t(`room.${room.id}`)}
              </button>
            ))}
          </div>
        </div>
      )}

      {you.inVent && vent && (
        <div className="panel menu">
          <div className="muted small">{t('hud.inVent', { room: t(`room.${vent.roomId}`) })}</div>
          <div className="menu-grid">
            {vent.links.map((id) => (
              <button key={id} onClick={() => send('vent', { action: 'move', to: id })}>
                → {t(`room.${VENTS.find((v) => v.id === id)?.roomId ?? ''}`)}
              </button>
            ))}
            <button className="primary" onClick={() => send('vent', { action: 'exit' })}>
              {t('act.exit')}
            </button>
          </div>
        </div>
      )}

      <div className="actions">
        {impostor && <button onClick={() => setMenu(!menu)}>{t('act.sabotage')}</button>}
        {impostor && you.alive && !you.inVent && (
          <button disabled={!vent} onClick={() => send('vent', { action: 'enter' })}>
            {t('act.vent')}
          </button>
        )}
        {impostor && you.alive && (
          <button className="danger" disabled={!canKill} onClick={kill}>
            {t('act.kill')} {killIn > 0 ? `(${killIn}s)` : '[Q]'}
          </button>
        )}
        {you.alive && (
          <button className="warn" disabled={!nearby.bodyId} onClick={report}>
            {t('act.report')} [R]
          </button>
        )}
        <button className="primary" disabled={!canUse} onClick={use}>
          {useLabel} [E]
        </button>
      </div>
      <div className="hint">{t('hud.move')}</div>
    </div>
  );
}
