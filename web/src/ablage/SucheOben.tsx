import { useEffect } from 'react';
import { SUCHE_PFAD } from '../../../shared/src/erweitertesuche';
import { api } from '../api';
import { HakenFeld, KopfSuche } from '../bausteine';
import { useDaten } from '../daten';
import { geheZu, Link, useOrt } from '../ort';
import { t } from '../sprache';
import { kopfsuche, useKopfsuche } from './kopfsuche';

/**
 * Suchfeld in der Kopfzeile (#1218), auf jeder Seite der Ablage gleich (Baustein `KopfSuche`):
 *
 * - **Ohne Bereich** führt Enter in die erweiterte Suche: der Begriff im Volltext (Titel und Felder, Dokumente,
 *   Notizen), die Treffer kommen sofort. In der erweiterten Suche selbst ersetzt Enter nur den Begriff.
 * - **In einer Ansicht** zeigt das Feld den Bereich als Chip; Tippen filtert die Liste in der Mitte sofort (Stand in
 *   `kopfsuche.ts`). „Suchen in ▾“: Titel und Felder (immer), Text der Dokumente und Notizen – gemerkt wie bisher
 *   (`suche_volltext`, `suche_notizen`); darunter „Mehr Filter …“ in die erweiterte Suche mit dem Mappentyp der Ansicht.
 * - Eine **Archivnummer** mit Enter springt wie bisher zum Dokument (#345).
 */
const istArchivnummer = (x: string) => !!x && !/\s/.test(x) && /\d/.test(x) && x.length <= 50;

export function SucheOben() {
  const s = useKopfsuche();
  const d = useDaten();
  const { pfad } = useOrt();
  const b = s.bereich;
  // Auf eine andere Seite ohne Liste: Das Feld beginnt leer. In einer Ansicht bleibt der Text, wenn man eine Mappe
  // öffnet; eine neue Liste leert es beim Anmelden selbst.
  useEffect(() => { if (!pfad.startsWith(SUCHE_PFAD) && !kopfsuche.jetzt().bereich) kopfsuche.setzeText(''); }, [pfad]);

  async function enter(wert: string) {
    const text = wert.trim();
    if (!text) return;
    if (istArchivnummer(text)) {
      try {
        const r = await api.archivnummer(text);
        kopfsuche.setzeText('');
        geheZu(`/ablage/${r.typId}/${r.mappeId}?register=${encodeURIComponent(r.dokument.registerKey)}&dokument=${r.dokument.id}`);
        return;
      } catch { /* keine Archivnummer: weiter wie sonst */ }
    }
    if (b) return;
    // In der erweiterten Suche bleiben Mappentypen, Bedingungen und „in“; sonst beginnt sie neu.
    const q = location.pathname.startsWith(SUCHE_PFAD) ? new URLSearchParams(location.search) : new URLSearchParams();
    q.set('volltext', text);
    geheZu(`${SUCHE_PFAD}?${q.toString()}`);
  }

  const volltext = d.einstellungen.suche_volltext === true;
  const notizen = d.einstellungen.suche_notizen === true;
  const mehr = new URLSearchParams();
  if (b?.typ) mehr.set('typ', b.typ);
  if (s.text.trim()) mehr.set('volltext', s.text.trim());
  const suchenIn = b && {
    text: t('ablage.kopfsuche.suchen-in'),
    inhalt: <>
      <HakenFeld beschriftung={t('ablage.kopfsuche.in-feldern')} hinweis={t('ablage.kopfsuche.in-feldern.immer')} className="klein">
        <input type="checkbox" checked disabled />
      </HakenFeld>
      <HakenFeld beschriftung={t('ablage.kopfsuche.in-dokumenten')} className="klein">
        <input type="checkbox" checked={volltext} onChange={(e) => d.setzeEinstellung('suche_volltext', e.target.checked || null)} />
      </HakenFeld>
      <HakenFeld beschriftung={t('ablage.kopfsuche.in-notizen')} className="klein">
        <input type="checkbox" checked={notizen} onChange={(e) => d.setzeEinstellung('suche_notizen', e.target.checked || null)} />
      </HakenFeld>
      <Link to={`${SUCHE_PFAD}${mehr.toString() ? `?${mehr.toString()}` : ''}`} className="verweis sucheoben-mehr">{t('ablage.kopfsuche.mehr-filter')}</Link>
    </>,
  };

  return (
    <KopfSuche wert={s.text} setze={kopfsuche.setzeText} anker="startseite.suche" onEnter={(w) => void enter(w)}
      beschriftung={b ? t('ablage.kopfsuche.bereich-beschriftung', { name: b.name }) : t('ablage.kopfsuche.beschriftung')}
      platzhalter={b ? t('ablage.kopfsuche.bereich-platzhalter', { name: b.name }) : t('ablage.kopfsuche.platzhalter')}
      bereich={b ? { text: t('ablage.kopfsuche.chip', { name: b.name }), weg: kopfsuche.bereichWeg } : null}
      suchenIn={suchenIn || null} />
  );
}
