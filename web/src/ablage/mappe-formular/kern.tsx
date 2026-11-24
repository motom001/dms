import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { abschnittEinstellung, abschnittId, ausgeblendeteFelder, gruppiere } from '../../../../shared/src/darstellung';
import { type Anzeigestand } from '../../../../shared/src/anzeige';
import { ausDokumentKnopf } from '../../../../shared/src/erkennung';
import { mitNotizen, startRegister, type AnsichtsRegister } from '../../../../shared/src/mappenansicht';
import {
  darfLoeschen,
  geschuetzteFelder,
  istLeer,
  type Abschnitt,
  type Feld as FeldDef,
  type Mappe,
  type Mappenkonflikt,
  type Mappentyp,
  type Pruefergebnis,
  type Register,
  type Werte,
} from '../../../../shared/src/model';
import { ORGANISATION_BEREICH } from '../../../../shared/src/organisation';
import { darfBereich } from '../../../../shared/src/verwaltungsrecht';
import type { Bezuege, MappeDetails } from '../../api/mappen';
import type { TypVorschlaege } from '../../api/werkbank';
import { Knopf } from '../../bausteine';
import { useDaten } from '../../daten';
import { useKonto } from '../../konto';
import { useUngespeichert } from '../../ort';
import { t } from '../../sprache';
import { ausRoh, werteAusRoh, type RohWerte } from '../../werte';
import { anzeigeImFormular, hatWert as mitWert } from '../anzeige';
import { useBruecke } from '../bruecke';
import type { NeueDatei } from '../Dokumente';
import { berechnetGesperrt, mitVerknuepftenFrage, registerVon, schreibschutzGesperrt, zusammengesetztGesperrt } from './hilfen';
import { useLoeschsperre, type Loeschsperre } from './Verknuepfungen';
import type { FeldVorschlag, Vorbelegt, ZuordnenNachher } from './werte';

export interface FormularProps {
  typ: Mappentyp;
  mappe?: Mappe;
  start: RohWerte;
  sicht: string;
  anhang?: string;
  details?: MappeDetails | null;
  neuLaden?: () => Promise<void>;
  zuordnen?: ZuordnenNachher;
  /** Fenster „+ … anlegen“ (#935): nach dem Speichern die neue Mappe zurückgeben statt die Seite zu wechseln; „Abbrechen“ schließt. */
  imFenster?: { gespeichert(m: Mappe): void; abbrechen(): void };
  /** Seite „Dokument übernehmen“ (#934): Vorschläge aus dem Dokument, eingetragen wie bei „Aus Dokument ausfüllen“. */
  vorschlagStart?: TypVorschlaege;
  /** Kopf über dem Formular mit den aktuellen Werten (neue Mappe auf der Seite „Dokument übernehmen“). */
  kopf?: (werte: Werte, bekannt: Bezuege) => ReactNode;
  /** „Mit verknüpften Mappen löschen …“ (#424) – als weiterer Weg unter „Warum nicht?“ (#423). */
  mitVerknuepften?: () => void;
  /** Register von außen öffnen (#427); `n` zählt, damit derselbe Wunsch erneut wirkt. */
  registerWunsch?: { key: string; n: number };
}

type Daten = ReturnType<typeof useDaten>;
type Ich = ReturnType<typeof useKonto>['ich'];

/**
 * Rechte und Schutz der Felder: Nur lesbar sind Systemfelder von Benutzern, Name einer Systemrolle (#26, #27) – und
 * berechnete Felder (#1034): die schreibt nur ihr Paket. So lassen auch „folgt aus“ und „Aus Dokument ausfüllen“ sie aus
 * („nie überschreiben“). Geschützte Felder (#995), z. B. das Merkmal „eigene Organisation“: Der Server sagt je Mappe, was
 * diese Person nicht ändern darf; bei einer neuen Mappe gilt: nur im Verwaltungsmodus mit dem Bereich „Eigene
 * Organisation“. Zusammengesetzte Felder (#1050) ebenso: Ablago setzt sie aus ihren Teilen.
 */
function rechteLage({ typ, mappe, details, zuordnen }: FormularProps, d: Daten, ich: Ich) {
  const geschuetzt = {
    ...geschuetzteFelder(typ, mappe),
    ...berechnetGesperrt(typ),
    ...zusammengesetztGesperrt(typ),
    ...schreibschutzGesperrt(
      typ,
      mappe ? (details?.schreibschutz ?? []) : ich.rolle === 'admin' && darfBereich(ich, ORGANISATION_BEREICH) ? [] : null,
    ),
  };
  // Berechtigungen (#126): ohne „Bearbeiten“ nur ansehen; Löschen und Passwörter je nach Recht.
  const rechte = mappe ? details?.rechte : undefined;
  const nurLesen = !!rechte && !rechte.U;
  const darfLoeschenHier = !rechte || rechte.D;
  // „Mappe löschen“ (#423): nie kommentarlos grau – warum nicht, steht auf Klick direkt am Knopf.
  const loeschenZeigen = !!mappe && darfLoeschen(typ, mappe);
  const loeschSperre: Loeschsperre | undefined = !loeschenZeigen
    ? undefined
    : !darfLoeschenHier
      ? { grund: t('ablage.mappeformular.mappen-dieses-mappentyps-darfst') }
      : details?.loeschbar?.ok === false
        ? {
            grund: details.loeschbar.grund ?? t('ablage.mappeformular.diese-mappe-laesst-sich'),
            rueckverweise: details.loeschbar.rueckverweise,
          }
        : undefined;
  // Weitere Löschwege trotz Sperre (z. B. „Mit verknüpften Mappen löschen …“, #424) kommen über `wege` dazu.
  return { geschuetzt, rechte, nurLesen, loeschenZeigen, loeschSperre, aufloesenHinweis: aufloesenHinweis(zuordnen, d) };
}

/** Post auflösen (#936): Vor dem Speichern sagt die Speicherleiste, was mit der Post geschieht. */
const aufloesenHinweis = (zuordnen: ZuordnenNachher | undefined, d: Daten) =>
  zuordnen?.aufloesen === true
    ? d.zaehler.papierkorbTage
      ? t('ablage.mappeformular.aufloesen-hinweis')
      : t('ablage.mappeformular.aufloesen-hinweis-ohne-korb')
    : zuordnen?.aufloesen === false
      ? t('ablage.mappeformular.aufloesen-gesperrt')
      : '';

/** Werte der Mappe im Formular: Ausgangsstand, Eingaben, Dateien, Fehler und Meldungen. */
function useWerte({ typ, mappe, start, details, registerWunsch }: FormularProps, register: AnsichtsRegister[], ich: Ich) {
  // Sprung aus der Suche nach einer Archivnummer (#345): ?register=… öffnet das Register.
  // Erwähnung in einer Notiz (#427): gleich den Register „Notizen“.
  const [aktiv, setAktiv] = useState(() =>
    startRegister(register, new URLSearchParams(location.search).get('register'), details?.aufgaben, ich.id),
  );
  useEffect(() => {
    if (registerWunsch) setAktiv(registerWunsch.key);
  }, [registerWunsch]);
  const [basis, setBasis] = useState(() => JSON.stringify(start));
  const basisRoh = useMemo(() => JSON.parse(basis) as RohWerte, [basis]);
  // Gleichzeitig bearbeiten (#609): Stand der Mappe, auf dem `basis` beruht – geht beim Speichern mit.
  const [stand, setStand] = useState(mappe?.geaendert);
  const [konflikt, setKonflikt] = useState<Mappenkonflikt & { wahl: Record<string, 'meins' | 'seins'> }>();
  const [roh, setRoh] = useState<RohWerte>(start);
  // Werte aus den Eingaben – für zusammengesetzte Felder (#1050), die sich sofort mit ihren Teilen ändern.
  const werteJetzt = useMemo(() => werteAusRoh(typ, roh), [typ, roh]);
  const [neueDateien, setNeueDateien] = useState<NeueDatei[]>([]);
  const [entfernt, setEntfernt] = useState<string[]>([]);
  const [fehler, setFehler] = useState<Pruefergebnis | null>(null);
  const [meldung, setMeldung] = useState<string>();
  const [hinweise, setHinweise] = useState<Array<{ art: 'warn' | 'schlecht'; text: ReactNode }>>([]);
  const [sendet, setSendet] = useState(false);
  return {
    ...{ aktiv, setAktiv, basis, setBasis, basisRoh, stand, setStand, konflikt, setKonflikt, roh, setRoh, werteJetzt },
    ...{ neueDateien, setNeueDateien, entfernt, setEntfernt, fehler, setFehler, meldung, setMeldung, hinweise, setHinweise },
    ...{ sendet, setSendet },
  };
}

/** „Aus Dokument ausfüllen“ (#391): Vorschläge je Feld – eingetragen (Feld war leer) oder als Alternative. */
function useAusDokument() {
  const [adOffen, setAdOffen] = useState(false);
  const [vorschlaege, setVorschlaege] = useState<Record<string, FeldVorschlag>>({});
  const [adNeu, setAdNeu] = useState<TypVorschlaege['neu']>({});
  const [adMeldung, setAdMeldung] = useState<string>();
  // Nach dem Speichern (#1043): Positionen der E-Rechnung anlegen, Mappen, die dazugehören, verknüpfen – abwählbar.
  const [adPositionen, setAdPositionen] = useState<(NonNullable<TypVorschlaege['positionen']> & { an: boolean }) | null>(null);
  const [adDazu, setAdDazu] = useState<Array<NonNullable<TypVorschlaege['dazu']>[number] & { an: boolean }>>([]);
  // Hier angelegte Mappen (#1485): Id → Feld, aus dem heraus sie angelegt wurde; spätere Vorschläge nur für dieses Feld.
  const angelegtAus = useRef(new Map<string, string>());
  return {
    ...{ adOffen, setAdOffen, vorschlaege, setVorschlaege, adNeu, setAdNeu, adMeldung, setAdMeldung },
    ...{ adPositionen, setAdPositionen, adDazu, setAdDazu, angelegtAus },
  };
}

/** Titel und Typ der Mappen, auf die verwiesen wird (vom Server und aus der Auswahl), und die Markierungen am Feld. */
function useBekannt(details: MappeDetails | null | undefined, roh: RohWerte) {
  const [bekannt, setBekannt] = useState<Bezuege>(details?.bezuege ?? {});
  useEffect(() => {
    if (details) setBekannt((b) => ({ ...b, ...details.bezuege }));
  }, [details]);
  const merke = (id: string, b: { titel: string; typId: string }) => setBekannt((x) => (x[id]?.titel === b.titel ? x : { ...x, [id]: b }));
  // Folgt aus (#886): für Rückfragen nach einer Antwort des Servers immer der aktuelle Stand.
  const rohRef = useRef(roh);
  rohRef.current = roh;
  const bekanntRef = useRef(bekannt);
  bekanntRef.current = bekannt;
  /** Felder, die sich aus ihrer Quelle gefüllt haben (#886) – markiert „aus …“, solange der Wert so bleibt. */
  const [gefolgt, setGefolgt] = useState<Record<string, { quelle: string; wert: string }>>({});
  /**
   * Beim Auswählen übernehmen (#1037): Felder, in die eine gewählte Mappe einen Wert vorgeschlagen hat – markiert
   * „vorgeschlagen aus …“, solange der Wert so bleibt. `feld`/`mappe`: woher; `vorher`: der leere Wert davor.
   */
  const [vorbelegt, setVorbelegt] = useState<Record<string, Vorbelegt>>({});
  const vorbelegtRef = useRef(vorbelegt);
  vorbelegtRef.current = vorbelegt;
  return { bekannt, merke, rohRef, bekanntRef, gefolgt, setGefolgt, vorbelegt, setVorbelegt, vorbelegtRef };
}

/**
 * Hat sich die Mappe anderswo geändert (z. B. „Datum auf … setzen“, #130) und ist hier nichts ungespeichert: übernehmen.
 * Dazu die Wache gegen Verlassen mit ungespeicherten Änderungen.
 */
function useAenderungen(p: FormularProps, w: ReturnType<typeof useWerte>, ad: ReturnType<typeof useAusDokument>) {
  const { mappe, start } = p;
  const werteGeaendert = JSON.stringify(w.roh) !== w.basis;
  const startJson = JSON.stringify(start);
  useEffect(() => {
    if (mappe && !werteGeaendert && startJson !== w.basis) {
      w.setBasis(startJson);
      w.setRoh(JSON.parse(startJson));
    }
    // Mit den Werten auch ihren Stand übernehmen (#609) – solange hier nichts ungespeichert ist.
    if (mappe && !werteGeaendert) w.setStand(mappe.geaendert);
  }, [startJson, mappe?.geaendert]); // eslint-disable-line react-hooks/exhaustive-deps -- nur übernehmen, wenn sich die gespeicherten Werte ändern (#609)
  const dokumenteGeaendert = w.neueDateien.length > 0 || w.entfernt.length > 0;
  const danachOffen = !!ad.adPositionen?.an || ad.adDazu.some((x) => x.an);
  useUngespeichert(werteGeaendert || dokumenteGeaendert);
  return { werteGeaendert, startJson, dokumenteGeaendert, danachOffen };
}

/*
 * Anzeigen, wenn … (#1033): Was bei den eingegebenen Werten zu sehen ist – sofort beim Ausfüllen, mit derselben
 * Auswertung wie der Server (Pflicht). Ausgeblendete Werte bleiben, wie sie sind; eine ruhige Zeile sagt es, und
 * „anzeigen“ holt Feld oder Abschnitt für diese Mappe zurück (`aufgedeckt`, nur bis zum Verlassen).
 */
function useAnzeige(typ: Mappentyp, roh: RohWerte, d: Daten, bekannt: Bezuege) {
  // Ausgeblendete Felder (#655) zeigt die Mappe nicht; ihre Werte bleiben, wie sie sind.
  const ausgeblendet = useMemo(() => ausgeblendeteFelder(typ), [typ]);
  const merkmale = d.zaehler.merkmale;
  const eigene = d.zaehler.eigeneOrganisationen;
  const anz: Anzeigestand = useMemo(
    () => anzeigeImFormular(typ, roh, { merkmale, eigene, bekannt }),
    [typ, roh, merkmale, eigene, bekannt],
  );
  const [aufgedeckt, setAufgedeckt] = useState<Set<string>>(() => new Set());
  const decke = (k: string) => setAufgedeckt((x) => new Set([...x, k]));
  const hatWert = (f: FeldDef) => mitWert(f, roh);
  const alleAuf = (r: Register) => typ.felder.filter((f) => r.felder?.includes(f.key));
  const felderAuf = (r: Register) => alleAuf(r).filter((f) => !ausgeblendet.has(f.key));
  return { ausgeblendet, merkmale, eigene, anz, aufgedeckt, decke, hatWert, alleAuf, felderAuf };
}

/*
 * Abschnitte (#890): offen oder eingeklappt. Vorgabe aus dem Mappentyp, gemerkt je Person (persönliche Einstellung je
 * Typ, auf allen Geräten). Ablago klappt selbst auf, wo ein Pflichtfeld leer ist, die Suche oder ein Link auf ein Feld
 * zeigt (beides beim Öffnen) und wo ein Fehler beim Speichern oder ein Vorschlag aus „Aus Dokument ausfüllen“ steckt.
 */
function useAbschnitte(typ: Mappentyp, start: RohWerte, d: Daten, a: ReturnType<typeof useAnzeige>) {
  const { ausgeblendet, alleAuf } = a;
  const gemerkt = (d.einstellungen[abschnittEinstellung(typ.id)] ?? {}) as Record<string, boolean>;
  const abschnittVon = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of registerVon(typ)) {
      if (r.art !== 'felder') continue;
      for (const g of gruppiere(r.abschnitte, alleAuf(r), (f) => !ausgeblendet.has(f.key)))
        if (g.abschnitt?.titel) for (const f of g.felder) m.set(f.key, abschnittId(r.key, g.abschnitt));
    }
    return m;
  }, [typ, ausgeblendet]); // eslint-disable-line react-hooks/exhaustive-deps -- hängt am Typ und den ausgeblendeten Feldern, Hilfsfunktionen sind fest
  const [jetzt, setJetzt] = useState<Record<string, boolean>>(() => {
    const such = new URLSearchParams(location.search);
    const gesucht = new Set([...such.keys()].map((k) => k.split('.')[0]).concat(such.getAll('feld')));
    const auf: Record<string, boolean> = {};
    for (const f of typ.felder) {
      const id = abschnittVon.get(f.key);
      if (id && ((f.pflicht && f.typ !== 'janein' && istLeer(ausRoh(f, start[f.key]))) || gesucht.has(f.key))) auf[id] = true;
    }
    return auf;
  });
  const oeffneAbschnitte = (keys: string[]) => {
    const ids = keys.map((k) => abschnittVon.get(k)).filter((x): x is string => !!x);
    if (ids.length) setJetzt((x) => ({ ...x, ...Object.fromEntries(ids.map((id) => [id, true])) }));
  };
  const abschnittOffen = (r: Register, ab: Abschnitt) => {
    const id = abschnittId(r.key, ab);
    return jetzt[id] ?? gemerkt[id] ?? !ab.eingeklappt;
  };
  const umschaltenAbschnitt = (r: Register, ab: Abschnitt) => {
    const id = abschnittId(r.key, ab);
    const offen = !abschnittOffen(r, ab);
    setJetzt((x) => ({ ...x, [id]: offen }));
    // Gemerkt wird nur, was von der Vorgabe abweicht; Abschnitte, die es nicht mehr gibt, fallen dabei weg.
    const neu = Object.fromEntries(
      Object.entries({ ...gemerkt, [id]: offen }).filter(
        ([k, v]) => [...abschnittVon.values()].includes(k) && v !== !alleAbschnitte.get(k)?.eingeklappt,
      ),
    );
    d.setzeEinstellung(abschnittEinstellung(typ.id), Object.keys(neu).length ? neu : null);
  };
  const alleAbschnitte = useMemo(
    () => new Map(registerVon(typ).flatMap((r) => (r.abschnitte ?? []).map((x) => [abschnittId(r.key, x), x] as const))),
    [typ],
  );
  return { oeffneAbschnitte, abschnittOffen, umschaltenAbschnitt };
}

/**
 * Alles, was die Teile des Formulars teilen: Rechte, Werte, Vorschläge, Bezüge, Anzeige und Abschnitte – Hooks in der
 * Reihenfolge, in der das Formular sie vor der Aufteilung (#1279) hatte.
 */
export function useFormularKern(p: FormularProps) {
  const { typ, mappe, details, imFenster } = p;
  const d = useDaten();
  const { ich } = useKonto();
  // Register des Typs plus System-Register „Notizen“ vor der Historie (#427).
  const register = mitNotizen(registerVon(typ));
  const r = rechteLage(p, d, ich);
  // „Mit verknüpften Mappen löschen …“ (#424) ist ein schwerer Eingriff: Gefahr mit eigener Rückfrage, danach wie
  // bisher das Lösch-Fenster mit der Auswahl (#1210, Wunsch Thomas).
  const sperreErklaerung = useLoeschsperre(
    r.loeschSperre,
    p.mitVerknuepften && (
      <Knopf art="gefahr" groesse="klein" symbol="geloescht" onClick={p.mitVerknuepften} rueckfrage={mitVerknuepftenFrage(mappe?.titel)}>
        {t('ablage.mappeformular.mit-verknuepften-mappen-loeschen')}
      </Knopf>
    ),
  );
  const w = useWerte(p, register, ich);
  const bruecke = useBruecke();
  // Auf der Seite „Dokument übernehmen“ (#934) steht „Aus Dokument ausfüllen“ nicht – das Dokument ist schon da.
  const knopf = r.nurLesen || bruecke || imFenster ? null : ausDokumentKnopf(typ);
  const ad = useAusDokument();
  const b = useBekannt(details, w.roh);
  const ae = useAenderungen(p, w, ad);
  // Speicherleiste (#1211): Reiter und Fläche gehören über diese Id zusammen.
  const registerId = `mappe-${useId().replace(/:/g, '')}`;
  const reg = register.find((x) => x.key === w.aktiv) ?? register[0];
  const a = useAnzeige(typ, w.roh, d, b.bekannt);
  const ab = useAbschnitte(typ, p.start, d, a);
  return { p, d, ich, register, ...r, sperreErklaerung, ...w, bruecke, knopf, ...ad, ...b, ...ae, registerId, reg, ...a, ...ab };
}

export type Kern = ReturnType<typeof useFormularKern>;
