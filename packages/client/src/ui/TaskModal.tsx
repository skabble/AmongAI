import { useCallback, useEffect, useState } from 'react';
import { useT } from '../i18n';
import { send, setState, useStore } from '../store';
import { MiniGameView } from './MiniGames';

/** Janela do mini-jogo aberto: um passo de tarefa ou a reparação de uma sabotagem. */
export function TaskModal() {
  const active = useStore((s) => s.activeGame);
  const sabotage = useStore((s) => s.view?.sabotage);
  const evidence = useStore((s) => s.view?.evidence);
  const [finished, setFinished] = useState(false);
  const t = useT();

  const close = useCallback(() => setState({ activeGame: undefined }), []);
  useEffect(() => {
    setFinished(false);
  }, [active]);

  // Uma reparação fecha-se sozinha quando a sabotagem fica resolvida (por nós ou por outro jogador).
  useEffect(() => {
    if (active?.kind === 'fix' && !sabotage) close();
    // O mesmo quando outro Desalinhado destrói a evidência que estávamos a destruir.
    if (active?.kind === 'evidence' && !finished && !evidence?.includes(active.stationId)) close();
  }, [active, sabotage, evidence, finished, close]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  const done = useCallback(() => {
    if (!active) return;
    if (active.kind === 'task') send('taskStep', { taskId: active.taskId });
    else if (active.kind === 'fix') send('fix', { panelId: active.panelId });
    else send('evidence', { stationId: active.stationId });
    setFinished(true);
    setTimeout(close, 700);
  }, [active, close]);

  const pulse = useCallback(() => {
    if (active?.kind === 'fix') send('fix', { panelId: active.panelId });
  }, [active]);

  if (!active) return null;
  return (
    <div className="overlay">
      <div className="card task">
        <header className="row between">
          <h2>{t(active.title)}</h2>
          <button className="ghost" onClick={close}>
            {t('common.close')}
          </button>
        </header>
        {finished ? (
          <p className="result ok">{t('mg.done')}</p>
        ) : (
          <MiniGameView key={active.kind === 'task' ? active.taskId : active.kind === 'fix' ? active.panelId : active.stationId} game={active.game} onDone={done} onPulse={pulse} />
        )}
      </div>
    </div>
  );
}
