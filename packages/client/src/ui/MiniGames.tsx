import { useEffect, useMemo, useRef, useState } from 'react';
import type { MiniGame } from '@amongai/shared';
import { useT } from '../i18n';

interface GameProps {
  onDone: () => void;
  /** Só para 'hold': chamado repetidamente enquanto o botão está premido. */
  onPulse?: () => void;
}

function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

// ---------------------------------------------------------------- mini-jogos de IA

/** Categorias para rotular: as imagens certas e as que se parecem mas não são. */
const LABEL_SETS = [
  { key: 'cats', yes: ['🐱', '🐈'], no: ['🐶', '🦊', '🐯', '🐰', '🐭', '🦁'] },
  { key: 'cars', yes: ['🚗', '🚙', '🚕'], no: ['🚲', '🛵', '🚌', '✈️', '🚂', '🛴'] },
  { key: 'fruit', yes: ['🍎', '🍌', '🍇', '🍓', '🍐'], no: ['🥕', '🥦', '🌽', '🍞', '🧀', '🥚'] },
] as const;

function makeLabelGrid() {
  const set = LABEL_SETS[Math.floor(Math.random() * LABEL_SETS.length)]!;
  const targets = 3 + Math.floor(Math.random() * 2);
  const tiles = shuffled([
    ...Array.from({ length: targets }, (_, i) => ({ emoji: set.yes[i % set.yes.length]!, target: true })),
    ...shuffled([...set.no]).slice(0, 9 - targets).map((emoji) => ({ emoji, target: false })),
  ]);
  return { key: set.key, tiles };
}

/** Rotular dados: escolher todas as imagens de uma categoria, como num captcha. */
function Label({ onDone }: GameProps) {
  const t = useT();
  const [grid, setGrid] = useState(makeLabelGrid);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [wrong, setWrong] = useState(false);
  const toggle = (i: number) => {
    const next = new Set(selected);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setSelected(next);
  };
  const check = () => {
    const ok = grid.tiles.every((tile, i) => tile.target === selected.has(i));
    if (ok) return onDone();
    setWrong(true);
    setGrid(makeLabelGrid());
    setSelected(new Set());
  };
  return (
    <>
      <p className="muted">{t('mg.label', { what: t(`mg.label.${grid.key}`) })}</p>
      <div className="label-grid">
        {grid.tiles.map((tile, i) => (
          <button key={i} className={selected.has(i) ? 'selected' : ''} onClick={() => toggle(i)} aria-pressed={selected.has(i)}>
            {tile.emoji}
          </button>
        ))}
      </div>
      {wrong && <p className="result bad">{t('mg.labelWrong')}</p>}
      <button className="primary" onClick={check}>
        {t('mg.labelCheck')}
      </button>
    </>
  );
}

const PROMPT_PARTS = ['role', 'context', 'task', 'format'] as const;

/** Montar o prompt: escolher os pedaços pela ordem Papel → Contexto → Tarefa → Formato. */
function Prompt({ onDone }: GameProps) {
  const t = useT();
  const order = useMemo(() => shuffled([...PROMPT_PARTS]), []);
  const [placed, setPlaced] = useState(0);
  const [miss, setMiss] = useState<string | null>(null);
  const pick = (part: (typeof PROMPT_PARTS)[number]) => {
    if (part !== PROMPT_PARTS[placed]) {
      setMiss(part);
      setTimeout(() => setMiss(null), 450);
      return;
    }
    if (placed + 1 === PROMPT_PARTS.length) onDone();
    setPlaced(placed + 1);
  };
  return (
    <>
      <p className="muted">{t('mg.prompt')}</p>
      <ol className="prompt-slots">
        {PROMPT_PARTS.map((part, i) => (
          <li key={part} className={i < placed ? 'filled' : i === placed ? 'next' : ''}>
            <span className="tag">{t(`mg.prompt.${part}`)}</span>
            {i < placed && <span>{t(`mg.prompt.${part}Text`)}</span>}
          </li>
        ))}
      </ol>
      <div className="prompt-chips">
        {order.map((part) =>
          PROMPT_PARTS.indexOf(part) < placed ? null : (
            <button key={part} className={miss === part ? 'miss' : ''} onClick={() => pick(part)}>
              {t(`mg.prompt.${part}Text`)}
            </button>
          ),
        )}
      </div>
    </>
  );
}

const EPOCHS = 12;

/** Treinar o modelo: guardar o checkpoint quando a perda de validação deixa de descer (paragem antecipada). */
function Train({ onDone }: GameProps) {
  const t = useT();
  const [attempt, setAttempt] = useState(0);
  // Época em que a validação é mínima; depois disso o modelo começa a sobreajustar.
  const best = useMemo(() => 4 + Math.floor(Math.random() * 5), [attempt]);
  const [epoch, setEpoch] = useState(1);
  const [message, setMessage] = useState<'early' | 'overfit' | null>(null);
  const trainLoss = (e: number) => 1.1 / (1 + 0.45 * e);
  const valLoss = (e: number) => 0.32 + 0.022 * (e - best) ** 2 + (e < best ? 0.03 * (best - e) : 0);
  const step = () => {
    setMessage(null);
    if (epoch >= EPOCHS || epoch > best + 2) {
      setMessage('overfit');
      setAttempt((a) => a + 1);
      setEpoch(1);
      return;
    }
    setEpoch(epoch + 1);
  };
  const save = () => {
    if (epoch < best + 1) return setMessage('early');
    if (epoch > best + 2) {
      setMessage('overfit');
      setAttempt((a) => a + 1);
      setEpoch(1);
      return;
    }
    onDone();
  };
  // Gráfico: x = época, y = perda (0 em baixo).
  const W = 300;
  const H = 130;
  const x = (e: number) => 10 + ((e - 1) / (EPOCHS - 1)) * (W - 20);
  const y = (v: number) => H - 10 - Math.min(1, v / 1.0) * (H - 20);
  const line = (f: (e: number) => number) =>
    Array.from({ length: epoch }, (_, i) => `${i ? 'L' : 'M'}${x(i + 1).toFixed(1)},${y(f(i + 1)).toFixed(1)}`).join(' ');
  return (
    <>
      <p className="muted">{t('mg.train')}</p>
      <svg className="train-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('mg.trainChart')}>
        <line x1="10" y1={H - 10} x2={W - 10} y2={H - 10} className="axis" />
        <path d={line(trainLoss)} className="train-line" />
        <path d={line(valLoss)} className="val-line" />
        <circle cx={x(epoch)} cy={y(valLoss(epoch))} r="4" className="val-dot" />
      </svg>
      <div className="train-legend small">
        <span className="legend-train">{t('mg.trainLoss', { v: trainLoss(epoch).toFixed(3) })}</span>
        <span className="legend-val">{t('mg.valLoss', { v: valLoss(epoch).toFixed(3) })}</span>
        <span className="muted">{t('mg.epoch', { n: epoch, total: EPOCHS })}</span>
      </div>
      {message && <p className={`result ${message === 'early' ? '' : 'bad'}`}>{t(message === 'early' ? 'mg.trainEarly' : 'mg.trainOverfit')}</p>}
      <div className="row">
        <button onClick={step}>{t('mg.trainStep')}</button>
        <button className="primary" onClick={save}>
          {t('mg.trainSave')}
        </button>
      </div>
    </>
  );
}

function Sequence({ onDone }: GameProps) {
  const sequence = useMemo(() => Array.from({ length: 4 }, () => Math.floor(Math.random() * 9)), []);
  const [lit, setLit] = useState<number | null>(null);
  const t = useT();
  const [showing, setShowing] = useState(true);
  const [position, setPosition] = useState(0);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setShowing(true);
    setPosition(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    sequence.forEach((cell, i) => {
      timers.push(setTimeout(() => setLit(cell), 500 + i * 650));
      timers.push(setTimeout(() => setLit(null), 500 + i * 650 + 420));
    });
    timers.push(setTimeout(() => setShowing(false), 500 + sequence.length * 650));
    return () => timers.forEach(clearTimeout);
  }, [sequence, attempt]);

  const press = (cell: number) => {
    if (showing) return;
    if (cell !== sequence[position]) return setAttempt((n) => n + 1);
    if (position + 1 === sequence.length) onDone();
    else setPosition(position + 1);
  };

  return (
    <>
      <p className="muted">{showing ? t('mg.seqShow') : t('mg.seqRepeat', { a: position, b: sequence.length })}</p>
      <div className="pad">
        {Array.from({ length: 9 }, (_, cell) => (
          <button key={cell} className={lit === cell ? 'lit' : ''} disabled={showing} onClick={() => press(cell)} />
        ))}
      </div>
    </>
  );
}

function Calibrate({ onDone }: GameProps) {
  const [value, setValue] = useState(0);
  const [hits, setHits] = useState(0);
  const zone = useMemo(() => 25 + Math.random() * 45, [hits]);
  const t = useT();
  useEffect(() => {
    const start = performance.now();
    const timer = setInterval(() => {
      const t = ((performance.now() - start) / 1400) % 2;
      setValue((t < 1 ? t : 2 - t) * 100);
    }, 30);
    return () => clearInterval(timer);
  }, []);
  const fix = () => {
    if (Math.abs(value - zone) > 9) return setHits(0);
    if (hits + 1 === 3) onDone();
    else setHits(hits + 1);
  };
  return (
    <>
      <p className="muted">{t('mg.calibrate', { n: hits })}</p>
      <div className="gauge">
        <div className="gauge-zone" style={{ left: `${zone - 9}%`, width: '18%' }} />
        <div className="gauge-marker" style={{ left: `${value}%` }} />
      </div>
      <button className="primary" onClick={fix}>
        {t('mg.calibrateBtn')}
      </button>
    </>
  );
}

function Transfer({ onDone }: GameProps) {
  const [progress, setProgress] = useState<number | null>(null);
  const t = useT();
  useEffect(() => {
    if (progress === null) return;
    if (progress >= 100) {
      onDone();
      return;
    }
    const timer = setTimeout(() => setProgress(progress + 2), 150);
    return () => clearTimeout(timer);
  }, [progress, onDone]);
  return (
    <>
      <p className="muted">{t('mg.transfer')}</p>
      <div className="progress big">
        <div style={{ width: `${progress ?? 0}%` }} />
      </div>
      <button className="primary" disabled={progress !== null} onClick={() => setProgress(0)}>
        {progress === null ? t('mg.transferBtn') : `${progress}%`}
      </button>
    </>
  );
}

/** Investigar uma evidência: demora uns segundos, durante os quais o Impostor fica exposto. */
function Scan({ onDone }: GameProps) {
  const [progress, setProgress] = useState(0);
  const t = useT();
  useEffect(() => {
    if (progress >= 100) {
      onDone();
      return;
    }
    const timer = setTimeout(() => setProgress(progress + 4), 120);
    return () => clearTimeout(timer);
  }, [progress, onDone]);
  return (
    <>
      <p className="muted">{t('mg.scan')}</p>
      <div className="progress big">
        <div style={{ width: `${progress}%` }} />
      </div>
    </>
  );
}

function Clean({ onDone }: GameProps) {
  const [bad, setBad] = useState(() => new Set(shuffled(Array.from({ length: 16 }, (_, i) => i)).slice(0, 6)));
  const t = useT();
  useEffect(() => {
    if (bad.size === 0) onDone();
  }, [bad, onDone]);
  return (
    <>
      <p className="muted">{t('mg.clean', { n: bad.size })}</p>
      <div className="grid4">
        {Array.from({ length: 16 }, (_, i) => (
          <button
            key={i}
            className={bad.has(i) ? 'bad' : ''}
            disabled={!bad.has(i)}
            onClick={() => {
              const next = new Set(bad);
              next.delete(i);
              setBad(next);
            }}
          />
        ))}
      </div>
    </>
  );
}

function Keypad({ onDone }: GameProps) {
  const code = useMemo(() => String(Math.floor(10000 + Math.random() * 90000)), []);
  const [typed, setTyped] = useState('');
  const t = useT();
  const press = (digit: string) => {
    const next = typed + digit;
    if (!code.startsWith(next)) return setTyped('');
    if (next === code) onDone();
    else setTyped(next);
  };
  return (
    <>
      <p className="muted">{t('mg.keypad')}</p>
      <div className="code-display">
        <strong>{code}</strong>
        <span>{typed.padEnd(5, '·')}</span>
      </div>
      <div className="pad keys">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((digit) => (
          <button key={digit} onClick={() => press(digit)}>
            {digit}
          </button>
        ))}
      </div>
    </>
  );
}

function Switches({ onDone }: GameProps) {
  const t = useT();
  const [on, setOn] = useState(() => {
    const initial = Array.from({ length: 5 }, () => Math.random() < 0.4);
    initial[Math.floor(Math.random() * 5)] = false;
    return initial;
  });
  useEffect(() => {
    if (on.every(Boolean)) onDone();
  }, [on, onDone]);
  return (
    <>
      <p className="muted">{t('mg.switches')}</p>
      <div className="switches">
        {on.map((value, i) => (
          <button
            key={i}
            className={value ? 'on' : ''}
            onClick={() => setOn(on.map((v, j) => (j === i ? !v : v)))}
            aria-label={t('mg.switch', { n: i + 1, state: t(value ? 'mg.on' : 'mg.off') })}
          >
            {value ? 'I' : 'O'}
          </button>
        ))}
      </div>
    </>
  );
}

function Hold({ onPulse }: GameProps) {
  const [held, setHeld] = useState(false);
  const t = useT();
  const pulse = useRef(onPulse);
  pulse.current = onPulse;
  useEffect(() => {
    if (!held) return;
    pulse.current?.();
    const timer = setInterval(() => pulse.current?.(), 700);
    return () => clearInterval(timer);
  }, [held]);
  return (
    <>
      <p className="muted">{t('mg.hold')}</p>
      <button
        className={`hold ${held ? 'held' : ''}`}
        onPointerDown={() => setHeld(true)}
        onPointerUp={() => setHeld(false)}
        onPointerLeave={() => setHeld(false)}
      >
        {held ? t('mg.holding') : t('mg.holdBtn')}
      </button>
    </>
  );
}

const GAMES: Record<MiniGame, (props: GameProps) => React.ReactNode> = {
  sequence: Sequence,
  calibrate: Calibrate,
  transfer: Transfer,
  clean: Clean,
  keypad: Keypad,
  switches: Switches,
  hold: Hold,
  scan: Scan,
  label: Label,
  prompt: Prompt,
  train: Train,
};

export function MiniGameView({ game, ...props }: GameProps & { game: MiniGame }) {
  const Component = GAMES[game];
  return <Component {...props} />;
}
