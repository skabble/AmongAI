import { useT } from '../i18n';
import { leaveRoom, send, useStore } from '../store';
import { Bot } from './common';

export function EndScreen() {
  const view = useStore((s) => s.view)!;
  const t = useT();
  const crewWon = view.winner === 'crew';
  const youWon = view.winner === view.you.role;
  const isHost = view.hostId === view.you.id;

  return (
    <main className="center">
      <div className={`card end ${crewWon ? 'reveal-crew' : 'reveal-impostor'}`}>
        <div className="muted">{t(youWon ? 'end.win' : 'end.loss')}</div>
        <h1>{t(crewWon ? 'end.crewWon' : 'end.impostorsWon')}</h1>
        <p>{view.winReason && t(`reason.${view.winReason}`)}</p>
        <ul className="players">
          {view.players.map((p) => (
            <li key={p.id} className={p.dead ? 'offline' : ''}>
              <Bot color={p.color} size={22} dead={p.dead} />
              {p.name}
              <span className={`tag ${p.role === 'impostor' ? 'tag-impostor' : ''}`}>
                {t(p.role === 'impostor' ? 'role.impostor' : 'role.crew')}
              </span>
              {p.dead && <span className="tag">{t('tag.eliminated')}</span>}
            </li>
          ))}
        </ul>
        <footer className="row">
          {isHost ? (
            <button className="primary" onClick={() => send('playAgain')}>
              {t('end.back')}
            </button>
          ) : (
            <span className="muted">{t('end.waitHost')}</span>
          )}
          <button onClick={leaveRoom}>{t('common.leave')}</button>
        </footer>
      </div>
    </main>
  );
}
