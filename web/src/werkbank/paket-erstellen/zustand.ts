import { useEffect, useRef, useState } from 'react';
import {
  naechsteVersionen,
  type ErstellenStand,
  type PaketEntwurf,
  type PaketErstellenEingabe,
  type PaketPruefung,
} from '../../../../shared/src/paketerstellung';
import { gebietsschema } from '../../../../shared/src/sprache';
import { ApiFehler } from '../../api/anfrage';
import { paketeApi } from '../../api/pakete';
import { werkbankApi } from '../../api/werkbank';
import { t } from '../../sprache';

/**
 * Zustand des Assistenten „Paket erstellen“ (#374; #1279 aus PaketErstellen.tsx gezogen): Stand und Eingabe laden,
 * Version vorbelegen (#651), automatisch prüfen, Auswahl umschalten, letzte Version hochladen, erstellen (#652).
 */

export type Liste = 'typen' | 'sichten' | 'beispiele' | 'wortlisten' | 'rundgaenge' | 'tipps' | 'automatisierungen';

export const groesse = (b: number) =>
  b < 1024 ? t('werkbank.paketerstellen.bytes', { b }) : `${(b / 1024).toLocaleString(gebietsschema(), { maximumFractionDigits: 1 })} KB`;

/**
 * Angaben eines früheren Pakets als neue Version (#652): Auswahl und Angaben übernehmen; die Version setzt die Prüfung
 * nach der erkannten Art der Änderung (#651);
 * Mappentypen, Ansichten und Wortlisten, die es nicht mehr gibt, fallen mit Hinweis weg. Neue eigene Typen kommen nicht von selbst dazu.
 */
function alsNeueVersion(w: PaketEntwurf, stand: ErstellenStand): { e: PaketErstellenEingabe; weg?: string } {
  const typen = w.typen.filter((id) => stand.typen.some((x) => x.id === id));
  const sichten = w.sichten.filter((id) => stand.sichten.some((x) => x.id === id));
  const wortlisten = (w.wortlisten ?? []).filter((id) => stand.wortlisten.some((x) => x.id === id));
  const fehlt = w.typen.length - typen.length + w.sichten.length - sichten.length + (w.wortlisten ?? []).length - wortlisten.length;
  return {
    e: {
      typen,
      sichten,
      beispiele: w.beispiele,
      wortlisten,
      ...(w.beispielDokumente ? { beispielDokumente: true } : {}),
      ...(w.rundgaenge?.length ? { rundgaenge: w.rundgaenge.filter((x) => stand.rundgaenge?.some((r) => r.schluessel === x)) } : {}),
      ...(w.tipps?.length ? { tipps: w.tipps.filter((x) => stand.tipps?.some((r) => r.schluessel === x)) } : {}),
      ...(w.automatisierungen?.length
        ? { automatisierungen: w.automatisierungen.filter((x) => stand.automatisierungen?.some((r) => r.id === x)) }
        : {}),
      id: w.id,
      name: w.name,
      version: '',
      beschreibung: w.beschreibung,
      autor: w.autor,
      lizenz: w.lizenz,
      lizenzArt: w.lizenzArt ?? 'frei',
      lizenzName: w.lizenzName,
      lizenzText: w.lizenzText,
      dms: '',
      aenderungen: '',
    },
    weg: fehlt ? t('pakete.erstellen.frage.weg', { anzahl: fehlt }) : undefined,
  };
}

/** Automatische Prüfung bei jeder Änderung (kurz verzögert); die letzte Antwort gewinnt. */
function usePruefen(e: PaketErstellenEingabe | null, setFehler: (f?: string) => void) {
  const [pruefung, setPruefung] = useState<PaketPruefung | null>(null);
  const [prueft, setPrueft] = useState(false);
  const lauf = useRef(0);
  useEffect(() => {
    if (!e) return;
    const nr = ++lauf.current;
    setPrueft(true);
    const timer = setTimeout(() => {
      paketeApi
        .paketErstellenPruefen(e)
        .then(
          (p) => {
            if (nr === lauf.current) {
              setPruefung(p);
              setFehler(undefined);
            }
          },
          (x) => {
            if (nr === lauf.current) setFehler((x as Error).message);
          },
        )
        .finally(() => {
          if (nr === lauf.current) setPrueft(false);
        });
    }, 350);
    return () => clearTimeout(timer);
  }, [e, setFehler]);
  return { pruefung, prueft };
}

export function usePaketErstellen(onErstellt?: () => void) {
  const [stand, setStand] = useState<ErstellenStand | null>(null);
  const [e, setE] = useState<PaketErstellenEingabe | null>(null);
  const [idAuto, setIdAuto] = useState(true);
  const [schritt, setSchritt] = useState(0);
  const [suche, setSuche] = useState('');
  const [fehler, setFehler] = useState<string>();
  const [fertig, setFertig] = useState<string>();
  const [sendet, setSendet] = useState(false);
  const [experte, setExperte] = useState(false);
  const [hochgeladen, setHochgeladen] = useState(false);
  /** #652: Gibt es frühere Pakete, beginnt Schritt 1 mit „Neues Paket“ oder „Neue Version von …“. */
  const [frage, setFrage] = useState(false);
  const [weg, setWeg] = useState<string>();
  const { pruefung, prueft } = usePruefen(e, setFehler);

  useEffect(() => {
    paketeApi.paketErstellenStand().then(
      (s) => {
        setStand(s);
        const von = new URLSearchParams(location.search).get('von');
        const w = von ? s.entwuerfe.find((x) => x.id === von) : undefined;
        if (w) {
          setE(alsNeueVersion(w, s).e);
          setIdAuto(false);
          setWeg(alsNeueVersion(w, s).weg);
        } else {
          setE(s.vorschlag);
          setIdAuto(!s.vorschlag.id);
          setFrage(s.entwuerfe.length > 0);
        }
      },
      (x) => setFehler((x as Error).message),
    );
    // Stufe „Alles“ (#987, vorher Expertenmodus #356) – eigene oder die der Installation: Version und Ablago-Version
    // dann auch von Hand (#651).
    werkbankApi.werkbankAnsicht().then(
      (w) => setExperte((w.eigene.vorlage ?? w.installation.vorlage) === 'alles'),
      () => setExperte(false),
    );
  }, []);

  // #651: Version und nötige Ablago-Version aus der Prüfung vorbelegen, solange nichts Passendes gewählt ist.
  const lage = pruefung?.version;
  useEffect(() => {
    if (!e || !lage || e.vonHand) return;
    const x: Partial<PaketErstellenEingabe> = {};
    if (!lage.dmsOptionen.includes(e.dms)) x.dms = lage.dmsOptionen[0];
    const moeglich = lage.bekannt ? Object.values(naechsteVersionen(lage.bekannt)) : ['1.0.0', ...(experte ? ['0.1.0'] : [])];
    if (!moeglich.includes(e.version)) x.version = lage.bekannt ? naechsteVersionen(lage.bekannt)[lage.art ?? 'inhalt'] : '1.0.0';
    if (Object.keys(x).length) setE({ ...e, ...x });
  }, [lage, e, experte]);

  const setze = (x: Partial<PaketErstellenEingabe>) => {
    setFertig(undefined);
    setE({ ...e!, ...x });
  };
  const umschalten = (liste: Liste, id: string, an: boolean) => {
    const l = e![liste] ?? [];
    setze({ [liste]: an ? [...l, id] : l.filter((x) => x !== id) });
  };
  const ausEntwurf = (x: PaketEntwurf) => {
    const n = alsNeueVersion(x, stand!);
    setIdAuto(false);
    setHochgeladen(false);
    setWeg(n.weg);
    setFrage(false);
    setze(n.e);
  };
  const neuesPaket = () => {
    setIdAuto(true);
    setHochgeladen(false);
    setWeg(undefined);
    setFrage(false);
    setze(stand!.vorschlag);
  };
  const x = { e, setze, setFehler, setHochgeladen, setIdAuto, setSendet, setFertig, setStand, onErstellt };
  return {
    stand,
    e,
    idAuto,
    setIdAuto,
    schritt,
    setSchritt,
    pruefung,
    prueft,
    suche,
    setSuche,
    fehler,
    fertig,
    sendet,
    experte,
    hochgeladen,
    frage,
    weg,
    lage,
    setze,
    umschalten,
    ausEntwurf,
    neuesPaket,
    letzteHochladen: (datei: File) => letzteHochladen(x, datei),
    erstellen: (mitZip: boolean) => erstellen(x, mitZip),
  };
}
export type ErstellenZustand = ReturnType<typeof usePaketErstellen>;

type Aktion = {
  e: PaketErstellenEingabe | null;
  setze(x: Partial<PaketErstellenEingabe>): void;
  setFehler(f?: string): void;
  setHochgeladen(h: boolean): void;
  setIdAuto(a: boolean): void;
  setSendet(s: boolean): void;
  setFertig(f?: string): void;
  setStand(s: ErstellenStand): void;
  onErstellt?: () => void;
};

/** Letzte Version hochladen (#651): bekannte Version (und ohne Id auch Id und Name) aus dem ZIP. */
async function letzteHochladen(z: Aktion, datei: File) {
  const e = z.e;
  if (!e) return;
  try {
    const r = await paketeApi.paketLetzteVersion(datei);
    if (e.id && r.id !== e.id) {
      z.setFehler(t('pakete.erstellen.version.andereId', { id: r.id, eigene: e.id }));
      return;
    }
    z.setFehler(undefined);
    z.setHochgeladen(true);
    if (!e.id) z.setIdAuto(false);
    z.setze({ bekannteVersion: r.version, ...(e.id ? {} : { id: r.id, name: e.name || r.name }) });
  } catch (x) {
    z.setFehler([(x as Error).message, ...(x instanceof ApiFehler ? x.gruende : [])].join(' '));
  }
}

/** #652: „Paket erstellen“ legt es an (unter „Installiert“ als selbst erstellt), auf Wunsch zusätzlich als ZIP. */
async function erstellen(z: Aktion, mitZip: boolean) {
  const e = z.e;
  if (!e) return;
  z.setSendet(true);
  z.setFehler(undefined);
  z.setFertig(undefined);
  try {
    if (mitZip) {
      const r = await paketeApi.paketExportieren(e);
      z.setFertig(t('pakete.erstellen.fertig.zip', { datei: r.name, groesse: groesse(r.bytes) }));
    } else {
      const r = await paketeApi.paketAnlegen(e);
      z.setFertig(t('pakete.erstellen.fertig.angelegt', { name: r.name, version: r.version }));
    }
    z.setStand(await paketeApi.paketErstellenStand());
    z.onErstellt?.();
  } catch (x) {
    z.setFehler([(x as Error).message, ...(x instanceof ApiFehler ? x.gruende : [])].join(' '));
  } finally {
    z.setSendet(false);
  }
}
