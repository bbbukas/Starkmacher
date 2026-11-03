import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/fraunces/full.css';
import '@fontsource-variable/nunito';
import './styles.css';
import { App } from './App';
import { DatenProvider } from './daten/DatenKontext';
import { MeldungenProvider } from './komponenten/Meldungen';

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <MeldungenProvider>
      <DatenProvider>
        <App />
      </DatenProvider>
    </MeldungenProvider>
  </StrictMode>,
);
