import { AuswahlFilter } from '../werkbank/Sichten';
import { AnzeigeChip, AnzeigeEditor } from './Anzeige';
import { TabellenEditor } from './Tabelle';
import { kreisImStandard } from '../../../shared/src/nummernkreis';
import { moeglicheQuellen, moeglicheZielFelder } from '../../../shared/src/folgtaus';
import { type ChangeEvent, Fragment, useEffect, useRef, useState } from 'react';
import { Ansage, umgestellt, useZiehen, ziehTasten } from '../ziehen';
import {
  ABSCHNITT_TITEL_MAX, ERKENNBAR_AN_MAX, FELDTYPEN, feldtypName, freierSchluessel, INDEXPLATZHALTER, istIndexplatzhalter, REGISTERARTEN, HISTORIENGRUPPEN, historiengruppeName, historiengruppenVon, type Historiengruppe, SYSTEMSPALTEN, type Systemspalte, schluesselAus, standardRegister, titelAus, trefferlistenVon, VERWEISARTEN, vorlageFelder, wirksameVorlage, pruefeTitelFilter,
  type Abschnitt, type Feld, type Mappe, type Mappentyp, type Register, type Registerart, type Trefferliste, type Werte,
  einzigesZiel, gemeinsameFelder, jedeMappe, zielErlaubt, zieleVon,
} from '../../../shared/src/model';
import { Mehrfachauswahl } from '../ablage/Mehrfachauswahl';
import { feldVerwendung, registerAusblendbar } from '../../../shared/src/darstellung';
import { FILTER } from '../../../shared/src/titelfilter';
import { wirksameTypen } from '../../../shared/src/sichten';
import { OFFENES_REGELWERK, regelProblem, regelwerkVon, type Regelwerk } from '../../../shared/src/rechte';
import { KiAmTyp, PaketeAmTyp, RegelwerkAbschnitt, TestlaufBlatt } from '../werkbank/Berechtigungen';
import { FRIST_STANDARD } from '../../../shared/src/fristen';
import { api, ApiFehler, type Bezuege } from '../api';
import { useDaten } from '../daten';
import { geheZu, Link, loeseWache } from '../ort';
import { Speicherleiste, useEntwurf } from '../Speicherleiste';
import { titelOder } from '../seiten';
import { Hilfe } from '../Hilfe';
import { Symbol } from '../Symbol';
import { t, t as tx, tn } from '../sprache';
import { FRISTEN, JAHRE_MAX, type Archiv } from '../../../shared/src/archiv';
import { STEMPEL_MODI, type StempelModus, type StempelTyp } from '../../../shared/src/stempel';
import { useStempelVorlagen } from '../ablage/Stempel';
import { Bereich, liesOffen, merkeOffen, TYP_BEREICHE, type Klappe, type TypBereich } from './Bereich';
import { hinweis, rueckfrage } from '../rueckfrage';
import { FELDFORMATE, formatName, HEUTE, istFeldformat, type Feldformat } from '../../../shared/src/feldformate';
import { abflussBestaetigen } from '../werkbank/ErkennungPaket';
import { Beschriftungsstand, OptionenBeschriftung, SprachText } from './Beschriftung';
import { optionText, type Beschriftungen, type TypTeile } from '../../../shared/src/beschriftung';
import type { ErkennungStand } from '../api';
import { artenFuer, artVon, AUS_DOKUMENT_STANDARD, BESCHRIFTUNG_MAX, ENGINE_EINGEBAUT, ERKENNUNG_FELDTYPEN, ERKENNUNG_HINWEIS_MAX, ERKENNUNGSARTEN, WIEDERFINDEN_FELDTYPEN, type AusDokument, type Erkennungsart } from '../../../shared/src/erkennung';
import { gebietsschema } from '../../../shared/src/sprache';
import { leseZeitraum, zeitraumText } from '../../../shared/src/feldarten';
import { abfangen, Knopf } from '../bausteine';

/** Entfernen im Editor wirkt erst beim Speichern (#136). */
const ERST_BEIM_SPEICHERN = t('mappentypen.editor.das-wird-erst-mit');

/* ---------------------------------------------------------------- */

const ZAHLEN = ['minLen', 'maxLen', 'min', 'max', 'nachkomma'] as const;
type Zahlprop = (typeof ZAHLEN)[number];

/** Feld im Bearbeitungszustand: Zahlen als getippter Text, Merker für neue Felder. */
type EntwurfFeld = Omit<Feld, Zahlprop> & Record<Zahlprop, string> & { _uid: string; _neu?: boolean; _schluesselGetippt?: boolean; _register: string;
  /** Ausblenden (#655) hat „Pflicht“ aufgehoben – Hinweis am Feld, bis gespeichert ist. */
  _pflichtWeg?: boolean;
  /** „Feld wieder freigeben“ (#1034): beim Speichern `berechnetVon: null`. */
  _freigeben?: boolean };
/** Abschnitt im Entwurf (#890): `vor` ist die _uid des Felds, damit ein neuer Schlüssel nichts kaputt macht. */
interface EntwurfAbschnitt { _uid: string; vor: string; titel: string; eingeklappt?: boolean; beschriftungen?: Abschnitt['beschriftungen']; anzeigen?: Abschnitt['anzeigen'] }
/** Register im Bearbeitungszustand; welche Felder darauf liegen, steht am Feld (_register). */
type EntwurfRegister = Omit<Register, 'felder' | 'abschnitte'> & { _uid: string; _neu?: boolean; _schluesselGetippt?: boolean; abschnitte?: EntwurfAbschnitt[] };
/** Trefferliste im Entwurf (#75): Spalten als _titel usw. bzw. feld:<_uid> – damit ein umbenannter Schlüssel nichts kaputt macht. */
interface EntwurfListe { _uid: string; _neu?: boolean; key: string; name: string; spalten: string[]; standard: boolean; beschriftungen?: Trefferliste['beschriftungen'] }
interface Entwurf {
  id: string; name: string;
  /** Fester Schlüssel (#145); bei neuen Typen aus dem Namen, bis man ihn selbst tippt. */
  schluessel: string; _schluesselGetippt?: boolean; beschreibung: string; titelVorlage: string; felder: EntwurfFeld[]; register: EntwurfRegister[]; trefferlisten: EntwurfListe[];
  /** Berechtigungen (#142): mit dem Mappentyp gespeichert. */
  berechtigungen: Regelwerk;
  /** Archivmodus (#212). */
  archiv: Archiv | null;
  /** Stempel beim Weitergeben (#394): vorschlagen oder Pflicht. */
  stempel: StempelTyp | null;
  /** „Aus Dokument ausfüllen“ (#391). */
  ausDokument: AusDokument | null;
  /** Post automatisch zuordnen (#337). */
  autoZuordnen: boolean;
  /** Kann aus Post angelegt werden (#937); null = Vorgabe (an mit Dokumentenregister). */
  ausPost: boolean | null;
  /** Woran man ihn erkennt (#937). */
  erkennbarAn: string;
  /** Name, Beschreibung und „Woran man ihn erkennt“ je Sprache (#728, #937). */
  beschriftungen?: Beschriftungen<TypTeile>;
}

function neueId(): string {
  // crypto.randomUUID gibt es nur über HTTPS oder localhost; im Heimnetz oft nicht.
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const alsEntwurfRegister = ({ felder: _f, abschnitte: _a, ...r }: Register): EntwurfRegister => ({ ...r, _uid: neueId() });
/** Abschnitte eines gespeicherten Registers für den Entwurf (#890): `vor` über die _uid der Felder. */
const entwurfAbschnitte = (r: Register, felder: EntwurfFeld[]): EntwurfAbschnitt[] | undefined => (r.art !== 'felder' ? undefined
  : (r.abschnitte ?? []).flatMap((a) => { const f = felder.find((x) => x.key === a.vor); return f ? [{ _uid: neueId(), vor: f._uid, titel: a.titel ?? '', ...(a.eingeklappt ? { eingeklappt: true } : {}), ...(a.beschriftungen ? { beschriftungen: a.beschriftungen } : {}), ...(a.anzeigen ? { anzeigen: a.anzeigen } : {}) }] : []; }));

/**
 * Ein Feld verlässt sein Register (entfernt oder umgezogen, #890): Ein Abschnitt, der mit ihm begann, beginnt jetzt mit
 * dem nächsten Feld des Registers – fehlt das oder hat es schon einen, fällt er weg.
 */
function ohneAnker(x: Entwurf, uid: string): Entwurf {
  const f = x.felder.find((g) => g._uid === uid);
  if (!f) return x;
  const reihe = x.felder.filter((g) => g._register === f._register);
  const naechstes = reihe[reihe.indexOf(f) + 1];
  return { ...x, register: x.register.map((r) => (r.key !== f._register || !r.abschnitte?.some((a) => a.vor === uid) ? r : {
    ...r, abschnitte: r.abschnitte.flatMap((a) => (a.vor !== uid ? [a] : naechstes && !r.abschnitte!.some((b) => b.vor === naechstes._uid) ? [{ ...a, vor: naechstes._uid }] : [])),
  })) };
}

function entwurfAus(eintrag?: Mappentyp): Entwurf {
  if (!eintrag) return { id: neueId(), name: '', schluessel: '', beschreibung: '', titelVorlage: '', felder: [], register: standardRegister([]).map(alsEntwurfRegister), trefferlisten: [{ _uid: neueId(), key: 'standard', name: t('mappentypen.editor.standard'), spalten: [], standard: true }], berechtigungen: structuredClone(OFFENES_REGELWERK), archiv: null, stempel: null, ausDokument: null, autoZuordnen: false, ausPost: null, erkennbarAn: '' };
  const erstes = eintrag.register.find((r) => r.art === 'felder')?.key ?? '';
  const e: Entwurf = {
    id: eintrag.id, name: eintrag.name, schluessel: eintrag.schluessel ?? '', beschreibung: eintrag.beschreibung, titelVorlage: eintrag.titelVorlage ?? '',
    berechtigungen: structuredClone(regelwerkVon(eintrag)),
    archiv: eintrag.archiv ?? null,
    stempel: eintrag.stempel ?? null,
    ausDokument: eintrag.ausDokument ?? null,
    autoZuordnen: !!eintrag.autoZuordnen,
    ausPost: eintrag.ausPost ?? null,
    erkennbarAn: eintrag.erkennbarAn ?? '',
    beschriftungen: eintrag.beschriftungen,
    register: [],
    felder: eintrag.felder.map((f) => ({
      ...f, _uid: neueId(),
      _register: eintrag.register.find((r) => r.art === 'felder' && r.felder?.includes(f.key))?.key ?? erstes,
      ...Object.fromEntries(ZAHLEN.map((p) => [p, f[p] == null ? '' : String(f[p]).replace('.', ',')])),
    }) as unknown as EntwurfFeld),
    trefferlisten: [],
  };
  e.register = eintrag.register.map((r) => ({ ...alsEntwurfRegister(r), ...(r.art === 'felder' ? { abschnitte: entwurfAbschnitte(r, e.felder) } : {}) }));
  e.trefferlisten = trefferlistenVon(eintrag).map((l) => ({
    _uid: neueId(), key: l.key, name: l.name, standard: !!l.standard, beschriftungen: l.beschriftungen,
    spalten: l.spalten.flatMap((k) => {
      if (k.startsWith('_')) return [k];
      const f = e.felder.find((x) => x.key === k);
      return f ? [`feld:${f._uid}`] : [];
    }),
  }));
  return e;
}

/** Mappentyp kopieren (#147): neuer, ungespeicherter Entwurf mit Feldern, Titel, Trefferlisten, Registern und Berechtigungen. */
function kopieVon(mappentyp: Mappentyp, typen: Mappentyp[]): Entwurf {
  const e = entwurfAus(mappentyp);
  const id = neueId();
  const namen = new Set(typen.map((x) => x.name.trim().toLowerCase()));
  let name = t('mappentypen.editor.kopie-von', { name: mappentyp.name }); let n = 2;
  while (namen.has(name.toLowerCase())) name = t('mappentypen.editor.kopie-von-2', { name: mappentyp.name, wert: n++ });
  // Verweise auf sich selbst zeigen in der Kopie auf die Kopie.
  const selbst = (x?: string) => (x === mappentyp.id ? id : x);
  return {
    ...e, id, name, schluessel: freierSchluessel(name, typen.map((x) => x.schluessel ?? '')),
    felder: e.felder.map((f) => ({ ...f, ...(f.typ === 'referenz' ? { zielTypen: (f.zielTypen ?? []).map((z) => selbst(z)!) } : {}), _neu: true, _schluesselGetippt: true })),
    register: e.register.map((r) => (r.quellen ? { ...r, quellen: r.quellen.map((q) => ({ ...q, typId: selbst(q.typId)! })) } : r)),
    berechtigungen: structuredClone(e.berechtigungen),
  };
}

/** Standardwert im Editor: ein gespeicherter Zeitraum (P3M) lesbar als „3 Monate“ (#1035), sonst wie getippt. */
function standardAnzeige(f: Pick<Feld, 'typ' | 'standard'>): string {
  const s = String(f.standard ?? '');
  if (f.typ === 'zeitraum' && /^P\d+[DWMY]$/.test(s)) { const z = leseZeitraum(s); if (z) return zeitraumText(z); }
  if (f.typ === 'prozent' && /^-?\d+(\.\d+)?$/.test(s)) return s.replace('.', ',');
  return s;
}

/** Für die Vorschau, solange es keine Mappe gibt. */
function beispielWerte(felder: Feld[]): Werte {
  const w: Werte = {};
  for (const f of felder) {
    switch (f.typ) {
      case 'zahl': w[f.key] = 42; break;
      case 'betrag': w[f.key] = { betrag: 123.45, waehrung: f.waehrung || 'EUR' }; break;
      case 'zeitraum': w[f.key] = { anzahl: 3, einheit: 'monate' }; break;
      case 'prozent': w[f.key] = 19; break;
      case 'datum': w[f.key] = new Date().toISOString().slice(0, 10); break;
      case 'janein': w[f.key] = true; break;
      case 'auswahl': w[f.key] = f.optionen?.[0] ?? ''; break;
      case 'referenz': w[f.key] = 'beispiel'; break;
      case 'passwort': w[f.key] = null; break;
      // Tabelle (#1030): kein Wert.
      case 'tabelle': break;
      default: w[f.key] = f.label || f.key;
    }
  }
  return w;
}

export function TypEditor({ typ, vorlage }: { typ?: Mappentyp; vorlage?: Mappentyp }) {
  const d = useDaten();
  const neu = !typ;
  const system = typ?.system;
  const [start] = useState(() => (typ ? entwurfAus(typ) : vorlage ? kopieVon(vorlage, d.typen) : entwurfAus()));
  // Eine Kopie gilt von Anfang an als ungespeichert.
  const [basis, setBasis] = useState(() => (vorlage && !typ ? '' : JSON.stringify(start)));
  const [e, setE] = useState<Entwurf>(start);
  const [offen, setOffen] = useState<number | null>(null);
  const [ansage, setAnsage] = useState('');

  // Bereiche (#144): neu = alle offen, bestehend = zu bzw. wie zuletzt auf diesem Gerät.
  const [auf, setAuf] = useState<Set<TypBereich>>(() => {
    const x = new Set<TypBereich>(neu ? TYP_BEREICHE.map(([k]) => k) : liesOffen(typ.id) ?? []);
    const h = location.hash.slice(1);
    if (TYP_BEREICHE.some(([k]) => k === h)) x.add(h as TypBereich);
    return x;
  });
  const [fehlerOrte, setFehlerOrte] = useState<Set<TypBereich>>(new Set());
  const stelle = (n: Set<TypBereich>) => { if (!neu) merkeOffen(e.id, n); return n; };
  const springe = (k: TypBereich) => setTimeout(() => document.getElementById(k)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 30);
  const oeffne = (ks: TypBereich[], springen = true) => {
    setAuf((x) => stelle(new Set([...x, ...ks])));
    if (springen && ks[0]) springe(ks[0]);
  };
  useEffect(() => { const h = location.hash.slice(1); if (TYP_BEREICHE.some(([k]) => k === h)) springe(h as TypBereich); }, []);
  // Drag & Drop (#74): Felder umsortieren oder auf ein Feldregister ziehen; ändert nur den Entwurf.
  const zf = useZiehen({
    erlaubt: (_q, ziel, ort) => ort !== 'in' || ziel.startsWith('reg:'),
    fertig: (quelle, ziel, ort) => {
      if (ziel.startsWith('reg:')) {
        const key = ziel.slice(4);
        setE((x) => { const y = x.felder.find((f) => f._uid === quelle)?._register === key ? x : ohneAnker(x, quelle); return { ...y, felder: y.felder.map((f) => (f._uid === quelle ? { ...f, _register: key } : f)) }; });
        const f = e.felder.find((x) => x._uid === quelle);
        setAnsage(t('mappentypen.editor.liegt-jetzt-auf-register', { wert: f?.label || t('mappentypen.editor.feld'), wert2: e.register.find((r) => r.key === key)?.name ?? key }));
        return;
      }
      setE((x) => {
        const von = x.felder.findIndex((f) => f._uid === quelle), zu = x.felder.findIndex((f) => f._uid === ziel);
        return { ...x, felder: umgestellt(x.felder, von, zu, ort === 'vor' ? 'vor' : 'nach') };
      });
      setOffen(null); setFehler(null);
    },
  });
  // Neue Typen bekommen eine eigene Sicht in der Ablage, außer man wählt das ab (#38).
  const [sichtAnlegen, setSichtAnlegen] = useState(true);
  const [fehler, setFehler] = useState<{ allgemein: string[]; felder: Record<string, string[]> } | null>(null);
  const [meldung, setMeldung] = useState<string>();
  const [gruende, setGruende] = useState<string[]>([]);
  const [sendet, setSendet] = useState(false);
  // Ein leerer neuer Mappentyp gilt nicht als Änderung – Verlassen ohne Rückfrage.
  const ent = useEntwurf(basis, JSON.stringify(e), {
    neu, liste: '/werkbank/typen', aus: neu && e.felder.length === 0 && e.name === '',
    zuruecksetzen: () => { setE(JSON.parse(basis)); setFehler(null); setMeldung(undefined); setOffen(null); },
  });

  const gespeichert = d.typ(e.id);
  // Gleichzeitig bearbeiten (#917): der Stand, auf dem diese Bearbeitung beruht – geht beim Speichern mit.
  const [stand, setStand] = useState(typ?.geaendert);
  // Hat inzwischen jemand anderes gespeichert und ist hier nichts geändert, gilt gleich der neue Stand.
  useEffect(() => {
    if (neu || !gespeichert || !stand || gespeichert.geaendert <= stand || ent.geaendert) return;
    const frisch = entwurfAus(gespeichert);
    setE(frisch); setBasis(JSON.stringify(frisch)); setStand(gespeichert.geaendert);
  }, [gespeichert?.geaendert, ent.geaendert]); // eslint-disable-line react-hooks/exhaustive-deps -- nur übernehmen, wenn sich der gespeicherte Stand ändert
  // Der Entwurf als Mappentyp, für Regeln und Prüfungen im Editor.
  const entwurfTyp = { id: e.id, name: e.name, beschreibung: e.beschreibung, system: system ?? null, felder: e.felder as unknown as Feld[], register: [], erstellt: '', geaendert: '' } as unknown as Mappentyp;
  // Fehler, die man schon vor dem Speichern sieht.
  const liveFehler: Partial<Record<TypBereich, boolean>> = {
    titel: vorlageFelder(e.titelVorlage).some((k) => !istIndexplatzhalter(k) && !e.felder.some((f) => f.key === k)) || pruefeTitelFilter({ felder: e.felder as unknown as Feld[], titelVorlage: e.titelVorlage }).length > 0,
    berechtigungen: e.berechtigungen.regeln.some((r) => !!regelProblem(r, entwurfTyp)),
  };
  const hatFehler = (k: TypBereich) => fehlerOrte.has(k) || !!liveFehler[k];
  const klappe = (k: TypBereich): Klappe => ({
    offen: auf.has(k), fehler: hatFehler(k),
    umschalten: () => setAuf((x) => { const n = new Set(x); if (n.has(k)) n.delete(k); else n.add(k); return stelle(n); }),
  });
  const unpassend = gespeichert ? d.zaehler.typen[gespeichert.id]?.unpassend ?? 0 : 0;

  const setzeFeld = (i: number, patch: Partial<EntwurfFeld>) => setE((x) => {
    const felder = x.felder.map((f, j) => (j === i ? { ...f, ...patch } : f));
    return { ...x, felder };
  });
  const eindeutigerSchluessel = (basisKey: string, i: number, felder = e.felder) => {
    let k = basisKey; let n = 2;
    while (felder.some((g, j) => j !== i && g.key === k)) k = `${basisKey}_${n++}`.slice(0, 40);
    return k;
  };

  function feldHinzufuegen() {
    const i = e.felder.length;
    const f: EntwurfFeld = {
      key: eindeutigerSchluessel('neues_feld', i), label: t('mappentypen.editor.neues-feld'), typ: 'text', pflicht: false, eindeutig: false, hilfe: '', standard: '',
      minLen: '', maxLen: '', min: '', max: '', nachkomma: '', muster: '', optionen: [], mehrfach: false, zielTypen: [], verweisart: 'bezug', waehrung: 'EUR', _uid: neueId(), _neu: true,
      _register: e.register.find((r) => r.art === 'felder')?.key ?? '',
    };
    setE((x) => ({ ...x, felder: [...x.felder, f] }));
    setOffen(i);
  }
  function verschiebe(i: number, r: number) {
    const j = i + r;
    if (j < 0 || j >= e.felder.length) return;
    setE((x) => { const fs = [...x.felder]; [fs[i], fs[j]] = [fs[j], fs[i]]; return { ...x, felder: fs }; });
    setOffen((o) => (o === i ? j : o === j ? i : o));
    setFehler(null);
  }
  async function entferne(i: number) {
    const f = e.felder[i];
    // Ohne Zahlen (#512, kommen noch) lieber nachsehen.
    const n = gespeichert && (!d.zahlenDa || d.anzahl(gespeichert.id)) ? (await api.belegung(gespeichert.id).catch(() => ({} as Record<string, number>)))[f.key] ?? 0 : 0;
    const text = n
      ? t('mappentypen.editor.mappen-haben-in-einen', { anzahl: n, label: f.label, ERST_BEIM_SPEICHERN })
      : ERST_BEIM_SPEICHERN.trim();
    if (!(await rueckfrage({ titel: t('mappentypen.editor.feld-entfernen', { label: f.label }), text, ja: t('mappentypen.editor.entfernen'), gefahr: n > 0 }))) return;
    setE((x) => { const y = ohneAnker(x, f._uid); return { ...y, titelVorlage: y.titelVorlage.replace(new RegExp(`\\{${f.key}(\\|[^{}]*)?\\}`, 'g'), '').trim(), felder: y.felder.filter((g) => g._uid !== f._uid) }; });
    setOffen(null); setFehler(null);
  }

  /** Wo das Feld noch genutzt wird (#655) – Entwurf mit Spalten als Feldschlüssel. */
  const verwendung = (key: string) => feldVerwendung({
    ...entwurfTyp, titelVorlage: e.titelVorlage, archiv: e.archiv, berechtigungen: e.berechtigungen,
    trefferlisten: e.trefferlisten.map((l) => ({ key: l.key, name: l.name, beschriftungen: l.beschriftungen, spalten: l.spalten.map((k) => (k.startsWith('feld:') ? e.felder.find((f) => `feld:${f._uid}` === k)?.key ?? k : k)) })),
  }, key, d.sichten);
  /**
   * Felder ausblenden (#655): Wird eines noch genutzt, fragt der Editor vorher; Pflicht hebt er mit Hinweis auf.
   * `uids` sind die betroffenen Felder (ein Feld oder alle eines Registers); `dann` setzt das Ausblenden selbst.
   */
  async function ausblendenFragen(uids: string[], titel: string, dann: (x: Entwurf) => Entwurf) {
    const felder = e.felder.filter((f) => uids.includes(f._uid));
    const genutzt = felder.flatMap((f) => verwendung(f.key).map((v) => (felder.length > 1 ? `${f.label || f.key}: ${v}` : v)));
    if (genutzt.length && !(await rueckfrage({ titel, text: t('mappentypen.darstellung.noch-genutzt', { liste: genutzt.join(' · ') }), ja: t('mappentypen.darstellung.trotzdem-ausblenden') }))) return;
    setE((x) => {
      const y = dann(x);
      return { ...y, felder: y.felder.map((f) => (uids.includes(f._uid) && f.pflicht ? { ...f, pflicht: false, _pflichtWeg: true } : f)) };
    });
    const weg = felder.filter((f) => f.pflicht).map((f) => f.label || f.key);
    if (weg.length) setAnsage(t('mappentypen.darstellung.pflicht-aufgehoben-ansage', { felder: weg.join(', ') }));
  }

  async function speichern(bestaetigt = false) {
    setSendet(true); setMeldung(undefined); setGruende([]);
    const { trefferlisten: listen, _schluesselGetippt: _sg, ...ohneListen } = e;
    // Beschriftungen (#728) immer mitschicken, leer als null – ohne die Angabe behielte der Server die bisherigen.
    const daten = {
      ...ohneListen, beschriftungen: e.beschriftungen ?? null,
      // Ausgeblendet (#655) immer mitschicken – ohne die Angabe behielte der Server den bisherigen Wert.
      // Anzeigen, wenn … (#1033) genauso: null entfernt die Regel.
      // Feld wieder freigeben (#1034): ausdrücklich null; sonst bleibt „berechnet“, wie es ist.
      felder: e.felder.map(({ _uid, _neu, _schluesselGetippt, _register, _pflichtWeg, _freigeben, ...rest }) => ({ ...rest, beschriftungen: rest.beschriftungen ?? null, ausgeblendet: !!rest.ausgeblendet, anzeigen: rest.anzeigen ?? null, ...(_freigeben ? { berechnetVon: null } : {}) })),
      register: e.register.map(({ _uid, _neu, _schluesselGetippt, abschnitte, ...r }) => {
        const felder = e.felder.filter((f) => f._register === r.key);
        // Abschnitte (#890) als Feldschlüssel; nur vor Feldern dieses Registers, Reihenfolge der Felder.
        const ab = (abschnitte ?? []).flatMap((a) => {
          const f = felder.find((x) => x._uid === a.vor);
          const titel = a.titel.trim();
          return f ? [{ vor: f.key, ...(titel ? { titel, ...(a.eingeklappt ? { eingeklappt: true } : {}), beschriftungen: a.beschriftungen ?? null } : {}), ...(a.anzeigen ? { anzeigen: a.anzeigen } : {}) }] : [];
        });
        return { ...(r.art === 'felder' ? { ...r, felder: felder.map((f) => f.key), abschnitte: ab } : r), beschriftungen: r.beschriftungen ?? null, ausgeblendet: !!r.ausgeblendet };
      }),
      trefferlisten: listen.map(({ _uid, _neu, ...l }) => ({
        ...l, beschriftungen: l.beschriftungen ?? null, spalten: l.spalten.flatMap((k) => (k.startsWith('feld:') ? e.felder.filter((f) => `feld:${f._uid}` === k && f.typ !== 'passwort' && f.typ !== 'tabelle').map((f) => f.key) : [k])),
      })),
    };
    try {
      const mappentyp = neu ? await api.typAnlegen({ ...daten, sichtAnlegen }) : await api.typAendern(e.id, { ...daten, bestaetigt, stand });
      const sauber = entwurfAus(mappentyp);
      setE(sauber); setBasis(JSON.stringify(sauber)); setStand(mappentyp.geaendert); setFehler(null); setOffen(null); setFehlerOrte(new Set());
      // Ein neuer Typ bleibt nach dem Anlegen aufgeklappt wie gerade.
      if (neu) merkeOffen(mappentyp.id, auf);
      loeseWache();
      await d.neuLaden();
      if (neu) geheZu(`/werkbank/typen/${mappentyp.id}`);
      else setMeldung(t('mappentypen.editor.mappentyp-gespeichert'));
    } catch (err) {
      const f = err as ApiFehler;
      // Inzwischen von jemand anderem gespeichert (#917): nichts überschrieben; den neuen Stand holen –
      // „Verwerfen“ zeigt ihn dann, die eigenen Änderungen bleiben bis dahin stehen.
      if (f.status === 409 && (f.details as { konflikt?: boolean } | undefined)?.konflikt) { setMeldung(f.message); await d.neuLaden(); return; }
      // Berechtigungen (#142): Danach könnte niemand mehr Mappen dieses Typs lesen – nachfragen.
      if (f.status === 409 && (f.details as { niemand?: number } | undefined)?.niemand && !bestaetigt && await rueckfrage({ titel: t('mappentypen.editor.trotzdem-speichern'), text: f.message, ja: t('mappentypen.editor.trotzdem-speichern-2'), gefahr: true })) { setSendet(false); await speichern(true); return; }
      // Bereiche mit Fehler markieren und aufklappen (#144).
      const orte = new Set<TypBereich>();
      if (f.pruefung) {
        setFehler(f.pruefung);
        const erstes = Object.keys(f.pruefung.felder)[0];
        if (erstes !== undefined) { setOffen(Number(erstes)); orte.add('felder'); }
        for (const o of f.pruefung.orte ?? []) if (TYP_BEREICHE.some(([k]) => k === o)) orte.add(o as TypBereich);
        if (f.pruefung.allgemein.length > (f.pruefung.orte?.length ?? 0)) orte.add('grunddaten');
      }
      if ((f.details as { berechtigungen?: boolean } | undefined)?.berechtigungen) orte.add('berechtigungen');
      setFehlerOrte(orte);
      if (orte.size) oeffne(TYP_BEREICHE.map(([k]) => k).filter((k) => orte.has(k)));
      setMeldung(f.message);
    } finally { setSendet(false); }
  }

  async function loeschen() {
    if (neu) { loeseWache(); geheZu('/werkbank/typen'); return; }
    if (!(await rueckfrage({ titel: t('mappentypen.editor.mappentyp-endgueltig-loeschen', { name: e.name }), text: t('mappentypen.editor.das-laesst-sich-nicht'), ja: t('mappentypen.editor.endgueltig-loeschen'), gefahr: true }))) return;
    try {
      await api.typLoeschen(e.id);
      loeseWache(); await d.neuLaden(); geheZu('/werkbank/typen');
    } catch (err) {
      setMeldung((err as Error).message);
      setGruende((err as ApiFehler).gruende ?? []);
    }
  }

  const feldregister = e.register.filter((r) => r.art === 'felder');

  return (
    <form className="editorform" onSubmit={(ev) => { ev.preventDefault(); void speichern(); }} onKeyDown={ent.tasten} noValidate>
      <div className="seitenkopf"><div>
        <p className="ueber">{t('mappentypen.editor.mappentyp')}</p>
        <h1>{e.name || (neu ? t('mappentypen.editor.neuer-mappentyp') : t('mappentypen.editor.ohne-namen'))}{system && <span className="chip">{t('mappentypen.editor.system')}</span>}</h1>
        {gespeichert && d.zahlenDa && <p className="leise"><Link to={`/ablage/${gespeichert.id}`} className="verweis">{t('mappentypen.editor.mappen-in-der-ablage', { anzahl: d.anzahl(gespeichert.id), zahl: d.anzahl(gespeichert.id).toLocaleString(gebietsschema()) })}</Link></p>}
        {vorlage && neu && <p className="leise">{t('mappentypen.editor.kopie-von-noch-nicht', { name: vorlage.name })}</p>}
      </div>
      {gespeichert && !system && <div className="knoepfe"><Link to={`/werkbank/typen/neu?kopie=${gespeichert.id}`} className="knopf klein" title={t('mappentypen.editor.neuen-mappentyp-mit-feldern')}>{t('mappentypen.editor.mappentyp-kopieren')}</Link></div>}
      </div>

      <nav className="sprungleiste" aria-label={t('mappentypen.editor.bereiche-des-mappentyps')}>
        {TYP_BEREICHE.map(([k, name]) => (
          <button key={k} type="button" className={`sprung${auf.has(k) ? ' an' : ''}${hatFehler(k) ? ' fehler' : ''}`} onClick={() => oeffne([k])}
            title={hatFehler(k) ? t('mappentypen.editor.fehler', { name }) : name}>{name}{hatFehler(k) && <span className="fehlerpunkt" aria-label={t('mappentypen.editor.mit-fehler')}>!</span>}</button>
        ))}
        <span className="luecke" aria-hidden="true" />
        <button type="button" className="textknopf klein" onClick={() => setAuf(stelle(auf.size === TYP_BEREICHE.length ? new Set() : new Set(TYP_BEREICHE.map(([k]) => k))))}>
          {auf.size === TYP_BEREICHE.length ? t('mappentypen.editor.alle-zuklappen') : t('mappentypen.editor.alle-aufklappen')}</button>
      </nav>

      {system && (
        <div className="hinweis info"><p>{system === 'benutzer'
          ? t('mappentypen.editor.systemmappentyp-jeder-benutzer-hat')
          : t('mappentypen.editor.systemmappentyp-rollen-die-benutzer')}</p></div>
      )}
      {unpassend > 0 && (
        <div className="hinweis warn"><p>{t('mappentypen.editor.mappen-passen-nicht-zur', { anzahl: unpassend })}</p></div>
      )}
      {fehler?.allgemein.length ? <div className="hinweis schlecht"><p>{fehler.allgemein.join(' ')}</p></div> : null}
      {gruende.length > 0 && <div className="hinweis warn"><ul>{gruende.map((g) => <li key={g}>{g}</li>)}</ul></div>}

      <Bereich id="grunddaten" titel={t('mappentypen.editor.grunddaten')} klappe={klappe('grunddaten')}
        kurz={<>{tn('mappentypen.editor.kennung', { code: <code className="mono">{e.schluessel || '–'}</code> })}{e.beschreibung ? <> · {e.beschreibung}</> : null}</>}>
        <div className="raster">
          <div className="eigenschaft"><span><label htmlFor="typ-name">{t('mappentypen.editor.name')}</label></span>
            <SprachText id="typ-name" wert={e.name} placeholder={t('mappentypen.editor.z-b-vertrag')} autoFocus={neu} teil="name" beschriftungen={e.beschriftungen}
              setzeWert={(name) => setE({ ...e, name, ...(neu && !e._schluesselGetippt ? { schluessel: schluesselAus(name) } : {}) })}
              setzeBeschriftungen={(b) => setE({ ...e, beschriftungen: b as Beschriftungen<TypTeile> | undefined })} /></div>
          <label className="eigenschaft"><span>{tn('mappentypen.editor.kennung-2', { klein: <small>{neu || !gespeichert?.schluessel ? t('mappentypen.editor.wird-nach-dem-speichern') : t('mappentypen.editor.fest-name-laesst-sich')}</small> })}</span>
            <input className="mono" value={e.schluessel} placeholder={t('mappentypen.editor.z-b-vertrag-2')} disabled={!neu && !!gespeichert?.schluessel}
              onChange={(ev) => setE({ ...e, schluessel: ev.target.value, _schluesselGetippt: true })} /></label>
        </div>
        <div className="eigenschaft"><span><label htmlFor="typ-beschreibung">{t('mappentypen.editor.beschreibung')}</label></span>
          <SprachText id="typ-beschreibung" wert={e.beschreibung} placeholder={t('mappentypen.editor.wofuer-ist-dieser-mappentyp')} teil="beschreibung" beschriftungen={e.beschriftungen}
            setzeWert={(beschreibung) => setE({ ...e, beschreibung })} setzeBeschriftungen={(b) => setE({ ...e, beschriftungen: b as Beschriftungen<TypTeile> | undefined })} /></div>
        {/* Dokument übernehmen (#937): nicht bei Systemtypen – die sind nie Ziel von „Wohin gehört das?“. */}
        {!system && <DokumentUebernehmen e={e} setE={setE} />}
        {/* „12 von 14 Beschriftungen auf Englisch“ (#728): nur ein Hinweis, nie ein Fehler. */}
        <Beschriftungsstand typ={{ ...e, felder: e.felder as unknown as Feld[], register: e.register as unknown as Register[], trefferlisten: e.trefferlisten }} />
        {neu && <label className="haken"><input type="checkbox" checked={sichtAnlegen} onChange={(ev) => setSichtAnlegen(ev.target.checked)} />
          <span>{tn('mappentypen.editor.eigene-ansicht-in-der', { klein: <small className="hilfe">{t('mappentypen.editor.abwaehlen-wenn-die-mappen')}</small> })}</span></label>}
        {gespeichert && <VerwendetIn typ={gespeichert} />}
      </Bereich>

      <Bereich id="felder" titel={t('mappentypen.editor.felder')} hilfe={<Hilfe ort="mappentyp.felder" />} klappe={klappe('felder')} kurz={feldKurz(e.felder)}
        beschreibung={<>{tn('mappentypen.editor.feld-anklicken-um-feldart', { hilfe: <Hilfe ort="mappentyp.ziehen" /> })}</>}>
        <div className="feldliste">
          {e.felder.length === 0 && <div className="leer"><p>{t('mappentypen.editor.noch-keine-felder-fuege')}</p></div>}
          {e.felder.map((f, i) => (
            <FeldZeile key={f._uid} f={f} i={i} anzahl={e.felder.length} offen={offen === i} fehler={fehler?.felder[String(i)]}
              zieh={zf.eintrag(f._uid)} griff={<button {...zf.griff(f._uid, f.label || t('mappentypen.editor.feld'))} onKeyDown={(ev) => ziehTasten(ev, {
                hoch: i > 0 ? () => { verschiebe(i, -1); setAnsage(t('mappentypen.editor.steht-jetzt-an-stelle', { wert: f.label || t('mappentypen.editor.feld'), i })); } : undefined,
                runter: i < e.felder.length - 1 ? () => { verschiebe(i, 1); setAnsage(t('mappentypen.editor.steht-jetzt-an-stelle-2', { wert: f.label || t('mappentypen.editor.feld'), wert2: i + 2 })); } : undefined,
              })}><span aria-hidden="true">⠿</span></button>}
              eigeneId={e.id} eigenerName={e.name} typen={d.typen} feldregister={feldregister}
              alleFelder={e.felder.map((x) => ({ key: x.key, label: x.label || x.key, typ: x.typ, optionen: x.optionen, zielTypen: x.zielTypen, mehrfach: x.mehrfach }) as Feld)}
              benutzerFelder={e.felder.filter((x) => x.typ === 'referenz' && !x.mehrfach && !!einzigesZiel(x) && einzigesZiel(x) === d.typen.find((mappentyp) => mappentyp.system === 'benutzer')?.id).map((x) => ({ key: x.key, label: x.label || x.key }))}
              umschalten={() => setOffen(offen === i ? null : i)}
              verschiebe={(r) => verschiebe(i, r)} entferne={() => void entferne(i)}
              ausblenden={(an) => (an
                ? void ausblendenFragen([f._uid], t('mappentypen.darstellung.feld-ausblenden', { label: f.label || f.key }), (x) => ({ ...x, felder: x.felder.map((g) => (g._uid === f._uid ? { ...g, ausgeblendet: true } : g)) }))
                : setE((x) => ({ ...x, felder: x.felder.map((g) => (g._uid === f._uid ? { ...g, ausgeblendet: undefined, _pflichtWeg: undefined } : g)) })))}
              registerAusgeblendet={!!e.register.find((r) => r.key === f._register)?.ausgeblendet}
              berechnung={typ?.berechnung}
              setze={(patch) => {
                const p = { ...patch };
                if ('label' in p && f._neu && !f._schluesselGetippt) p.key = eindeutigerSchluessel(schluesselAus(p.label ?? ''), i);
                if ('key' in p) p._schluesselGetippt = true;
                if ('typ' in p) p.standard = p.typ === 'janein' ? false : '';
                // Ein Abschnitt, der mit dem Feld begann, bleibt im alten Register (#890).
                if ('_register' in p && p._register !== f._register) setE((x) => ohneAnker(x, f._uid));
                setzeFeld(i, p);
              }} />
          ))}
        </div>
        <div><button type="button" className="knopf" onClick={feldHinzufuegen}>{t('mappentypen.editor.feld-hinzufuegen')}</button></div>
        <Ansage text={ansage} />
      </Bereich>

      <TitelEditor e={e} setze={(titelVorlage) => setE((x) => ({ ...x, titelVorlage }))} klappe={klappe('titel')} />

      <TrefferlisteEditor e={e} setE={setE} klappe={klappe('trefferlisten')} />

      <RegisterEditor e={e} setE={setE} feldAblage={(key) => zf.ablage(`reg:${key}`)} klappe={klappe('register')} ausblendenFragen={ausblendenFragen} />
      <Bereich id="archiv" titel={t('mappentypen.editor.archivmodus')} hilfe={<Hilfe ort="mappentyp.archiv" />} klappe={klappe('archiv')}
        kurz={e.archiv ? <>{t('mappentypen.editor.an-jahre-ab', { jahre: e.archiv.jahre })}{' '}{e.archiv.stichtag ? e.felder.find((f) => f.key === e.archiv!.stichtag)?.label ?? e.archiv.stichtag : t('mappentypen.editor.anlagedatum')}</> : t('mappentypen.editor.aus')}>
        <ArchivEinstellung archiv={e.archiv} setze={(archiv) => setE({ ...e, archiv })} datumsfelder={e.felder.filter((f) => f.typ === 'datum' && f.key).map((f) => ({ key: f.key, label: f.label || f.key }))} typId={gespeichert?.id} />
      </Bereich>

      <Bereich id="stempel" titel={t('mappentypen.editor.stempel-beim-weitergeben')} hilfe={<Hilfe ort="mappentyp.stempel" />} klappe={klappe('stempel')}
        kurz={e.stempel ? STEMPEL_MODI[e.stempel.modus] : t('mappentypen.editor.aus')}>
        <StempelEinstellung stempel={e.stempel} setze={(stempel) => setE({ ...e, stempel })} />
      </Bereich>

      {!system && <Bereich id="erkennung" titel={t('mappentypen.editor.erkennung')} hilfe={<Hilfe ort="mappentyp.erkennungstyp" />} klappe={klappe('erkennung')}
        kurz={[e.ausDokument?.aus ? t('mappentypen.editor.knopf-aus') : `„${e.ausDokument?.beschriftung || AUS_DOKUMENT_STANDARD}“`, t('mappentypen.editor.felder-markiert', { zahl: e.felder.filter((f) => f.erkennung).length }), t('mappentypen.editor.felder-wiederfinden', { zahl: e.felder.filter((f) => f.wiederfinden).length }), ...(e.autoZuordnen && !e.archiv ? [t('mappentypen.editor.post-automatisch-zuordnen')] : [])].join(' · ')}>
        <ErkennungTyp ad={e.ausDokument} setze={(ausDokument) => setE((x) => ({ ...x, ausDokument }))} wiederfinden={e.felder.filter((f) => f.wiederfinden && WIEDERFINDEN_FELDTYPEN.includes(f.typ)).map((f) => f.label || f.key)} felder={e.felder.filter((f) => f.erkennung).map((f) => f.label || f.key)} />
        <div className="raster">
          <div className="eigenschaft unten">
            <label className="haken"><input type="checkbox" checked={e.autoZuordnen && !e.archiv} disabled={!!e.archiv} onChange={(ev) => setE((x) => ({ ...x, autoZuordnen: ev.target.checked }))} />
              <span>{tn('mappentypen.editor.post-automatisch-zuordnen-wenn', { klein: <small className="hilfe">{e.archiv
                ? t('mappentypen.editor.im-archivmodus-nicht-moeglich')
                : t('mappentypen.editor.sicher-heisst-absender-eindeutig')}</small> })}</span></label>
          </div>
        </div>
      </Bereich>}

      <RegelwerkAbschnitt rw={e.berechtigungen} setRw={(f) => setE((x) => ({ ...x, berechtigungen: f(x.berechtigungen) }))} neu={neu}
        gespeichert={gespeichert ? regelwerkVon(gespeichert) : null} typ={entwurfTyp} klappe={klappe('berechtigungen')} />
      <TestlaufBlatt typId={gespeichert?.id ?? ''} entwurf={e.berechtigungen} klappe={klappe('testlauf')} />
      {typ?.system !== 'benutzer' && <PaketeAmTyp typId={gespeichert?.id ?? ''} klappe={klappe('pakete')} />}
      {typ?.system !== 'benutzer' && <KiAmTyp typId={gespeichert?.id ?? ''} klappe={klappe('ki')} />}

      <Speicherleiste ent={ent} gegenstand={t('mappentypen.editor.mappentyp')} sendet={sendet} meldung={meldung ? { art: fehler ? 'schlecht' : 'gut', text: meldung } : undefined}
        links={neu || system ? undefined : <button type="button" className="textknopf gefahr" onClick={() => void loeschen()}>{t('mappentypen.editor.mappentyp-loeschen')}</button>} />
    </form>
  );
}

/** Kurzinfo der Felder (#144), z. B. „8 Felder, 2 Pflicht, 1 Frist“. */
function feldKurz(felder: EntwurfFeld[]): string {
  if (!felder.length) return t('mappentypen.editor.noch-keine-felder');
  const pflicht = felder.filter((f) => f.pflicht).length;
  const frist = felder.filter((f) => f.typ === 'datum' && f.frist).length;
  // Ausgeblendete Felder (#655) zählen mit – sie sind ja noch da.
  const aus = felder.filter((f) => f.ausgeblendet).length;
  return [t('mappentypen.editor.felder-2', { anzahl: felder.length }), pflicht && t('mappentypen.editor.pflicht', { pflicht }), frist && t('mappentypen.editor.fristen', { anzahl: frist }), aus && t('mappentypen.darstellung.ausgeblendete-felder', { anzahl: aus })].filter(Boolean).join(', ');
}

/** „Verwendet in“ (#147): Sichten, Referenzfelder und Verknüpfungsregister, die diesen Typ nutzen. */
function VerwendetIn({ typ }: { typ: Mappentyp }) {
  const d = useDaten();
  const sichten = d.sichten.filter((s) => s.typen.includes(typ.id));
  const felder = d.typen.filter((mappentyp) => mappentyp.id !== typ.id).flatMap((mappentyp) => mappentyp.felder.filter((f) => f.typ === 'referenz' && zieleVon(f).includes(typ.id)).map((f) => ({ t: mappentyp, f })));
  const register = d.typen.filter((mappentyp) => mappentyp.id !== typ.id)
    .flatMap((mappentyp) => mappentyp.register.filter((r) => r.art === 'verknuepfungen' && r.quellen?.some((q) => q.typId === typ.id)).map((r) => ({ t: mappentyp, r })));
  // Tabellen (#1030) anderer Typen, die Mappen dieses Typs zeigen.
  const tabellen = d.typen.filter((mappentyp) => mappentyp.id !== typ.id).flatMap((mappentyp) => mappentyp.felder.filter((f) => f.typ === 'tabelle' && f.quelle?.typId === typ.id).map((f) => ({ t: mappentyp, f })));
  const leer = !sichten.length && !felder.length && !register.length && !tabellen.length;
  return (
    <div className="verwendet">
      <h3 className="zwischen">{t('mappentypen.editor.verwendet-in')}</h3>
      {leer ? <p className="leise klein">{t('mappentypen.editor.nirgends-verwendet-keine-ansicht')}</p> : (
        <ul className="verwendetliste klein">
          {sichten.map((s) => <li key={s.id}>{tn('mappentypen.editor.ansicht', { link: <Link to={`/werkbank/sichten/${s.id}`} className="verweis">{s.name}</Link> })}</li>)}
          {felder.map(({ t: mappentyp, f }) => <li key={`${mappentyp.id}-${f.key}`}>{tn('mappentypen.editor.feld-2', { link: <Link to={`/werkbank/typen/${mappentyp.id}#felder`} className="verweis">{mappentyp.name} › {f.label || f.key}</Link> })}</li>)}
          {register.map(({ t: mappentyp, r }) => <li key={`${mappentyp.id}-${r.key}`}>{tn('mappentypen.editor.verknuepfungsregister', { link: <Link to={`/werkbank/typen/${mappentyp.id}#register`} className="verweis">{mappentyp.name} › {r.name}</Link> })}</li>)}
          {tabellen.map(({ t: mappentyp, f }) => <li key={`t-${mappentyp.id}-${f.key}`}>{tn('mappentypen.tabelle.verwendet', { link: <Link to={`/werkbank/typen/${mappentyp.id}#felder`} className="verweis">{mappentyp.name} › {f.label || f.key}</Link> })}</li>)}
        </ul>
      )}
    </div>
  );
}

function FeldZeile(p: {
  f: EntwurfFeld; i: number; anzahl: number; offen: boolean; fehler?: string[];
  eigeneId: string; eigenerName: string; typen: Mappentyp[]; feldregister: EntwurfRegister[];
  /** Fristen (#129): Benutzerfelder dieses Typs als möglicher Empfänger. */
  benutzerFelder: Array<{ key: string; label: string }>;
  /** Auswahlfilter (#173): die Felder dieses Typs, deren Werte der Filter nutzen kann. */
  alleFelder: Feld[];
  umschalten(): void; verschiebe(r: number): void; entferne(): void; setze(patch: Partial<EntwurfFeld>): void;
  /** Ausblenden (#655): an mit Rückfrage, wenn das Feld noch genutzt wird; aus sofort. */
  ausblenden(an: boolean): void;
  /** Das Register des Felds ist ausgeblendet – dann ist es das Feld auch. */
  registerAusgeblendet: boolean;
  /** Berechnete Felder (#1034): je Paket Name und ob es noch rechnet. */
  berechnung?: Mappentyp['berechnung'];
  zieh: { className: string }; griff: React.ReactNode;
}) {
  const { f, i, offen, fehler, setze } = p;
  const id = (x: string) => `f${i}-${x}`;
  // Ziele (#1036): einer oder mehrere Mappentypen; „jede Mappe“ nur an Systemfeldern.
  const zielNameVon = (z: string) => (z === p.eigeneId ? (p.eigenerName || t('mappentypen.editor.dieser-mappentyp')) : p.typen.find((mappentyp) => mappentyp.id === z)?.name ?? '–');
  const ziele = zieleVon(f);
  const zielName = jedeMappe(f) ? t('mappentypen.editor.jede-mappe') : ziele.length ? ziele.map(zielNameVon).join(', ') : f.zielOptional?.length ? t('mappentypen.editor.ziele-offen') : '–';

  const chips: string[] = [];
  if (f.system) chips.push(t('mappentypen.editor.system'));
  // Berechnet (#1034): von welchem Paket – oder „nicht mehr berechnet“.
  const berechnetVon = f.berechnetVon && !f._freigeben ? f.berechnetVon : undefined;
  const bInfo = berechnetVon ? p.berechnung?.[berechnetVon] : undefined;
  const bPaket = bInfo?.name ?? berechnetVon ?? '';
  if (berechnetVon) chips.push(bInfo?.aktiv === false ? t('mappentypen.berechnet.chip-nicht-mehr') : t('mappentypen.berechnet.chip', { paket: bPaket }));
  if (f.ausgeblendet || p.registerAusgeblendet) chips.push(t('mappentypen.darstellung.chip.ausgeblendet'));
  if (f.eindeutig && (f.typ === 'text' || f.typ === 'zahl')) chips.push('eindeutig');
  if (f.typ === 'referenz') chips.push(`→ ${zielName}`, VERWEISARTEN[f.verweisart ?? 'bezug']);
  if (f.typ === 'tabelle' && f.quelle?.typId) chips.push(`← ${zielNameVon(f.quelle.typId)}`);
  if (f.typ === 'auswahl') chips.push(t('mappentypen.editor.werte', { zahl: (f.optionen ?? []).length }));
  if (f.mehrfach && (f.typ === 'auswahl' || f.typ === 'referenz')) chips.push('mehrfach');
  if (f.typ === 'referenz' && f.mehrfach && f.gleicherTyp) chips.push(t('mappentypen.editor.chip.gleicher-typ'));
  if (p.feldregister.length > 1) chips.push(t('mappentypen.editor.register', { wert: p.feldregister.find((r) => r.key === f._register)?.name ?? '–' }));
  if (f.erkennung && ERKENNUNG_FELDTYPEN.includes(f.typ)) chips.push(t('mappentypen.editor.chip.aus-dokument'));
  if (f.wiederfinden && WIEDERFINDEN_FELDTYPEN.includes(f.typ)) chips.push(t('mappentypen.editor.chip.wiederfinden'));
  // Paket-Update (#534): Verweisfeld, das sich aus einem alten Textfeld füllen lässt.
  if (f.typ === 'referenz' && f.folgtAus) chips.push(t('mappentypen.editor.folgt-aus-chip', { feld: p.alleFelder.find((x) => x.key === f.folgtAus!.feld)?.label ?? f.folgtAus.feld }));
  if (f.typ === 'referenz' && f.ausText) chips.push(tx('pakete.typ.austext', { aus: p.alleFelder.find((x) => x.key === f.ausText)?.label ?? f.ausText }));
  // Format und Datumsgrenzen (#535).
  if (f.typ === 'text' && istFeldformat(f.format)) chips.push(t('felder.editor.chip.format', { format: formatName(f.format) }));
  const grenzeText = (g: string) => (g === HEUTE ? t('felder.editor.datum.heute') : /^\d{4}-\d{2}-\d{2}$/.test(g) ? `${g.slice(8, 10)}.${g.slice(5, 7)}.${g.slice(0, 4)}` : g);
  if (f.typ === 'datum' && f.min) chips.push(t('felder.editor.chip.min', { datum: grenzeText(f.min) }));
  if (f.typ === 'datum' && f.max) chips.push(t('felder.editor.chip.max', { datum: grenzeText(f.max) }));
  if (f.typ === 'datum' && f.frist) chips.push(t('felder.editor.chip.frist'));
  if (f.typ === 'betrag' && f.negativ) chips.push(t('mappentypen.editor.chip.negativ'));

  const zahl = (prop: Zahlprop, label: string, platzhalter: string) => (
    <label className="eigenschaft" htmlFor={id(prop)}><span>{label}</span>
      <input id={id(prop)} inputMode="decimal" placeholder={platzhalter} value={f[prop]} onChange={(e) => setze({ [prop]: e.target.value } as Partial<EntwurfFeld>)} /></label>
  );
  const haken = (prop: 'pflicht' | 'eindeutig' | 'mehrfach' | 'negativ', label: string, hilfe: string) => (
    <label className="haken"><input type="checkbox" checked={!!f[prop]} onChange={(e) => setze({ [prop]: e.target.checked })} /><span><span className="haken-titel">{label}</span><small className="hilfe">{hilfe}</small></span></label>
  );

  let besonders = null;
  if (f.typ === 'text' || f.typ === 'langtext' || f.typ === 'formatiert') besonders = <div className="raster">
    {zahl('minLen', t('mappentypen.editor.mindestlaenge'), t('mappentypen.editor.leer.keine'))}{zahl('maxLen', t('mappentypen.editor.hoechstlaenge'), t('mappentypen.editor.leer.keine'))}
    {f.typ === 'text' && <label className="eigenschaft" htmlFor={id('muster')}><span>{tn('mappentypen.editor.muster', { klein: <small>{t('mappentypen.editor.regulaerer-ausdruck')}</small> })}</span><input id={id('muster')} className="mono" placeholder="z. B. [A-Z]{2}-\d+" value={f.muster ?? ''} onChange={(e) => setze({ muster: e.target.value })} /></label>}
    {f.typ === 'text' && <FormatEditor f={f} id={id} setze={setze} alleFelder={p.alleFelder} />}
  </div>;
  else if (f.typ === 'zahl' || f.typ === 'prozent') besonders = <div className="raster">{zahl('min', t('mappentypen.editor.minimum'), t('mappentypen.editor.leer.keins'))}{zahl('max', t('mappentypen.editor.maximum'), t('mappentypen.editor.leer.keins'))}{zahl('nachkomma', t('mappentypen.editor.nachkommastellen'), t('mappentypen.editor.leer.beliebig'))}</div>;
  else if (f.typ === 'betrag') besonders = <div className="raster">{zahl('min', t('mappentypen.editor.minimum'), t('mappentypen.editor.leer.keins'))}{zahl('max', t('mappentypen.editor.maximum'), t('mappentypen.editor.leer.keins'))}
    <label className="eigenschaft" htmlFor={id('waehrung')}><span>{t('mappentypen.editor.standardwaehrung')}</span><input id={id('waehrung')} className="mono" maxLength={3} value={f.waehrung ?? 'EUR'} onChange={(e) => setze({ waehrung: e.target.value.toUpperCase() })} /></label>
    {/* Negative Beträge (#1035): Vorgabe aus, also wie bisher ≥ 0. */}
    <div className="eigenschaft unten">{haken('negativ', t('mappentypen.editor.negativ'), t('mappentypen.editor.negativ-hilfe'))}</div></div>;
  else if (f.typ === 'zeitraum') besonders = <p className="leise klein">{t('mappentypen.editor.zeitraum-hilfe')}</p>;
  else if (f.typ === 'auswahl') besonders = <div className="raster">
    <label className="eigenschaft" htmlFor={id('optionen')}><span>{tn('mappentypen.editor.auswahlwerte', { klein: <small>{t('mappentypen.editor.einer-pro-zeile')}</small> })}</span>
      <textarea id={id('optionen')} rows={4} defaultValue={(f.optionen ?? []).join('\n')} onBlur={(e) => setze({ optionen: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })} /></label>
    <div className="eigenschaft unten">{haken('mehrfach', t('mappentypen.editor.mehrfachauswahl'), t('mappentypen.editor.mehrere-werte-gleichzeitig-waehlbar'))}</div>
  </div>;
  else if (f.typ === 'datum') besonders = <><DatumGrenzen f={f} id={id} setze={setze} /><FristEditor f={f} id={id} setze={setze} benutzerFelder={p.benutzerFelder} /></>;
  else if (f.typ === 'passwort') besonders = <p className="leise klein">{t('mappentypen.editor.wird-verschluesselt-gespeichert-und')}</p>;
  // Tabelle (#1030): Quelle wie ein Verknüpfungsregister, Spalten aus einer Trefferliste des anderen Typs, „+ Neu“.
  else if (f.typ === 'tabelle') besonders = <TabellenEditor f={f} id={id} eigeneId={p.eigeneId} eigenerName={p.eigenerName} typen={p.typen} eigeneFelder={p.alleFelder} setze={setze} />;
  else if (f.typ === 'referenz') besonders = <><div className="raster">
    <div className="eigenschaft"><label htmlFor={id('ziel')}>{t('mappentypen.editor.verweist-auf-mappen-vom')}</label>
      {jedeMappe(f) ? <p className="leise">{t('mappentypen.editor.jede-mappe')}</p>
        : <ZielTypenWahl id={id('ziel')} f={f} typen={p.typen} eigeneId={p.eigeneId} eigenerName={p.eigenerName} setze={setze} />}
      <small className="hilfe">{t('mappentypen.editor.dieser-mappentyp-ergibt-eine')} {t('mappentypen.editor.mehrere-ziele-hilfe')}</small></div>
    <fieldset className="wahl"><legend>{t('mappentypen.editor.art-des-verweises')}</legend>
      <label className="haken"><input type="radio" name={id('va')} checked={f.verweisart === 'zugehoerigkeit'} onChange={() => setze({ verweisart: 'zugehoerigkeit' })} /><span>{tn('mappentypen.editor.zugehoerigkeit', { klein: <small className="hilfe">{t('mappentypen.editor.gehoert-zu-zaehlt-bei')}</small> })}</span></label>
      <label className="haken"><input type="radio" name={id('va')} checked={f.verweisart !== 'zugehoerigkeit'} onChange={() => setze({ verweisart: 'bezug' })} /><span>{tn('mappentypen.editor.bezug', { klein: <small className="hilfe">{t('mappentypen.editor.nur-verknuepft-z-b')}</small> })}</span></label>
    </fieldset>
    <div className="eigenschaft unten">{haken('mehrfach', t('mappentypen.editor.mehrere-mappen-erlaubt'), t('mappentypen.editor.z-b-eine-zahlung'))}
      {/* „Alle vom selben Typ“ (#1036): nur mit mehreren Mappen und mehr als einem möglichen Zieltyp. */}
      {f.mehrfach && (ziele.length > 1 || !!f.zielOptional?.length) && <label className="haken"><input type="checkbox" checked={!!f.gleicherTyp} onChange={(e) => setze({ gleicherTyp: e.target.checked || undefined })} /><span><span className="haken-titel">{t('mappentypen.editor.gleicher-typ')}</span><small className="hilfe">{t('mappentypen.editor.gleicher-typ-hilfe')}</small></span></label>}
    </div>
  </div>
  {/* Auswahlfilter (#172): nicht für „jede Mappe“. Eigene Zeile in voller Breite (#372) – Bedingungen brauchen Platz.
      Mehrere Zieltypen (#1036): Bedingungen über die Felder, die alle haben. */}
  {ziele.length > 0 && (() => {
    if (ziele.includes(p.eigeneId)) return <p className="leise klein">{t('mappentypen.editor.einen-auswahlfilter-auf-diesen')}</p>;
    const zt = ziele.map((z) => p.typen.find((mappentyp) => mappentyp.id === z)).filter((x): x is Mappentyp => !!x);
    if (zt.length !== ziele.length) return null;
    const ziel = zt.length === 1 ? zt[0] : { ...zt[0], id: '', name: zt.map((x) => x.name).join(', '), felder: gemeinsameFelder(zt.map((x) => x.felder)) };
    return <div><AuswahlFilter ziel={ziel} zielTypen={ziele} bedingungen={f.auswahlFilter ?? []} setze={(b) => setze({ auswahlFilter: b })} eigeneFelder={p.alleFelder} feldKey={f.key} /></div>;
  })()}
  {/* Folgt aus (#886): nur bei genau einem Ziel-Mappentyp. */}
  {!!einzigesZiel(f) && <FolgtAusEditor f={f} id={id} setze={setze} alleFelder={p.alleFelder} felderVon={(x) => (x === p.eigeneId ? p.alleFelder : p.typen.find((y) => y.id === x)?.felder)} />}
  </>;

  let standard = null;
  if (f.typ === 'text' || f.typ === 'langtext' || f.typ === 'formatiert' || f.typ === 'zahl' || f.typ === 'betrag' || f.typ === 'prozent' || f.typ === 'zeitraum')
    standard = <label className="eigenschaft" htmlFor={id('std')}><span>{tn('mappentypen.editor.standardwert', { wert: f.typ === 'text' ? <small>{kreisImStandard(f.standard) ? t('mappentypen.editor.nummernkreis-das-feld-wird') : t('mappentypen.editor.oder-nummernkreis-schluessel')}</small> : f.typ === 'zeitraum' && <small>{t('mappentypen.editor.zeitraum-standard')}</small> })}</span><input id={id('std')} placeholder={t('mappentypen.editor.leer')} value={standardAnzeige(f)} onChange={(e) => setze({ standard: e.target.value })} /></label>;
  else if (f.typ === 'datum')
    standard = <label className="eigenschaft" htmlFor={id('std')}><span>{t('mappentypen.editor.standardwert-2')}</span><input id={id('std')} type="date" value={String(f.standard ?? '')} onChange={(e) => setze({ standard: e.target.value })} /></label>;
  else if (f.typ === 'janein')
    standard = <div className="eigenschaft unten"><label className="haken"><input type="checkbox" checked={f.standard === true} onChange={(e) => setze({ standard: e.target.checked })} /><span><span className="haken-titel">{t('mappentypen.editor.standardmaessig-ja')}</span></span></label></div>;
  else if (f.typ === 'auswahl' && !f.mehrfach)
    standard = <label className="eigenschaft" htmlFor={id('std')}><span>{t('mappentypen.editor.standardwert-2')}</span><select id={id('std')} value={String(f.standard ?? '')} onChange={(e) => setze({ standard: e.target.value })}>
      <option value="">{t('mappentypen.editor.keiner')}</option>{(f.optionen ?? []).map((o) => <option key={o} value={o}>{optionText(f, o)}</option>)}</select></label>;

  return (
    <div {...p.zieh} className={`feldzeile ${offen ? 'offen' : ''} ${fehler ? 'fehlerhaft' : ''} ${f.ausgeblendet || p.registerAusgeblendet ? 'ausgeblendet' : ''} ${p.zieh.className}`}>
      <div className="feldsumme">
        {p.griff}
        <button type="button" className="feldkopfknopf" aria-expanded={offen} onClick={p.umschalten}>
          <span className="flabel">{f.label || t('mappentypen.editor.ohne-bezeichnung')}{f.pflicht && <span className="pflicht">*</span>}</span>
          <code className="fkey">{f.key}</code>
          <span className="ftyp">{feldtypName(f.typ)}</span>
          {(chips.length > 0 || f.anzeigen) && <span className="chips">{chips.map((c) => <span key={c} className="chip">{c}</span>)}<AnzeigeChip regel={f.anzeigen} typ={{ felder: p.alleFelder }} /></span>}
        </button>
        <div className="feldaktionen">
          <button type="button" className="symbol" disabled={i === 0} onClick={() => p.verschiebe(-1)} aria-label={t('mappentypen.editor.feld-nach-oben')}>↑</button>
          <button type="button" className="symbol" disabled={i === p.anzahl - 1} onClick={() => p.verschiebe(1)} aria-label={t('mappentypen.editor.feld-nach-unten')}>↓</button>
        </div>
      </div>
      {fehler && !offen && <p className="fehlertext eingerueckt">{fehler.join(' ')}</p>}
      {offen && (
        <div className="feldeditor">
          {fehler && <div className="hinweis schlecht"><p>{fehler.join(' ')}</p></div>}
          {f.system && <p className="leise klein">{t('mappentypen.editor.systemfeld-bezeichnung-hilfetext-und')}</p>}
          {/* Berechnet (#1034): nur das Paket schreibt den Wert; freigeben erst, wenn es nicht mehr rechnet. */}
          {berechnetVon && <div className={`hinweis ${bInfo?.aktiv === false ? 'warn' : 'info'} berechnetinfo`} data-anker="mappentyp.berechnet">
            <p><Symbol name="rechnen" /> {bInfo?.aktiv === false ? t('mappentypen.berechnet.nicht-mehr', { paket: bPaket }) : t('mappentypen.berechnet.aktiv', { paket: bPaket })} <Hilfe ort="mappentyp.berechnet" /></p>
            {bInfo?.aktiv === false && <p><Knopf art="neben" groesse="klein" onClick={() => setze({ _freigeben: true })}>{t('mappentypen.berechnet.freigeben')}</Knopf></p>}
          </div>}
          {f.berechnetVon && f._freigeben && <div className="hinweis info berechnetinfo"><p>{t('mappentypen.berechnet.wird-freigegeben')}{' '}
            <Knopf art="link" groesse="klein" onClick={() => setze({ _freigeben: undefined })}>{t('mappentypen.berechnet.rueckgaengig')}</Knopf></p></div>}
          <div className="raster">
            <div className="eigenschaft"><span><label htmlFor={id('label')}>{t('mappentypen.editor.bezeichnung')}</label></span>
              <SprachText id={id('label')} wert={f.label} placeholder={t('mappentypen.editor.z-b-kuendigung-bis')} autoFocus={f._neu} teil="label" beschriftungen={f.beschriftungen}
                setzeWert={(label) => setze({ label })} setzeBeschriftungen={(b) => setze({ beschriftungen: b as Feld['beschriftungen'] })} /></div>
            {/* Hilfetext neben der Bezeichnung, bei allen Feldarten an derselben Stelle (#372). */}
            <div className="eigenschaft"><span><label htmlFor={id('hilfe')}>{t('mappentypen.editor.hilfetext')}</label></span>
              <SprachText id={id('hilfe')} wert={f.hilfe ?? ''} placeholder={t('mappentypen.editor.erklaerung-die-beim-ausfuellen')} teil="hilfe" beschriftungen={f.beschriftungen}
                setzeWert={(hilfe) => setze({ hilfe })} setzeBeschriftungen={(b) => setze({ beschriftungen: b as Feld['beschriftungen'] })} /></div>
            {p.feldregister.length > 1 && (
              <label className="eigenschaft" htmlFor={id('reg')}><span>{t('mappentypen.editor.register-2')}</span>
                <select id={id('reg')} value={f._register} onChange={(e) => setze({ _register: e.target.value })}>
                  {p.feldregister.map((r) => <option key={r._uid} value={r.key}>{r.name || r.key}</option>)}
                </select></label>
            )}
          </div>
          {/* Bei Systemfeldern sind Schlüssel, Datentyp und Eigenschaften fest. */}
          <fieldset className="ohnerahmen" disabled={f.system}>
          <div className="raster">
            <label className="eigenschaft" htmlFor={id('key')}><span>{tn('mappentypen.editor.kennung-2', { klein: <small>{f._neu ? t('mappentypen.editor.wird-nach-dem-speichern') : t('mappentypen.editor.fest-schuetzt-gespeicherte-werte')}</small> })}</span>
              <input id={id('key')} className="mono" value={f.key} disabled={!f._neu} onChange={(e) => setze({ key: e.target.value })} /></label>
            <label className="eigenschaft" htmlFor={id('typ')}><span>{t('mappentypen.editor.feldart')}</span>
              <select id={id('typ')} value={f.typ} onChange={(e) => setze({ typ: e.target.value as Feld['typ'] })}>
                {(Object.keys(FELDTYPEN) as Feld['typ'][]).map((k) => <option key={k} value={k}>{feldtypName(k)}</option>)}
              </select></label>
          </div>
          <div className="raster">
            {/* Ausgeblendete Felder (#655) können nicht Pflicht sein – sonst ließe sich keine Mappe speichern. */}
            {/* Tabellen (#1030) haben keinen Wert – nie Pflicht. */}
            {f.typ !== 'tabelle' && <div className="eigenschaft unten">{f.ausgeblendet || p.registerAusgeblendet || berechnetVon
              ? <label className="haken"><input type="checkbox" checked={false} disabled /><span><span className="haken-titel">{t('mappentypen.editor.pflichtfeld')}</span><small className="hilfe">{berechnetVon ? t('mappentypen.berechnet.nie-pflicht') : f._pflichtWeg ? t('mappentypen.darstellung.pflicht-aufgehoben') : t('mappentypen.darstellung.nie-pflicht')}</small></span></label>
              : haken('pflicht', t('mappentypen.editor.pflichtfeld'), t('mappentypen.editor.mappe-laesst-sich-ohne'))}</div>}
            <div className="eigenschaft unten"><label className="haken"><input type="checkbox" checked={!!f.ausgeblendet} onChange={(ev) => p.ausblenden(ev.target.checked)} />
              <span><span className="haken-titel">{t('mappentypen.darstellung.ausblenden')}</span><small className="hilfe">{p.registerAusgeblendet && !f.ausgeblendet ? t('mappentypen.darstellung.register-ausgeblendet') : t('mappentypen.darstellung.ausblenden-hilfe')}</small></span></label></div>
            {(f.typ === 'text' || f.typ === 'zahl') && <div className="eigenschaft unten">{haken('eindeutig', t('mappentypen.editor.eindeutig'), t('mappentypen.editor.wert-darf-je-mappentyp'))}</div>}
            {standard}
          </div>
          {/* Anzeigen, wenn … (#1033): nie an Systemfeldern. */}
          {!f.system && <AnzeigeEditor regel={f.anzeigen} setze={(anzeigen) => setze({ anzeigen })} typ={{ felder: p.alleFelder }} eigene={[f.key]} typen={p.typen} />}
          {besonders && <><h3 className="zwischen">{t('mappentypen.editor.eigenschaften-fuer', { FELDTYPEN: feldtypName(f.typ) })}</h3>{besonders}</>}
          {ERKENNUNG_FELDTYPEN.includes(f.typ) && <ErkennungEditor f={f} id={id} setze={setze} />}
          {WIEDERFINDEN_FELDTYPEN.includes(f.typ) && <WiederfindenEditor f={f} setze={setze} />}
          </fieldset>
          {/* Beschriftungen der festen Werte (#728) – auch an Systemfeldern wie Stand oder Kanal der Post. */}
          {f.typ === 'auswahl' && <OptionenBeschriftung id={id('optbeschr')} optionen={f.optionen ?? []} beschriftungen={f.beschriftungen} setze={(b) => setze({ beschriftungen: b as Feld['beschriftungen'] })} />}
          <div className="feldfuss">
            {f.system ? <span className="leise klein">{t('mappentypen.editor.systemfelder-lassen-sich-nicht')}</span> : <button type="button" className="textknopf gefahr" onClick={p.entferne}>{t('mappentypen.editor.feld-entfernen-2')}</button>}
            <button type="button" className="knopf klein" onClick={p.umschalten}>{t('mappentypen.editor.zuklappen')}</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Format eines Textfelds (#535); bei PLZ das Feld mit dem Land. */
function FormatEditor({ f, id, setze, alleFelder }: { f: EntwurfFeld; id: (x: string) => string; setze(p: Partial<EntwurfFeld>): void; alleFelder: Feld[] }) {
  const laender = alleFelder.filter((x) => x.key !== f.key && (x.typ === 'text' || x.typ === 'auswahl'));
  return <>
    <label className="eigenschaft" htmlFor={id('format')}><span>{t('felder.editor.format')} <Hilfe ort="mappentyp.format" /></span>
      <select id={id('format')} value={f.format ?? ''} onChange={(e) => setze({ format: (e.target.value || null) as Feldformat | null, ...(e.target.value !== 'plz' ? { landFeld: null } : {}) })}>
        <option value="">{t('felder.editor.format.keins')}</option>
        {FELDFORMATE.map((x) => <option key={x} value={x}>{formatName(x)}</option>)}
      </select>
      {f.format && <small className="hilfe">{t('felder.editor.format.hilfe')}</small>}</label>
    {f.format === 'plz' && <label className="eigenschaft" htmlFor={id('landfeld')}><span>{t('felder.editor.landfeld')}</span>
      <select id={id('landfeld')} value={f.landFeld ?? ''} onChange={(e) => setze({ landFeld: e.target.value || null })}>
        <option value="">{t('felder.editor.landfeld.keins')}</option>
        {laender.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
        {f.landFeld && !laender.some((x) => x.key === f.landFeld) && <option value={f.landFeld}>{f.landFeld}</option>}
      </select>
      <small className="hilfe">{t('felder.editor.landfeld.hilfe')}</small></label>}
  </>;
}

/** Grenzen eines Datumsfelds (#535): keine, heute oder ein festes Datum. */
function DatumGrenzen({ f, id, setze }: { f: EntwurfFeld; id: (x: string) => string; setze(p: Partial<EntwurfFeld>): void }) {
  const eine = (prop: 'min' | 'max') => {
    const w = f[prop] ?? '';
    const art = !w ? '' : w === HEUTE ? HEUTE : 'fest';
    return (
      <label className="eigenschaft" htmlFor={id(prop)}><span>{t(prop === 'min' ? 'felder.editor.datum.min' : 'felder.editor.datum.max')}</span>
        <span className="wertgruppe">
          <select id={id(prop)} value={art} onChange={(e) => setze({ [prop]: e.target.value === HEUTE ? HEUTE : e.target.value === 'fest' ? (art === 'fest' ? w : new Date().toISOString().slice(0, 10)) : '' } as Partial<EntwurfFeld>)}>
            <option value="">{t('felder.editor.datum.keine')}</option>
            <option value={HEUTE}>{t('felder.editor.datum.heute')}</option>
            <option value="fest">{t('felder.editor.datum.fest')}</option>
          </select>
          {art === 'fest' && <input type="date" aria-label={t(prop === 'min' ? 'felder.editor.datum.min' : 'felder.editor.datum.max')} value={w} onChange={(e) => setze({ [prop]: e.target.value } as Partial<EntwurfFeld>)} />}
        </span></label>
    );
  };
  return (
    <div className="raster">
      {eine('min')}{eine('max')}
      <p className="leise klein ff-hinweis">{t('felder.editor.datum.hilfe')}</p>
    </div>
  );
}

/** Feld-Eigenschaft „Aus Dokument füllen“ (#336, #391; bis #938 „Für die Erkennung nutzen“): Art und Erkennungshinweis. */
function ErkennungEditor({ f, id, setze }: { f: EntwurfFeld; id: (x: string) => string; setze(p: Partial<EntwurfFeld>): void }) {
  const an = !!f.erkennung;
  const geschaetzt = artVon({ key: f.key, label: f.label, typ: f.typ, format: f.format });
  return (
    <div className="raster">
      <div className="eigenschaft unten">
        <label className="haken"><input type="checkbox" checked={an} onChange={(e) => setze({ erkennung: e.target.checked ? {} : null })} />
          <span><span className="haken-titel">{tn('mappentypen.editor.aus-dokument-fuellen', { hilfe: <Hilfe ort="mappentyp.erkennung" /> })}</span><small className="hilfe">{t('mappentypen.editor.aus-dokument-fuellen-hilfe')}</small></span></label>
      </div>
      {an && artenFuer(f.typ).length > 1 && (
        <label className="eigenschaft" htmlFor={id('erkart')}><span>{t('mappentypen.editor.was-steht-im-feld')}</span>
          <select id={id('erkart')} value={f.erkennung?.art ?? ''} onChange={(e) => setze({ erkennung: { ...f.erkennung, art: (e.target.value || undefined) as Erkennungsart | undefined } })}>
            <option value="">{t('mappentypen.editor.automatisch', { wert: geschaetzt ? ` – ${ERKENNUNGSARTEN[geschaetzt]}` : t('mappentypen.editor.nichts-erkannt') })}</option>
            {artenFuer(f.typ).map((a) => <option key={a} value={a}>{ERKENNUNGSARTEN[a]}</option>)}
          </select></label>
      )}
      {an && <label className="eigenschaft" htmlFor={id('erkhinweis')}><span>{tn('mappentypen.editor.erkennungshinweis', { klein: <small>{t('mappentypen.editor.optional')}</small> })}</span>
        <input id={id('erkhinweis')} maxLength={ERKENNUNG_HINWEIS_MAX} placeholder={t('mappentypen.editor.z-b-kundennummer-oben')} value={f.erkennung?.hinweis ?? ''} onChange={(e) => setze({ erkennung: { ...f.erkennung, hinweis: e.target.value } })} /></label>}
    </div>
  );
}

/** Feld-Eigenschaft „Zum Wiederfinden nutzen“ (#938): eigener Haken, unabhängig von „eindeutig“. */
function WiederfindenEditor({ f, setze }: { f: EntwurfFeld; setze(p: Partial<EntwurfFeld>): void }) {
  return (
    <div className="raster">
      <div className="eigenschaft unten">
        <label className="haken"><input type="checkbox" checked={!!f.wiederfinden} onChange={(e) => setze({ wiederfinden: e.target.checked || undefined })} />
          <span><span className="haken-titel">{tn('mappentypen.editor.zum-wiederfinden-nutzen', { hilfe: <Hilfe ort="mappentyp.wiederfinden" /> })}</span>
            <small className="hilfe">{f.typ === 'referenz' ? t('mappentypen.editor.zum-wiederfinden-verweis') : t('mappentypen.editor.zum-wiederfinden-hilfe')}</small></span></label>
      </div>
    </div>
  );
}

/**
 * Grunddaten (#937): „Kann aus Post angelegt werden“ und „Woran man ihn erkennt“ – Grundlage für „Dokument übernehmen“.
 * Ohne eigene Wahl gilt die Vorgabe: an, wenn der Typ ein Dokumentenregister hat.
 */
function DokumentUebernehmen({ e, setE }: { e: Entwurf; setE: (f: (x: Entwurf) => Entwurf) => void }) {
  const vorgabe = e.register.some((r) => r.art === 'dokumente');
  const an = e.ausPost ?? vorgabe;
  return <>
    <label className="haken"><input type="checkbox" checked={an} onChange={(ev) => setE((x) => ({ ...x, ausPost: ev.target.checked === vorgabe ? null : ev.target.checked }))} />
      <span>{tn('mappentypen.editor.kann-aus-post', { klein: <small className="hilfe">{t(vorgabe ? 'mappentypen.editor.kann-aus-post-hilfe' : 'mappentypen.editor.kann-aus-post-ohne-register')}</small> })}</span></label>
    <div className="eigenschaft"><span><label htmlFor="typ-erkennbar">{tn('mappentypen.editor.woran-erkennt', { klein: <small>{t('mappentypen.editor.optional')}</small> })}</label></span>
      <SprachText id="typ-erkennbar" wert={e.erkennbarAn} placeholder={t('mappentypen.editor.woran-erkennt-beispiel')} teil="erkennbarAn" beschriftungen={e.beschriftungen}
        setzeWert={(erkennbarAn) => setE((x) => ({ ...x, erkennbarAn: erkennbarAn.slice(0, ERKENNBAR_AN_MAX) }))}
        setzeBeschriftungen={(b) => setE((x) => ({ ...x, beschriftungen: b as Beschriftungen<TypTeile> | undefined }))} />
      <small className="hilfe">{t('mappentypen.editor.woran-erkennt-hilfe', { anzahl: ERKENNBAR_AN_MAX - e.erkennbarAn.length })}</small></div>
  </>;
}

/**
 * „Ist eine Frist“ an einem Datumsfeld (#129, seit #712): Das Datum steht unter „Zu erledigen“ und im Kalender und löst
 * „Datum erreicht“ aus. Wann und an wen Ablago erinnert, stellt man in einer Automatisierung ein – nicht mehr am Feld.
 * Bestehende Angaben (Vorlauf, Empfänger, Text, Wiederholung) bleiben gespeichert (Vorgabe aus dem Paket).
 */
function FristEditor({ f, setze }: { f: EntwurfFeld; id: (x: string) => string; setze(p: Partial<EntwurfFeld>): void; benutzerFelder: Array<{ key: string; label: string }> }) {
  return (
    <div className="fristeditor">
      <label className="haken"><input type="checkbox" checked={!!f.frist} onChange={(e) => setze({ frist: e.target.checked ? { ...(f.frist ?? FRIST_STANDARD) } : null })} />
        <span><span className="haken-titel">{t('felder.editor.frist')}&nbsp;<Hilfe ort="mappentyp.frist" /></span><small className="hilfe">{t('felder.editor.frist.hilfe')}</small></span></label>
      {f.frist && <p className="leise klein">{t('felder.editor.frist.erinnern')} <Link className="verweis" to="/werkbank/automatisierungen">{t('felder.editor.frist.link')}</Link></p>}
    </div>
  );
}

/* ---------------------------------------------------------------- */

function TitelEditor({ e, setze, klappe }: { e: Entwurf; setze: (v: string) => void; klappe: Klappe }) {
  const d = useDaten();
  const feld = useRef<HTMLInputElement>(null);
  // Beispiele für die Vorschau: die ersten Mappen dieses Typs.
  const [mappen, setMappen] = useState<Mappe[]>([]);
  const [bezuege, setBezuege] = useState<Bezuege>({});
  const [beispielId, setBeispielId] = useState<string>('');
  useEffect(() => {
    if (d.zahlenDa && !d.anzahl(e.id)) return;
    api.seite(`typ:${e.id}`, 0, 50).then((s) => { setMappen(s.mappen); setBezuege(s.bezuege); setBeispielId((b) => b || s.mappen[0]?.id || ''); }).catch(() => {});
  }, [e.id, d.stand]); // eslint-disable-line react-hooks/exhaustive-deps -- Beispiele nur bei anderem Typ oder neuem Stand laden
  const felder = e.felder as unknown as Feld[];
  const v = e.titelVorlage;
  const unbekannt = vorlageFelder(v).filter((k) => !istIndexplatzhalter(k) && !felder.some((f) => f.key === k));
  const filterFehler = pruefeTitelFilter({ felder, titelVorlage: v });
  const beispiel = mappen.find((m) => m.id === beispielId);
  const werte = beispiel ? beispiel.werte : beispielWerte(felder);
  const jetzt = new Date().toISOString();
  const vorschau = titelAus({ felder, titelVorlage: v }, werte, (id) => (id === 'beispiel' ? t('mappentypen.editor.verwiesene-mappe') : titelOder(bezuege[id]?.titel)),
    beispiel ?? { erstellt: jetzt, geaendert: jetzt });
  const automatisch = wirksameVorlage({ felder, titelVorlage: '' });

  function einsetzen(key: string) {
    const el = feld.current;
    const von = el?.selectionStart ?? v.length;
    const bis = el?.selectionEnd ?? von;
    const platz = `{${key}}`;
    setze(v.slice(0, von) + platz + v.slice(bis));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(von + platz.length, von + platz.length); });
  }

  return (
    <Bereich id="titel" titel={t('mappentypen.editor.titel-einer-mappe')} klappe={klappe}
      kurz={<><code className="mono">{v || automatisch || '–'}</code>{vorschau ? <> · z. B. „{vorschau}“</> : null}</>}
      beschreibung={t('mappentypen.editor.so-heisst-eine-mappe')}>
      <label className="eigenschaft" htmlFor="titel-vorlage"><span>{t('mappentypen.editor.vorlage')}</span>
        <input id="titel-vorlage" ref={feld} className="mono" value={v} onChange={(ev) => setze(ev.target.value)}
          placeholder={automatisch ? t('mappentypen.editor.leer-2', { automatisch }) : t('mappentypen.editor.titel-beispiel')} /></label>
      <div className="chipwahl">
        <span className="leise klein">{t('mappentypen.editor.einsetzen')}</span>
        {/* Passwörter nie im Titel (#46). */}
        {felder.filter((f) => f.typ !== 'passwort' && f.typ !== 'tabelle').map((f) => <button key={f.key} type="button" className="chipknopf" onClick={() => einsetzen(f.key)}>{f.label || f.key}</button>)}
        {Object.entries(INDEXPLATZHALTER).map(([k, name]) => (
          <button key={k} type="button" className="chipknopf index" title={t('mappentypen.editor.indexwert-datum-an-dem', { k, wert: k === 'angelegt' ? t('mappentypen.editor.angelegt') : t('mappentypen.editor.zuletzt-geaendert') })} onClick={() => einsetzen(k)}>{name}</button>
        ))}
      </div>
      {unbekannt.length > 0 && <p className="fehlertext">{t('mappentypen.editor.diese-platzhalter-passen-zu')}{' '}{unbekannt.map((k) => `{${k}}`).join(', ')}</p>}
      {filterFehler.map((x) => <p key={x} className="fehlertext">{x}</p>)}
      <details className="filterhilfe">
        <summary className="klein">{tn('mappentypen.editor.platzhalter-formatieren-mit-filtern', { hilfe: <Hilfe ort="werkbank.titelfilter" /> })}</summary>
        <p className="leise klein">{tn('mappentypen.editor.hinter-einem-senkrechten-strich', { code: <code className="mono">{t('mappentypen.editor.betreff-kurz-30-gross')}</code> })}</p>
        <table className="klein filtertabelle"><tbody>
          {Object.entries(FILTER).map(([k, f]) => <tr key={k}><td><code className="mono">{k}{'arg' in f ? (f.arg === 'zahl' ? ':30' : ':"…"') : ''}</code></td><td>{f.text}</td></tr>)}
        </tbody></table>
      </details>
      <div className="vorschau">
        <span className="ueber">{t('mappentypen.editor.vorschau')}</span>
        <strong className="vorschautitel">{vorschau || t('mappentypen.editor.ohne-titel')}</strong>
        {mappen.length > 0
          ? <label className="klein leise">{t('mappentypen.editor.mit-den-werten-von')}<select value={beispielId} onChange={(ev) => setBeispielId(ev.target.value)}>
                {mappen.map((m) => <option key={m.id} value={m.id}>{titelOder(m.titel)}</option>)}
              </select></label>
          : <span className="klein leise">{t('mappentypen.editor.mit-beispielwerten')}</span>}
      </div>
    </Bereich>
  );
}

function RegisterEditor({ e, setE, feldAblage, klappe, ausblendenFragen }: {
  e: Entwurf; setE: (f: (x: Entwurf) => Entwurf) => void; feldAblage: (key: string) => { className: string }; klappe: Klappe;
  ausblendenFragen: (uids: string[], titel: string, dann: (x: Entwurf) => Entwurf) => Promise<void>;
}) {
  const d = useDaten();
  const [ansage, setAnsage] = useState('');
  const zr = useZiehen({
    fertig: (quelle, ziel, ort) => setE((x) => {
      const von = x.register.findIndex((r) => r._uid === quelle), zu = x.register.findIndex((r) => r._uid === ziel);
      return { ...x, register: umgestellt(x.register, von, zu, ort === 'vor' ? 'vor' : 'nach') };
    }),
  });
  const setzeReg = (i: number, patch: Partial<EntwurfRegister>) =>
    setE((x) => ({ ...x, register: x.register.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));

  const eindeutig = (basis: string, i: number) => {
    let k = basis || 'register'; let n = 2;
    while (e.register.some((r, j) => j !== i && r.key === k)) k = `${basis}_${n++}`.slice(0, 40);
    return k;
  };

  function hinzufuegen(art: Registerart) {
    const name = { felder: t('mappentypen.editor.weitere-angaben'), dokumente: t('mappentypen.editor.dokumente'), verknuepfungen: t('mappentypen.editor.verknuepfungen'), protokoll: t('mappentypen.editor.historie') }[art];
    const r: EntwurfRegister = { key: eindeutig(schluesselAus(name), -1), name, art, _uid: neueId(), _neu: true, ...(art === 'verknuepfungen' ? { quellen: [] } : {}) };
    setE((x) => ({ ...x, register: [...x.register, r] }));
  }
  function verschiebe(i: number, rueck: number) {
    const j = i + rueck;
    if (j < 0 || j >= e.register.length) return;
    setE((x) => { const rs = [...x.register]; [rs[i], rs[j]] = [rs[j], rs[i]]; return { ...x, register: rs }; });
  }
  async function entferne(i: number) {
    const r = e.register[i];
    if (r.art === 'felder') {
      const ziel = e.register.find((x, j) => j !== i && x.art === 'felder');
      const betroffen = e.felder.filter((f) => f._register === r.key);
      if (betroffen.length && !ziel) { await hinweis({ titel: t('mappentypen.editor.register-laesst-sich-nicht'), text: t('mappentypen.editor.auf-diesem-register-liegen') }); return; }
      if (!(await rueckfrage({ titel: t('mappentypen.editor.register-entfernen', { name: r.name }), text: `${betroffen.length ? t('mappentypen.editor.seine-felder-wandern-auf', { betroffen: betroffen.length, name: ziel!.name }) : ''}${ERST_BEIM_SPEICHERN}`.trim(), ja: t('mappentypen.editor.entfernen') }))) return;
      setE((x) => ({ ...x, register: x.register.filter((_, j) => j !== i), felder: x.felder.map((f) => (f._register === r.key ? { ...f, _register: ziel!.key } : f)) }));
      return;
    }
    if (!(await rueckfrage({ titel: t('mappentypen.editor.register-entfernen', { name: r.name }), text: `${r.art === 'dokumente' ? t('mappentypen.editor.enthaelt-es-noch-dokumente') : ''}${ERST_BEIM_SPEICHERN}`.trim(), ja: t('mappentypen.editor.entfernen') }))) return;
    setE((x) => ({ ...x, register: x.register.filter((_, j) => j !== i) }));
  }

  /** Register ausblenden (#655): Felder darauf gelten als ausgeblendet – wie beim Feld mit Rückfrage und ohne Pflicht. */
  function registerAusblenden(i: number, an: boolean) {
    const r = e.register[i];
    if (!an) { setzeReg(i, { ausgeblendet: undefined }); return; }
    const setzen = (x: Entwurf): Entwurf => ({ ...x, register: x.register.map((y) => (y._uid === r._uid ? { ...y, ausgeblendet: true } : y)) });
    void ausblendenFragen(e.felder.filter((f) => f._register === r.key && !f.ausgeblendet).map((f) => f._uid), t('mappentypen.darstellung.register-ausblenden', { name: r.name || r.key }), setzen);
  }

  // Mögliche Quellen: jedes Referenzfeld, das auf diesen Mappentyp zeigt (auch aus ihm selbst).
  const quellen = [
    ...d.typen.filter((mappentyp) => mappentyp.id !== e.id).flatMap((mappentyp) => mappentyp.felder.filter((f) => f.typ === 'referenz' && zielErlaubt(f, e.id)).map((f) => ({ typId: mappentyp.id, feldKey: f.key, text: `${mappentyp.name} › ${f.label}` }))),
    ...e.felder.filter((f) => f.typ === 'referenz' && zieleVon(f).includes(e.id)).map((f) => ({ typId: e.id, feldKey: f.key, text: `${e.name || t('mappentypen.editor.dieser-mappentyp-2')} › ${f.label}` })),
  ];

  return (
    <Bereich id="register" titel={t('mappentypen.editor.register-2')} hilfe={<Hilfe ort="mappentyp.register" />} klappe={klappe}
      kurz={e.register.map((r) => (r.ausgeblendet ? t('mappentypen.darstellung.register-kurz-ausgeblendet', { name: r.name || r.key }) : r.name || r.key)).join(' · ') || t('mappentypen.editor.keine')}
      beschreibung={t('mappentypen.editor.die-trennblaetter-einer-mappe')}>
      <div className="registerliste">
        {e.register.map((r, i) => {
          const anzahl = e.felder.filter((f) => f._register === r.key).length;
          const gewaehlt = r.quellen ?? [];
          return (
            <div key={r._uid} {...zr.eintrag(r._uid)}>
              <div {...(r.art === 'felder' ? feldAblage(r.key) : {})} className={`registerzeile art-${r.art} ${r.ausgeblendet ? 'ausgeblendet' : ''} ${r.art === 'felder' ? feldAblage(r.key).className : ''}`}>
              <div className="registerkopf">
                <span className="registerchip"><button {...zr.griff(r._uid, r.name || t('mappentypen.editor.register-2'))} onKeyDown={(ev) => ziehTasten(ev, {
                  hoch: i > 0 ? () => { verschiebe(i, -1); setAnsage(t('mappentypen.editor.steht-jetzt-an-stelle-3', { name: r.name, i })); } : undefined,
                  runter: i < e.register.length - 1 ? () => { verschiebe(i, 1); setAnsage(t('mappentypen.editor.steht-jetzt-an-stelle-4', { name: r.name, wert: i + 2 })); } : undefined,
                })}><span aria-hidden="true">⠿</span></button><span className="chip">{REGISTERARTEN[r.art]}</span>{r.ausgeblendet && <span className="chip warn">{t('mappentypen.darstellung.chip.ausgeblendet')}</span>}</span>
                <SprachText ariaLabel={t('mappentypen.editor.name-des-registers')} wert={r.name} teil="name" beschriftungen={r.beschriftungen}
                  setzeBeschriftungen={(b) => setzeReg(i, { beschriftungen: b as Register['beschriftungen'] })} setzeWert={(name) => {
                  if (!r._neu) { setzeReg(i, { name }); return; }
                  const key = eindeutig(schluesselAus(name), i);
                  // Felder auf diesem Register wandern mit dem neuen Schlüssel mit.
                  setE((x) => ({
                    ...x,
                    register: x.register.map((y, j) => (j === i ? { ...y, name, key } : y)),
                    felder: x.felder.map((f) => (f._register === r.key ? { ...f, _register: key } : f)),
                  }));
                }} />
                <code className="fkey" title={t('mappentypen.editor.kennung-3')}>{r.key}</code>
                <div className="feldaktionen">
                  <button type="button" className="symbol" disabled={i === 0} onClick={() => verschiebe(i, -1)} aria-label={t('mappentypen.editor.register-nach-vorn')}>↑</button>
                  <button type="button" className="symbol" disabled={i === e.register.length - 1} onClick={() => verschiebe(i, 1)} aria-label={t('mappentypen.editor.register-nach-hinten')}>↓</button>
                  <button type="button" className="symbol" onClick={abfangen(() => entferne(i))} aria-label={t('mappentypen.editor.register-entfernen-2', { name: r.name })} title={t('mappentypen.editor.register-entfernen-3', { ERST_BEIM_SPEICHERN })}>×</button>
                </div>
              </div>
              {r.art === 'felder' && (anzahl ? <Feldaufteilung r={r} felder={e.felder.filter((f) => f._register === r.key)} alle={e.felder} typen={d.typen} setze={(abschnitte) => setzeReg(i, { abschnitte })} ansage={setAnsage} />
                : <p className="leise klein">{t('mappentypen.editor.noch-keine-felder-2')}</p>)}
              {/* Ausblenden (#655): nicht bei Dokumentenregistern und Registern mit Systemfeldern. */}
              {(() => {
                const geht = registerAusblendbar({ art: r.art, felder: e.felder.filter((f) => f._register === r.key).map((f) => f.key) }, e.felder);
                return (geht || r.ausgeblendet) && <label className="haken"><input type="checkbox" checked={!!r.ausgeblendet} onChange={(ev) => registerAusblenden(i, ev.target.checked)} />
                  <span>{tn('mappentypen.darstellung.register-ausblenden-haken', { klein: <small className="hilfe">{r.art === 'felder' ? t('mappentypen.darstellung.register-ausblenden-hilfe') : t('mappentypen.darstellung.register-ausblenden-hilfe-2')}</small> })}</span></label>;
              })()}
              {r.art === 'dokumente' && <>
                <p className="leise klein">{t('mappentypen.editor.hier-werden-dateien-hochgeladen')}</p>
                <label className="haken"><input type="checkbox" checked={r.volltext !== false} onChange={(ev) => setzeReg(i, { volltext: ev.target.checked ? undefined : false })} />
                  <span>{tn('mappentypen.editor.volltext-erzeugen', { klein: <small className="hilfe">{t('mappentypen.editor.textebene-von-pdfs-lesen')}</small> })}</span></label>
                {/* Versionierung (#194) */}
                <label className="haken"><input type="checkbox" checked={!!r.versionierung} onChange={(ev) => setzeReg(i, { versionierung: ev.target.checked || undefined, ...(ev.target.checked ? {} : { versionenBehalten: undefined }) })} />
                  <span>{tn('mappentypen.editor.versionierung-einschalten', { klein: <small className="hilfe">{t('mappentypen.editor.beim-ersetzen-bleibt-die')}</small> })}</span></label>
                {r.versionierung && <label className="eigenschaft klein einzug"><span>{tn('mappentypen.editor.nur-die-letzten-versionen', { klein: <small>{t('mappentypen.editor.leer-alle')}</small> })}</span>
                  <input type="number" min={2} className="kurz" value={r.versionenBehalten ?? ''} onChange={(ev) => setzeReg(i, { versionenBehalten: ev.target.value === '' ? undefined : Math.max(2, Math.trunc(Number(ev.target.value))) })} /></label>}
              </>}
              {r.art === 'protokoll' && <>
                <p className="leise klein">{t('mappentypen.editor.zeigt-wer-wann-was')}</p>
                {/* #800: Geschrieben wird immer alles – hier steht nur, was dieses Register zeigt. */}
                <fieldset className="wahl"><legend className="klein">{tn('mappentypen.editor.historie-zeigt', { span: <span className="leise">{t('mappentypen.editor.historie-zeigt-hinweis')}</span> })}</legend>
                  {(Object.keys(HISTORIENGRUPPEN) as Historiengruppe[]).map((g) => {
                    const an = historiengruppenVon(r).includes(g);
                    return <label key={g} className="haken"><input type="checkbox" checked={an}
                      onChange={() => { const alt = historiengruppenVon(r); setzeReg(i, { zeigt: an ? alt.filter((x) => x !== g) : [...alt, g] }); }} />
                      <span>{historiengruppeName(g)}</span></label>;
                  })}
                  {r.zeigt && <button type="button" className="textknopf klein" onClick={() => setzeReg(i, { zeigt: undefined })}>{t('mappentypen.editor.historie-vorauswahl')}</button>}
                </fieldset>
              </>}
              {r.art === 'verknuepfungen' && (
                quellen.length === 0
                  ? <p className="leise klein">{t('mappentypen.editor.noch-verweist-kein-verweisfeld')}</p>
                  : <fieldset className="wahl"><legend className="klein">{tn('mappentypen.editor.zeigt-mappen-die-so', { span: <span className="leise">{t('mappentypen.editor.keine-auswahl-alle-als')}</span> })}</legend>
                      {quellen.map((q) => {
                        const an = gewaehlt.some((g) => g.typId === q.typId && g.feldKey === q.feldKey);
                        const g = gewaehlt.find((x) => x.typId === q.typId && x.feldKey === q.feldKey);
                        // Trefferliste je Quelle (#75): das Register zeigt die Mappen dann als Tabelle mit deren Spalten.
                        const listen = q.typId === e.id ? e.trefferlisten.map((l) => ({ key: l.key, name: l.name })) : trefferlistenVon(d.typ(q.typId) ?? {}).map((l) => ({ key: l.key, name: l.name }));
                        const fehlt = !!g?.trefferliste && !listen.some((l) => l.key === g.trefferliste);
                        return (
                          <div key={`${q.typId}-${q.feldKey}`} className="quellzeile">
                            <label className="haken"><input type="checkbox" checked={an}
                              onChange={() => setzeReg(i, { quellen: an ? gewaehlt.filter((x) => !(x.typId === q.typId && x.feldKey === q.feldKey)) : [...gewaehlt, { typId: q.typId, feldKey: q.feldKey }] })} />
                              <span>{q.text}</span></label>
                            {/* Immer da, bis zum Anhaken unsichtbar: so springt beim An- und Abhaken keine Zeile (#372). */}
                            <select aria-label={t('mappentypen.editor.trefferliste-fuer', { text: q.text })} className={`klein ${fehlt ? 'fehlerhaft' : ''} ${an ? '' : 'platzhalter'}`} value={g?.trefferliste ?? ''}
                              disabled={!an}
                              onChange={(ev) => setzeReg(i, { quellen: gewaehlt.map((x) => (x === g ? { typId: x.typId, feldKey: x.feldKey, ...(ev.target.value ? { trefferliste: ev.target.value } : {}) } : x)) })}>
                              <option value="">{t('mappentypen.editor.einfache-liste-titel')}</option>
                              {fehlt && <option value={g!.trefferliste}>{tn('mappentypen.editor.fehlt-einfache-liste', { trefferliste: g!.trefferliste })}</option>}
                              {listen.map((l) => <option key={l.key} value={l.key}>{t('mappentypen.editor.tabelle', { name: l.name })}</option>)}
                            </select>
                          </div>
                        );
                      })}
                    </fieldset>
              )}
              </div>
            </div>
          );
        })}
      </div>
      <Ansage text={ansage} />
      <div className="knoepfe">
        <button type="button" className="knopf klein" onClick={() => hinzufuegen('felder')}>{t('mappentypen.editor.feldregister')}</button>
        <button type="button" className="knopf klein" onClick={() => hinzufuegen('dokumente')}>{t('mappentypen.editor.dokumentenregister')}</button>
        <button type="button" className="knopf klein" onClick={() => hinzufuegen('verknuepfungen')}>{t('mappentypen.editor.verknuepfungsregister-2')}</button>
        {/* #800: mehrere Register „Historie“ möglich, z. B. „Verlauf“ und „Abrufe“. */}
        <button type="button" className="knopf klein" onClick={() => hinzufuegen('protokoll')}>{t('mappentypen.editor.historie-2')}</button>
      </div>
    </Bereich>
  );
}

/**
 * Felder eines Feldregisters mit Abschnitten (#890): Ab einem Abschnitt beginnt eine neue Zeile – mit Überschrift als
 * dünne Linie mit Titel (auf Wunsch eingeklappt), ohne Überschrift nur als Umbruch. Abschnitte lassen sich hinzufügen,
 * verschieben (Pfeile, Alt+Pfeiltasten am Griff, Ziehen) und entfernen; die Reihenfolge der Felder bestimmt „Felder“.
 */
function Feldaufteilung({ r, felder, alle, typen, setze, ansage }: {
  r: EntwurfRegister; felder: EntwurfFeld[]; setze: (a: EntwurfAbschnitt[]) => void; ansage: (text: string) => void;
  /** Anzeigen, wenn … (#1033): alle Felder des Typs (Bedingungen dürfen auf jedes schauen) und die Mappentypen. */
  alle: EntwurfFeld[]; typen: Mappentyp[];
}) {
  const abschnitte = (r.abschnitte ?? []).filter((a) => felder.some((f) => f._uid === a.vor));
  const [bedingungOffen, setBedingungOffen] = useState<string | null>(null);
  const typTeil = { felder: alle.map((x) => ({ key: x.key, label: x.label || x.key, typ: x.typ, optionen: x.optionen, zielTypen: x.zielTypen, mehrfach: x.mehrfach }) as Feld) };
  /** Felder des Abschnitts: ab seinem Feld bis vor den nächsten Abschnitt – auf die darf seine Bedingung nicht schauen. */
  const eigeneVon = (a: EntwurfAbschnitt) => {
    const start = felder.findIndex((f) => f._uid === a.vor);
    const aus: string[] = [];
    for (let j = start; j >= 0 && j < felder.length; j++) {
      if (j > start && abschnitte.some((x) => x.vor === felder[j]._uid)) break;
      aus.push(felder[j].key);
    }
    return aus;
  };
  const frei = (uid: string, ausser?: string) => !abschnitte.some((a) => a.vor === uid && a._uid !== ausser);
  const name = (a: EntwurfAbschnitt) => a.titel.trim() || t('mappentypen.darstellung.umbruch');
  const feldName = (f: EntwurfFeld) => f.label || f.key;
  /** Nächstes Feld ohne Abschnitt nach oben (−1) bzw. unten (+1). */
  const ziel = (a: EntwurfAbschnitt, richtung: number) => {
    for (let j = felder.findIndex((f) => f._uid === a.vor) + richtung; j >= 0 && j < felder.length; j += richtung) if (frei(felder[j]._uid)) return felder[j];
    return undefined;
  };
  const setzeA = (uid: string, patch: Partial<EntwurfAbschnitt>) => setze(abschnitte.map((a) => (a._uid === uid ? { ...a, ...patch } : a)));
  const schiebe = (a: EntwurfAbschnitt, richtung: number) => {
    const f = ziel(a, richtung);
    if (!f) return;
    setzeA(a._uid, { vor: f._uid });
    ansage(t('mappentypen.darstellung.beginnt-jetzt-vor', { name: name(a), feld: feldName(f) }));
  };
  function hinzufuegen() {
    // Vor dem letzten Feld ohne Abschnitt; von dort schiebt man ihn an seinen Platz.
    const f = [...felder].reverse().find((x) => frei(x._uid));
    if (!f) return;
    setze([...abschnitte, { _uid: neueId(), vor: f._uid, titel: '' }]);
    ansage(t('mappentypen.darstellung.hinzugefuegt-vor', { feld: feldName(f) }));
  }
  /** Ablegen auf einem Feld: davor – oder danach, also vor dem nächsten Feld. */
  const ankerBei = (ziel: string, ort: string, quelle: string) => {
    const i = felder.findIndex((f) => `f:${f._uid}` === ziel);
    const f = i < 0 ? undefined : ort === 'nach' ? felder[i + 1] : felder[i];
    return f && frei(f._uid, quelle) ? f : undefined;
  };
  const zs = useZiehen({
    erlaubt: (quelle, ziel, ort) => ziel.startsWith('f:') && !!ankerBei(ziel, ort, quelle),
    fertig: (quelle, ziel, ort) => {
      const f = ankerBei(ziel, ort, quelle);
      const a = abschnitte.find((x) => x._uid === quelle);
      if (!f || !a) return;
      setzeA(quelle, { vor: f._uid });
      ansage(t('mappentypen.darstellung.beginnt-jetzt-vor', { name: name(a), feld: feldName(f) }));
    },
  });
  return (
    <div className="feldaufteilung">
      <p className="leise klein">{t('mappentypen.darstellung.aufteilung-hilfe')}</p>
      <ol className="aufteilung">
        {felder.map((f) => {
          const a = abschnitte.find((x) => x.vor === f._uid);
          const ze = zs.eintrag(`f:${f._uid}`);
          const ae = a ? zs.eintrag(a._uid) : null;
          return (
            <Fragment key={f._uid}>
              {a && ae && (
                <li {...ae} className={`abschnittzeile ${a.titel.trim() ? 'mit-titel' : ''} ${ae.className}`}>
                  <button {...zs.griff(a._uid, name(a))} onKeyDown={(ev) => ziehTasten(ev, { hoch: ziel(a, -1) ? () => schiebe(a, -1) : undefined, runter: ziel(a, 1) ? () => schiebe(a, 1) : undefined })}><span aria-hidden="true">⠿</span></button>
                  <SprachText ariaLabel={t('mappentypen.darstellung.ueberschrift')} wert={a.titel} placeholder={t('mappentypen.darstellung.ohne-ueberschrift')} teil="titel" beschriftungen={a.beschriftungen}
                    setzeWert={(titel) => setzeA(a._uid, { titel: titel.slice(0, ABSCHNITT_TITEL_MAX) })} setzeBeschriftungen={(b) => setzeA(a._uid, { beschriftungen: b as Abschnitt['beschriftungen'] })} />
                  <label className="haken klein" title={a.titel.trim() ? undefined : t('mappentypen.darstellung.eingeklappt-nur-mit-titel')}>
                    <input type="checkbox" checked={!!a.eingeklappt && !!a.titel.trim()} disabled={!a.titel.trim()} onChange={(ev) => setzeA(a._uid, { eingeklappt: ev.target.checked || undefined })} />
                    <span>{t('mappentypen.darstellung.eingeklappt')}</span></label>
                  {/* Anzeigen, wenn … (#1033): Symbol und Satz am Abschnitt, Bearbeiten darunter. */}
                  <AnzeigeChip regel={a.anzeigen} typ={typTeil} />
                  <Knopf art="link" groesse="klein" aria-expanded={bedingungOffen === a._uid} onClick={() => setBedingungOffen(bedingungOffen === a._uid ? null : a._uid)}>
                    {t('mappentypen.anzeige.am-abschnitt')}</Knopf>
                  <div className="feldaktionen">
                    <button type="button" className="symbol" disabled={!ziel(a, -1)} onClick={() => schiebe(a, -1)} aria-label={t('mappentypen.darstellung.nach-oben', { name: name(a) })}>↑</button>
                    <button type="button" className="symbol" disabled={!ziel(a, 1)} onClick={() => schiebe(a, 1)} aria-label={t('mappentypen.darstellung.nach-unten', { name: name(a) })}>↓</button>
                    <button type="button" className="symbol" onClick={() => { setze(abschnitte.filter((x) => x._uid !== a._uid)); ansage(t('mappentypen.darstellung.entfernt', { name: name(a) })); }} aria-label={t('mappentypen.darstellung.entfernen', { name: name(a) })}>×</button>
                  </div>
                </li>
              )}
              {a && bedingungOffen === a._uid && (
                <li className="abschnittanzeige">
                  <AnzeigeEditor regel={a.anzeigen} setze={(anzeigen) => setzeA(a._uid, { anzeigen })} typ={typTeil} eigene={eigeneVon(a)} typen={typen} />
                </li>
              )}
              <li {...ze} className={`aufteilungsfeld ${f.ausgeblendet ? 'ausgeblendet' : ''} ${ze.className}`}>
                {feldName(f)}{f.ausgeblendet && <span className="chip">{t('mappentypen.darstellung.chip.ausgeblendet')}</span>}
              </li>
            </Fragment>
          );
        })}
      </ol>
      <button type="button" className="knopf klein" disabled={!felder.some((f) => frei(f._uid))} onClick={hinzufuegen}>{t('mappentypen.darstellung.abschnitt-hinzufuegen')}</button>
    </div>
  );
}

/* ---------------------------------------------------------------- */

/** Trefferlisten (#75): mehrere je Typ, eine ist Standard; je Liste Spalten auswählen und anordnen (#19). */
function TrefferlisteEditor({ e, setE, klappe }: { e: Entwurf; setE: (f: (x: Entwurf) => Entwurf) => void; klappe: Klappe }) {
  const d = useDaten();
  const name = (k: string) => (k.startsWith('feld:') ? e.felder.find((f) => `feld:${f._uid}` === k)?.label || t('mappentypen.editor.feld-ohne-namen') : SYSTEMSPALTEN[k as Systemspalte] ?? k);
  const setzeListe = (i: number, patch: Partial<EntwurfListe>) => setE((x) => ({ ...x, trefferlisten: x.trefferlisten.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  const eindeutig = (basis: string, i: number) => {
    let k = basis || 'liste'; let n = 2;
    while (e.trefferlisten.some((l, j) => j !== i && l.key === k)) k = `${basis || 'liste'}_${n++}`.slice(0, 40);
    return k;
  };
  function hinzufuegen() {
    const nm = t('mappentypen.editor.liste', { wert: e.trefferlisten.length + 1 });
    const vorlage = e.trefferlisten.find((l) => l.standard)?.spalten ?? [];
    setE((x) => ({ ...x, trefferlisten: [...x.trefferlisten, { _uid: neueId(), _neu: true, key: eindeutig(schluesselAus(nm), -1), name: nm, spalten: [...vorlage], standard: false }] }));
  }
  async function entferne(i: number) {
    const l = e.trefferlisten[i];
    const n = verwendung(l.key).length;
    if (!(await rueckfrage({ titel: t('mappentypen.editor.trefferliste-entfernen', { name: l.name }), text: `${n ? t('mappentypen.editor.sie-wird-an-stellen', { anzahl: n }) : ''}${ERST_BEIM_SPEICHERN}`.trim(), ja: t('mappentypen.editor.entfernen') }))) return;
    setE((x) => {
      const rest = x.trefferlisten.filter((_, j) => j !== i);
      if (l.standard && rest.length) rest[0] = { ...rest[0], standard: true };
      return { ...x, trefferlisten: rest };
    });
  }
  // Wo eine Liste verwendet wird: Sichten mit diesem Typ und Verknüpfungsregister mit diesem Typ als Quelle.
  function verwendung(key: string): string[] {
    const sichten = d.sichten.filter((s) => s.trefferliste === key && wirksameTypen(d.sichten, s.id).includes(e.id)).map((s) => t('mappentypen.editor.ansicht-2', { name: s.name }));
    const register = [
      ...d.typen.filter((mappentyp) => mappentyp.id !== e.id).map((mappentyp) => ({ typ: mappentyp.name, register: mappentyp.register })),
      { typ: e.name || 'dieser Mappentyp', register: e.register as Register[] },
    ].flatMap(({ typ, register }) => register.filter((r) => r.quellen?.some((q) => q.typId === e.id && q.trefferliste === key)).map((r) => t('mappentypen.editor.register-3', { name: r.name, typ })));
    return [...sichten, ...register];
  }
  return (
    <Bereich id="trefferlisten" titel={t('mappentypen.editor.trefferlisten')} hilfe={<Hilfe ort="mappentyp.trefferlisten" />} klappe={klappe}
      kurz={t('mappentypen.editor.listen-standard', { anzahl: e.trefferlisten.length, wert: e.trefferlisten.find((l) => l.standard)?.name ?? '–' })}
      beschreibung={<>{t('mappentypen.editor.spalten-wenn-die-liste')}</>}>
      <div className="trefferlisten">
        {e.trefferlisten.map((l, i) => {
          const wo = verwendung(l.key);
          return (
            <section key={l._uid} className={`trefferlistenblock ${l.standard ? 'standard' : ''}`} aria-label={t('mappentypen.editor.trefferliste', { name: l.name })}>
              <div className="registerkopf">
                <SprachText ariaLabel={t('mappentypen.editor.name-der-trefferliste')} wert={l.name} teil="name" beschriftungen={l.beschriftungen}
                  setzeBeschriftungen={(b) => setzeListe(i, { beschriftungen: b as Trefferliste['beschriftungen'] })} setzeWert={(nm) => {
                  setzeListe(i, l._neu ? { name: nm, key: eindeutig(schluesselAus(nm), i) } : { name: nm });
                }} />
                <code className="fkey" title={t('mappentypen.editor.kennung-3')}>{l.key}</code>
                <label className="haken klein"><input type="radio" name="standardliste" checked={l.standard}
                  onChange={() => setE((x) => ({ ...x, trefferlisten: x.trefferlisten.map((y, j) => ({ ...y, standard: j === i })) }))} /><span>{t('mappentypen.editor.standard')}</span></label>
                <div className="feldaktionen">
                  <button type="button" className="symbol" disabled={e.trefferlisten.length < 2} title={e.trefferlisten.length < 2 ? t('mappentypen.editor.eine-trefferliste-braucht-der') : t('mappentypen.editor.trefferliste-entfernen-2', { ERST_BEIM_SPEICHERN })}
                    onClick={abfangen(() => entferne(i))} aria-label={t('mappentypen.editor.trefferliste-entfernen-3', { name: l.name })}>×</button>
                </div>
              </div>
              <Spaltenwahl e={e} spalten={l.spalten} name={name} setze={(spalten) => setzeListe(i, { spalten })} />
              <p className="leise klein">{wo.length ? t('mappentypen.editor.verwendet-in-2', { wo: wo.join(', ') }) : l.standard ? t('mappentypen.editor.gilt-ueberall-wo-keine') : t('mappentypen.editor.noch-nirgends-verwendet')}</p>
            </section>
          );
        })}
      </div>
      <div className="knoepfe"><button type="button" className="knopf klein" onClick={hinzufuegen}>{t('mappentypen.editor.trefferliste-2')}</button></div>
    </Bereich>
  );
}

/** Spalten einer Trefferliste: auswählen und anordnen. */
function Spaltenwahl({ e, spalten, name, setze }: { e: Entwurf; spalten: string[]; name: (k: string) => string; setze: (eintrag: string[]) => void }) {
  // Spalten gelöschter Felder, Passwortfelder (#46) und Tabellen (#1030, ohne Wert) fallen weg.
  const liste = spalten.filter((k) => !k.startsWith('feld:') || e.felder.some((f) => `feld:${f._uid}` === k && f.typ !== 'passwort' && f.typ !== 'tabelle'));
  const verfuegbar = [
    // Ausgeblendete Felder (#655) nicht als neue Spalte; schon gewählte bleiben.
    ...e.felder.filter((f) => f.typ !== 'passwort' && f.typ !== 'tabelle' && !f.ausgeblendet && !e.register.some((r) => r.ausgeblendet && r.key === f._register)).map((f) => ({ k: `feld:${f._uid}`, n: f.label || f.key })),
    ...(Object.keys(SYSTEMSPALTEN) as Systemspalte[]).filter((k) => k !== '_typ').map((k) => ({ k, n: SYSTEMSPALTEN[k] })),
  ].filter((x) => !liste.includes(x.k));
  const [ansage, setAnsage] = useState('');
  const schiebe = (i: number, r: number) => {
    const j = i + r;
    if (j < 0 || j >= liste.length) return;
    const n = [...liste]; [n[i], n[j]] = [n[j], n[i]]; setze(n);
    setAnsage(t('mappentypen.editor.steht-jetzt-an-stelle-4', { name: name(liste[i]), wert: j + 1 }));
  };
  // Drag & Drop (#74)
  const zs = useZiehen({ fertig: (quelle, ziel, ort) => setze(umgestellt(liste, liste.indexOf(quelle), liste.indexOf(ziel), ort === 'vor' ? 'vor' : 'nach')) });
  return (
    <>
      <Ansage text={ansage} />
      {liste.length > 0 && (
        <ol className="spaltenliste">
          {liste.map((k, i) => (
            <li key={k} {...zs.eintrag(k)} className={`${i < 3 ? 'kompakt' : ''} ${zs.eintrag(k).className}`}>
              <button {...zs.griff(k, name(k))} onKeyDown={(ev) => ziehTasten(ev, { hoch: () => schiebe(i, -1), runter: () => schiebe(i, 1) })}><span aria-hidden="true">⠿</span></button>
              <span className="nr">{i + 1}</span>
              <span className="nm">{name(k)}{k.startsWith('_') && <span className="chip">{t('mappentypen.editor.system')}</span>}</span>
              <span className="aktionen">
                <button type="button" className="symbol" disabled={i === 0} onClick={() => schiebe(i, -1)} aria-label={t('mappentypen.editor.nach-vorn', { name: name(k) })}>↑</button>
                <button type="button" className="symbol" disabled={i === liste.length - 1} onClick={() => schiebe(i, 1)} aria-label={t('mappentypen.editor.nach-hinten', { name: name(k) })}>↓</button>
                <button type="button" className="symbol" onClick={() => setze(liste.filter((x) => x !== k))} aria-label={t('mappentypen.editor.entfernen-2', { name: name(k) })}>×</button>
              </span>
            </li>
          ))}
        </ol>
      )}
      {verfuegbar.length > 0 && (
        <label className="eigenschaft schmal"><span>{t('mappentypen.editor.spalte-hinzufuegen')}</span>
          <select value="" onChange={(ev) => { if (ev.target.value) setze([...liste, ev.target.value]); }}>
            <option value="">{t('mappentypen.editor.waehlen')}</option>
            {verfuegbar.map((x) => <option key={x.k} value={x.k}>{x.n}{x.k.startsWith('_') ? t('mappentypen.editor.system-2') : ''}</option>)}
          </select>
        </label>
      )}
    </>
  );
}

/** Archivmodus (#212): Frist, Stichtag; beim Einschalten Vorschau, beim Ausschalten Rückfrage. */
function ArchivEinstellung({ archiv, setze, datumsfelder, typId }: { archiv: Archiv | null; setze: (a: Archiv | null) => void; datumsfelder: Array<{ key: string; label: string }>; typId?: string }) {
  const [vorschau, setVorschau] = useState<{ mappen: number; darfWeg: number } | null>(null);
  const text = JSON.stringify(archiv);
  useEffect(() => {
    if (!archiv || !typId) { setVorschau(null); return; }
    let aktuell = true;
    api.archivVorschau(typId, archiv).then((v) => aktuell && setVorschau(v)).catch(() => aktuell && setVorschau(null));
    return () => { aktuell = false; };
  }, [text, typId]); // eslint-disable-line react-hooks/exhaustive-deps -- Vorschau hängt am eingegebenen Text; archiv wird daraus abgeleitet
  const vorschlag = FRISTEN.some((f) => f.jahre === archiv?.jahre);
  return (
    <div className="stapel">
      <p className="leise">{t('mappentypen.editor.fuer-belege-mit-aufbewahrungspflicht')}</p>
      <label className="haken"><input type="checkbox" checked={!!archiv} onChange={abfangen(async (ev: ChangeEvent<HTMLInputElement>) => {
        if (ev.target.checked) setze({ jahre: 8, stichtag: datumsfelder[0]?.key ?? null });
        else if (await rueckfrage({ titel: t('mappentypen.editor.archivmodus-ausschalten'), text: t('mappentypen.editor.danach-lassen-sich-mappen'), ja: t('mappentypen.editor.ausschalten'), gefahr: true })) setze(null);
      })} /><span>{tn('mappentypen.editor.archivmodus-einschalten', { klein: <small className="hilfe">{t('mappentypen.editor.gilt-auch-fuer-vorhandene')}</small> })}</span></label>
      {archiv && <>
        <div className="raster">
          <label className="eigenschaft"><span>{t('mappentypen.editor.aufbewahrungsfrist')}</span>
            <select value={vorschlag ? String(archiv.jahre) : 'eigen'} onChange={(ev) => setze({ ...archiv, jahre: ev.target.value === 'eigen' ? 3 : Number(ev.target.value) })}>
              {FRISTEN.map((f) => <option key={f.jahre} value={f.jahre}>{t('mappentypen.editor.jahre', { jahre: f.jahre, text: f.text })}</option>)}
              <option value="eigen">{t('mappentypen.editor.eigene-zahl')}</option>
            </select></label>
          {!vorschlag && <label className="eigenschaft"><span>{t('mappentypen.editor.jahre-2')}</span><input type="number" min={1} max={JAHRE_MAX} value={archiv.jahre} onChange={(ev) => setze({ ...archiv, jahre: Math.max(1, Math.min(JAHRE_MAX, Math.trunc(Number(ev.target.value) || 1))) })} /></label>}
          <label className="eigenschaft"><span>{tn('mappentypen.editor.stichtag', { klein: <small>{t('mappentypen.editor.frist-bis-ende-des')}</small> })}</span>
            <select value={archiv.stichtag ?? ''} onChange={(ev) => setze({ ...archiv, stichtag: ev.target.value || null })}>
              {datumsfelder.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              <option value="">{t('mappentypen.editor.anlagedatum-der-mappe')}</option>
            </select></label>
        </div>
        {vorschau && <p className="hinweis info">{t('mappentypen.editor.mappen-sind-betroffen', { anzahl: vorschau.mappen, wert: vorschau.darfWeg ? t('mappentypen.editor.davon-waeren-schon-darf', { anzahl: vorschau.darfWeg }) : '' })}</p>}
      </>}
    </div>
  );
}

/** Erkennung am Mappentyp (#391): Knopf „Aus Dokument ausfüllen“ mit eigener Beschriftung oder ausgeblendet. */
function ErkennungTyp({ ad, setze, wiederfinden, felder }: { ad: AusDokument | null; setze: (a: AusDokument | null) => void; wiederfinden: string[]; felder: string[] }) {
  const an = !ad?.aus;
  // Erkennung (#511): eingebaut oder ein Paket mit dms:erkennen; leer = Standard aus der Werkbank.
  const [stand, setStand] = useState<ErkennungStand | null>(null);
  useEffect(() => { api.erkennungStand().then(setStand, () => setStand(null)); }, []);
  // Ohne leere Angaben speichern: nichts gesetzt → null.
  const neu = (x: AusDokument) => { const o = Object.fromEntries(Object.entries(x).filter(([, v]) => v !== undefined && v !== '' && v !== false)) as AusDokument; return Object.keys(o).length ? o : null; };
  const engine = ad?.engine ?? '';
  const standardName = stand?.standard.paket ? stand.pakete.find((p) => p.id === stand.standard.paket)?.name ?? stand.standard.paket : tx('erkennung.typ.engine.eingebaut');
  async function waehle(wert: string) {
    const p = stand?.pakete.find((x) => x.id === wert);
    if (p?.netz && !(await abflussBestaetigen(p.name))) return;
    setze(neu({ ...ad, engine: wert || undefined, abfluss: p?.netz ? true : undefined }));
  }
  return (
    <div className="raster">
      <div className="eigenschaft unten">
        <label className="haken"><input type="checkbox" checked={an} onChange={(ev) => setze(neu({ ...ad, aus: ev.target.checked ? undefined : true }))} />
          <span>{tn('mappentypen.editor.knopf-aus-dokument-ausfuellen', { klein: <small className="hilfe">{t('mappentypen.editor.in-jeder-mappe-dieses')}</small> })}</span></label>
      </div>
      {an && <label className="eigenschaft" htmlFor="typ-ad-beschriftung"><span>{tn('mappentypen.editor.beschriftung', { klein: <small>{t('mappentypen.editor.optional')}</small> })}</span>
        <input id="typ-ad-beschriftung" maxLength={BESCHRIFTUNG_MAX} placeholder={t('mappentypen.editor.z-b-visitenkarte-scannen', { AUS_DOKUMENT_STANDARD })} value={ad?.beschriftung ?? ''} onChange={(ev) => setze(neu({ ...ad, beschriftung: ev.target.value || undefined }))} /></label>}
      {an && stand && (stand.pakete.length > 0 || engine) && (
        <label className="eigenschaft" htmlFor="typ-ad-engine"><span>{tx('erkennung.typ.engine')}</span>
          <select id="typ-ad-engine" value={engine} onChange={(ev) => void waehle(ev.target.value)}>
            <option value="">{tx('erkennung.typ.engine.standard', { name: standardName })}</option>
            <option value={ENGINE_EINGEBAUT}>{tx('erkennung.typ.engine.eingebaut')}</option>
            {stand.pakete.map((p) => <option key={p.id} value={p.id}>{p.netz ? tx('erkennung.typ.engine.netz', { name: p.name }) : tx('erkennung.typ.engine.paket', { name: p.name })}</option>)}
            {engine && engine !== ENGINE_EINGEBAUT && !stand.pakete.some((p) => p.id === engine) && <option value={engine}>{engine}</option>}
          </select>
          <small className="hilfe">{tx('erkennung.typ.engine.hilfe')}</small></label>
      )}
      <p className="leise klein" style={{ gridColumn: '1 / -1' }}>{felder.length
        ? t('mappentypen.editor.aus-dokument-fuellt', { felder: felder.join(', ') })
        : t('mappentypen.editor.kein-feld-aus-dokument')}</p>
      {/* Zum Wiederfinden (#938): woran Ablago vorhandene Mappen dieses Typs im Dokument wiederfindet. */}
      <p className="leise klein" style={{ gridColumn: '1 / -1' }}>{wiederfinden.length
        ? t('mappentypen.editor.wiederfinden-ueber', { felder: wiederfinden.join(', ') })
        : t('mappentypen.editor.kein-feld-wiederfinden')}</p>
    </div>
  );
}

/** Stempel beim Weitergeben (#394): je Mappentyp aus, als Vorschlag oder als Pflicht – mit Vorlage. */
function StempelEinstellung({ stempel, setze }: { stempel: StempelTyp | null; setze: (s: StempelTyp | null) => void }) {
  const vorlagen = useStempelVorlagen();
  const modus: StempelModus = stempel?.modus ?? 'aus';
  return (
    <div className="raster">
      <label className="eigenschaft"><span>{t('mappentypen.editor.beim-herunterladen-exportieren-und')}</span>
        <select id="typ-stempel-modus" value={modus} onChange={(ev) => {
          const m = ev.target.value as StempelModus;
          setze(m === 'aus' ? null : { modus: m, vorlage: stempel?.vorlage ?? vorlagen?.[0]?.id ?? null });
        }}>
          {Object.entries(STEMPEL_MODI).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select></label>
      {stempel && <label className="eigenschaft"><span>{tn('mappentypen.editor.vorlage-2', { klein: <small><Link to="/werkbank/stempel" className="verweis">{t('mappentypen.editor.vorlagen-bearbeiten')}</Link></small> })}</span>
        <select id="typ-stempel-vorlage" value={stempel.vorlage ?? ''} onChange={(ev) => setze({ ...stempel, vorlage: ev.target.value || null })}>
          {!vorlagen?.some((v) => v.id === stempel.vorlage) && <option value={stempel.vorlage ?? ''}>{stempel.vorlage ? t('mappentypen.editor.unbekannte-vorlage') : t('mappentypen.editor.stempel-standard')}</option>}
          {(vorlagen ?? []).map((v) => <option key={v.id} value={v.id}>{v.name} – {v.text.split('\n').join(' / ')}</option>)}
        </select></label>}
      <p className="leise klein" style={{ gridColumn: "1 / -1" }}>{modus === 'pflicht'
        ? t('mappentypen.editor.pflicht-dokumente-dieses-mappentyps')
        : modus === 'vorschlag' ? t('mappentypen.editor.vorschlag-beim-weitergeben-ist')
        : t('mappentypen.editor.kein-stempel-vorgegeben-benutzer')}</p>
    </div>
  );
}

/**
 * Ziele eines Verweisfelds (#1036): ein oder mehrere Mappentypen, gewählt mit dem einen Auswahl-Baustein
 * (Mehrfachauswahl). Optionale Ziele aus einem Paket, die es noch nicht gibt, stehen darunter; wer einen davon entfernt,
 * nimmt ihn auch aus den optionalen (sonst käme er mit dem nächsten Paket wieder).
 */
function ZielTypenWahl({ id, f, typen, eigeneId, eigenerName, setze }: {
  id: string; f: EntwurfFeld; typen: Mappentyp[]; eigeneId: string; eigenerName: string; setze(patch: Partial<EntwurfFeld>): void;
}) {
  const [eingabe, setEingabe] = useState('');
  const [offen, setOffen] = useState(false);
  const gewaehlt = zieleVon(f);
  const eigen = { id: eigeneId, name: t('mappentypen.editor.dieser-mappentyp-3', { wert: eigenerName || t('mappentypen.editor.dieser-mappentyp-2') }), schluessel: undefined as string | undefined };
  const alle = [...typen.filter((x) => x.id !== eigeneId).map((x) => ({ id: x.id, name: x.name, schluessel: x.schluessel })), eigen];
  const q = eingabe.trim().toLowerCase();
  const auswahl = alle.filter((x) => !gewaehlt.includes(x.id) && (!q || x.name.toLowerCase().includes(q)));
  const name = (z: string) => alle.find((x) => x.id === z)?.name ?? '–';
  const offenOpt = (f.zielOptional ?? []).filter((k) => !typen.some((x) => x.schluessel === k && gewaehlt.includes(x.id)));
  const entferne = (z: string) => {
    const k = typen.find((x) => x.id === z)?.schluessel;
    const rest = gewaehlt.filter((y) => y !== z);
    const opt = (f.zielOptional ?? []).filter((x) => x !== k);
    setze({ zielTypen: rest, zielOptional: opt.length ? opt : undefined, ...(rest.length < 2 && !opt.length ? { gleicherTyp: undefined } : {}) });
  };
  return (
    <>
      <Mehrfachauswahl id={id} name={t('mappentypen.editor.zieltypen')} platzhalter={t('mappentypen.editor.zieltyp-suchen')}
        eingabe={eingabe} setEingabe={setEingabe} offen={offen} setOffen={setOffen}
        vorschlaege={auswahl.map((x) => ({ id: x.id, text: x.name }))} leerText={t('mappentypen.editor.keine-weiteren-typen')}
        waehle={(z) => { setze({ zielTypen: [...gewaehlt, z] }); setEingabe(''); setOffen(false); }}
        gewaehlt={gewaehlt.map((z) => ({ id: z, inhalt: name(z), entfernenText: t('mappentypen.editor.zieltyp-entfernen', { name: name(z) }) }))}
        entferne={entferne} />
      {offenOpt.length > 0 && <p className="leise klein zieltypen-offen">{t('mappentypen.editor.ziele-optional', { typen: offenOpt.join(', ') })}</p>}
    </>
  );
}

/**
 * Folgt aus (#886): Das Verweisfeld füllt sich aus einem anderen Verweisfeld dieser Mappe – über ein Verweisfeld der
 * Mappe, auf die jenes zeigt (z. B. Organisation aus Niederlassung → Organisation). Nur ein leeres Feld, keine Sperre.
 */
function FolgtAusEditor({ f, id, setze, alleFelder, felderVon }: {
  f: EntwurfFeld; id: (x: string) => string; setze(patch: Partial<EntwurfFeld>): void;
  alleFelder: Feld[]; felderVon(typId: string): Feld[] | undefined;
}) {
  const quellen = moeglicheQuellen(alleFelder, f);
  if (!quellen.length && !f.folgtAus) return null;
  const quelle = f.folgtAus ? alleFelder.find((x) => x.key === f.folgtAus!.feld) : undefined;
  const qz = quelle ? einzigesZiel(quelle) : undefined;
  const zielFelder = qz ? moeglicheZielFelder(felderVon(qz) ?? [], f) : [];
  const waehleQuelle = (k: string) => {
    if (!k) { setze({ folgtAus: undefined }); return; }
    const q = alleFelder.find((x) => x.key === k);
    const qz2 = q ? einzigesZiel(q) : undefined;
    const z = qz2 ? moeglicheZielFelder(felderVon(qz2) ?? [], f) : [];
    setze({ folgtAus: { feld: k, zielFeld: z[0]?.key ?? '' } });
  };
  return (
    <div className="raster folgtaus">
      <label className="eigenschaft" htmlFor={id('folgt')}><span>{t('mappentypen.editor.folgt-aus')}</span>
        <select id={id('folgt')} value={f.folgtAus?.feld ?? ''} onChange={(e) => waehleQuelle(e.target.value)}>
          <option value="">{t('mappentypen.editor.folgt-aus-nicht')}</option>
          {quellen.map((x) => <option key={x.key} value={x.key}>{x.label || x.key}</option>)}
          {f.folgtAus && !quellen.some((x) => x.key === f.folgtAus!.feld) && <option value={f.folgtAus.feld}>{f.folgtAus.feld}</option>}
        </select>
        <small className="hilfe">{t('mappentypen.editor.folgt-aus-hilfe')}</small></label>
      {f.folgtAus && <label className="eigenschaft" htmlFor={id('folgt-ziel')}><span>{t('mappentypen.editor.folgt-aus-ueber', { feld: quelle?.label || f.folgtAus.feld })}</span>
        <select id={id('folgt-ziel')} value={f.folgtAus.zielFeld} onChange={(e) => setze({ folgtAus: { feld: f.folgtAus!.feld, zielFeld: e.target.value } })}>
          {!zielFelder.some((x) => x.key === f.folgtAus!.zielFeld) && <option value={f.folgtAus.zielFeld}>{f.folgtAus.zielFeld || t('mappentypen.editor.bitte-waehlen')}</option>}
          {zielFelder.map((x) => <option key={x.key} value={x.key}>{x.label || x.key}</option>)}
        </select>
        {!zielFelder.length && <small className="hilfe">{t('mappentypen.editor.folgt-aus-kein-ziel')}</small>}</label>}
    </div>
  );
}
