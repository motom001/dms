/** Erkennung (#1278 aus erkennung.ts): Vorschläge für die Felder eines Mappentyps, eigene Organisation und Haushalt. */
import type { Wert, Mappentyp, Betrag, Feld } from '../model';
import { type Sicherheit, type Fund, ausschnitt, type Angaben, findeAngaben } from './angaben';
import { t } from '../texte';
import { type Erkennungsart, ERKENNUNG_FELDTYPEN, artVon, klein } from './arten';
import { vonAussenFuellbar } from '../berechnet';
import { esc, domainVon, wertMuster } from './abgleich';
import { formatFehler } from '../feldformate';
import { leseZeitraum, leseProzent } from '../feldarten';
import { optionTexte } from '../beschriftung';
import { nummerHinterWort, nummernWoerter } from './nummern';
import { datenIn, datumsPaare, zeitraumVorschlaege } from './zeitraum';

/* ---------- Vorschläge für die Felder eines Mappentyps ---------- */

export interface Vorschlag {
  wert: Wert;
  sicherheit: Sicherheit;
  /** Textstelle, an der der Wert steht. */
  fundstelle: string;
  /** Wo die Fundstelle im Dokument liegt (#939): Dokument, Seite und Rahmen (relativ zur Seite, 0…1). Fehlt = nicht gefunden. */
  stelle?: { dokument: string; bereiche: Array<{ seite: number; x: number; y: number; b: number; h: number }> };
  /**
   * Beim Auswählen übernehmen (#1037): Der Wert kommt nicht aus dem Dokument, sondern aus der Mappe `mappe`, die für das
   * Verweisfeld `feld` vorgeschlagen ist (z. B. Kündigungsfrist aus der Vertragsart). Die Oberfläche trägt ihn nur in ein
   * leeres Feld ein und ersetzt ihn, solange er unverändert ist, wenn man eine andere Mappe wählt.
   */
  aus?: { feld: string; mappe: string };
  /**
   * Hinweis zum Vorschlag (#1043), z. B. „Gutschrift – als negativer Betrag übernommen“ oder „Aussteller ist deine
   * eigene Organisation – ausgehend?“. Steht neben dem Vorschlag; ändert nichts von selbst.
   */
  hinweis?: string;
}
export type Vorschlaege = Record<string, Vorschlag>;

/**
 * Gutschrift (#1043): Steht „Gutschrift“, „Erstattung“ oder „Rückzahlung“ auf dem Beleg, werden positive Beträge in
 * Feldern, die negative Beträge erlauben (Feldart Betrag mit `negativ`, #1035), negativ – mit Hinweis. Gilt für die
 * eingebaute Erkennung und für Antworten aus Paketen (dms:erkennen). Felder ohne `negativ` bleiben positiv (dort wäre
 * ein negativer Wert ungültig). `ausser`: Felder, deren Vorzeichen schon feststeht (E-Rechnung).
 */
export function wendeGutschriftAn(
  t2: Pick<Mappentyp, 'felder'>,
  v: Vorschlaege,
  gutschrift: Fund | null | undefined,
  ausser: ReadonlySet<string> = new Set(),
): Vorschlaege {
  if (!gutschrift) return v;
  for (const [k, x] of Object.entries(v)) {
    const f = t2.felder.find((y) => y.key === k);
    if (!f || f.typ !== 'betrag' || !f.negativ || x.aus || ausser.has(k)) continue;
    const b = x.wert as Betrag | null;
    if (!b || typeof b !== 'object' || typeof b.betrag !== 'number' || !(b.betrag > 0)) continue;
    if (typeof f.min === 'number' && -b.betrag < f.min) continue;
    v[k] = { ...x, wert: { ...b, betrag: -b.betrag }, hinweis: t('gemeinsam.erkennung.gutschrift-negativ', { wort: gutschrift.wert }) };
  }
  return v;
}

/**
 * Felder, die „Aus Dokument ausfüllen“ füllen darf: markiert – oder, hat der Typ gar keine markierten, alle mit
 * erkennbarer Art. Ausgeblendete Felder (#655) nie – in der Mappe sähe niemand den Vorschlag.
 */
export function fuellfelder(
  t: Pick<Mappentyp, 'felder'> & { register?: Mappentyp['register'] },
): Array<{ feld: Feld; art: Erkennungsart }> {
  // Wie ausgeblendeteFelder (darstellung.ts) – hier ohne den Import, der einen Kreis über model/ schlösse.
  const aus = new Set([
    ...t.felder.filter((f) => f.ausgeblendet).map((f) => f.key),
    ...(t.register ?? []).filter((r) => r.ausgeblendet && r.art === 'felder').flatMap((r) => r.felder ?? []),
  ]);
  // Berechnete Felder (#1034, „nie überschreiben“): schreibt nur ihr Paket – nie ein Vorschlag aus dem Dokument.
  const geeignet = t.felder.filter(
    (f) => f.typ !== 'passwort' && ERKENNUNG_FELDTYPEN.includes(f.typ) && !aus.has(f.key) && vonAussenFuellbar(f),
  );
  const markiert = geeignet.filter((f) => f.erkennung);
  return (markiert.length ? markiert : geeignet)
    .map((f) => ({ feld: f, art: artVon(f) }))
    .filter((x): x is { feld: Feld; art: Erkennungsart } => !!x.art);
}

/** Muster aus dem Erkennungshinweis („Muster 100-####“, # = Ziffer, A = Buchstabe) als regulärer Ausdruck. */
export function musterAusHinweis(hinweis: string | undefined): RegExp | null {
  const m = /muster\s*[:„"]?\s*([^\s„“"]+)/i.exec(hinweis ?? '');
  if (!m || !/[#]/.test(m[1])) return null;
  const re = m[1]
    .replace(/[“"”.,;)]+$/, '')
    .split('')
    .map((c) => (c === '#' ? '\\d' : c === 'A' ? '[A-Z]' : esc(c)))
    .join('');
  return new RegExp(`(?<![A-Za-z0-9])${re}(?![A-Za-z0-9])`);
}

/** Zeitraum im Text: „3 Monate“, „14 Tagen“, „1 Jahr“, „6 months“ – nicht „Monatsende“. */
const ZEITRAUM_IM_TEXT =
  /(?<![\d,.])(\d{1,4})\s?(Tag(?:e|en)?|Wochen?|Monat(?:e|en)?|Jahr(?:e|en)?|days?|weeks?|months?|years?)(?![\wÄÖÜäöüß])/gi;
/** Prozentangabe im Text: „19 %“, „7,5%“. */
const PROZENT_IM_TEXT = /(?<![\d,.])(\d{1,3}(?:[.,]\d{1,3})?)\s?%/g;

/**
 * Wert zu einem Feld im Text (#1035): steht die Bezeichnung des Felds in einer Zeile („Kündigungsfrist“), zählt der
 * erste Treffer in dieser oder der nächsten Zeile (Sicherheit mittel); sonst der erste im ganzen Text (niedrig) – auf
 * einer Rechnung steht meist nur ein Steuersatz.
 */
function naheBeschriftung<T>(
  text: string,
  f: Pick<Feld, 'key' | 'label'>,
  muster: RegExp,
  lies: (m: RegExpExecArray) => T | null,
): Fund<T> | null {
  const funde: Array<{ wert: T; i: number; laenge: number }> = [];
  for (const m of text.matchAll(new RegExp(muster.source, muster.flags))) {
    const wert = lies(m as RegExpExecArray);
    if (wert !== null) funde.push({ wert, i: m.index ?? 0, laenge: m[0].length });
  }
  if (!funde.length) return null;
  const woerter = [
    ...new Set(
      klein(`${f.label} ${f.key.replace(/_/g, ' ')}`)
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 4),
    ),
  ];
  let anfang = 0;
  const zeilen = text.split('\n').map((z) => {
    const a = anfang;
    anfang += z.length + 1;
    return { a, e: anfang, z };
  });
  for (let n = 0; n < zeilen.length; n++) {
    if (!woerter.some((w) => klein(zeilen[n].z).includes(w))) continue;
    const bis = (zeilen[n + 1] ?? zeilen[n]).e;
    const x = funde.find((y) => y.i >= zeilen[n].a && y.i < bis);
    if (x) return { wert: x.wert, sicherheit: 'mittel', fundstelle: ausschnitt(text, x.i, x.laenge) };
  }
  return { wert: funde[0].wert, sicherheit: 'niedrig', fundstelle: ausschnitt(text, funde[0].i, funde[0].laenge) };
}

/** Was die Vorschläge für die einzelnen Felder teilen: Text, Angaben, schon vergebene Funde und das Setzen. */
interface VorschlagLauf {
  text: string;
  a: Angaben;
  hatArt: (x: Erkennungsart) => boolean;
  /** Ein Personentyp (Vor- oder Nachname): Dann ist „Name“ nicht die Organisation aus dem Briefkopf. */
  personTyp: boolean;
  /** Schon in einem Feld vorgeschlagene E-Mail-Adressen und Telefonnummern – das nächste Feld bekommt die nächste. */
  benutzt: Set<string>;
  setze: (f: Feld, wert: Wert, fund: { sicherheit: Sicherheit; fundstelle: string }) => void;
  /** Gruppen gleichbedeutender Wörter (#1657): weitere Wortformen, hinter denen eine Nummer steht. */
  gruppen: readonly (readonly string[])[];
  /** Datumspaare (#1646): je Feld das andere Feld des Paars. */
  partner: Map<string, string>;
  vorschlag: (k: string) => Vorschlag | undefined;
}

/** Was die Erkennung zusätzlich zum Text nutzt (#1657): Gruppen gleichbedeutender Wörter aus Werkbank und Paketen. */
export interface VorschlagOptionen {
  gruppen?: readonly (readonly string[])[];
}

/**
 * Vorschläge für die Felder eines Typs aus den gefundenen Angaben (ohne Verweise – die gleicht der Server
 * mit vorhandenen Mappen ab). Werte sind schon im Format der Feldart (Datum ISO, Betrag mit Währung).
 */
export function vorschlaegeAus(
  t: Pick<Mappentyp, 'felder'>,
  text: string,
  a: Angaben = findeAngaben(text),
  opt: VorschlagOptionen = {},
): Vorschlaege {
  const v: Vorschlaege = {};
  const felder = fuellfelder(t);
  const hatArt = (x: Erkennungsart) => felder.some((f) => f.art === x);
  // Nur Werte, die zum Format bzw. zu den Grenzen des Felds passen (#535) – so landet z. B. keine Faxnummer mit Buchstaben im Feld.
  const passt = (f: Feld, wert: Wert) => !formatFehler(f, wert, { felder: t.felder, werte: {} });
  const lauf: VorschlagLauf = {
    text,
    a,
    hatArt,
    personTyp: hatArt('vorname') || hatArt('nachname'),
    benutzt: new Set<string>(),
    setze: (f, wert, fund) => {
      if (wert !== '' && wert != null && !v[f.key] && passt(f, wert))
        v[f.key] = { wert, sicherheit: fund.sicherheit, fundstelle: fund.fundstelle };
    },
    gruppen: opt.gruppen ?? [],
    partner: new Map(
      datumsPaare(
        t,
        felder.map((x) => x.feld),
      ).flatMap((p) => [
        [p.beginn.key, p.ende.key],
        [p.ende.key, p.beginn.key],
      ]),
    ),
    vorschlag: (k) => v[k],
  };
  // Zeitraum (#1646): Datumspaare („vom 01.07.2012 – 31.07.2012“) gehen an Beginn und Ende – vor dem einzelnen Datum.
  // Ein Erkennungshinweis mit Muster (#391) gewinnt auch hier.
  for (const [k, x] of Object.entries(zeitraumVorschlaege(t, text, felder))) {
    const f = t.felder.find((y) => y.key === k);
    if (f && !musterAusHinweis(f.erkennung?.hinweis)?.test(text)) lauf.setze(f, x.wert, x);
  }
  for (const { feld: f, art } of felder) {
    // Erkennungshinweis mit Muster (#391): gewinnt vor allem anderen.
    if (nachMuster(f, lauf)) continue;
    vorschlagFuer(f, art, lauf);
  }
  return wendeGutschriftAn(t, v, a.gutschrift);
}

/** Erkennungshinweis mit Muster (#391): Trifft es, gilt der Treffer (Sicherheit hoch) und sonst nichts für das Feld. */
function nachMuster(f: Feld, l: VorschlagLauf): boolean {
  const muster = musterAusHinweis(f.erkennung?.hinweis);
  const m = muster?.exec(l.text);
  if (!m) return false;
  l.setze(f, m[0], { sicherheit: 'hoch', fundstelle: ausschnitt(l.text, m.index, m[0].length) });
  return true;
}

const KONTAKT_ARTEN = ['email', 'internet', 'iban', 'ustid', 'telefon', 'mobil', 'fax'] as const;
const WERT_ARTEN = ['datum', 'betrag', 'zeitraum', 'prozent'] as const;
const PERSON_ARTEN = ['vorname', 'nachname', 'funktion', 'name'] as const;
const BRIEFKOPF_ARTEN = ['strasse', 'hausnummer', 'plz', 'ort'] as const;
const unter = <T extends Erkennungsart>(liste: readonly T[], art: Erkennungsart): art is T => (liste as readonly string[]).includes(art);

/** Vorschlag je Erkennungsart. */
function vorschlagFuer(f: Feld, art: Erkennungsart, l: VorschlagLauf): void {
  if (unter(KONTAKT_ARTEN, art)) vorschlagKontakt(f, art, l);
  else if (unter(WERT_ARTEN, art)) vorschlagWert(f, art, l);
  else if (unter(PERSON_ARTEN, art)) vorschlagPerson(f, art, l);
  else if (unter(BRIEFKOPF_ARTEN, art)) vorschlagBriefkopf(f, art, l);
  else if (art === 'nummer') vorschlagNummer(f, l);
  else if (art === 'auswahl') vorschlagAuswahl(f, l);
}

/** E-Mail, Telefon, Mobil und Fax (je Feld die nächste noch nicht vergebene), Internetseite, IBAN, USt-Id. */
function vorschlagKontakt(f: Feld, art: (typeof KONTAKT_ARTEN)[number], l: VorschlagLauf) {
  const { a } = l;
  const erste = (liste: Fund[]) => liste.find((x) => !l.benutzt.has(x.wert)) ?? null;
  switch (art) {
    case 'internet': {
      const i =
        erste(a.internet) ??
        (() => {
          const d = a.emails.map((e) => domainVon(e.wert)).find(Boolean);
          return d ? { wert: `www.${d}`, sicherheit: 'mittel' as const, fundstelle: a.emails[0].fundstelle } : null;
        })();
      if (i) l.setze(f, i.wert, i);
      return;
    }
    case 'iban': {
      const i = a.ibans[0];
      if (i) l.setze(f, i.wert, i);
      return;
    }
    case 'ustid': {
      const u = a.ustids[0];
      if (u) l.setze(f, u.wert, u);
      return;
    }
    default: {
      const x = erste({ email: a.emails, telefon: a.telefon, mobil: a.mobil, fax: a.fax }[art]);
      if (x) {
        l.benutzt.add(x.wert);
        l.setze(f, x.wert, x);
      }
    }
  }
}

/** Datum und Betrag aus den Angaben; Zeitraum und Prozent (#1035) am liebsten neben der Bezeichnung des Felds. */
function vorschlagWert(f: Feld, art: (typeof WERT_ARTEN)[number], l: VorschlagLauf) {
  const { a, text } = l;
  switch (art) {
    case 'datum': {
      // Zwei Felder eines Paars (#1646) nicht mit demselben Wert aus einer Fundstelle, in der zwei Daten stehen.
      const p = l.partner.get(f.key);
      const andere = p ? l.vorschlag(p) : undefined;
      if (a.datum && andere?.wert === a.datum.wert && andere.fundstelle === a.datum.fundstelle && datenIn(a.datum.fundstelle) >= 2) return;
      if (a.datum) l.setze(f, a.datum.wert, a.datum);
      return;
    }
    case 'betrag':
      if (a.betrag) l.setze(f, f.typ === 'zahl' ? a.betrag.wert.betrag : a.betrag.wert, a.betrag);
      return;
    // Zeitraum und Prozent (#1035): am liebsten neben der Bezeichnung des Felds („Kündigungsfrist: 3 Monate“).
    case 'zeitraum': {
      const z = naheBeschriftung(text, f, ZEITRAUM_IM_TEXT, (m) => leseZeitraum(`${m[1]} ${m[2]}`) ?? null);
      if (z) l.setze(f, z.wert, z);
      return;
    }
    case 'prozent': {
      const x = naheBeschriftung(text, f, PROZENT_IM_TEXT, (m) => {
        const n = leseProzent(m[1]);
        return n != null && Number.isFinite(n) && n <= 100 ? n : null;
      });
      if (x) l.setze(f, x.wert, x);
    }
  }
}

/** Fund aus Person oder Briefkopf übernehmen, wenn es Wert und Quelle gibt. */
const fundAus = (l: VorschlagLauf, f: Feld, w: string | undefined, quelle: { fundstelle: string } | null, s: Sicherheit = 'mittel') =>
  w && quelle ? l.setze(f, w, { sicherheit: s, fundstelle: quelle.fundstelle }) : undefined;

/** Person (Vorname, Nachname, Funktion) und Name (Briefkopf oder Organisation der Person – nicht bei Personentypen). */
function vorschlagPerson(f: Feld, art: (typeof PERSON_ARTEN)[number], l: VorschlagLauf) {
  const bk = l.a.briefkopf;
  const p = l.a.person;
  switch (art) {
    case 'vorname':
      return fundAus(l, f, p?.vorname, p, 'mittel');
    case 'nachname':
      return fundAus(l, f, p?.nachname, p, 'mittel');
    case 'funktion':
      return fundAus(l, f, p?.funktion, p, 'mittel');
    case 'name':
      if (l.personTyp) return;
      return fundAus(l, f, bk?.name ?? p?.organisation, bk ?? p, bk?.fundstelle.includes('·') ? 'hoch' : 'mittel');
  }
}

/** Anschrift aus dem Briefkopf: Straße (ohne Feld für die Hausnummer mit ihr), Hausnummer, PLZ, Ort. */
function vorschlagBriefkopf(f: Feld, art: (typeof BRIEFKOPF_ARTEN)[number], l: VorschlagLauf) {
  const bk = l.a.briefkopf;
  switch (art) {
    case 'strasse': {
      const mitNr = !l.hatArt('hausnummer') && bk?.hausnummer ? `${bk.strasse} ${bk.hausnummer}` : bk?.strasse;
      return fundAus(l, f, mitNr, bk);
    }
    case 'hausnummer':
      return fundAus(l, f, bk?.hausnummer, bk);
    case 'plz':
      if (bk?.plz) l.setze(f, f.typ === 'zahl' ? Number(bk.plz) : bk.plz, { sicherheit: 'mittel', fundstelle: bk.fundstelle });
      return;
    case 'ort':
      return fundAus(l, f, bk?.ort, bk);
  }
}

/** Nummer mit passender Beschriftung: Feld „Kundennummer“ ↔ gefunden „Kundennummer“; „Rechnungs-Nr.“ ↔ „Rechnungsnummer“. */
function vorschlagNummer(f: Feld, l: VorschlagLauf) {
  const stamm = (s: string) =>
    klein(s)
      .replace(/[^a-z]/g, '')
      .replace(/(nummer|nr)$/, '');
  const n =
    l.a.nummern.find((x) => {
      const s = stamm(x.label);
      return !!s && (s === stamm(f.label) || s === stamm(f.key));
    }) ??
    // Ohne feste Beschriftung (#1657): direkt hinter dem Wort des Felds („Rechnung R-2026-1120“).
    nummerHinterWort(l.text, nummernWoerter(f, l.gruppen));
  if (n) l.setze(f, f.typ === 'zahl' ? Number(n.wert.replace(/\D/g, '')) || '' : n.wert, n);
}

/** Auswahl (#728): fester Wert oder eine seiner Beschriftungen im Text; gesetzt wird immer der feste Wert. */
function vorschlagAuswahl(f: Feld, l: VorschlagLauf) {
  const { text } = l;
  const wort = (x: string) => new RegExp(`(?<![\\wÄÖÜäöüß])${esc(x)}(?![\\wÄÖÜäöüß])`, 'i');
  let treffer: { wert: string; text: string } | undefined;
  for (const o of f.optionen ?? []) {
    const x = [o, ...optionTexte(f, o)].find((y) => y.length >= 3 && wort(y).test(text));
    if (x) {
      treffer = { wert: o, text: x };
      break;
    }
  }
  if (treffer) {
    const m = wort(treffer.text).exec(text)!;
    l.setze(f, f.mehrfach ? [treffer.wert] : treffer.wert, {
      sicherheit: 'niedrig',
      fundstelle: ausschnitt(text, m.index, treffer.text.length),
    });
  }
}

/* ---------- Eigene Organisation und Haushalt (#995, #1043) ---------- */

/** Was eine eigene Mappe (eigene Organisation, Person des Haushalts) als Aussteller verrät. */
export interface EigeneAngaben {
  mappeId: string;
  typId: string;
  namen: string[];
  ustids: string[];
  ibans: string[];
}
/** Aussteller eines Belegs, wie die Erkennung ihn sieht: Absenderzeile oder Verkäufer der E-Rechnung. */
export interface Aussteller {
  name?: string;
  ustid?: string;
  iban?: string;
  fundstelle: string;
}

/** Namen, USt-Id und IBAN einer Mappe aus ihren Feldern (Name, Vorname + Nachname) – zum Vergleich mit dem Aussteller. */
export function eigeneAngaben(
  typ: Pick<Mappentyp, 'id' | 'felder'>,
  m: { id: string; werte: Record<string, unknown>; titel?: string | null },
): EigeneAngaben {
  const werte = (art: Erkennungsart) =>
    typ.felder
      .filter((f) => (f.typ === 'text' || f.typ === 'langtext') && artVon(f) === art)
      .flatMap((f) => (Array.isArray(m.werte[f.key]) ? (m.werte[f.key] as unknown[]) : [m.werte[f.key]]))
      .filter((x): x is string => typeof x === 'string' && !!x.trim())
      .map((x) => x.trim());
  const person = [...werte('vorname'), ...werte('nachname')].join(' ').trim();
  const namen = [
    ...new Set([...werte('name'), ...(person.includes(' ') ? [person] : []), ...(m.titel?.trim() ? [m.titel.trim()] : [])]),
  ].filter((n) => n.replace(/\s/g, '').length >= 4);
  const norm = (x: string) => x.replace(/\s/g, '').toUpperCase();
  return { mappeId: m.id, typId: typ.id, namen, ustids: werte('ustid').map(norm), ibans: werte('iban').map(norm) };
}

/**
 * Ist eine eigene Mappe der Aussteller (#1043)? Ihr Name steht in der Absenderzeile bzw. als Verkäufer der E-Rechnung,
 * oder ihre USt-Id bzw. IBAN ist die des Verkäufers. Nur dann ist ein Beleg „ausgehend“ – und auch das nur als
 * Vorschlag mit Hinweis (Ergänzung Sicherheit: ein gefälschter Aussteller soll nicht unbemerkt als eigene Rechnung
 * durchgehen). Der Name im Anschriftfeld (Empfänger) zählt nicht.
 */
export function eigenerAussteller(a: Aussteller | null | undefined, eigene: EigeneAngaben[]): EigeneAngaben | null {
  if (!a) return null;
  const norm = (x: string | undefined) => (x ?? '').replace(/\s/g, '').toUpperCase();
  for (const e of eigene) {
    if (a.ustid && e.ustids.includes(norm(a.ustid))) return e;
    if (a.iban && e.ibans.includes(norm(a.iban))) return e;
    if (a.name && e.namen.some((n) => wertMuster(n, 'name')?.test(a.name!))) return e;
  }
  return null;
}
