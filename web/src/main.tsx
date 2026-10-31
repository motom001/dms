import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { DatenProvider } from './daten';
import { KontoProvider } from './konto';
import './styles.css';
import { starteSammler } from './diagnose';
import { starteErreichbarkeit } from './erreichbar';
import { Rueckfragen } from './rueckfrage';

starteSammler();
starteErreichbarkeit();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <KontoProvider>
      <DatenProvider>
        <App />
      </DatenProvider>
    </KontoProvider>
    {/* Rückfragen (#355) – außerhalb der Anmeldung, damit auch Einrichtung und Wiederherstellen sie haben. */}
    <Rueckfragen />
  </StrictMode>,
);
