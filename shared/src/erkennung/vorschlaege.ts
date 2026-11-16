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

/**
 * Vorschläge für die Felder eines Typs aus den gefundenen Angaben (ohne Verweise – die gleicht der Server
 * mit vorhandenen Mappen ab). Werte sind schon im Format der Feldart (Datum ISO, Betrag mit Währung).
 */
export function vorschlaegeAus(t: Pick<Mappentyp, 'felder'>, text: string, a: Angaben = findeAngaben(text)): Vorschlaege {
  const v: Vorschlaege = {};
  const felder = fuellfelder(t);
  const hatArt = (x: Erkennungsart) => felder.some((f) => f.art === x);
  const personTyp = hatArt('vorname') || hatArt('nachname');
  // Nur Werte, die zum Format bzw. zu den Grenzen des Felds passen (#535) – so landet z. B. keine Faxnummer mit Buchstaben im Feld.
  const passt = (f: Feld, wert: Wert) => !formatFehler(f, wert, { felder: t.felder, werte: {} });
  const setze = (f: Feld, wert: Wert, fund: { sicherheit: Sicherheit; fundstelle: string }) => {
    if (wert !== '' && wert != null && !v[f.key] && passt(f, wert))
      v[f.key] = { wert, sicherheit: fund.sicherheit, fundstelle: fund.fundstelle };
  };
  const benutzt = new Set<string>();
  const erste = (l: Fund[]) => l.find((x) => !benutzt.has(x.wert)) ?? null;
  for (const { feld: f, art } of felder) {
    // Erkennungshinweis mit Muster (#391): gewinnt vor allem anderen.
    const muster = musterAusHinweis(f.erkennung?.hinweis);
    if (muster) {
      const m = muster.exec(text);
      if (m) {
        setze(f, m[0], { sicherheit: 'hoch', fundstelle: ausschnitt(text, m.index, m[0].length) });
        continue;
      }
    }
    const bk = a.briefkopf;
    const p = a.person;
    const fund = (w: string | undefined, quelle: { fundstelle: string } | null, s: Sicherheit = 'mittel') =>
      w && quelle ? setze(f, w, { sicherheit: s, fundstelle: quelle.fundstelle }) : undefined;
    switch (art) {
      case 'email': {
        const e = erste(a.emails);
        if (e) {
          benutzt.add(e.wert);
          setze(f, e.wert, e);
        }
        break;
      }
      case 'internet': {
        const i =
          erste(a.internet) ??
          (() => {
            const d = a.emails.map((e) => domainVon(e.wert)).find(Boolean);
            return d ? { wert: `www.${d}`, sicherheit: 'mittel' as const, fundstelle: a.emails[0].fundstelle } : null;
          })();
        if (i) setze(f, i.wert, i);
        break;
      }
      case 'iban': {
        const i = a.ibans[0];
        if (i) setze(f, i.wert, i);
        break;
      }
      case 'ustid': {
        const u = a.ustids[0];
        if (u) setze(f, u.wert, u);
        break;
      }
      case 'telefon': {
        const x = erste(a.telefon);
        if (x) {
          benutzt.add(x.wert);
          setze(f, x.wert, x);
        }
        break;
      }
      case 'mobil': {
        const x = erste(a.mobil);
        if (x) {
          benutzt.add(x.wert);
          setze(f, x.wert, x);
        }
        break;
      }
      case 'fax': {
        const x = erste(a.fax);
        if (x) {
          benutzt.add(x.wert);
          setze(f, x.wert, x);
        }
        break;
      }
      case 'datum':
        if (a.datum) setze(f, a.datum.wert, a.datum);
        break;
      case 'betrag':
        if (a.betrag) setze(f, f.typ === 'zahl' ? a.betrag.wert.betrag : a.betrag.wert, a.betrag);
        break;
      // Zeitraum und Prozent (#1035): am liebsten neben der Bezeichnung des Felds („Kündigungsfrist: 3 Monate“).
      case 'zeitraum': {
        const z = naheBeschriftung(text, f, ZEITRAUM_IM_TEXT, (m) => leseZeitraum(`${m[1]} ${m[2]}`) ?? null);
        if (z) setze(f, z.wert, z);
        break;
      }
      case 'prozent': {
        const x = naheBeschriftung(text, f, PROZENT_IM_TEXT, (m) => {
          const n = leseProzent(m[1]);
          return n != null && Number.isFinite(n) && n <= 100 ? n : null;
        });
        if (x) setze(f, x.wert, x);
        break;
      }
      case 'vorname':
        fund(p?.vorname, p, 'mittel');
        break;
      case 'nachname':
        fund(p?.nachname, p, 'mittel');
        break;
      case 'funktion':
        fund(p?.funktion, p, 'mittel');
        break;
      case 'name':
        if (personTyp) break;
        fund(bk?.name ?? p?.organisation, bk ?? p, bk?.fundstelle.includes('·') ? 'hoch' : 'mittel');
        break;
      case 'strasse': {
        const mitNr = !hatArt('hausnummer') && bk?.hausnummer ? `${bk.strasse} ${bk.hausnummer}` : bk?.strasse;
        fund(mitNr, bk);
        break;
      }
      case 'hausnummer':
        fund(bk?.hausnummer, bk);
        break;
      case 'plz':
        if (bk?.plz) setze(f, f.typ === 'zahl' ? Number(bk.plz) : bk.plz, { sicherheit: 'mittel', fundstelle: bk.fundstelle });
        break;
      case 'ort':
        fund(bk?.ort, bk);
        break;
      case 'nummer': {
        // Passende Beschriftung: Feld „Kundennummer“ ↔ gefunden „Kundennummer“; „Rechnungs-Nr.“ ↔ „Rechnungsnummer“.
        const stamm = (s: string) =>
          klein(s)
            .replace(/[^a-z]/g, '')
            .replace(/(nummer|nr)$/, '');
        const n = a.nummern.find((x) => {
          const s = stamm(x.label);
          return !!s && (s === stamm(f.label) || s === stamm(f.key));
        });
        if (n) setze(f, f.typ === 'zahl' ? Number(n.wert.replace(/\D/g, '')) || '' : n.wert, n);
        break;
      }
      case 'auswahl': {
        // Fester Wert oder eine seiner Beschriftungen (#728) im Text; gesetzt wird immer der feste Wert.
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
          setze(f, f.mehrfach ? [treffer.wert] : treffer.wert, {
            sicherheit: 'niedrig',
            fundstelle: ausschnitt(text, m.index, treffer.text.length),
          });
        }
        break;
      }
      default:
        break;
    }
  }
  return wendeGutschriftAn(t, v, a.gutschrift);
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
