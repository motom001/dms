/**
 * Zustand des Dokumentenregisters (#1279) als Hooks – in der Reihenfolge der Effekte von früher: doppelte Dateien,
 * Leerseiten, Texterkennung, sichtbar scrollen, Handy, Ablegen im Fenster.
 */
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { MAX_DATEIGROESSE, type Dokument, type Mappentyp, type OcrStand, type Register } from '../../../../shared/src/model';
import { volltextHerkunft } from '../../../../shared/src/volltext';
import { registerName } from '../../../../shared/src/beschriftung';
import { eingangsreihenfolge, gruppiere } from '../../../../shared/src/anlagen';
import { dokumenteApi, type Fundstelle } from '../../api/dokumente';
import { mappenApi } from '../../api/mappen';
import { useDaten } from '../../daten';
import { t } from '../../sprache';
import { fundstellenFuer } from '../Doppelt';
import { useLeerseiten } from '../Leerseiten';
import { useMappenZiel } from '../NeuePost';
import { ansichtVon, DOKUMENT_SORTIERUNGEN, sortiereDokumente, type Dokumentsortierung, type NeueDatei } from './hilfen';
import { useHandy } from './teile';

export interface DokumenteProps {
  register: Register;
  dokumente: Dokument[];
  neue: NeueDatei[];
  entfernt: string[];
  /** Ohne Recht „Bearbeiten“ (#126): nur ansehen und herunterladen. */
  nurLesen?: boolean;
  hinzufuegen(d: File[]): void;
  entferne(id: string): void;
  entferneMehrere(ids: string[]): void;
  vergiss(uid: string): void;
  /** Gleicher Name (#194): Wahl je neuer Datei. */
  setzeNeue?(uid: string, patch: Partial<NeueDatei>): void;
  /** Nach Ersetzen und Zurückholen (#194) – sofort, ohne „Mappe speichern“. */
  neuLaden?(): Promise<void>;
  /** Dokumente einer Post (#335): Teilen erzeugt neue Posts. */
  post?: boolean;
  /** Stempel beim Weitergeben (#394): Einstellung des Mappentyps, Titel für {mappe}. */
  typ?: Mappentyp;
  mappeTitel?: string;
  /**
   * Exportrecht (#723): Herunterladen ist Mitnehmen und braucht E. Ohne E bleiben die Dokumente zum Ansehen;
   * Herunterladen, Teilen und Kopien mit Stempel gibt es dann nicht – „Warum nicht?“ erklärt es an der Leiste.
   */
  mitnehmen?: boolean;
}

/** Doppelte Dateien (#333): je neuer Datei einmal nachsehen, ob es sie schon gibt. */
function useDoppelt(neue: NeueDatei[], eigeneMappe: string | undefined) {
  const [doppelt, setDoppelt] = useState<Record<string, Fundstelle[]>>({});
  const geprueft = useRef(new Set<string>());
  useEffect(() => {
    const offen = neue.filter((n) => !geprueft.current.has(n.uid));
    if (!offen.length) return;
    for (const n of offen) geprueft.current.add(n.uid);
    void fundstellenFuer(offen, eigeneMappe).then((m) => {
      if (m.size)
        setDoppelt((d) => ({
          ...d,
          ...Object.fromEntries([...m].map(([n, f]) => [n.uid, f.filter((x) => x.mappeId !== eigeneMappe)]).filter(([, f]) => f.length)),
        }));
    });
  }, [neue, eigeneMappe]);
  return doppelt;
}

/** Was je Dokument offen ist (Stempel, Versionen, „Über“, Seiten, Verkleinern, Schwärzen, Anlage) und die Meldung dazu. */
function useOffen() {
  const [stempelOffen, setStempelOffen] = useState<{ id: string; version?: number }>();
  const [versionenOffen, setVersionenOffen] = useState<string>();
  // „Über dieses Dokument“ ohne geöffnete Anzeige (#1211), etwa bei Originalen, die der Browser nicht zeigt.
  const [ueberOffen, setUeberOffen] = useState<string>();
  // PDF bearbeiten (#335): Seitenansicht je Dokument, Zusammenfügen der Auswahl.
  const [seitenOffen, setSeitenOffen] = useState<string>();
  const [kleinOffen, setKleinOffen] = useState<string>();
  const [schwarzOffen, setSchwarzOffen] = useState<string>();
  const [pdfMeldung, setPdfMeldung] = useState<ReactNode>();
  const [zusammen, setZusammen] = useState<{ name: string; entfernen: boolean; laeuft?: boolean; fehler?: string } | null>(null);
  const [alsAnlage, setAlsAnlage] = useState<string>();
  const [teilVorschlag, setTeilVorschlag] = useState<{ id: string; ab: number }>();
  return {
    ...{ stempelOffen, setStempelOffen, versionenOffen, setVersionenOffen, ueberOffen, setUeberOffen },
    ...{ seitenOffen, setSeitenOffen, kleinOffen, setKleinOffen, schwarzOffen, setSchwarzOffen, pdfMeldung, setPdfMeldung },
    ...{ zusammen, setZusammen, alsAnlage, setAlsAnlage, teilVorschlag, setTeilVorschlag },
  };
}

/** Archivnummer (#345) direkt speichern; neue Version hochladen (#194) – beides ohne „Mappe speichern“. */
function useSofort(neuLaden: (() => Promise<void>) | undefined) {
  const [asn, setAsn] = useState<{ id: string; wert: string; fehler?: string } | null>(null);
  async function speichereAsn() {
    if (!asn) return;
    try {
      await dokumenteApi.setzeArchivnummer(asn.id, asn.wert);
      setAsn(null);
      await neuLaden?.();
    } catch (e) {
      setAsn({ ...asn, fehler: (e as Error).message });
    }
  }
  const [ersetzeId, setErsetzeId] = useState<string>();
  const [versionFehler, setVersionFehler] = useState<string>();
  const ersetzFeld = useRef<HTMLInputElement>(null);
  async function ersetze(datei: File) {
    const id = ersetzeId;
    setErsetzeId(undefined);
    if (!id) return;
    setVersionFehler(undefined);
    if (datei.size > MAX_DATEIGROESSE) {
      setVersionFehler(t('ablage.dokumente.ist-zu-gross-ueber', { name: datei.name }));
      return;
    }
    try {
      await dokumenteApi.ersetzen(id, datei);
      await neuLaden?.();
    } catch (e) {
      setVersionFehler((e as Error).message);
    }
  }
  return { asn, setAsn, speichereAsn, setErsetzeId, versionFehler, setVersionFehler, ersetzFeld, ersetze };
}

/** Reihenfolge (#86, #999) mit Anlagen (#998) unter ihrem Hauptdokument. */
function reiheVon(roh: Dokument[], entfernt: string[], post: boolean | undefined, sortierung: Dokumentsortierung) {
  // Post (#999): in der Reihenfolge des Eingangs – bei einer E-Mail so, wie die Anhänge in ihr stehen; nie nach Namen.
  const dokumente = post ? eingangsreihenfolge(roh) : sortiereDokumente(roh, sortierung in DOKUMENT_SORTIERUNGEN ? sortierung : 'name');
  // Anlagen (#998): eingeklappt unter ihrem Hauptdokument, in ihrer Reihenfolge; sortiert werden nur Hauptdokumente.
  const reihe = gruppiere(dokumente).flatMap((g) => [g.haupt, ...g.anlagen]);
  const hauptVon = (x: Dokument) => (x.anlageZu ? roh.find((y) => y.id === x.anlageZu) : undefined);
  // „Post ab hier teilen“ (#999): dieses Hauptdokument und alle danach (samt Anlagen) kommen als neue Post nach „Neue Post“.
  const hauptReihe = reihe.filter((y) => !hauptVon(y) && !entfernt.includes(y.id));
  return { dokumente, reihe, hauptVon, hauptReihe };
}

/** Auswahl (#87): je Register; verschwindet mit dem Register bzw. der Mappe (eigene Instanz). */
function useDokAuswahl(dokumente: Dokument[], entfernt: string[]) {
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(new Set());
  const [anker, setAnker] = useState<string>();
  const [hinweis, setHinweis] = useState<string>();
  const waehlbar = dokumente.filter((x) => !entfernt.includes(x.id));
  const auswahl = waehlbar.filter((x) => gewaehlt.has(x.id));
  const pdfAuswahl = auswahl.filter((x) => x.mime === 'application/pdf');
  return { gewaehlt, setGewaehlt, anker, setAnker, hinweis, setHinweis, waehlbar, auswahl, pdfAuswahl };
}

/** Texterkennung (#45): Stand nachladen, solange etwas wartet oder läuft; Sprachen und „Post teilen?“ (#579) kommen mit. */
function useTexterkennung(dokumente: Dokument[]) {
  const [ocr, setOcr] = useState<Record<string, OcrStand | undefined>>({});
  const [frisch, setFrisch] = useState<Record<string, Pick<Dokument, 'sprache' | 'weitereSprachen' | 'teilenAb'>>>({});
  const [teilenWeg, setTeilenWeg] = useState<Set<string>>(new Set());
  const mitFrisch = (x: Dokument): Dokument => (frisch[x.id] ? { ...x, ...frisch[x.id] } : x);
  const [text, setText] = useState<{ id: string; text: string | null } | null>(null);
  const standVon = (x: Dokument) => ocr[x.id] ?? x.ocr;
  // Wartet es auf das Paket, nur solange eins installiert ist (#459: ohne Paket wartet es, bis eins kommt).
  const offen = dokumente.some((x) => {
    const s = standVon(x)?.stand;
    const h = volltextHerkunft(standVon(x));
    return s === 'wartet' || s === 'laeuft' || (h?.art === 'wartet' && !!h.paket) || h?.art === 'umwandlung' || h?.art === 'volltext';
  });
  useEffect(() => {
    if (!offen || !dokumente.length) return;
    const timer = setTimeout(() => {
      void mappenApi.mappe(dokumente[0].mappeId).then(
        (m) => {
          setOcr(Object.fromEntries(m.dokumente.map((x) => [x.id, x.ocr])));
          setFrisch(
            Object.fromEntries(
              m.dokumente.map((x) => [x.id, { sprache: x.sprache, weitereSprachen: x.weitereSprachen, teilenAb: x.teilenAb }]),
            ),
          );
        },
        () => {},
      );
    }, 3000);
    return () => clearTimeout(timer);
  }, [offen, ocr, dokumente.length]); // eslint-disable-line react-hooks/exhaustive-deps -- Nachfrage nur neu planen, wenn sich Texterkennung oder Dokumentzahl ändern
  return { ocr, setOcr, teilenWeg, setTeilenWeg, mitFrisch, text, setText, standVon };
}

/** Geöffnete Anzeige (#85, #631) direkt unter ihrer Zeile; am Handy (#505) im Vollbild des Browsers. */
function useAnsicht(roh: Dokument[], entfernt: string[]) {
  // ?dokument=… (#345: Sprung über die Archivnummer) zeigt dieses Dokument gleich an.
  const [ansicht, setAnsicht] = useState<string | undefined>(() => {
    const w = new URLSearchParams(location.search).get('dokument');
    return roh.some((x) => x.id === w && ansichtVon(x, false)) ? w! : undefined;
  });
  // Archivfassung (#631): Dokumente, bei denen jemand „Original anzeigen“ gewählt hat.
  const [original, setOriginal] = useState<Set<string>>(new Set());
  const offenRef = useRef<HTMLLIElement>(null);
  // Die geöffnete Anzeige steht direkt unter ihrer Zeile und wird sichtbar gescrollt (#85).
  useEffect(() => {
    if (ansicht) offenRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [ansicht]);
  // Handy (#505): kein eingebetteter Rahmen – Tippen öffnet das Dokument im Vollbild (Anzeige des Browsers, Zwei-Finger-Zoom, Zurück mit einem Tipp).
  const handy = useHandy();
  const umschalten = (x: Dokument) => {
    // Auch aufklappen, wenn gerade das Original gewählt ist, das sich nicht anzeigen lässt (#1211): Dann steht dort der Satz.
    const v = ansichtVon(x, original.has(x.id)) ?? ansichtVon(x, false);
    if (!v || entfernt.includes(x.id)) return;
    if (handy) {
      location.assign(v.url);
      return;
    }
    setAnsicht(x.id === ansicht ? undefined : x.id);
  };
  const zeilenKlick = (x: Dokument, e: MouseEvent) => {
    // Knöpfe, Links, Kästchen, der Volltext und die Dialoge (Seiten, Verkleinern, Schwärzen) behalten ihre eigene Funktion.
    if (
      (e.target as HTMLElement).closest('a, button, input, select, label, pre, .dokansicht, .pdfseiten, .leerseiten, [role="menu"], form')
    )
      return;
    umschalten(x);
  };
  /** Was der Original-Wechsel zeigt (#631): gemerkt je Dokument. */
  const wechsle = (x: Dokument) => {
    const n = new Set(original);
    if (n.has(x.id)) n.delete(x.id);
    else n.add(x.id);
    setOriginal(n);
  };
  return { ansicht, setAnsicht, original, offenRef, handy, umschalten, zeilenKlick, wechsle };
}

/** Hochladen: Auswahl, Ziehen in die Zone und Ablegen irgendwo im Fenster (#193). */
function useHochladen(p: DokumenteProps) {
  const auswahlFeld = useRef<HTMLInputElement>(null);
  const [ziehen, setZiehen] = useState(false);
  const [zuGross, setZuGross] = useState<string[]>([]);
  function nimm(liste: FileList | File[]) {
    const alle = [...liste];
    const gross = alle.filter((f) => f.size > MAX_DATEIGROESSE);
    setZuGross(gross.map((f) => f.name));
    p.hinzufuegen(alle.filter((f) => f.size <= MAX_DATEIGROESSE && f.size > 0));
  }
  return { auswahlFeld, ziehen, setZiehen, zuGross, nimm };
}

export function useDokumente(p: DokumenteProps) {
  const o = useOffen();
  const stempelPflicht = p.typ?.stempel?.modus === 'pflicht';
  const versioniert = !!p.register.versionierung;
  const doppelt = useDoppelt(p.neue, p.dokumente[0]?.mappeId);
  const sofort = useSofort(p.neuLaden);
  const d = useDaten();
  const bearbeitbar = !p.nurLesen && !!p.neuLaden;
  const h = useHochladen(p);
  const sortierung = (d.einstellungen.dokumente_sortierung as Dokumentsortierung | undefined) ?? 'name';
  const r = reiheVon(p.dokumente, p.entfernt, p.post, sortierung);
  // Leerseiten (#997): nur an der Post – Seitenleiste mit „Doch behalten“ / „Auch weglassen“.
  const leer = useLeerseiten(p.post ? p.dokumente : []);
  const w = useDokAuswahl(r.dokumente, p.entfernt);
  const ocr = useTexterkennung(r.dokumente);
  const a = useAnsicht(p.dokumente, p.entfernt);
  // Ablegen irgendwo im Fenster (#193): diese Mappe ist dann ein Ziel neben „als neue Post“.
  useMappenZiel(p.nurLesen ? null : { name: registerName(p.register), nimm: h.nimm });
  return { p, d, o, h, r, w, a, ocr, leer, doppelt, sofort, sortierung, stempelPflicht, versioniert, bearbeitbar };
}

export type Kern = ReturnType<typeof useDokumente>;
