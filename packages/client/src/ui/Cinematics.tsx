import { useEffect, useState } from 'react';
import type { MeetingView, PublicPlayer } from '@amongai/shared';
import { useT } from '../i18n';
import { Bot } from './common';

const SPLASH_MS = 2800;

/**
 * Aviso no início de cada reunião, no ecrã de todos: «Corpo encontrado» com o morto numa poça de sangue
 * (e quem reportou), ou «Reunião de emergência». Desaparece sozinho; um clique salta-o.
 */
export function MeetingSplash({ meeting, byId }: { meeting: MeetingView; byId: (id?: string) => PublicPlayer | undefined }) {
  const t = useT();
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), SPLASH_MS);
    return () => clearTimeout(timer);
  }, []);
  if (!visible) return null;
  const body = meeting.reason === 'body';
  const victim = byId(meeting.victimId);
  const caller = byId(meeting.callerId);
  return (
    <div className={`cinematic splash ${body ? 'splash-body' : 'splash-emergency'}`} onClick={() => setVisible(false)}>
      <div className="splash-content">
        <h1 className="splash-title">{t(body ? 'cin.bodyTitle' : 'cin.emergencyTitle')}</h1>
        {body ? (
          <div className="splash-corpse">
            <span className="splash-pool" aria-hidden="true" />
            {victim && <Bot color={victim.color} size={110} dead />}
          </div>
        ) : (
          <div className="splash-button" aria-hidden="true" />
        )}
        {body && victim && <p className="splash-name">{t('cin.victim', { name: victim.name })}</p>}
        {caller && <p className="muted">{t(body ? 'cin.reportedBy' : 'cin.calledBy', { name: caller.name })}</p>}
      </div>
    </div>
  );
}

/**
 * Resultado da votação: o expulso atravessa o espaço a rodar e o veredicto escreve-se letra a letra.
 * Sem expulsão, só o espaço e «Ninguém foi expulso». Um clique fecha e mostra os votos.
 */
export function Ejection({ meeting, byId }: { meeting: MeetingView; byId: (id?: string) => PublicPlayer | undefined }) {
  const t = useT();
  const [visible, setVisible] = useState(true);
  if (!visible) return null;
  const ejected = meeting.ejectedId ? byId(meeting.ejectedId) : undefined;
  const verdict = ejected
    ? `${ejected.name} ${t(
        meeting.ejectedWasImpostor === undefined
          ? 'meet.ejected'
          : meeting.ejectedWasImpostor
            ? 'meet.wasImpostor'
            : 'meet.wasNotImpostor',
      )}`
    : t('meet.noEject');
  const left =
    meeting.impostorsLeft === undefined
      ? undefined
      : meeting.impostorsLeft === 1
        ? t('meet.left1')
        : t('meet.leftN', { n: meeting.impostorsLeft });
  return (
    <div className="cinematic space" onClick={() => setVisible(false)}>
      <div className="stars stars-far" aria-hidden="true" />
      <div className="stars stars-near" aria-hidden="true" />
      {ejected && (
        <div className="ejected-bot" aria-hidden="true">
          <Bot color={ejected.color} size={90} />
        </div>
      )}
      <div className="space-text">
        <p className="typewriter" style={{ ['--chars' as string]: verdict.length }}>
          {verdict}
        </p>
        {left && <p className="space-left">{left}</p>}
        <p className="space-skip">{t('cin.skip')}</p>
      </div>
    </div>
  );
}
