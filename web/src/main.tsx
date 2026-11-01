import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { DatenProvider } from './daten';
import { KontoProvider } from './konto';
import './styles.css';
import { starteSammler } from './diagnose';
import { starteErreichbarkeit } from './erreichbar';
import { Rueckfragen } from './rueckfrage';
import { Abrufseite } from './abruf';

const wurzel = createRoot(document.getElementById('root')!);

if (location.pathname === '/abruf') {
  // Öffentliche Abrufseite einer Auskunft (#455): eigenständig – ohne Anmeldung, Kontostatus und Diagnose.
  wurzel.render(<StrictMode><Abrufseite /></StrictMode>);
} else {
  starteSammler();
  starteErreichbarkeit();
  wurzel.render(
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
}
