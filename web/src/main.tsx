import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { DatenProvider } from './daten';
import { KontoProvider } from './konto';
import './styles.css';
import { starteSammler } from './diagnose';
import { starteErreichbarkeit } from './erreichbar';

starteSammler();
starteErreichbarkeit();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <KontoProvider>
      <DatenProvider>
        <App />
      </DatenProvider>
    </KontoProvider>
  </StrictMode>,
);
