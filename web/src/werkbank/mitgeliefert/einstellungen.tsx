import type { ReactNode } from 'react';
import { SuchePanel } from '../SucheEinstellungen';
import { TexterkennungPanel, type TexterkennungZustand } from '../Texterkennung';
import { AutomatischVerkleinern } from '../Verkleinern';

/**
 * Einstellungen auf der Seite eines mitgelieferten Anbieters (#1570) – umgezogen aus den früheren Bereichen, sonst
 * unverändert: „Text aus PDF und Texterkennung“ nimmt „Suche und Volltext“ auf, die Archivfassung und die anderen
 * Dateitypen ihre Abschnitte daraus, „PDF bearbeiten“ „Neue PDFs automatisch verkleinern“ (vorher Systemzustand).
 * Briefsatz und E-Rechnung haben nichts einzustellen (`undefined`).
 */
export function mitgeliefertEinstellungen(id: string, ocr: TexterkennungZustand, wartungAn: boolean): ReactNode | undefined {
  switch (id) {
    case 'ablago.text':
      return (
        <>
          <TexterkennungPanel t={ocr} wartungAn={wartungAn} />
          <SuchePanel />
        </>
      );
    case 'ablago.archiv':
      return <TexterkennungPanel t={ocr} teil="archiv" />;
    case 'ablago.umwandeln':
      return <TexterkennungPanel t={ocr} teil="umwandeln" />;
    case 'ablago.pdf':
      return <AutomatischVerkleinern />;
    default:
      return undefined;
  }
}

/** Braucht die Seite den Stand der Texterkennung (`useTexterkennung`)? */
export const brauchtTexterkennung = (id: string | undefined) => id === 'ablago.text' || id === 'ablago.archiv' || id === 'ablago.umwandeln';
