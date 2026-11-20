import { useT } from '../i18n';
import { send, useStore } from '../store';
import { PlayerName } from './common';

/**
 * Coluna fixa à direita durante o jogo e as reuniões: o papel do jogador sempre visível
 * (quadrado verde para a Equipa, vermelho para os Impostores) e, para o anfitrião,
 * o botão que termina o jogo e leva todos ao lobby.
 */
export function SidePanel() {
  const view = useStore((s) => s.view)!;
  const t = useT();
  const role = view.you.role;
  if (!role) return null;
  const impostor = role === 'impostor';
  const isHost = view.hostId === view.you.id;
  const mates = impostor ? view.players.filter((p) => p.role === 'impostor' && p.id !== view.you.id) : [];

  const toLobby = () => {
    if (window.confirm(t('host.confirm'))) send('toLobby');
  };

  return (
    <aside className="side-panel">
      <div className={`role-badge ${impostor ? 'role-badge-impostor' : 'role-badge-crew'}`}>
        <span className="role-square" aria-hidden="true" />
        <div>
          <div className="role-label">{t('side.youAre')}</div>
          <div className="role-name">
            {t(impostor ? 'role.impostor' : 'role.crew')}
            {!view.you.alive && <span className="role-ghost">{t('hud.ghost')}</span>}
          </div>
          <div className="role-hint">{t(impostor ? 'side.impostorHint' : 'side.crewHint')}</div>
          {mates.length > 0 && (
            <div className="role-mates">
              {t('side.mates')} {mates.map((m) => <PlayerName key={m.id} player={m} />)}
            </div>
          )}
        </div>
      </div>
      {isHost && (
        <button className="host-lobby" onClick={toLobby} onMouseDown={(e) => e.preventDefault()} tabIndex={-1}>
          ⟲ {t('host.toLobby')}
        </button>
      )}
    </aside>
  );
}
