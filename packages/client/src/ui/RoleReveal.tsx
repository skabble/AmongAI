import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import { useStore } from '../store';
import { Bot, PlayerName } from './common';

/** Mostra o papel durante uns segundos no início de cada jogo. */
export function RoleReveal() {
  const view = useStore((s) => s.view)!;
  const [visible, setVisible] = useState(true);
  const t = useT();
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 4500);
    return () => clearTimeout(timer);
  }, []);
  if (!visible || !view.you.role) return null;

  const impostor = view.you.role === 'impostor';
  const themed = !!view.round;
  const me = view.players.find((p) => p.id === view.you.id);
  const mates = view.players.filter((p) => p.role === 'impostor' && p.id !== view.you.id);
  return (
    <div className={`overlay reveal ${impostor ? 'reveal-impostor' : 'reveal-crew'}`} onClick={() => setVisible(false)}>
      <div>
        {me && <Bot color={me.color} size={96} />}
        <div className="muted">{t('reveal.yourRole')}</div>
        <h1>{t(impostor ? 'role.impostor' : 'role.crew')}</h1>
        <p>
          {t(`reveal.${impostor ? 'impostor' : 'crew'}${themed ? 'Themed' : 'Classic'}`)}
        </p>
        {mates.length > 0 && (
          <p>
            {t('reveal.with')} {mates.map((m) => <PlayerName key={m.id} player={m} />)}
          </p>
        )}
      </div>
    </div>
  );
}
