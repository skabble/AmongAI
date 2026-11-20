import { useEffect, useState } from 'react';
import type { PublicPlayer } from '@desalinhados/shared';
import { useT } from '../i18n';
import { serverNow } from '../store';

/** Segundos que faltam até `endsAt` (relógio do servidor), atualizado 4 vezes por segundo. */
export function useCountdown(endsAt: number | undefined): number {
  const [, force] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => force((n) => n + 1), 250);
    return () => clearInterval(timer);
  }, []);
  if (!endsAt) return 0;
  return Math.max(0, Math.ceil((endsAt - serverNow()) / 1000));
}

export function Dot({ color }: { color: string }) {
  return <span className="dot" style={{ background: color }} />;
}

/** O robô de laboratório do jogo, em SVG, para os ecrãs fora do mapa. */
export function Bot({ color, size = 28, dead = false }: { color: string; size?: number; dead?: boolean }) {
  return (
    <svg className="bot" width={size} height={(size * 64) / 48} viewBox="0 0 48 64" aria-hidden="true" style={{ opacity: dead ? 0.4 : 1 }}>
      <rect x="13" y="52" width="10" height="9" rx="3" fill="#1c2232" />
      <rect x="26" y="52" width="10" height="9" rx="3" fill="#1c2232" />
      <rect x="5" y="36" width="6" height="13" rx="3" fill={color} />
      <rect x="37" y="36" width="6" height="13" rx="3" fill={color} />
      <rect x="5" y="36" width="6" height="13" rx="3" fill="#000" opacity="0.35" />
      <rect x="37" y="36" width="6" height="13" rx="3" fill="#000" opacity="0.35" />
      <rect x="8" y="30" width="32" height="26" rx="8" fill="#0a0d16" />
      <rect x="10" y="32" width="28" height="22" rx="7" fill={color} />
      <rect x="10" y="46" width="28" height="8" rx="4" fill="#000" opacity="0.3" />
      <rect x="25" y="37" width="9" height="7" fill="#f2f5fb" />
      <rect x="26" y="38" width="3" height="3" fill="#4fd1ff" />
      <rect x="20" y="28" width="8" height="4" fill="#1c2232" />
      <rect x="6" y="8" width="36" height="24" rx="9" fill="#0a0d16" />
      <rect x="8" y="10" width="32" height="20" rx="8" fill={color} />
      <rect x="8" y="10" width="32" height="12" rx="8" fill="#fff" opacity="0.15" />
      <rect x="15" y="13" width="23" height="13" rx="4" fill="#101626" />
      {dead ? (
        <path d="M21 16l5 6M26 16l-5 6M30 16l5 6M35 16l-5 6" stroke="#ff4d5e" strokeWidth="2" />
      ) : (
        <>
          <rect x="22" y="17" width="4" height="5" rx="1" fill="#6ff0ff" />
          <rect x="31" y="17" width="4" height="5" rx="1" fill="#6ff0ff" />
        </>
      )}
      <line x1="20" y1="9" x2="18" y2="3" stroke="#0a0d16" strokeWidth="2" />
      <circle cx="18" cy="3" r="3" fill="#ffe45c" />
    </svg>
  );
}

export function PlayerName({ player }: { player: PublicPlayer | undefined }) {
  const t = useT();
  if (!player) return <span className="muted">{t('common.someoneLeft')}</span>;
  return (
    <span className="player-name">
      <Dot color={player.color} />
      {player.name}
    </span>
  );
}
