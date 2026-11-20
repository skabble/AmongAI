import { useState } from 'react';
import { useT } from '../i18n';
import { createRoom, joinRoom, useStore } from '../store';

const NAME_KEY = 'desalinhados:nome';

function initialName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function Home({ connecting }: { connecting: boolean }) {
  const error = useStore((s) => s.error);
  const t = useT();
  const [name, setName] = useState(initialName);
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get('sala')?.toUpperCase() ?? '');

  const remember = () => {
    try {
      localStorage.setItem(NAME_KEY, name.trim());
    } catch {
      // sem armazenamento local: o nome não fica guardado
    }
  };
  // Um só botão, que depende do código: vazio cria uma sala, completo entra nessa sala.
  const joining = code.length > 0;
  const codeComplete = code.length === 5;
  const ready = name.trim().length > 0 && !connecting && (!joining || codeComplete);
  const label = !joining ? t('home.create') : codeComplete ? t('home.joinCode', { code }) : t('home.codeIncomplete');

  return (
    <main className="center">
      <form
        className="card home"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ready) return;
          remember();
          void (joining ? joinRoom(code, name.trim()) : createRoom(name.trim()));
        }}
      >
        <h1>{t('app.title')}</h1>
        <p className="muted">{t('home.tagline')}</p>
        <label>
          {t('home.nickname')}
          <input value={name} maxLength={16} onChange={(e) => setName(e.target.value)} placeholder={t('home.nicknamePh')} autoFocus={!name} />
        </label>
        <label>
          {t('home.code')}
          <span className="row">
            <input
              className="code-input"
              value={code}
              maxLength={5}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
              placeholder={t('home.codePh')}
              autoFocus={!!name && !code}
            />
            {joining && (
              <button type="button" className="ghost" onClick={() => setCode('')} aria-label={t('home.clearCode')}>
                ✕
              </button>
            )}
          </span>
          <span className="muted small">{t('home.codeHelp')}</span>
        </label>
        <button type="submit" className="primary home-go" disabled={!ready}>
          {label}
        </button>
        {connecting && <p className="muted">{t('home.connecting')}</p>}
        {error && <p className="error">{t(error)}</p>}
      </form>
    </main>
  );
}
