import { useEffect, useRef, useState, type ReactNode } from 'react';
import { feldLabel } from '../../../shared/src/beschriftung';
import { rechtsbuendig } from '../../../shared/src/feldarten';
import { darfErstellen, type Feld, type Mappe, type Mappentyp, type Sortierung } from '../../../shared/src/model';
import { TABELLE_SEITE, tabelleNeuText } from '../../../shared/src/tabelle';
import { mappenApi, type Bezuege } from '../api/mappen';
import { Knopf, Tabelle } from '../bausteine';
import { useDaten } from '../daten';
import { gebietsschema } from '../../../shared/src/sprache';
import { titelOder } from '../seiten';
import { t } from '../sprache';
import { spaltenName, zelle } from './spalten';
import { VerweisFenster } from './VerweisFenster';
import s from './Tabellenfeld.module.css';

/**
 * Feldart Tabelle (#1030) in der Mappe: die Mappen des anderen Typs, die über das Verweisfeld der Quelle hierher
 * verweisen – mit den Spalten seiner Trefferliste, sortiert wie dort, je 50 mit „weitere anzeigen“. Klick öffnet die
 * Mappe. Darunter „+ Neu“ (Beschriftung aus dem Typ, z. B. „+ Position“) nur mit Anlegerecht am anderen Typ: Es öffnet
 * die neue Mappe im Fenster (#935) mit dem Verweis auf diese Mappe; nach dem Speichern steht sie in der Tabelle.
 *
 * Zeilen und Zahl liefert der Server nur aus Mappen, die die Person lesen darf. Keine Summen – Rechnen ist Sache von
 * Paketen.
 */
export function Tabellenfeld({ feld: f, mappe, nurLesen, ohneUeberschrift, neuesFormular }: {
  feld: Feld;
  /** Die Abschnittsüberschrift darüber nennt die Tabelle schon – dann keine zweite (Name bleibt für Bildschirmleser). */
  ohneUeberschrift?: boolean;
  /** Die gespeicherte Mappe; fehlt bei einer neuen (dann gibt es noch nichts, das hierher verweist). */
  mappe?: Mappe;
  nurLesen?: boolean;
  /** Formular für die neue Mappe im Fenster: Typ, Startwerte (Verweis gesetzt), danach und abbrechen. */
  neuesFormular: (typ: Mappentyp, verweis: { feldKey: string; mappeId: string }, fertig: { gespeichert(m: Mappe): void; abbrechen(): void }) => ReactNode;
}) {
  const d = useDaten();
  const q = f.quelle;
  const quelltyp = q ? d.typ(q.typId) : undefined;
  const titel = feldLabel(f);
  // Sortierung wie in der Trefferliste des anderen Typs (je Person gemerkt, #22); ohne nach Titel.
  const sortierung = quelltyp ? (d.einstellungen[`sortierung:${quelltyp.id}`] as Sortierung | undefined) ?? null : null;
  const { daten, fehler, weitere, neuLaden } = useZeilen(mappe, f.key, quelltyp?.id, sortierung);
  const [fenster, setFenster] = useState(false);
  const [angelegt, setAngelegt] = useState<string>();
  // Nach dem Fenster zurück an „+ Neu“ (#935: der Fokus geht dahin, wo er herkam).
  const rueck = useRef<HTMLElement | null>(null);
  useEffect(() => { if (!angelegt) return; const z = window.setTimeout(() => setAngelegt(undefined), 6000); return () => window.clearTimeout(z); }, [angelegt]);

  const kopf = <h3 className={ohneUeberschrift ? s.unsichtbar : s.titel} id={`tabelle-${f.key}`}>{titel}</h3>;
  // Den anderen Typ gibt es für diese Person nicht (kein Leserecht auf den Typ) oder nicht mehr: ruhig nichts.
  if (!q || !quelltyp) return <section className={s.feld} aria-labelledby={`tabelle-${f.key}`}>{kopf}<p className="leise">{t('ablage.tabelle.leer', { name: titel })}</p></section>;
  const neuText = tabelleNeuText(f, quelltyp);
  const darf = !!mappe && !nurLesen && darfErstellen(quelltyp);
  // Muster #989: Anlegen-Knopf. Ohne Anlegerecht am anderen Typ gibt es ihn nicht – der Server prüft ohnehin.
  const neu = darf ? <Knopf art="anlegen" groesse="klein" aria-haspopup="dialog" aria-expanded={fenster} onClick={() => { rueck.current = document.activeElement as HTMLElement | null; setFenster(true); }}>{neuText}</Knopf> : null;
  const fuss = (mehr: number) => (mehr > 0 || neu || angelegt ? <>
    {neu}
    {mehr > 0 && <Knopf art="link" groesse="klein" onClick={weitere}>{t('ablage.tabelle.weitere', { anzahl: Math.min(mehr, TABELLE_SEITE).toLocaleString(gebietsschema()), gesamt: (daten?.gesamt ?? 0).toLocaleString(gebietsschema()) })}</Knopf>}
    {angelegt && <span className="leise klein" role="status">{t('ablage.tabelle.angelegt', { titel: angelegt })}</span>}
  </> : undefined);
  const inhalt = !mappe ? <p className="leise">{t('ablage.tabelle.nach-dem-speichern', { name: titel, neu: neuText })}</p>
    : fehler ? <p className="fehlertext klein">{fehler}</p>
    : !daten ? <p className="leise klein">{t('ablage.mappeformular.lade')}</p>
    : <Zeilen f={f} typ={quelltyp} daten={daten} titel={titel} fuss={fuss(daten.gesamt - daten.mappen.length)} />;
  return (
    <section className={s.feld} aria-labelledby={`tabelle-${f.key}`} data-anker={`mappe.tabellenfeld:${f.key}`}>
      {kopf}
      {inhalt}
      {fenster && mappe && (
        <VerweisFenster ziel={quelltyp} zurueck={rueck} schliessen={() => setFenster(false)}>
          {neuesFormular(quelltyp, { feldKey: q.feldKey, mappeId: mappe.id }, {
            gespeichert: (m) => { setFenster(false); setAngelegt(titelOder(m.titel)); neuLaden(); },
            abbrechen: () => setFenster(false),
          })}
        </VerweisFenster>
      )}
    </section>
  );
}

/** Die Zeilen im Baustein Tabelle: Spalten der Trefferliste, Zellen formatiert wie in der Ablage. */
function Zeilen({ f, typ, daten, titel, fuss }: { f: Feld; typ: Mappentyp; daten: { spalten: string[]; mappen: Mappe[]; bezuege: Bezuege }; titel: string; fuss: ReactNode }) {
  const d = useDaten();
  const spalten = daten.spalten.map((k) => ({ key: k, titel: spaltenName(k, typ), rechts: rechtsbuendig(typ.felder.find((x) => x.key === k)?.typ) }));
  const zeilen = daten.mappen.map((m) => ({
    key: m.id, ziel: `/ablage/${typ.id}/${m.id}`, ersatz: titelOder(m.titel),
    zellen: Object.fromEntries(daten.spalten.map((k) => [k, zelle(k, m, typ, daten.bezuege, d.person)])),
  }));
  return <Tabelle beschriftung={titel} spalten={spalten} zeilen={zeilen} leer={t('ablage.tabelle.leer', { name: titel })} anker={`mappe.tabelle:${f.key}`} fuss={fuss} />;
}

/** Zeilen vom Server (je 50, nur lesbare): neu laden, wenn Mappe, Feld, Sortierung oder der Stand der Ablage sich ändern. */
function useZeilen(mappe: Mappe | undefined, feld: string, typId: string | undefined, sortierung: Sortierung | null) {
  const d = useDaten();
  const [daten, setDaten] = useState<{ spalten: string[]; gesamt: number; mappen: Mappe[]; bezuege: Bezuege } | null>(null);
  const [fehler, setFehler] = useState<string>();
  const [runde, setRunde] = useState(0);
  const sortText = JSON.stringify(sortierung);
  useEffect(() => {
    if (!mappe || !typId) return;
    let aktuell = true;
    setFehler(undefined);
    mappenApi.tabelle(mappe.id, feld, 0, sortierung).then((r) => aktuell && setDaten(r), (e: Error) => aktuell && setFehler(e.message));
    return () => { aktuell = false; };
  }, [mappe?.id, mappe?.geaendert, feld, typId, sortText, d.stand, runde]); // eslint-disable-line react-hooks/exhaustive-deps -- neu laden, wenn Mappe, Feld, Sortierung oder der Stand der Ablage sich ändern
  async function weitere() {
    if (!mappe || !daten) return;
    const r = await mappenApi.tabelle(mappe.id, feld, daten.mappen.length, sortierung, daten.gesamt);
    setDaten({ ...r, mappen: [...daten.mappen, ...r.mappen.filter((m) => !daten.mappen.some((x) => x.id === m.id))], bezuege: { ...daten.bezuege, ...r.bezuege } });
  }
  return { daten, fehler, weitere, neuLaden: () => setRunde((n) => n + 1) };
}
