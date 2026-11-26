/**
 * Prüfstand (#1679): Messwerte je Dokument bewerten und zusammenzählen – reine Funktionen ohne Ablago.
 *
 * Ein Ergebnis je Dokument (aus messen.mjs) trägt die richtige Antwort (`erwartet`) und was Ablago vorschlug. Gezählt
 * wird nur, was messbar ist: Absender nur mit einer Mappe für den Absender, Zielmappe nur, wenn die Mappe vor dem
 * Dokument schon da war, Mappentyp nur, wenn der Typ installiert ist.
 */

export const WEGE = ['kern', 'abgleich', 'aehnlichkeit', 'ki'];
const KENNZAHLEN = ['typ1', 'typ3', 'vorschlag', 'sicherFalsch', 'fuellVorn', 'absender', 'ziel1', 'ziel3', 'felder'];
/** Ab hier zeigt „Wie sicher ist Ablago?“ „sicher“ (wie SICHER_AB in web/src/ablage/WieSicher.tsx, mindestens die Schwelle). */
const SICHER_AB = 0.75;

const norm = (s) => String(s).normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
const istObjekt = (w) => !!w && typeof w === 'object' && !Array.isArray(w);
const zahl = (w) => (typeof w === 'number' ? w : istObjekt(w) && typeof w.betrag === 'number' ? w.betrag : Number.NaN);

/**
 * Ist der vorgeschlagene Wert der erwartete? Verweise (`{ beispiel }`) und Vorgaben (`{ vorgabe }`) vergleicht der
 * Aufrufer über Schlüssel: Ablagos Mappen-Ids sind vorher in `schluessel` bzw. `vorgabe:<schluessel>` übersetzt.
 */
export function gleich(erwartet, bekommen) {
  if (bekommen === undefined || bekommen === null || bekommen === '') return false;
  if (Array.isArray(bekommen)) return bekommen.some((b) => gleich(erwartet, b));
  if (istObjekt(erwartet) && 'beispiel' in erwartet) return bekommen === erwartet.beispiel;
  if (istObjekt(erwartet) && 'vorgabe' in erwartet) return bekommen === `vorgabe:${erwartet.vorgabe}`;
  if (istObjekt(erwartet) && 'anzahl' in erwartet)
    return istObjekt(bekommen) && Number(bekommen.anzahl) === Number(erwartet.anzahl) && bekommen.einheit === erwartet.einheit;
  if (typeof erwartet === 'number' || (istObjekt(erwartet) && 'betrag' in erwartet)) {
    const d = Math.abs(zahl(erwartet) - zahl(bekommen));
    const w = istObjekt(erwartet) && istObjekt(bekommen) ? (erwartet.waehrung ?? 'EUR') === (bekommen.waehrung ?? 'EUR') : true;
    return d < 0.005 && w;
  }
  if (typeof erwartet === 'boolean') return bekommen === erwartet;
  if (istObjekt(bekommen)) return false;
  const a = norm(erwartet);
  const b = norm(bekommen);
  return a === b || a.replace(/ /g, '') === b.replace(/ /g, '');
}

/** Bewertung eines Dokuments: je Kennzahl true/false oder null (nicht messbar). */
export function bewerte(e) {
  const typen = e.typen ?? [];
  const erw = e.erwartet;
  const typDa = !!erw.typId;
  const ziele = e.ziele ?? [];
  const felder = Object.values(e.felder ?? {});
  return {
    typ1: typDa ? typen[0]?.typ === erw.typ : null,
    typ3: typDa ? typen.slice(0, 3).some((t) => t.typ === erw.typ) : null,
    vorschlag: typDa ? e.vorschlag === erw.typ : null,
    // #1672: „sicher“, aber der falsche Typ – und beim Ungleichgewicht der aufgefüllte Typ fälschlich vorn.
    sicherFalsch: typDa ? !!typen[0] && typen[0].typ !== erw.typ && typen[0].sicherheit >= Math.max(SICHER_AB, e.schwelle ?? 0) : null,
    fuellVorn: e.fuellTyp && erw.typ !== e.fuellTyp ? typen[0]?.typ === e.fuellTyp : null,
    absender: erw.absenderMappe ? (e.absender ?? [])[0] === erw.absenderMappe : null,
    ziel1: erw.mappeDa ? ziele[0] === erw.mappe : null,
    ziel3: erw.mappeDa ? ziele.slice(0, 3).includes(erw.mappe) : null,
    felder: felder.length ? { richtig: felder.filter((f) => f === 'richtig').length, von: felder.length } : null,
    wege: Object.fromEntries(WEGE.map((w) => [w, typDa ? wegBewertung(typen, w, erw.typ) : null])),
  };
}

/** Je Weg: Hat er etwas geliefert, steht der erwartete Typ bei ihm vorn bzw. unter seinen Typen? */
function wegBewertung(typen, weg, typ) {
  const mit = typen
    .map((t) => ({ typ: t.typ, s: Math.max(-1, ...(t.belege ?? []).filter((b) => b.weg === weg).map((b) => b.sicherheit ?? 0)) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s);
  return { geliefert: mit.length > 0, typ1: mit[0]?.typ === typ, typ3: mit.some((x) => x.typ === typ) };
}

const leer = () => ({ dokumente: 0, ...Object.fromEntries(KENNZAHLEN.map((k) => [k, { ja: 0, von: 0 }])) });

function zaehle(z, b) {
  z.dokumente++;
  for (const k of KENNZAHLEN) {
    const v = b[k];
    if (v === null || v === undefined) continue;
    if (k === 'felder') {
      z.felder.ja += v.richtig;
      z.felder.von += v.von;
    } else {
      z[k].von++;
      if (v) z[k].ja++;
    }
  }
}

/** Gruppen, nach denen der Bericht aufteilt. */
const GRUPPEN = {
  seltenheit: (e) => e.seltenheit ?? '–',
  form: (e) => e.form ?? '–',
  absender: (e) => (e.erwartet.absenderMappe ? (e.absenderErstes ? 'erstes Dokument' : 'bekannt') : 'ohne Mappe'),
};

/** Alles zusammenzählen: gesamt, je Gruppe und je Weg. */
export function auswerten(ergebnisse) {
  const gesamt = leer();
  const nach = Object.fromEntries(Object.keys(GRUPPEN).map((g) => [g, {}]));
  const wege = Object.fromEntries(WEGE.map((w) => [w, { geliefert: 0, typ1: { ja: 0, von: 0 }, typ3: { ja: 0, von: 0 } }]));
  let ohneText = 0;
  let typFehlt = 0;
  for (const e of ergebnisse) {
    const b = bewerte(e);
    zaehle(gesamt, b);
    for (const [g, f] of Object.entries(GRUPPEN)) zaehle((nach[g][f(e)] ??= leer()), b);
    if (!e.text?.zeichen) ohneText++;
    if (!e.erwartet.typId) typFehlt++;
    for (const w of WEGE) {
      const x = b.wege[w];
      if (!x) continue;
      if (x.geliefert) wege[w].geliefert++;
      wege[w].typ1.von++;
      wege[w].typ3.von++;
      if (x.typ1) wege[w].typ1.ja++;
      if (x.typ3) wege[w].typ3.ja++;
    }
  }
  return { gesamt, nach, wege, ohneText, typFehlt };
}

/** Anteil in Prozent mit einer Nachkommastelle; null ohne Messung. */
export const anteil = (k) => (k && k.von ? Math.round((1000 * k.ja) / k.von) / 10 : null);

/** Erkennungsart nach der Feldart (wie artVon im Kern; das Werkzeug läuft ohne den Quellcode von Ablago). */
const ART_NACH_TYP = {
  datum: 'datum',
  betrag: 'betrag',
  zeitraum: 'zeitraum',
  prozent: 'prozent',
  referenz: 'verweis',
  auswahl: 'auswahl',
};
const ART_NACH_FORMAT = { email: 'email', telefon: 'telefon', internetseite: 'internet', iban: 'iban', plz: 'plz' };

/**
 * Feldart eines Felds für „Felder je Feldart“ (#1693): die eingestellte Erkennungsart, sonst aus Feldart und Format,
 * Nummern an Kennung bzw. Bezeichnung („…nummer“, „…-Nr.“, „Kennzeichen“); sonst die Feldart (text, zahl …).
 */
export function feldart(f) {
  if (!f) return '–';
  if (f.erkennung?.art) return f.erkennung.art;
  if (ART_NACH_TYP[f.typ]) return ART_NACH_TYP[f.typ];
  if (f.format && ART_NACH_FORMAT[f.format]) return ART_NACH_FORMAT[f.format];
  const s = ` ${`${f.key ?? ''} ${f.label ?? ''}`.toLowerCase().replace(/[^a-zäöüß0-9]+/g, ' ')} `;
  if (/ iban /.test(s)) return 'iban';
  if (/ (\S*nummer|\S*nr|kennzeichen|aktenzeichen|zeichen) /.test(s)) return 'nummer';
  return f.typ ?? '–';
}

/**
 * Felder je Feldart (#1693): richtig, falsch, fehlt und „sicher“ (hoch), aber falsch. Ergebnisse ohne `feldInfo`
 * (ältere Berichte) zählen unter „–“.
 */
export function feldarten(ergebnisse) {
  const erg = {};
  for (const e of ergebnisse)
    for (const [k, stand] of Object.entries(e.felder ?? {})) {
      const info = e.feldInfo?.[k];
      const z = (erg[info?.art ?? '–'] ??= { richtig: 0, falsch: 0, fehlt: 0, sicherFalsch: 0 });
      if (stand in z) z[stand]++;
      if (stand === 'falsch' && info?.sicherheit === 'hoch') z.sicherFalsch++;
    }
  return erg;
}
