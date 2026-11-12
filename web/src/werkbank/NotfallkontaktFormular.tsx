import { Feld, HakenFeld } from '../bausteine';
import { t } from '../sprache';
import { NOTFALLKONTAKT_EMAIL_MAX, NOTFALLKONTAKT_NAME_MAX, NOTFALLKONTAKT_NOTIZ_MAX, NOTFALLKONTAKT_TELEFON_MAX, pruefeNotfallkontakt, type NotfallkontaktEingabe } from '../../../shared/src/notfallkontakte';

/**
 * Formular für einen Notfallkontakt (#812) – in Werkbank → Verschlüsselung und im Einrichtungsassistenten (Schritt
 * „Optionales“). Ohne Konto-Kontext, damit der Assistent es vor dem ersten Konto zeigen kann.
 */

export const leererKontakt = (): NotfallkontaktEingabe => ({ name: '', email: '', telefon: '', notiz: '', antwortAn: false });

/** Formular für einen Kontakt. `antwortSperre`: Grund, warum der Haken „Antworten an …“ nicht einschaltbar ist. */
export function KontaktFormular({ wert, setze, antwortSperre, fehler }: { wert: NotfallkontaktEingabe; setze(w: NotfallkontaktEingabe): void; antwortSperre?: string; fehler?: string[] }) {
  return (
    <div className="stapel" data-anker="notfallkontakt.formular">
      <Feld beschriftung={t('werkbank.notfallkontakte.name')}>
        <input value={wert.name} maxLength={NOTFALLKONTAKT_NAME_MAX} autoComplete="off" onChange={(e) => setze({ ...wert, name: e.target.value })} />
      </Feld>
      <Feld beschriftung={t('werkbank.notfallkontakte.email')}>
        <input type="email" value={wert.email} maxLength={NOTFALLKONTAKT_EMAIL_MAX} autoComplete="off" onChange={(e) => setze({ ...wert, email: e.target.value })} />
      </Feld>
      <Feld beschriftung={t('werkbank.notfallkontakte.telefon')} optional>
        <input type="tel" value={wert.telefon} maxLength={NOTFALLKONTAKT_TELEFON_MAX} autoComplete="off" onChange={(e) => setze({ ...wert, telefon: e.target.value })} />
      </Feld>
      <Feld beschriftung={t('werkbank.notfallkontakte.notiz')} hinweis={t('werkbank.notfallkontakte.notiz.hinweis')} optional>
        <input value={wert.notiz} maxLength={NOTFALLKONTAKT_NOTIZ_MAX} autoComplete="off" onChange={(e) => setze({ ...wert, notiz: e.target.value })} />
      </Feld>
      <HakenFeld beschriftung={t('werkbank.notfallkontakte.antwort')} hinweis={antwortSperre ?? t('werkbank.notfallkontakte.antwort.hinweis')}>
        <input type="checkbox" checked={wert.antwortAn} disabled={!!antwortSperre && !wert.antwortAn} onChange={(e) => setze({ ...wert, antwortAn: e.target.checked })} />
      </HakenFeld>
      {fehler && fehler.length > 0 && <div className="hinweis schlecht" role="alert">{fehler.map((f) => <p key={f}>{f}</p>)}</div>}
    </div>
  );
}

/** Fehler der Eingabe schon im Browser – dieselbe Prüfung wie auf dem Server. */
export const eingabeFehler = (w: NotfallkontaktEingabe) => pruefeNotfallkontakt(w).fehler.map((f) => t.frei(`meldungen.notfallkontakte.${f}`));
