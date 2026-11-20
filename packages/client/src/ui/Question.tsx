import type { RoundView, View } from '@amongai/shared';
import { useT } from '../i18n';

/**
 * A pergunta da ronda com as opções. Os Impostores veem o seu objetivo marcado a vermelho;
 * quem da Equipa encontrou a evidência da ronda vê assinalada a opção que eles querem (só ele a vê).
 */
export function Question({ round, compact = false }: { round: RoundView; compact?: boolean }) {
  const t = useT();
  return (
    <div className={`question ${compact ? 'question-compact' : ''}`}>
      <div className="question-text">{round.question}</div>
      <ol className="question-options">
        {round.options.map((option, i) => {
          const goal = round.goal?.includes(i);
          const hint = round.hints.includes(i);
          return (
            <li key={i} className={`${goal ? 'goal' : ''} ${hint ? 'excluded' : ''}`}>
              <span className="option-letter">{letter(i)}</span>
              <span className="option-text">{option}</span>
              {goal && <span className="tag tag-impostor">{t('q.goal')}</span>}
              {hint && <span className="tag tag-clue">{t('q.clueGoal')}</span>}
            </li>
          );
        })}
      </ol>
      {round.hints.length > 0 && <div className="question-note">{t('q.hintsPrivate')}</div>}
    </div>
  );
}

export function letter(i: number): string {
  return String.fromCharCode(65 + i);
}

/** Contador de decisões a favor dos Impostores («1/3»), ou só o número quando não há limite. */
export function BadDecisions({ value }: { value: View['badDecisions'] }) {
  const t = useT();
  if (!value) return null;
  const { count, limit } = value;
  return (
    <div className={`bad-decisions ${limit > 0 && count >= limit - 1 && count > 0 ? 'danger' : ''}`}>
      <span className="muted small">{t('q.badDecisions')}</span>
      <strong>{limit > 0 ? `${count}/${limit}` : count}</strong>
      {limit > 0 && (
        <span className="bad-pips" aria-hidden="true">
          {Array.from({ length: limit }, (_, i) => (
            <span key={i} className={i < count ? 'on' : ''} />
          ))}
        </span>
      )}
    </div>
  );
}
