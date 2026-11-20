import { useEffect, useRef, useState } from 'react';
import { CHAT_MAX, type PublicPlayer } from '@desalinhados/shared';
import { useT } from '../i18n';
import { send, useStore } from '../store';
import { Bot, Dot, PlayerName, useCountdown } from './common';
import { BadDecisions, letter } from './Question';
import { Ejection, MeetingSplash } from './Cinematics';

type ById = (id: string | undefined | null) => PublicPlayer | undefined;

function Chip({ player, glow, mine }: { player: PublicPlayer | undefined; glow?: boolean; mine?: boolean }) {
  return (
    <span className={`voter-chip ${glow ? 'glow-impostor' : ''} ${mine ? 'mine' : ''}`}>
      <Dot color={player?.color ?? '#888'} />
      {player?.name ?? '?'}
    </span>
  );
}

/**
 * As opções da pergunta, em cartões que são ao mesmo tempo os botões de escolha e o gráfico.
 * Passo 1: cada vivo clica para escolher (e pode mudar); vê-se ao vivo quem escolheu o quê.
 * Passo 2: o resultado da decisão, com quem escolheu a opção dos Desalinhados a brilhar a vermelho.
 */
function Options() {
  const view = useStore((s) => s.view)!;
  const t = useT();
  const m = view.meeting!;
  const round = view.round!;
  const d = m.decision;
  const byId: ById = (id) => view.players.find((p) => p.id === id);
  const mine = m.picks[view.you.id];
  const canPick = m.stage === 'speaking' && view.you.alive;
  const total = Object.keys(m.picks).length;

  return (
    <div className="options">
      {round.options.map((option, i) => {
        const pickers = m.participants.filter((id) => m.picks[id] === i);
        const goal = d ? d.goal.includes(i) : !!round.goal?.includes(i);
        const share = total ? Math.round((pickers.length / total) * 100) : 0;
        const classes = ['option-card'];
        if (mine === i) classes.push('mine');
        if (goal) classes.push('goal');
        if (d?.chosen === i) classes.push('chosen');
        if (round.hints.includes(i)) classes.push('clue');
        const body = (
          <>
            <span className="option-card-head">
              <span className="option-letter">{letter(i)}</span>
              <span className="option-card-text">{option}</span>
              <strong className="option-card-count">{pickers.length}</strong>
            </span>
            <span className="option-card-bar">
              <span style={{ width: `${share}%` }} />
            </span>
            <span className="option-card-tags">
              {mine === i && <span className="tag tag-mine">✓ {t('opt.yours')}</span>}
              {d?.chosen === i && <span className="tag tag-mine">{t('dec.winner')}</span>}
              {goal && <span className="tag tag-impostor">{t(d ? 'dec.goal' : 'q.goal')}</span>}
              {round.hints.includes(i) && !d && <span className="tag tag-clue">🔍 {t('opt.clue')}</span>}
            </span>
            <span className="voters">
              {pickers.map((id) => (
                <Chip key={id} player={byId(id)} glow={!!d && goal} mine={id === view.you.id} />
              ))}
            </span>
          </>
        );
        return canPick ? (
          <button key={i} className={classes.join(' ')} onClick={() => mine !== i && send('decide', { option: i })}>
            {body}
          </button>
        ) : (
          <div key={i} className={classes.join(' ')}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

/** Lista compacta para votar na expulsão, com a contagem e quem votou, ao vivo. */
function VoteList() {
  const view = useStore((s) => s.view)!;
  const t = useT();
  const m = view.meeting!;
  const byId: ById = (id) => view.players.find((p) => p.id === id);
  const you = view.you;
  const result = m.stage === 'result';
  const canVote = m.stage === 'voting' && you.alive && !m.yourVote;
  const count = (id: string) => m.ballots?.[id]?.length ?? 0;
  const entries: { id: string; player?: PublicPlayer }[] = [
    ...view.players.map((p) => ({ id: p.id, player: p })),
    { id: 'skip' },
  ];
  if (result) entries.sort((a, b) => count(b.id) - count(a.id) || Number(!!a.player?.dead) - Number(!!b.player?.dead));
  const top = Math.max(0, ...entries.map((e) => count(e.id)));

  return (
    <ul className="vote-list">
      {entries.map(({ id, player }) => {
        const dead = !!player?.dead;
        const pick = player ? m.picks[player.id] : undefined;
        const pickedGoal = pick !== undefined && !!m.decision?.goal.includes(pick);
        const voters = m.ballots?.[id] ?? [];
        const classes = ['vote-row'];
        if (dead) classes.push('dead');
        if (m.yourVote === id) classes.push('mine');
        if (top > 0 && count(id) === top) classes.push('top');
        if (result && m.ejectedId === id) classes.push('ejected');
        if (pickedGoal) classes.push('glow-impostor');
        return (
          <li key={id} className={classes.join(' ')}>
            <button disabled={!canVote || dead} onClick={() => send('vote', { target: id })}>
              {player ? <Bot color={player.color} size={26} dead={dead} /> : <span className="skip-icon">⏭</span>}
              <span className="vote-row-name">
                <strong>{player ? player.name : t('meet.skip')}</strong>
                {dead && <span className="tag">{t('tag.eliminated')}</span>}
                {player?.role === 'impostor' && <span className="tag tag-impostor">{t('role.impostor')}</span>}
                {m.yourVote === id && <span className="tag tag-mine">{t('tag.yourVote')}</span>}
                {player && !dead && m.stage === 'voting' && m.voted.includes(player.id) && (
                  <span className="voted-check">✓</span>
                )}
              </span>
              <strong className="vote-row-count">{count(id)}</strong>
            </button>
            {voters.length > 0 && (
              <div className="voters">
                {voters.map((voter, i) =>
                  voter ? (
                    <Chip key={i} player={byId(voter)} />
                  ) : (
                    <span key={i} className="voter-chip anon">
                      {t('meet.anonymous')}
                    </span>
                  ),
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Chat fixo no canto do ecrã durante a reunião, fora do cartão; pode ser minimizado. */
function Chat({ byId, ghost }: { byId: ById; ghost: boolean }) {
  const chat = useStore((s) => s.chat);
  const t = useT();
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(true);
  const [seen, setSeen] = useState(0);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) {
      end.current?.scrollIntoView({ block: 'nearest' });
      setSeen(chat.length);
    }
  }, [chat.length, open]);
  const unread = chat.length - seen;
  if (!open) {
    return (
      <button className="chat-dock chat-dock-closed" onClick={() => setOpen(true)}>
        💬 {t(ghost ? 'chat.ghost' : 'chat.title')} {unread > 0 && <span className="tag tag-mine">{unread}</span>}
      </button>
    );
  }
  return (
    <aside className="chat chat-dock">
      <header className="row between">
        <strong className="small">💬 {t(ghost ? 'chat.ghost' : 'chat.title')}</strong>
        <button className="ghost chat-min" onClick={() => setOpen(false)} aria-label={t('chat.minimize')}>
          —
        </button>
      </header>
      <div className="chat-log">
        {chat.length === 0 && <div className="muted small">{t('chat.empty')}</div>}
        {chat.map((message, i) => (
          <div key={i} className={message.ghost ? 'ghost-line' : ''}>
            <PlayerName player={byId(message.from)} />
            {message.text}
          </div>
        ))}
        <div ref={end} />
      </div>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          send('chat', { text: draft.trim() });
          setDraft('');
        }}
      >
        <input value={draft} maxLength={CHAT_MAX} onChange={(e) => setDraft(e.target.value)} placeholder={t('chat.placeholder')} />
        <button disabled={!draft.trim()}>{t('chat.send')}</button>
      </form>
    </aside>
  );
}

export function Meeting() {
  const view = useStore((s) => s.view)!;
  const t = useT();
  const m = view.meeting!;
  const seconds = useCountdown(m.endsAt);
  const byId: ById = (id) => view.players.find((p) => p.id === id);
  const you = view.you;
  const round = view.round;
  const speaking = m.stage === 'speaking';
  const result = m.stage === 'result';
  const isHost = view.hostId === you.id;
  const d = m.decision;
  const outcome = !d ? null : d.chosen === null ? 'tie' : d.goal.includes(d.chosen) ? 'bad' : 'good';
  const picked = Object.keys(m.picks).length;
  const alive = view.players.filter((p) => !p.dead).length;

  // A instrução principal de cada momento, numa linha só.
  let instruction: string;
  if (speaking) instruction = !you.alive ? t('meet.ghostNoPick') : round ? t(m.picks[you.id] === undefined ? 'meet.pickTitle' : 'meet.pickChange') : t('meet.talk');
  else if (m.stage === 'voting') instruction = t(you.alive ? (m.yourVote ? 'meet.voted' : 'meet.whoVote') : 'meet.ghostsNoVote');
  else instruction = t('meet.votes');

  return (
    <div className={`overlay meeting ${you.role === 'impostor' ? 'meeting-impostor' : 'meeting-crew'}`}>
      <div className="card meeting-card">
        <header className="meeting-head">
          <div className="meeting-title">
            <h1>{t(m.reason === 'body' ? 'meet.body' : 'meet.emergency')}</h1>
            <div className="muted small">
              {t('meet.calledBy')} <PlayerName player={byId(m.callerId)} />
              {m.victimId && (
                <>
                  {' '}
                  {t('meet.victim')} <PlayerName player={byId(m.victimId)} />
                </>
              )}
            </div>
          </div>
          <nav className="steps" aria-label={t('meet.steps')}>
            <span className={speaking ? 'current' : 'done'}>
              <b>1</b> {t('meet.step1')}
            </span>
            <span className={speaking ? '' : 'current'}>
              <b>2</b> {t('meet.step2')}
              {!speaking && <span className="timer-small">{seconds}s</span>}
            </span>
          </nav>
        </header>

        {round && (
          <section className="meeting-question">
            <h2>{round.question}</h2>
            {round.hints.length > 0 && !d && <div className="question-note">{t('q.hintsPrivate')}</div>}
          </section>
        )}

        {outcome && (
          <div className={`outcome outcome-${outcome}`}>
            <strong>{t(`dec.outcome.${outcome}`)}</strong>
            <span>
              {d!.chosen !== null && t('dec.chosenWas', { option: `${letter(d!.chosen)} · ${round!.options[d!.chosen]}` })}{' '}
              {t(`dec.effect.${outcome}`)}
            </span>
          </div>
        )}

        {speaking && (
          <div className="instruction">
            <strong>{instruction}</strong>
            {round && <span className="muted small">{t('chart.count', { n: picked, total: m.participants.length })}</span>}
          </div>
        )}

        {round && <Options />}

        {speaking && isHost && (
          <div className="host-bar">
            <button className="primary" onClick={() => send('openVoting')}>
              {t('meet.openVoting')} →
            </button>
          </div>
        )}

        {!speaking && !m.decisionLoss && (
          <section className="vote-step">
            <div className="instruction">
              <strong>{instruction}</strong>
              {m.stage === 'voting' && <span className="muted small">{t('meet.votedCount', { n: m.voted.length, total: alive })}</span>}
            </div>
            <VoteList />
          </section>
        )}

        {m.decisionLoss && (
          <section className="verdict decision-loss">
            <h2>{t('dec.loss')}</h2>
            <p className="muted">{t('dec.lossHelp')}</p>
          </section>
        )}

        {result && !m.decisionLoss && (
          <section className="verdict">
            <h2>
              {m.ejectedId ? (
                <>
                  <PlayerName player={byId(m.ejectedId)} />
                  {t(m.ejectedWasImpostor === undefined ? 'meet.ejected' : m.ejectedWasImpostor ? 'meet.wasImpostor' : 'meet.wasNotImpostor')}
                </>
              ) : (
                t('meet.noEject')
              )}
            </h2>
            {m.impostorsLeft !== undefined && (
              <p className="muted">{m.impostorsLeft === 1 ? t('meet.left1') : t('meet.leftN', { n: m.impostorsLeft })}</p>
            )}
          </section>
        )}

        {round && (
          <footer className="meeting-foot">
            <BadDecisions value={view.badDecisions} />
          </footer>
        )}
      </div>
      <Chat byId={byId} ghost={!you.alive} />
      <MeetingSplash meeting={m} byId={byId} />
      {result && !m.decisionLoss && <Ejection meeting={m} byId={byId} />}
    </div>
  );
}
