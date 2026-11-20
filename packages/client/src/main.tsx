import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { setLang } from './i18n';
import { getState, tryResume } from './store';
import './styles.css';

// Aplica a língua guardada ao título e ao atributo lang da página.
setLang(getState().lang);
void tryResume();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
