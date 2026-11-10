import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useDaten } from '../daten';
import { rueckfrage } from '../rueckfrage';
import { BenutzerWahl } from './Aufgaben';
import { t, tn } from '../sprache';

/**
 * Mehrere Aufgaben auf einmal weitergeben (#415, #419) – eine Komponente für Werkbank → Aufgaben und
 * Profil → Abwesenheit, beide über dieselbe Sammel-API (POST /api/aufgaben/weitergeben).
 * Ausgewählt ist nur, was gerade angezeigt wird: Ändert sich der Filter, zählt die Auswahl nur die sichtbaren.
 */
export function useSammelauswahl(angezeigt: string[]) {
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(new Set());
  const schluessel = angezeigt.join('|');
  const sichtbar = useMemo(() => new Set(angezeigt), [schluessel]); // eslint-disable-line react-hooks/exhaustive-deps -- Auswahl als Schlüssel verglichen, nicht als neues Feld bei jedem Zeichnen
  const aktiv = angezeigt.filter((id) => gewaehlt.has(id));
  return {
    aktiv, angezeigt,
    ist: (id: string) => gewaehlt.has(id) && sichtbar.has(id),
    umschalten: (id: string, an: boolean) => setGewaehlt((g) => { const n = new Set(g); if (an) n.add(id); else n.delete(id); return n; }),
    alle: (an: boolean) => setGewaehlt((g) => { const n = new Set(g); for (const id of angezeigt) { if (an) n.add(id); else n.delete(id); } return n; }),
    ohne: (ids: string[]) => setGewaehlt((g) => { const n = new Set(g); for (const id of ids) n.delete(id); return n; }),
    leeren: () => setGewaehlt(new Set()),
  };
}
export type Sammelauswahl = ReturnType<typeof useSammelauswahl>;

const aufgaben = (n: number) => (t('ablage.sammelweitergabe.aufgaben', { anzahl: n }));

/** Kästchen „alle angezeigten auswählen“ mit Anzeige „12 ausgewählt“. */
export function SammelKopf({ s }: { s: Sammelauswahl }) {
  const n = s.aktiv.length, gesamt = s.angezeigt.length;
  if (!gesamt) return null;
  return (
    <label className="haken sammel-kopf">
      <input type="checkbox" className="wahlhaken" checked={n > 0 && n === gesamt}
        ref={(el) => { if (el) el.indeterminate = n > 0 && n < gesamt; }}
        onChange={(e) => s.alle(e.target.checked)} />
      <span>{tn('ablage.sammelweitergabe.alle-angezeigten-auswaehlen', { wert: n > 0 && <span className="leise"> {' '}{t('ablage.sammelweitergabe.ausgewaehlt', { n })}</span> })}</span>
    </label>
  );
}

/** Kästchen je Aufgabe. */
export function SammelHaken({ s, id, titel }: { s: Sammelauswahl; id: string; titel: string }) {
  return <input type="checkbox" className="wahlhaken" checked={s.ist(id)} aria-label={t('ablage.sammelweitergabe.auswaehlen', { titel })} onChange={(e) => s.umschalten(id, e.target.checked)} />;
}

/**
 * Leiste bei einer Auswahl: „Ausgewählte weitergeben an [Person] [Weitergeben]“, „Auswahl aufheben“ und
 * – wo erlaubt – „Als erledigt markieren“. Danach eine Meldung, was ging und was nicht (mit Grund).
 */
export function SammelLeiste({ s, titel, vorschlag, ohne, erledigen, nachher }: {
  s: Sammelauswahl;
  /** Titel einer Aufgabe für Rückfrage und Meldung. */
  titel: (id: string) => string;
  /** Vorausgewähltes Ziel, z. B. der eingetragene Vertreter (#419). */
  vorschlag?: string | null;
  /** Nicht als Ziel anbieten (z. B. sich selbst). */
  ohne?: string | null;
  erledigen?: boolean;
  nachher: () => Promise<void>;
}) {
  const d = useDaten();
  const [ziel, setZiel] = useState(vorschlag ?? '');
  useEffect(() => { if (vorschlag) setZiel((z) => z || vorschlag); }, [vorschlag]);
  const [sendet, setSendet] = useState(false);
  const [meldung, setMeldung] = useState<{ text: string; nicht: Array<{ id: string; grund: string }>; fehler?: boolean }>();
  const n = s.aktiv.length;
  const name = d.personen.find((p) => p.id === ziel)?.name ?? '';

  async function tu(frage: { titel: string; text: string; ja: string }, f: (ids: string[]) => Promise<{ ok: string[]; nicht: Array<{ id: string; grund: string }> }>, gut: (k: number) => string) {
    const ids = [...s.aktiv];
    if (!(await rueckfrage(frage))) return;
    setSendet(true); setMeldung(undefined);
    try {
      const r = await f(ids);
      // Was ging, fällt aus der Auswahl; was nicht ging, bleibt gewählt – für einen zweiten Versuch mit anderem Ziel.
      s.ohne(r.ok);
      setMeldung({ text: r.ok.length ? gut(r.ok.length) : t('ablage.sammelweitergabe.nichts-geaendert'), nicht: r.nicht });
      await nachher();
    } catch (e) { setMeldung({ text: (e as Error).message, nicht: [], fehler: true }); }
    finally { setSendet(false); }
  }

  const weitergeben = () => void tu(
    { titel: t('ablage.sammelweitergabe.an-weitergeben', { aufgaben: aufgaben(n), name }), text: t('ablage.sammelweitergabe.jede-weitergabe-steht-in', { name }), ja: t('ablage.sammelweitergabe.weitergeben') },
    async (ids) => { const r = await api.aufgabenWeitergeben(ids, ziel); return { ok: r.weitergegeben, nicht: r.nicht }; },
    (k) => t('ablage.sammelweitergabe.an-weitergegeben', { aufgaben: aufgaben(k), name }),
  );
  const erledigt = () => void tu(
    { titel: t('ablage.sammelweitergabe.als-erledigt-markieren', { aufgaben: aufgaben(n) }), text: t('ablage.sammelweitergabe.passt-nicht-aufgaben-erledigen'), ja: t('ablage.sammelweitergabe.erledigt') },
    async (ids) => { const r = await api.aufgabenErledigen(ids); return { ok: r.erledigt, nicht: r.nicht }; },
    (k) => `${aufgaben(k)} erledigt.`,
  );

  return (
    <>
      {n > 0 && (
        <div className="aktionsleiste sammel-leiste" role="region" aria-label={t('ablage.sammelweitergabe.auswahl')}>
          <span className="klein">{tn('ablage.sammelweitergabe.ausgewaehlt-2', { b: <strong>{n}</strong> })}{' '}<button type="button" className="textknopf klein" onClick={s.leeren}>{t('ablage.sammelweitergabe.auswahl-aufheben')}</button></span>
          <span className="sammel-ziel">
            <span className="klein">{t('ablage.sammelweitergabe.ausgewaehlte-weitergeben-an')}</span>
            <BenutzerWahl label={t('ablage.sammelweitergabe.ausgewaehlte-weitergeben-an')} wert={ziel} setze={setZiel} ohne={ohne} />
            <button type="button" className="knopf klein primaer" disabled={!ziel || sendet} onClick={weitergeben}>{t('ablage.sammelweitergabe.weitergeben')}</button>
          </span>
          {erledigen && <button type="button" className="knopf klein" disabled={sendet} onClick={erledigt}>{t('ablage.sammelweitergabe.als-erledigt-markieren-2')}</button>}
        </div>
      )}
      {meldung && (
        <div className={`hinweis ${meldung.fehler ? 'schlecht' : meldung.nicht.length ? 'warn' : 'info'}`} role="status">
          <p>{meldung.text}{meldung.nicht.length > 0 && t('ablage.sammelweitergabe.gingen-nicht', { anzahl: meldung.nicht.length })}</p>
          {meldung.nicht.length > 0 && <ul className="klein">{meldung.nicht.slice(0, 50).map((x) => <li key={x.id}>{titel(x.id)}: {x.grund}</li>)}{meldung.nicht.length > 50 && <li>{t('ablage.sammelweitergabe.und-weitere', { wert: meldung.nicht.length - 50 })}</li>}</ul>}
          <button type="button" className="textknopf klein" onClick={() => setMeldung(undefined)}>{t('ablage.sammelweitergabe.ausblenden')}</button>
        </div>
      )}
    </>
  );
}
