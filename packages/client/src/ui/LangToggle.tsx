import { LANGS } from '@amongai/shared';
import { setLang, useT } from '../i18n';
import { useStore } from '../store';

/** Botão PT / EN fixo no canto superior direito, em todos os ecrãs. */
export function LangToggle() {
  const lang = useStore((s) => s.lang);
  const t = useT();
  return (
    <div className="lang-toggle" role="group" aria-label={t('lang.label')}>
      {LANGS.map((l) => (
        <button
          key={l}
          className={l === lang ? 'active' : ''}
          aria-pressed={l === lang}
          onClick={() => l !== lang && setLang(l)}
          // Não deixa o botão ficar com o foco: as teclas do jogo (espaço, E) não o devem ativar.
          onMouseDown={(e) => e.preventDefault()}
          tabIndex={-1}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
