/**
 * Lesbare Änderungslisten der Fassungen (#1006): je Gegenstand eine Beschreibung aus zwei Ständen, z. B. „Feld
 * ‚Kündigungsfrist‘ hinzugefügt · ‚Betrag‘ ist kein Pflichtfeld mehr · Trefferliste ‚Standard‘: Spalte ‚Ort‘ entfernt“.
 * Kein JSON-Diff für Menschen. Für Mappentypen baut sie auf dem Typvergleich der Pakete auf (`typvergleich.ts`, #653),
 * für Automatisierungen auf ihrer Kurzform (`automatisierung.ts`), für Automatisierungsvorlagen auf `ablaufvorlagen.ts`.
 *
 * Werte von Geheimnissen (Postfach-Passwort, geheime Paket-Einstellungen) stehen nie in einer Fassung; die Beschreibung
 * sagt nur „geändert“.
 */
import { karteText, wannText as vorlageWannText, type AblaufvorlageDaten, type VorlagenKarte } from './ablaufvorlagen';
import { dannText, kontextTyp, wennText, type AutomatisierungDaten, type DannKarte, type Kontextdaten } from './automatisierung';
import type { Feld, Mappentyp, Register, Trefferliste } from './model';
import { inAllgemeinerSuche, kannAusPost, SYSTEMSPALTEN, istSystemspalte } from './model';
import { kurzStandard, type Regelwerk } from './rechte';
import { kurzSicht, type SichtRegelwerk } from './sichtrechte';
import type { SichtDaten } from './sichten';
import type { StempelVorlage } from './stempel';
import { t } from './texte';
import { eigenschaftName, typBild } from './typvergleich';
import { gleicheStaende, type FassungArt } from './fassungen';

/** Stand eines Mappentyps in einer Fassung: der Typ ohne Id und Zeitstempel, dazu Stempel und Erkennung am Typ. */
export type TypStand = Omit<Mappentyp, 'id' | 'erstellt' | 'geaendert' | 'darfAnlegen' | 'paket'>;
/** Stand einer Ansicht: ohne Position unter den Geschwistern (Umsortieren ist keine Änderung der Ansicht). */
export type SichtStand = Omit<SichtDaten, 'position'>;
export interface NummernkreisStand { schluessel: string; name: string; muster: string; start: number }
export type StempelStand = Omit<StempelVorlage, 'id' | 'umgestellt'>;
/** Postfach ohne Passwort: nur, ob eines gesetzt ist. */
export type PostfachStand = Record<string, unknown> & { name: string; passwortGesetzt?: boolean };
/** Paket-Einstellungen: Werte; Geheimnisse nur als `{ gesetzt: true }`. */
export interface PaketEinstellungenStand { werte: Record<string, unknown> }
export type AutomatisierungStand = AutomatisierungDaten & { aktiv: boolean };
/** Automatisierungsvorlage (#1044): ihre Daten und an/aus – nicht Herkunft und Paket. */
export type AblaufvorlageStand = AblaufvorlageDaten & { aktiv: boolean };

/** Was die Beschreibung nachschlagen muss – der Server reicht es herein. */
export interface Vergleichskontext {
  /** Name eines Mappentyps (Ansichten, Verweise). */
  typName?(id: string): string | undefined;
  /** Name einer Ansicht (Elternansicht). */
  sichtName?(id: string): string | undefined;
  /** Name einer Einstellung eines Pakets und ob sie geheim ist. */
  einstellung?(schluessel: string): { name: string; geheim: boolean } | undefined;
  /** Automatisierungen: Typen, Personen, Rollen, Pakete. */
  automatisierung?: Pick<Kontextdaten, 'typen' | 'benutzer' | 'rollen' | 'pakete'>;
  /** Automatisierungsvorlagen: Mappentypen (Felder als Empfänger). */
  typen?: Mappentyp[];
}

const gleich = (a: unknown, b: unknown) => gleicheStaende(a ?? null, b ?? null);
const leer = (v: unknown) => v === undefined || v === null || v === false || v === '' || (Array.isArray(v) && !v.length);
const wert = (v: unknown) => (v === undefined || v === null || v === '' ? '–' : String(v));
const anAus = (v: unknown) => (v ? t('gemeinsam.fassungen.an') : t('gemeinsam.fassungen.aus'));

/** Gleich gemeint, verschieden gespeichert: „Aus Post anlegen“ ohne Angabe gilt wie berechnet (#937). */
function wirksam(art: FassungArt, x: unknown): unknown {
  if (art !== 'typ' || !x || typeof x !== 'object') return x;
  // „In der allgemeinen Suche zeigen“ (#1220): ohne Angabe gilt „ja“.
  return { ...(x as TypStand), ausPost: kannAusPost(x as TypStand), inSuche: inAllgemeinerSuche(x as TypStand) };
}

/**
 * Was sich von `alt` zu `neu` geändert hat, je Änderung ein Satz. `alt` null: der Eintrag ist neu („Angelegt“).
 * Gleiche Stände ergeben eine leere Liste.
 */
export function beschreibeAenderungen(art: FassungArt, alt: unknown, neu: unknown, k: Vergleichskontext = {}): string[] {
  if (alt === null || alt === undefined) return [t('gemeinsam.fassungen.angelegt')];
  if (gleich(wirksam(art, alt), wirksam(art, neu))) return [];
  const liste = (() => {
    switch (art) {
      case 'typ': return beschreibeTyp(alt as TypStand, neu as TypStand);
      case 'sicht': return beschreibeSicht(alt as SichtStand, neu as SichtStand, k);
      case 'nummernkreis': return beschreibeNummernkreis(alt as NummernkreisStand, neu as NummernkreisStand);
      case 'stempel': return beschreibeStempel(alt as StempelStand, neu as StempelStand);
      case 'postfach': return beschreibePostfach(alt as PostfachStand, neu as PostfachStand);
      case 'paketeinstellungen': return beschreibePaketEinstellungen(alt as PaketEinstellungenStand, neu as PaketEinstellungenStand, k);
      case 'automatisierung': return beschreibeAutomatisierung(alt as AutomatisierungStand, neu as AutomatisierungStand, k);
      case 'ablaufvorlage': return beschreibeAblaufvorlage(alt as AblaufvorlageStand, neu as AblaufvorlageStand, k);
      default: return [];
    }
  })();
  // Etwas Unbenanntes hat sich geändert (z. B. eine neue Eigenschaft) – nie still „nichts“.
  return liste.length ? liste : [t('gemeinsam.fassungen.weiteres-geaendert')];
}

/* ---------- Mappentyp ---------- */

function feldSaetze(a: { key: string; label: string; werte: Record<string, unknown> }, n: { key: string; label: string; werte: Record<string, unknown> }): string[] {
  const s: string[] = [];
  if (a.label !== n.label) s.push(t('gemeinsam.fassungen.feld-umbenannt', { alt: a.label, neu: n.label }));
  const rest: string[] = [];
  for (const k of new Set([...Object.keys(a.werte), ...Object.keys(n.werte)])) {
    if (gleich(a.werte[k], n.werte[k])) continue;
    if (k === 'pflicht') s.push(n.werte.pflicht ? t('gemeinsam.fassungen.feld-pflicht', { label: n.label }) : t('gemeinsam.fassungen.feld-nicht-pflicht', { label: n.label }));
    else if (k === 'eindeutig') s.push(n.werte.eindeutig ? t('gemeinsam.fassungen.feld-eindeutig', { label: n.label }) : t('gemeinsam.fassungen.feld-nicht-eindeutig', { label: n.label }));
    else if (k === 'ausgeblendet') s.push(n.werte.ausgeblendet ? t('gemeinsam.fassungen.feld-ausgeblendet', { label: n.label }) : t('gemeinsam.fassungen.feld-eingeblendet', { label: n.label }));
    else if (k === 'typ') s.push(t('gemeinsam.fassungen.feld-art', { label: n.label, alt: String(a.werte.typ ?? ''), neu: String(n.werte.typ ?? '') }));
    else rest.push(eigenschaftName(k));
  }
  if (rest.length) s.push(t('gemeinsam.fassungen.feld-geaendert', { label: n.label, was: [...new Set(rest)].join(', ') }));
  return s;
}

const spaltenName = (key: string, felder: Feld[]) => (istSystemspalte(key) ? SYSTEMSPALTEN[key] : felder.find((f) => f.key === key)?.label ?? key);

function regelSaetze(a: Regelwerk | SichtRegelwerk | null | undefined, n: Regelwerk | SichtRegelwerk | null | undefined, sicht: boolean): string[] {
  if (gleich(a, n)) return [];
  const s: string[] = [];
  const kurz = (r: Regelwerk | SichtRegelwerk | null | undefined) => (r ? (sicht ? kurzSicht((r as SichtRegelwerk).grund) : kurzStandard((r as Regelwerk).grund)) : t('gemeinsam.fassungen.rechte-offen'));
  if (!gleich(a?.grund, n?.grund) || !a !== !n) s.push(t('gemeinsam.fassungen.rechte-grund', { alt: kurz(a), neu: kurz(n) }));
  const ar = a?.regeln ?? [], nr = n?.regeln ?? [];
  const name = (r: { id: string; name?: string }) => r.name || r.id;
  for (const r of nr) if (!ar.some((x) => x.id === r.id)) s.push(t('gemeinsam.fassungen.regel-hinzugefuegt', { name: name(r) }));
  for (const r of ar) if (!nr.some((x) => x.id === r.id)) s.push(t('gemeinsam.fassungen.regel-entfernt', { name: name(r) }));
  for (const r of nr) { const x = ar.find((y) => y.id === r.id); if (x && !gleich(x, r)) s.push(t('gemeinsam.fassungen.regel-geaendert', { name: name(r) })); }
  if (!s.length) s.push(t('gemeinsam.fassungen.regel-reihenfolge'));
  return s;
}

const REGISTER_TEXTE: Record<string, string> = {
  volltext: 'gemeinsam.fassungen.register-volltext', versionierung: 'gemeinsam.fassungen.register-versionierung',
  versionenBehalten: 'gemeinsam.fassungen.register-versionierung', historie: 'gemeinsam.fassungen.register-historie',
};

/** Ein Register in beiden Ständen; `gemeinsam`: Felder, die es in beiden gibt – neue und entfernte nennt schon die Feldliste. */
function registerSatz(a: Register, n: Register, gemeinsam: Set<string>): string | null {
  const nur = (r: Register) => ({ ...r, ...(r.felder ? { felder: r.felder.filter((k) => gemeinsam.has(k)) } : {}) });
  const ba = typBild({ name: '', beschreibung: '', titelVorlage: '', felder: [], register: [nur(a)] } as unknown as Mappentyp).register[0];
  const bn = typBild({ name: '', beschreibung: '', titelVorlage: '', felder: [], register: [nur(n)] } as unknown as Mappentyp).register[0];
  const was = [...(a.name !== n.name ? [t('gemeinsam.typvergleich.umbenannt-von-2', { name: a.name })] : []),
    ...[...new Set([...Object.keys(ba.werte), ...Object.keys(bn.werte)])].filter((k) => !gleich(ba.werte[k], bn.werte[k])).map(eigenschaftName),
    ...Object.keys(REGISTER_TEXTE).filter((k) => !gleich((a as unknown as Record<string, unknown>)[k], (n as unknown as Record<string, unknown>)[k])).map((k) => t.frei(REGISTER_TEXTE[k]))];
  return was.length ? t('gemeinsam.fassungen.register-geaendert', { name: n.name, was: [...new Set(was)].join(', ') }) : null;
}

type Satz = () => string | null | false | undefined;
/** Sätze aus einer Liste von Prüfungen – je Prüfung eine kleine Funktion, damit jede für sich lesbar bleibt. */
const saetze = (liste: Satz[]): string[] => liste.map((f) => f()).filter((x): x is string => !!x);

type Bild = ReturnType<typeof typBild>;

/** Felder: hinzugefügt, entfernt, je Feld lesbar, Reihenfolge. */
function felderSaetze(alt: TypStand, neu: TypStand, ba: Bild, bn: Bild): string[] {
  const s: string[] = [];
  const altF = new Map(ba.felder.map((f) => [f.key, f] as const));
  const neuF = new Map(bn.felder.map((f) => [f.key, f] as const));
  for (const f of bn.felder) if (!altF.has(f.key)) s.push(t('gemeinsam.typvergleich.feld-hinzugefuegt', { label: f.label }));
  for (const f of ba.felder) if (!neuF.has(f.key)) s.push(t('gemeinsam.typvergleich.feld-entfernt', { label: f.label }));
  for (const f of bn.felder) { const a = altF.get(f.key); if (a) s.push(...feldSaetze(a, f)); }
  const reihe = (x: TypStand) => x.felder.map((f) => f.key).filter((key) => altF.has(key) && neuF.has(key)).join(',');
  if (reihe(alt) !== reihe(neu)) s.push(t('gemeinsam.fassungen.felder-reihenfolge'));
  return s;
}

/** Register: hinzugefügt, entfernt, geändert (Felder darauf nur, soweit es sie vorher und nachher gibt), Reihenfolge. */
function registerSaetze(alt: TypStand, neu: TypStand): string[] {
  const s: string[] = [];
  const gemeinsam = new Set(alt.felder.map((f) => f.key).filter((key) => neu.felder.some((f) => f.key === key)));
  for (const r of neu.register) {
    const a = alt.register.find((x) => x.key === r.key);
    const satz = a ? registerSatz(a, r, gemeinsam) : t('gemeinsam.typvergleich.register-hinzugefuegt', { name: r.name });
    if (satz) s.push(satz);
  }
  for (const r of alt.register) if (!neu.register.some((x) => x.key === r.key)) s.push(t('gemeinsam.typvergleich.register-entfernt', { name: r.name }));
  const gleicheMenge = alt.register.length === neu.register.length && alt.register.every((r) => neu.register.some((x) => x.key === r.key));
  if (gleicheMenge && alt.register.map((r) => r.key).join(',') !== neu.register.map((r) => r.key).join(',')) s.push(t('gemeinsam.fassungen.register-reihenfolge'));
  return s;
}

/** Eine Trefferliste in beiden Ständen: Name, Spalten, Reihenfolge, Standard, Beschriftungen. */
function listeSaetze(a: Trefferliste, l: Trefferliste, alt: TypStand, neu: TypStand): string[] {
  const gemeinsam = (x: string[], y: string[]) => x.filter((z) => y.includes(z)).join(',');
  return [
    ...saetze([() => a.name !== l.name && t('gemeinsam.fassungen.liste-umbenannt', { alt: a.name, neu: l.name })]),
    ...l.spalten.filter((sp) => !a.spalten.includes(sp)).map((sp) => t('gemeinsam.fassungen.spalte-hinzugefuegt', { liste: l.name, spalte: spaltenName(sp, neu.felder) })),
    ...a.spalten.filter((sp) => !l.spalten.includes(sp)).map((sp) => t('gemeinsam.fassungen.spalte-entfernt', { liste: l.name, spalte: spaltenName(sp, alt.felder) })),
    ...saetze([
      () => gemeinsam(a.spalten, l.spalten) !== gemeinsam(l.spalten, a.spalten) && t('gemeinsam.fassungen.spalten-reihenfolge', { liste: l.name }),
      () => !a.standard && !!l.standard && t('gemeinsam.fassungen.liste-standard', { name: l.name }),
      () => !gleich(a.beschriftungen, l.beschriftungen) && t('gemeinsam.fassungen.liste-beschriftungen', { name: l.name }),
    ]),
  ];
}

function listenSaetze(alt: TypStand, neu: TypStand): string[] {
  const la = alt.trefferlisten ?? [], ln = neu.trefferlisten ?? [];
  return [
    ...ln.flatMap((l) => { const a = la.find((x) => x.key === l.key); return a ? listeSaetze(a, l, alt, neu) : [t('gemeinsam.fassungen.liste-hinzugefuegt', { name: l.name })]; }),
    ...la.filter((l) => !ln.some((x) => x.key === l.key)).map((l) => t('gemeinsam.fassungen.liste-entfernt', { name: l.name })),
  ];
}

/** Einzelne Angaben des Typs. */
function angabenSaetze(alt: TypStand, neu: TypStand): string[] {
  const text = (x: string | null | undefined) => x ?? '';
  const archiv = () => (leer(neu.archiv) ? t('gemeinsam.fassungen.archiv-aus') : leer(alt.archiv) ? t('gemeinsam.fassungen.archiv-an') : t('gemeinsam.fassungen.archiv-geaendert'));
  const teil = () => (neu.teilVon ? t('gemeinsam.fassungen.teil-an', { feld: neu.felder.find((f) => f.key === neu.teilVon)?.label ?? neu.teilVon }) : t('gemeinsam.fassungen.teil-aus'));
  return saetze([
    () => text(alt.beschreibung) !== text(neu.beschreibung) && t('gemeinsam.typvergleich.beschreibung-geaendert'),
    () => text(alt.titelVorlage) !== text(neu.titelVorlage) && t('gemeinsam.fassungen.titel', { alt: wert(alt.titelVorlage), neu: wert(neu.titelVorlage) }),
    () => !gleich(alt.beschriftungen, neu.beschriftungen) && t('gemeinsam.typvergleich.beschriftungen-geaendert'),
    () => text(alt.erkennbarAn) !== text(neu.erkennbarAn) && t('gemeinsam.fassungen.erkennbar-an'),
    // Wirksam vergleichen (#937): ohne Angabe gilt „mit Dokumentenregister“; Systemtypen nie.
    () => kannAusPost(alt) !== kannAusPost(neu) && t('gemeinsam.fassungen.aus-post', { wert: anAus(kannAusPost(neu)) }),
    () => !gleich(alt.teilVon, neu.teilVon) && teil(),
    () => inAllgemeinerSuche(alt) !== inAllgemeinerSuche(neu) && (inAllgemeinerSuche(neu) ? t('gemeinsam.fassungen.in-suche-ja') : t('gemeinsam.fassungen.in-suche-nein')),
    () => !gleich(alt.archiv, neu.archiv) && archiv(),
    () => !gleich(alt.stempel, neu.stempel) && t('gemeinsam.fassungen.stempel-am-typ'),
    () => !gleich(alt.ausDokument, neu.ausDokument) && t('gemeinsam.fassungen.aus-dokument'),
    () => !alt.autoZuordnen !== !neu.autoZuordnen && t('gemeinsam.fassungen.auto-zuordnen', { wert: anAus(neu.autoZuordnen) }),
    () => (!alt.erstellenErlaubt !== !neu.erstellenErlaubt || !alt.loeschenErlaubt !== !neu.loeschenErlaubt) && t('gemeinsam.fassungen.haken'),
  ]);
}

export function beschreibeTyp(alt: TypStand, neu: TypStand): string[] {
  const ba = typBild({ ...alt, id: '', erstellt: '', geaendert: '' } as Mappentyp);
  const bn = typBild({ ...neu, id: '', erstellt: '', geaendert: '' } as Mappentyp);
  return [
    ...saetze([
      () => alt.name !== neu.name && t('gemeinsam.typvergleich.name', { name: alt.name, name2: neu.name }),
      () => alt.schluessel !== neu.schluessel && t('gemeinsam.fassungen.kennung', { alt: wert(alt.schluessel), neu: wert(neu.schluessel) }),
    ]),
    ...felderSaetze(alt, neu, ba, bn),
    ...registerSaetze(alt, neu),
    ...listenSaetze(alt, neu),
    ...angabenSaetze(alt, neu),
    ...regelSaetze(alt.berechtigungen, neu.berechtigungen, false).map((x) => t('gemeinsam.fassungen.rechte', { was: x })),
  ];
}

/* ---------- Ansicht ---------- */

/** Bedingungen: Anzahl, sonst „geändert“ (Ansichten und Automatisierungen). */
const bedingungsSatz = (a: unknown[], n: unknown[]) => !gleich(a, n) && (a.length !== n.length
  ? t('gemeinsam.fassungen.bedingungen-anzahl', { alt: a.length, neu: n.length }) : t('gemeinsam.fassungen.bedingungen-geaendert'));

export function beschreibeSicht(alt: SichtStand, neu: SichtStand, k: Vergleichskontext = {}): string[] {
  const typ = (id: string) => k.typName?.(id) ?? id;
  const ort = () => (neu.elternId ? t('gemeinsam.fassungen.sicht-unter', { name: k.sichtName?.(neu.elternId) ?? neu.elternId }) : t('gemeinsam.fassungen.sicht-oben'));
  return [
    ...saetze([
      () => alt.name !== neu.name && t('gemeinsam.typvergleich.name', { name: alt.name, name2: neu.name }),
      () => !gleich(alt.beschreibung || '', neu.beschreibung || '') && t('gemeinsam.typvergleich.beschreibung-geaendert'),
      () => !gleich(alt.elternId, neu.elternId) && ort(),
    ]),
    ...neu.typen.filter((id) => !alt.typen.includes(id)).map((id) => t('gemeinsam.fassungen.sicht-typ-dazu', { name: typ(id) })),
    ...alt.typen.filter((id) => !neu.typen.includes(id)).map((id) => t('gemeinsam.fassungen.sicht-typ-weg', { name: typ(id) })),
    ...saetze([
      () => bedingungsSatz(alt.bedingungen, neu.bedingungen),
      () => !gleich(alt.trefferliste, neu.trefferliste) && t('gemeinsam.fassungen.sicht-liste'),
      () => !gleich(alt.symbol, neu.symbol) && t('gemeinsam.fassungen.symbol'),
      () => !gleich(alt.beschriftungen, neu.beschriftungen) && t('gemeinsam.typvergleich.beschriftungen-geaendert'),
    ]),
    ...regelSaetze(alt.berechtigungen, neu.berechtigungen, true).map((x) => t('gemeinsam.fassungen.rechte', { was: x })),
  ];
}

/* ---------- Nummernkreis, Stempel-Vorlage, Postfach ---------- */

export function beschreibeNummernkreis(alt: NummernkreisStand, neu: NummernkreisStand): string[] {
  const s: string[] = [];
  if (alt.name !== neu.name) s.push(t('gemeinsam.typvergleich.name', { name: alt.name, name2: neu.name }));
  if (alt.muster !== neu.muster) s.push(t('gemeinsam.fassungen.muster', { alt: alt.muster, neu: neu.muster }));
  if (alt.start !== neu.start) s.push(t('gemeinsam.fassungen.start', { alt: alt.start, neu: neu.start }));
  return s;
}

const STEMPEL_TEXTE: Record<string, string> = {
  lage: 'gemeinsam.fassungen.stempel-lage', deckkraft: 'gemeinsam.fassungen.stempel-deckkraft', seiten: 'gemeinsam.fassungen.stempel-seiten', tinte: 'gemeinsam.fassungen.stempel-tinte',
  drehung: 'gemeinsam.fassungen.stempel-drehung', x: 'gemeinsam.fassungen.stempel-ort', y: 'gemeinsam.fassungen.stempel-ort', farbe: 'gemeinsam.fassungen.stempel-farbe', groesse: 'gemeinsam.fassungen.stempel-groesse',
};

export function beschreibeStempel(alt: StempelStand, neu: StempelStand): string[] {
  const s: string[] = [];
  if (alt.name !== neu.name) s.push(t('gemeinsam.typvergleich.name', { name: alt.name, name2: neu.name }));
  if (alt.text !== neu.text) s.push(t('gemeinsam.fassungen.stempel-text', { alt: alt.text, neu: neu.text }));
  const a = alt as unknown as Record<string, unknown>, n = neu as unknown as Record<string, unknown>;
  const was = [...new Set(Object.keys(STEMPEL_TEXTE).filter((x) => !gleich(a[x], n[x])).map((x) => t.frei(STEMPEL_TEXTE[x])))];
  if (was.length) s.push(t('gemeinsam.fassungen.stempel-aussehen', { was: was.join(', ') }));
  return s;
}

const POSTFACH_TEXTE: Record<string, string> = {
  server: 'gemeinsam.fassungen.postfach-verbindung', port: 'gemeinsam.fassungen.postfach-verbindung', verschluesselung: 'gemeinsam.fassungen.postfach-verbindung',
  anmeldung: 'gemeinsam.fassungen.postfach-anmeldung', anbieter: 'gemeinsam.fassungen.postfach-anmeldung', benutzer: 'gemeinsam.fassungen.postfach-konto',
  passwortGesetzt: 'gemeinsam.fassungen.postfach-passwort', ordner: 'gemeinsam.fassungen.postfach-ordner', abstand: 'gemeinsam.fassungen.postfach-abstand',
  fuer: 'gemeinsam.fassungen.postfach-fuer', absender: 'gemeinsam.fassungen.postfach-absender', nachher: 'gemeinsam.fassungen.postfach-nachher',
  zielordner: 'gemeinsam.fassungen.postfach-nachher', nurMitAnhang: 'gemeinsam.fassungen.postfach-anhang', original: 'gemeinsam.fassungen.postfach-original',
};

export function beschreibePostfach(alt: PostfachStand, neu: PostfachStand): string[] {
  const s: string[] = [];
  if (alt.name !== neu.name) s.push(t('gemeinsam.typvergleich.name', { name: alt.name, name2: neu.name }));
  if (!!alt.aktiv !== !!neu.aktiv) s.push(t('gemeinsam.fassungen.postfach-aktiv', { wert: anAus(neu.aktiv) }));
  const was = [...new Set(Object.keys(POSTFACH_TEXTE).filter((x) => !gleich(alt[x], neu[x])).map((x) => t.frei(POSTFACH_TEXTE[x])))];
  for (const w of was) s.push(w);
  return s;
}

/* ---------- Paket-Einstellungen ---------- */

export function beschreibePaketEinstellungen(alt: PaketEinstellungenStand, neu: PaketEinstellungenStand, k: Vergleichskontext = {}): string[] {
  const s: string[] = [];
  const a = alt.werte ?? {}, n = neu.werte ?? {};
  for (const key of [...new Set([...Object.keys(a), ...Object.keys(n)])].sort()) {
    if (gleich(a[key], n[key])) continue;
    const e = k.einstellung?.(key);
    const name = e?.name ?? key;
    // Einfache Werte zeigen, Geheimnisse und Listen nie.
    const einfach = (v: unknown) => v === undefined || v === null || ['string', 'number', 'boolean'].includes(typeof v);
    if (!e?.geheim && einfach(a[key]) && einfach(n[key]) && String(n[key] ?? '').length <= 60 && String(a[key] ?? '').length <= 60) {
      const w = (v: unknown) => (typeof v === 'boolean' ? anAus(v) : wert(v));
      s.push(t('gemeinsam.fassungen.einstellung-wert', { name, alt: w(a[key]), neu: w(n[key]) }));
    } else s.push(t('gemeinsam.fassungen.einstellung', { name }));
  }
  return s;
}

/* ---------- Automatisierung ---------- */

/** Dann- bzw. Sonst-Karten: hinzugefügt, geändert, entfernt, Reihenfolge. */
function kartenSaetze(bereich: 'dann' | 'sonst', alt: AutomatisierungStand, neu: AutomatisierungStand, kx: NonNullable<Vergleichskontext['automatisierung']>): string[] {
  const titel = bereich === 'dann' ? t('gemeinsam.fassungen.dann') : t('gemeinsam.fassungen.sonst');
  const typA = kontextTyp(alt.wenn, kx.typen), typN = kontextTyp(neu.wenn, kx.typen);
  const va: DannKarte[] = alt[bereich] ?? [], vn: DannKarte[] = neu[bereich] ?? [];
  const reihe = (l: DannKarte[], m: DannKarte[]) => l.filter((x) => m.some((y) => y.id === x.id)).map((x) => x.id).join(',');
  return [
    ...vn.flatMap((x) => {
      const a = va.find((y) => y.id === x.id);
      if (!a) return [t('gemeinsam.fassungen.karte-dazu', { bereich: titel, karte: dannText(x, typN, kx) })];
      return gleich(a, x) ? [] : [t('gemeinsam.fassungen.karte-geaendert', { bereich: titel, karte: dannText(x, typN, kx) })];
    }),
    ...va.filter((x) => !vn.some((y) => y.id === x.id)).map((x) => t('gemeinsam.fassungen.karte-weg', { bereich: titel, karte: dannText(x, typA, kx) })),
    ...saetze([() => reihe(va, vn) !== reihe(vn, va) && t('gemeinsam.fassungen.karten-reihenfolge', { bereich: titel })]),
  ];
}

export function beschreibeAutomatisierung(alt: AutomatisierungStand, neu: AutomatisierungStand, k: Vergleichskontext = {}): string[] {
  const kx = k.automatisierung ?? { typen: [], benutzer: [], rollen: [], pakete: [] };
  return [
    ...saetze([
      () => alt.name !== neu.name && t('gemeinsam.typvergleich.name', { name: alt.name, name2: neu.name }),
      () => !gleich(alt.beschreibung || '', neu.beschreibung || '') && t('gemeinsam.typvergleich.beschreibung-geaendert'),
      () => alt.reihenfolge !== neu.reihenfolge && t('gemeinsam.fassungen.reihenfolge', { alt: alt.reihenfolge, neu: neu.reihenfolge }),
      () => !alt.aktiv !== !neu.aktiv && (neu.aktiv ? t('gemeinsam.fassungen.eingeschaltet') : t('gemeinsam.fassungen.ausgeschaltet')),
      () => !gleich(alt.wenn, neu.wenn) && t('gemeinsam.fassungen.wenn', { alt: wennText(alt.wenn, kx), neu: wennText(neu.wenn, kx) }),
      () => bedingungsSatz(alt.und.karten, neu.und.karten) || (!gleich(alt.und, neu.und) && t('gemeinsam.fassungen.bedingungen-geaendert')),
    ]),
    ...kartenSaetze('dann', alt, neu, kx),
    ...kartenSaetze('sonst', alt, neu, kx),
  ];
}

/* ---------- Automatisierungsvorlage (#1044) ---------- */

export function beschreibeAblaufvorlage(alt: AblaufvorlageStand, neu: AblaufvorlageStand, k: Vergleichskontext = {}): string[] {
  const typen = k.typen ?? [];
  const typ = (id: string) => k.typName?.(id) ?? typen.find((x) => x.id === id)?.name ?? id;
  const titel = t('gemeinsam.fassungen.karten');
  const va: VorlagenKarte[] = alt.karten ?? [], vn: VorlagenKarte[] = neu.karten ?? [];
  const reihe = (l: VorlagenKarte[], m: VorlagenKarte[]) => l.filter((x) => m.some((y) => y.id === x.id)).map((x) => x.id).join(',');
  const at = alt.typen ?? [], nt = neu.typen ?? [];
  return [
    ...saetze([
      () => alt.name !== neu.name && t('gemeinsam.typvergleich.name', { name: alt.name, name2: neu.name }),
      () => !gleich(alt.beschreibung || '', neu.beschreibung || '') && t('gemeinsam.typvergleich.beschreibung-geaendert'),
      () => alt.reihenfolge !== neu.reihenfolge && t('gemeinsam.fassungen.reihenfolge', { alt: alt.reihenfolge, neu: neu.reihenfolge }),
      () => !alt.aktiv !== !neu.aktiv && (neu.aktiv ? t('gemeinsam.fassungen.eingeschaltet') : t('gemeinsam.fassungen.ausgeschaltet')),
    ]),
    ...nt.filter((id) => !at.includes(id)).map((id) => t('gemeinsam.fassungen.sicht-typ-dazu', { name: typ(id) })),
    ...at.filter((id) => !nt.includes(id)).map((id) => t('gemeinsam.fassungen.sicht-typ-weg', { name: typ(id) })),
    ...saetze([
      () => !gleich(alt.wann, neu.wann) && t('gemeinsam.fassungen.wann', { alt: vorlageWannText(alt.wann), neu: vorlageWannText(neu.wann) }),
      () => !gleich([...(alt.fragen ?? [])].sort(), [...(neu.fragen ?? [])].sort()) && t('gemeinsam.fassungen.fragen'),
    ]),
    ...vn.flatMap((x) => {
      const a = va.find((y) => y.id === x.id);
      if (!a) return [t('gemeinsam.fassungen.karte-dazu', { bereich: titel, karte: karteText(x, typen) })];
      return gleich(a, x) ? [] : [t('gemeinsam.fassungen.karte-geaendert', { bereich: titel, karte: karteText(x, typen) })];
    }),
    ...va.filter((x) => !vn.some((y) => y.id === x.id)).map((x) => t('gemeinsam.fassungen.karte-weg', { bereich: titel, karte: karteText(x, typen) })),
    ...saetze([() => reihe(va, vn) !== reihe(vn, va) && t('gemeinsam.fassungen.karten-reihenfolge', { bereich: titel })]),
  ];
}
