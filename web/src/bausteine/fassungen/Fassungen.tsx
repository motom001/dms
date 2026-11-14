import { useCallback, useEffect, useState } from 'react';
import { ZUSAMMENFASSEN_MIN, type FassungArt, type FassungEintrag, type FassungsListe, type FassungsVorschau, type GeloeschterEintrag } from '../../../../shared/src/fassungen';
import { gebietsschema } from '../../../../shared/src/sprache';
import { api, ApiFehler } from '../../api';
import { rueckfrage } from '../../rueckfrage';
import { t } from '../../sprache';
import { Bereich, type Klappe } from '../bereiche/Bereiche';
import { Knopf } from '../knopf/Knopf';
import { Eintragsliste, type Listeneintrag } from './Eintragsliste';
import s from './Fassungen.module.css';

/**
 * Baustein Fassungen (#1006): der Bereich „Fassungen“ in jedem Editor der Werkbank, der Fassungen hat – Mappentyp,
 * Ansicht, Nummernkreis, Stempel-Vorlage, Postfach, Paket-Einstellungen, Automatisierung. Liste wie die Historie einer
 * Mappe (wann, wer, lesbare Änderungen), zwei Fassungen vergleichen, „Diese Fassung wiederherstellen“ mit Rückfrage,
 * die vorher sagt, was sich ändert und worauf zu achten ist. Was der Server beim normalen Speichern nachfragt (z. B.
 * „danach darf niemand lesen“), fragt der Baustein ebenso nach. Anleitung im Entwicklerhandbuch, „Bausteine → Fassungen“.
 */

const zeit = (iso: string) => new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'short', timeStyle: 'short' });

export interface FassungenProps {
  art: FassungArt;
  /** Id bzw. Kennung des Eintrags. */
  eintrag: string;
  klappe: Klappe;
  /** Ändert sich mit jedem Speichern des Eintrags (z. B. `geaendert` oder `version`) – dann lädt die Liste neu. */
  stand?: unknown;
  /** Nach dem Wiederherstellen: den Eintrag neu laden. */
  nachher: () => void | Promise<void>;
  /** Anker und Sprungziel; Vorgabe `fassungen`. */
  id?: string;
  /** Titel des Bereichs; Vorgabe „Fassungen“ (die Musterseite braucht eigene Namen, axe: eindeutige Landmarken). */
  titel?: string;
  /** Woher die Fassungen kommen; Vorgabe die API. Die Musterseite und Tests reichen eine eigene Quelle herein. */
  quelle?: FassungenQuelle;
}

/** Die Schnittstellen der Fassungen (#1006) – je Gegenstand unter der Adresse seines Eintrags. */
export interface FassungenQuelle {
  liste(art: FassungArt, eintrag: string): Promise<FassungsListe>;
  vergleich(art: FassungArt, eintrag: string, von: number, bis: number): Promise<{ von: number; bis: number; aenderungen: string[] }>;
  vorschau(art: FassungArt, eintrag: string, nr: number): Promise<FassungsVorschau>;
  wiederherstellen(art: FassungArt, eintrag: string, nr: number, e: { stand: string | null; bestaetigt?: boolean; doppelteBestaetigt?: boolean; adresseBestaetigt?: boolean }): Promise<FassungsListe>;
  geloescht(arten: FassungArt[]): Promise<GeloeschterEintrag[]>;
}
const API: FassungenQuelle = {
  liste: (a, e) => api.fassungen(a, e), vergleich: (a, e, v, b) => api.fassungenVergleich(a, e, v, b), vorschau: (a, e, n) => api.fassungVorschau(a, e, n),
  wiederherstellen: (a, e, n, x) => api.fassungWiederherstellen(a, e, n, x), geloescht: (arten) => api.fassungenGeloescht(arten),
};

/** Text einer Änderungsliste: kurz für die Zeile, ganz für das Aufgeklappte. */
const kurzText = (f: FassungEintrag) => (f.aenderungen.length ? f.aenderungen.slice(0, 2).join(' · ') + (f.aenderungen.length > 2 ? ' …' : '') : t('oberflaeche.fassungen.keine'));

/** Rückfragen des normalen Speicherns (409 mit Angabe), die das Wiederherstellen ebenso bestätigen lässt. */
function bestaetigung(f: ApiFehler): 'bestaetigt' | 'doppelteBestaetigt' | 'adresseBestaetigt' | null {
  const d = (f.details ?? {}) as { niemand?: unknown; zusammengesetzt?: unknown; adresse?: unknown };
  if (f.status !== 409) return null;
  return d.niemand ? 'bestaetigt' : d.zusammengesetzt ? 'doppelteBestaetigt' : d.adresse ? 'adresseBestaetigt' : null;
}

export function Fassungen({ art, eintrag, klappe, stand, nachher, id = 'fassungen', titel, quelle = API }: FassungenProps) {
  const [liste, setListe] = useState<FassungsListe | null>(null);
  const [fehler, setFehler] = useState<string>();
  const [meldung, setMeldung] = useState<string>();
  const [wahl, setWahl] = useState<number[]>([]);
  const [vergleich, setVergleich] = useState<{ von: number; bis: number; aenderungen: string[] } | null>(null);
  const laden = useCallback(() => quelle.liste(art, eintrag).then((l) => { setListe(l); setFehler(undefined); }, (e: Error) => setFehler(e.message)), [art, eintrag, quelle]);
  useEffect(() => { void laden(); }, [laden, stand]);

  // Zwei gewählt: vergleichen, ältere zuerst.
  useEffect(() => {
    if (wahl.length !== 2) { setVergleich(null); return; }
    const [von, bis] = [...wahl].sort((a, b) => a - b);
    quelle.vergleich(art, eintrag, von, bis).then(setVergleich, (e: Error) => setFehler(e.message));
  }, [wahl, art, eintrag, quelle]);

  const waehle = (nr: number) => setWahl((w) => (w.includes(nr) ? w.filter((x) => x !== nr) : [...w.slice(-1), nr]));

  async function wiederherstellen(f: FassungEintrag) {
    setMeldung(undefined); setFehler(undefined);
    const v = await quelle.vorschau(art, eintrag, f.nr);
    if (!v.aenderungen.length) { setMeldung(t('oberflaeche.fassungen.schon-aktuell')); return; }
    const ja = await rueckfrage({
      titel: t('oberflaeche.fassungen.frage', { nr: f.nr }),
      text: <>
        <p>{t('oberflaeche.fassungen.aendert-sich')}</p>
        <ul>{v.aenderungen.map((x) => <li key={x}>{x}</li>)}</ul>
        {v.hinweise.length > 0 && <><p><strong>{t('oberflaeche.fassungen.beachten')}</strong></p><ul>{v.hinweise.map((x) => <li key={x}>{x}</li>)}</ul></>}
        <p className="leise">{t('oberflaeche.fassungen.nichts-verloren')}</p>
      </>,
      ja: t('oberflaeche.fassungen.ja'), gefahr: v.hinweise.length > 0,
    });
    if (!ja) return;
    const e: Parameters<FassungenQuelle['wiederherstellen']>[3] = { stand: v.stand };
    for (;;) {
      try {
        setListe(await quelle.wiederherstellen(art, eintrag, f.nr, e));
        setWahl([]);
        setMeldung(t('oberflaeche.fassungen.erledigt', { nr: f.nr }));
        await nachher();
        return;
      } catch (err) {
        const x = err as ApiFehler;
        const was = x instanceof ApiFehler ? bestaetigung(x) : null;
        if (was && !e[was] && await rueckfrage({ titel: t('oberflaeche.fassungen.trotzdem'), text: x.message, ja: t('oberflaeche.fassungen.ja'), gefahr: true })) { e[was] = true; continue; }
        // Inzwischen gespeichert (#917): die neue Liste zeigen, nichts überschrieben.
        if (x instanceof ApiFehler && (x.details as { konflikt?: boolean } | undefined)?.konflikt) await laden();
        setFehler(x.message);
        return;
      }
    }
  }

  const eintraege: Listeneintrag[] = (liste?.fassungen ?? []).map((f) => ({
    id: f.nr, wann: zeit(f.bis), wer: f.wer,
    was: <><strong>{t('oberflaeche.fassungen.fassung', { nr: f.nr })}</strong>: {kurzText(f)}</>,
    zustand: f.aktuell ? <span className="chip gut">{t('oberflaeche.fassungen.aktuell')}</span>
      : f.geloescht ? <span className="chip schlecht">{t('oberflaeche.fassungen.geloescht')}</span>
      : f.wiederhergestellt ? <span className="chip">{t('oberflaeche.fassungen.aus', { nr: f.wiederhergestellt })}</span> : undefined,
    mehr: f.aenderungen.length > 1 ? t('oberflaeche.fassungen.aenderungen', { anzahl: f.aenderungen.length }) : undefined,
    inhalt: <div className={s.inhalt}>
      {f.zeit !== f.bis && <p className="leise klein">{t('oberflaeche.fassungen.zeitraum', { von: zeit(f.zeit), bis: zeit(f.bis) })}</p>}
      {f.aenderungen.length > 0 && <ul className={s.aenderungen}>{f.aenderungen.map((x, i) => <li key={i}>{x}</li>)}</ul>}
      {f.geloescht && <p className="leise">{t('oberflaeche.fassungen.geloescht-am', { zeit: zeit(f.geloescht.zeit), wer: f.geloescht.wer })}</p>}
      <div className="knoepfe">
        {(liste?.fassungen.length ?? 0) > 1 && <Knopf groesse="klein" art="link" aria-pressed={wahl.includes(f.nr)} onClick={() => waehle(f.nr)}>
          {wahl.includes(f.nr) ? t('oberflaeche.fassungen.abwaehlen') : t('oberflaeche.fassungen.waehlen')}</Knopf>}
        {!f.aktuell && !liste?.fassungen[0]?.geloescht && <Knopf groesse="klein" onClick={() => wiederherstellen(f)}>{t('oberflaeche.fassungen.wiederherstellen')}</Knopf>}
      </div>
    </div>,
  }));
  const neueste = liste?.fassungen[0];

  return (
    <Bereich id={id} titel={titel ?? t('oberflaeche.fassungen.titel')} klappe={klappe}
      beschreibung={t('oberflaeche.fassungen.beschreibung', { minuten: ZUSAMMENFASSEN_MIN })}
      kurz={neueste ? t('oberflaeche.fassungen.kurz', { anzahl: liste!.gesamt, zeit: zeit(neueste.bis), wer: neueste.wer }) : undefined}>
      {fehler && <p className="fehlertext" role="alert">{fehler}</p>}
      {meldung && <p className="hinweis gut" role="status">{meldung}</p>}
      {wahl.length === 1 && <p className="leise" role="status">{t('oberflaeche.fassungen.zweite')}</p>}
      {vergleich && (
        <div className={s.vergleich} role="region" aria-label={t('oberflaeche.fassungen.vergleich', { von: vergleich.von, bis: vergleich.bis })}>
          <h3 className="h4">{t('oberflaeche.fassungen.vergleich', { von: vergleich.von, bis: vergleich.bis })}</h3>
          {vergleich.aenderungen.length ? <ul className={s.aenderungen}>{vergleich.aenderungen.map((x, i) => <li key={i}>{x}</li>)}</ul> : <p className="leise">{t('oberflaeche.fassungen.gleich')}</p>}
          <Knopf groesse="klein" art="link" onClick={() => setWahl([])}>{t('oberflaeche.fassungen.schliessen')}</Knopf>
        </div>
      )}
      {!liste ? !fehler && <p className="leise">{t('oberflaeche.fassungen.lade')}</p>
        : !liste.fassungen.length ? <p className="leise">{t('oberflaeche.fassungen.leer')}</p>
        : <Eintragsliste eintraege={eintraege} />}
      {liste && liste.gesamt > liste.fassungen.length && <p className="leise klein">{t('oberflaeche.fassungen.mehr', { anzahl: liste.fassungen.length, gesamt: liste.gesamt })}</p>}
    </Bereich>
  );
}

/**
 * Gelöschte Einträge eines Gegenstands (#1006): je Eintrag die letzte Fassung mit Löschvermerk – für den Nachweis, z. B.
 * in der Verfahrensdokumentation. Unter der Liste der Werkbank; nichts, solange nichts gelöscht ist.
 */
export function GeloeschteEintraege({ art, quelle = API }: { art: FassungArt; quelle?: FassungenQuelle }) {
  const [liste, setListe] = useState<GeloeschterEintrag[]>([]);
  useEffect(() => { quelle.geloescht([art]).then(setListe, () => setListe([])); }, [art, quelle]);
  if (!liste.length) return null;
  return (
    <details className={s.geloescht}>
      <summary>{t('oberflaeche.fassungen.geloeschte', { anzahl: liste.length })}</summary>
      <ul>
        {liste.map((x) => (
          <li key={`${x.art}|${x.eintrag}`}>
            <strong>{x.name || x.eintrag}</strong>{' '}
            <span className="leise">{t('oberflaeche.fassungen.geloescht-eintrag', { zeit: zeit(x.geloescht.zeit), wer: x.geloescht.wer, nr: x.nr })}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
