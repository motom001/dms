/**
 * Entwurf des Mappentyp-Editors (#1279 aus Einrichtung.tsx gezogen): Bearbeitungszustand eines Mappentyps, Umrechnen
 * vom gespeicherten Typ und zurück (zum Speichern), Kopie und kleine Hilfen ohne Oberfläche.
 */
import {
  freierSchluessel,
  standardRegister,
  trefferlistenVon,
  type Abschnitt,
  type Feld as FeldDef,
  type Mappentyp,
  type Register,
  type Trefferliste,
  type Werte,
} from '../../../shared/src/model';
import { OFFENES_REGELWERK, regelwerkVon, type Regelwerk } from '../../../shared/src/rechte';
import { t } from '../sprache';
import type { Archiv } from '../../../shared/src/archiv';
import type { StempelTyp } from '../../../shared/src/stempel';
import type { Beschriftungen, TypTeile } from '../../../shared/src/beschriftung';
import type { AusDokument } from '../../../shared/src/erkennung';
import { leseZeitraum, zeitraumText } from '../../../shared/src/feldarten';

/** Entfernen im Editor wirkt erst beim Speichern (#136). */
export const ERST_BEIM_SPEICHERN = t('mappentypen.editor.das-wird-erst-mit');

/* ---------------------------------------------------------------- */

const ZAHLEN = ['minLen', 'maxLen', 'min', 'max', 'nachkomma'] as const;
export type Zahlprop = (typeof ZAHLEN)[number];

/** FeldDef im Bearbeitungszustand: Zahlen als getippter Text, Merker für neue Felder. */
export type EntwurfFeld = Omit<FeldDef, Zahlprop> &
  Record<Zahlprop, string> & {
    _uid: string;
    _neu?: boolean;
    _schluesselGetippt?: boolean;
    _register: string;
    /** Ausblenden (#655) hat „Pflicht“ aufgehoben – Hinweis am FeldDef, bis gespeichert ist. */
    _pflichtWeg?: boolean;
    /** „FeldDef wieder freigeben“ (#1034): beim Speichern `berechnetVon: null`. */
    _freigeben?: boolean;
  };
/** Abschnitt im Entwurf (#890): `vor` ist die _uid des Felds, damit ein neuer Schlüssel nichts kaputt macht. */
export interface EntwurfAbschnitt {
  _uid: string;
  vor: string;
  titel: string;
  eingeklappt?: boolean;
  beschriftungen?: Abschnitt['beschriftungen'];
  anzeigen?: Abschnitt['anzeigen'];
}
/** Register im Bearbeitungszustand; welche Felder darauf liegen, steht am FeldDef (_register). */
export type EntwurfRegister = Omit<Register, 'felder' | 'abschnitte'> & {
  _uid: string;
  _neu?: boolean;
  _schluesselGetippt?: boolean;
  abschnitte?: EntwurfAbschnitt[];
};
/** Trefferliste im Entwurf (#75): Spalten als _titel usw. bzw. feld:<_uid> – damit ein umbenannter Schlüssel nichts kaputt macht. */
/** Bereiche des Mappentyp-Editors (#144) in der Reihenfolge der Sprungleiste. */
export const TYP_BEREICHE = [
  ['grunddaten', t('mappentypen.bereich.grunddaten')],
  ['felder', t('mappentypen.bereich.felder')],
  ['titel', t('mappentypen.bereich.titel')],
  ['trefferlisten', t('mappentypen.bereich.trefferlisten')],
  ['register', t('mappentypen.bereich.register')],
  ['archiv', t('mappentypen.bereich.archivmodus')],
  ['stempel', t('mappentypen.bereich.stempel-beim-weitergeben')],
  ['erkennung', t('mappentypen.bereich.erkennung')],
  ['berechtigungen', t('mappentypen.bereich.berechtigungen')],
  ['testlauf', t('mappentypen.bereich.testlauf')],
  ['pakete', t('mappentypen.bereich.pakete')],
  ['ki', t('mappentypen.bereich.ki')],
  // Fassungen (#1006): wer wann was geändert hat – erst nach dem Anlegen.
  ['fassungen', t('oberflaeche.fassungen.titel')],
] as const;
export type TypBereich = (typeof TYP_BEREICHE)[number][0];

export interface EntwurfListe {
  _uid: string;
  _neu?: boolean;
  key: string;
  name: string;
  spalten: string[];
  standard: boolean;
  beschriftungen?: Trefferliste['beschriftungen'];
}
export interface Entwurf {
  id: string;
  name: string;
  /** Fester Schlüssel (#145); bei neuen Typen aus dem Namen, bis man ihn selbst tippt. */
  schluessel: string;
  _schluesselGetippt?: boolean;
  beschreibung: string;
  titelVorlage: string;
  felder: EntwurfFeld[];
  register: EntwurfRegister[];
  trefferlisten: EntwurfListe[];
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
  /** Ist Teil einer anderen Mappe (#1031): `_uid` des Verweisfelds, '' = noch keins gewählt, null = aus. */
  _teilVon: string | null;
  /** In der allgemeinen Suche zeigen (#1220); null = Vorgabe (ja). */
  inSuche: boolean | null;
}

export function neueId(): string {
  // crypto.randomUUID gibt es nur über HTTPS oder localhost; im Heimnetz oft nicht.
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const alsEntwurfRegister = ({ felder: _f, abschnitte: _a, ...r }: Register): EntwurfRegister => ({ ...r, _uid: neueId() });
/** Abschnitte eines gespeicherten Registers für den Entwurf (#890): `vor` über die _uid der Felder. */
const entwurfAbschnitte = (r: Register, felder: EntwurfFeld[]): EntwurfAbschnitt[] | undefined =>
  r.art !== 'felder'
    ? undefined
    : (r.abschnitte ?? []).flatMap((a) => {
        const f = felder.find((x) => x.key === a.vor);
        return f
          ? [
              {
                _uid: neueId(),
                vor: f._uid,
                titel: a.titel ?? '',
                ...(a.eingeklappt ? { eingeklappt: true } : {}),
                ...(a.beschriftungen ? { beschriftungen: a.beschriftungen } : {}),
                ...(a.anzeigen ? { anzeigen: a.anzeigen } : {}),
              },
            ]
          : [];
      });

/**
 * Ein FeldDef verlässt sein Register (entfernt oder umgezogen, #890): Ein Abschnitt, der mit ihm begann, beginnt jetzt mit
 * dem nächsten FeldDef des Registers – fehlt das oder hat es schon einen, fällt er weg.
 */
export function ohneAnker(x: Entwurf, uid: string): Entwurf {
  const f = x.felder.find((g) => g._uid === uid);
  if (!f) return x;
  const reihe = x.felder.filter((g) => g._register === f._register);
  const naechstes = reihe[reihe.indexOf(f) + 1];
  return {
    ...x,
    register: x.register.map((r) =>
      r.key !== f._register || !r.abschnitte?.some((a) => a.vor === uid)
        ? r
        : {
            ...r,
            abschnitte: r.abschnitte.flatMap((a) =>
              a.vor !== uid
                ? [a]
                : naechstes && !r.abschnitte!.some((b) => b.vor === naechstes._uid)
                  ? [{ ...a, vor: naechstes._uid }]
                  : [],
            ),
          },
    ),
  };
}

export function entwurfAus(eintrag?: Mappentyp): Entwurf {
  if (!eintrag)
    return {
      id: neueId(),
      name: '',
      schluessel: '',
      beschreibung: '',
      titelVorlage: '',
      felder: [],
      register: standardRegister([]).map(alsEntwurfRegister),
      trefferlisten: [{ _uid: neueId(), key: 'standard', name: t('mappentypen.editor.standard'), spalten: [], standard: true }],
      berechtigungen: structuredClone(OFFENES_REGELWERK),
      archiv: null,
      stempel: null,
      ausDokument: null,
      autoZuordnen: false,
      ausPost: null,
      erkennbarAn: '',
      _teilVon: null,
      inSuche: null,
    };
  const erstes = eintrag.register.find((r) => r.art === 'felder')?.key ?? '';
  const e: Entwurf = {
    id: eintrag.id,
    name: eintrag.name,
    schluessel: eintrag.schluessel ?? '',
    beschreibung: eintrag.beschreibung,
    titelVorlage: eintrag.titelVorlage ?? '',
    berechtigungen: structuredClone(regelwerkVon(eintrag)),
    archiv: eintrag.archiv ?? null,
    stempel: eintrag.stempel ?? null,
    ausDokument: eintrag.ausDokument ?? null,
    autoZuordnen: !!eintrag.autoZuordnen,
    ausPost: eintrag.ausPost ?? null,
    inSuche: eintrag.inSuche ?? null,
    erkennbarAn: eintrag.erkennbarAn ?? '',
    beschriftungen: eintrag.beschriftungen,
    register: [],
    felder: eintrag.felder.map(
      (f) =>
        ({
          ...f,
          _uid: neueId(),
          _register: eintrag.register.find((r) => r.art === 'felder' && r.felder?.includes(f.key))?.key ?? erstes,
          ...Object.fromEntries(ZAHLEN.map((p) => [p, f[p] == null ? '' : String(f[p]).replace('.', ',')])),
        }) as unknown as EntwurfFeld,
    ),
    trefferlisten: [],
    _teilVon: null,
  };
  // Ist Teil einer anderen Mappe (#1031): im Entwurf über die _uid des Felds.
  e._teilVon = eintrag.teilVon ? (e.felder.find((f) => f.key === eintrag.teilVon)?._uid ?? '') : null;
  e.register = eintrag.register.map((r) => ({
    ...alsEntwurfRegister(r),
    ...(r.art === 'felder' ? { abschnitte: entwurfAbschnitte(r, e.felder) } : {}),
  }));
  e.trefferlisten = trefferlistenVon(eintrag).map((l) => ({
    _uid: neueId(),
    key: l.key,
    name: l.name,
    standard: !!l.standard,
    beschriftungen: l.beschriftungen,
    spalten: l.spalten.flatMap((k) => {
      if (k.startsWith('_')) return [k];
      const f = e.felder.find((x) => x.key === k);
      return f ? [`feld:${f._uid}`] : [];
    }),
  }));
  return e;
}

/** Mappentyp kopieren (#147): neuer, ungespeicherter Entwurf mit Feldern, Titel, Trefferlisten, Registern und Berechtigungen. */
export function kopieVon(mappentyp: Mappentyp, typen: Mappentyp[]): Entwurf {
  const e = entwurfAus(mappentyp);
  const id = neueId();
  const namen = new Set(typen.map((x) => x.name.trim().toLowerCase()));
  let name = t('mappentypen.editor.kopie-von', { name: mappentyp.name });
  let n = 2;
  while (namen.has(name.toLowerCase())) name = t('mappentypen.editor.kopie-von-2', { name: mappentyp.name, wert: n++ });
  // Verweise auf sich selbst zeigen in der Kopie auf die Kopie.
  const selbst = (x?: string) => (x === mappentyp.id ? id : x);
  return {
    ...e,
    id,
    name,
    schluessel: freierSchluessel(
      name,
      typen.map((x) => x.schluessel ?? ''),
    ),
    felder: e.felder.map((f) => ({
      ...f,
      ...(f.typ === 'referenz' ? { zielTypen: (f.zielTypen ?? []).map((z) => selbst(z)!) } : {}),
      _neu: true,
      _schluesselGetippt: true,
    })),
    register: e.register.map((r) => (r.quellen ? { ...r, quellen: r.quellen.map((q) => ({ ...q, typId: selbst(q.typId)! })) } : r)),
    berechtigungen: structuredClone(e.berechtigungen),
  };
}

/** Standardwert im Editor: ein gespeicherter Zeitraum (P3M) lesbar als „3 Monate“ (#1035), sonst wie getippt. */
export function standardAnzeige(f: Pick<FeldDef, 'typ' | 'standard'>): string {
  const s = String(f.standard ?? '');
  if (f.typ === 'zeitraum' && /^P\d+[DWMY]$/.test(s)) {
    const z = leseZeitraum(s);
    if (z) return zeitraumText(z);
  }
  if (f.typ === 'prozent' && /^-?\d+(\.\d+)?$/.test(s)) return s.replace('.', ',');
  return s;
}

/** Für die Vorschau, solange es keine Mappe gibt. */
export function beispielWerte(felder: FeldDef[]): Werte {
  const w: Werte = {};
  for (const f of felder) {
    switch (f.typ) {
      case 'zahl':
        w[f.key] = 42;
        break;
      case 'betrag':
        w[f.key] = { betrag: 123.45, waehrung: f.waehrung || 'EUR' };
        break;
      case 'zeitraum':
        w[f.key] = { anzahl: 3, einheit: 'monate' };
        break;
      case 'prozent':
        w[f.key] = 19;
        break;
      case 'datum':
        w[f.key] = new Date().toISOString().slice(0, 10);
        break;
      case 'janein':
        w[f.key] = true;
        break;
      case 'auswahl':
        w[f.key] = f.optionen?.[0] ?? '';
        break;
      case 'referenz':
        w[f.key] = 'beispiel';
        break;
      case 'passwort':
        w[f.key] = null;
        break;
      // Tabelle (#1030): kein Wert.
      case 'tabelle':
        break;
      default:
        w[f.key] = f.label || f.key;
    }
  }
  return w;
}

/** Kurzinfo der Felder (#144), z. B. „8 Felder, 2 Pflicht, 1 Frist“. */
export function feldKurz(felder: EntwurfFeld[]): string {
  if (!felder.length) return t('mappentypen.editor.noch-keine-felder');
  const pflicht = felder.filter((f) => f.pflicht).length;
  const frist = felder.filter((f) => f.typ === 'datum' && f.frist).length;
  // Ausgeblendete Felder (#655) zählen mit – sie sind ja noch da.
  const aus = felder.filter((f) => f.ausgeblendet).length;
  return [
    t('mappentypen.editor.felder-2', { anzahl: felder.length }),
    pflicht && t('mappentypen.editor.pflicht', { pflicht }),
    frist && t('mappentypen.editor.fristen', { anzahl: frist }),
    aus && t('mappentypen.darstellung.ausgeblendete-felder', { anzahl: aus }),
  ]
    .filter(Boolean)
    .join(', ');
}

/** Neues FeldDef im Entwurf (Knopf „+ Feld hinzufügen“): Text, nicht Pflicht, auf dem ersten Feldregister. */
export function neuesFeld(key: string, register: string): EntwurfFeld {
  return {
    key,
    label: t('mappentypen.editor.neues-feld'),
    typ: 'text',
    pflicht: false,
    eindeutig: false,
    hilfe: '',
    standard: '',
    minLen: '',
    maxLen: '',
    min: '',
    max: '',
    nachkomma: '',
    muster: '',
    optionen: [],
    mehrfach: false,
    zielTypen: [],
    verweisart: 'bezug',
    waehrung: 'EUR',
    _uid: neueId(),
    _neu: true,
    _register: register,
  };
}

/**
 * Der Entwurf, wie ihn der Server zum Speichern bekommt: Merker (_uid usw.) weg, Felder der Register und Spalten der
 * Trefferlisten wieder als Schlüssel.
 */
export function speicherDaten(e: Entwurf) {
  const { trefferlisten: listen, _schluesselGetippt: _sg, _teilVon: teilUid, ...ohneListen } = e;
  // Beschriftungen (#728) immer mitschicken, leer als null – ohne die Angabe behielte der Server die bisherigen.
  return {
    ...ohneListen,
    beschriftungen: e.beschriftungen ?? null,
    // Ist Teil einer anderen Mappe (#1031): Kennung des Felds; ohne gewähltes FeldDef meldet der Server den Fehler.
    teilVon: teilUid === null ? null : (e.felder.find((f) => f._uid === teilUid)?.key ?? '_'),
    // Ausgeblendet (#655) immer mitschicken – ohne die Angabe behielte der Server den bisherigen Wert.
    // Anzeigen, wenn … (#1033) genauso: null entfernt die Regel.
    // FeldDef wieder freigeben (#1034): ausdrücklich null; sonst bleibt „berechnet“, wie es ist.
    felder: e.felder.map(({ _uid, _neu, _schluesselGetippt, _register, _pflichtWeg, _freigeben, ...rest }) => ({
      ...rest,
      beschriftungen: rest.beschriftungen ?? null,
      ausgeblendet: !!rest.ausgeblendet,
      anzeigen: rest.anzeigen ?? null,
      ...(_freigeben ? { berechnetVon: null } : {}),
    })),
    register: e.register.map(({ _uid, _neu, _schluesselGetippt, abschnitte, ...r }) => {
      const felder = e.felder.filter((f) => f._register === r.key);
      // Abschnitte (#890) als Feldschlüssel; nur vor Feldern dieses Registers, Reihenfolge der Felder.
      const ab = (abschnitte ?? []).flatMap((a) => {
        const f = felder.find((x) => x._uid === a.vor);
        const titel = a.titel.trim();
        return f
          ? [
              {
                vor: f.key,
                ...(titel ? { titel, ...(a.eingeklappt ? { eingeklappt: true } : {}), beschriftungen: a.beschriftungen ?? null } : {}),
                ...(a.anzeigen ? { anzeigen: a.anzeigen } : {}),
              },
            ]
          : [];
      });
      return {
        ...(r.art === 'felder' ? { ...r, felder: felder.map((f) => f.key), abschnitte: ab } : r),
        beschriftungen: r.beschriftungen ?? null,
        ausgeblendet: !!r.ausgeblendet,
      };
    }),
    trefferlisten: listen.map(({ _uid, _neu, ...l }) => ({
      ...l,
      beschriftungen: l.beschriftungen ?? null,
      spalten: l.spalten.flatMap((k) =>
        k.startsWith('feld:')
          ? e.felder.filter((f) => `feld:${f._uid}` === k && f.typ !== 'passwort' && f.typ !== 'tabelle').map((f) => f.key)
          : [k],
      ),
    })),
  };
}
