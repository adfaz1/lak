import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Core styles load first so surface styles can refine them.
import './core/styles.css';
import { App } from './App';
import { LangProvider } from './core/lang';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LangProvider>
      <App />
    </LangProvider>
  </StrictMode>,
);
