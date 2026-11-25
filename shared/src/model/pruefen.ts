/**
 * Prüfregeln (#1278, vorher `shared/src/model.ts`): Mappentyp und Mappe prüfen – auf beiden Seiten gleich: die
 * Oberfläche zeigt Fehler früh an, der Server lässt nichts Ungültiges in die Datenbank.
 */
import { SCHLUESSEL, TYP_KENNUNG } from '../kennungen';
import type { Feld } from './felder';
import { FELDTYPEN } from './feldtypen';
import { type Mappentyp, type MappentypDaten, REGISTERARTEN, trefferlistenVon } from './mappentyp';
import { type TeilKontext, teilProbleme } from '../teile';
import { type Pruefergebnis, type Werte, type Betrag, istPasswortWert, istLeer } from './mappe';
import { t } from '../texte';
import { zielErlaubt, zieleVon, jedeMappe, gemeinsameFelder } from '../verweisziele';
import { vorlageFelder, istIndexplatzhalter, pruefeTitelFilter, INDEXPLATZHALTER, type Indexplatzhalter } from './werte';
import { folgtAusProbleme, folgtAusKreis } from '../folgtaus';
import { ausDatumProbleme } from '../ausdatum';
import { auswahlReihenfolgeProbleme } from '../auswahlreihenfolge';
import { vorbelegenProbleme } from '../vorbelegen';
import { tabellenProbleme } from '../tabelle';
import { zusammengesetztProbleme, teileVon, meldefeld } from '../zusammengesetzt';
import { istZeitraum, leseZeitraum, leseProzent, ZEITRAUM_ANZAHL_MAX } from '../feldarten';
import { pruefeFormatDefinition } from '../feldformate';
import { kreisImStandard, kreisVon } from '../nummernkreis';
import { erwaehnungen } from '../markdown';
import { gebietsschema } from '../sprache';
import { feldLabel as feldLabelVon } from '../beschriftung';
import { MUSTER_EINGABE_MAX, musterProblem, musterText } from '../muster';

/* ---------------------------------------------------------------- */

/** Kennung von Feld, Register und eigenem Mappentyp (#1084: bis 60 Zeichen, kennungen.ts). */
export const SCHLUESSEL_MUSTER = SCHLUESSEL;

/** Prüft die Definition eines Mappentyps. */
export interface TypKontext {
  eigeneId?: string;
  namenAndererTypen: string[];
  /** Schlüssel der anderen Mappentypen (#145). */
  schluesselAndererTypen?: string[];
  existiertTyp: (id: string) => boolean;
  /** Auswahlfilter prüfen (#172; aus sichten/auswahlfilter.ts, hier ohne Kreisimport). */
  auswahlProbleme?: (
    bed: import('../sichten/bedingungen').Feldbedingung[],
    zielFelder: Feld[],
    eigene: { felder: Feld[]; feldKey: string },
  ) => string[];
  /** Schlüssel der Nummernkreise (#171); fehlt: nicht prüfen. */
  nummernkreise?: string[];
  /** Felder eines anderen Typs (für Quellen von Verknüpfungsregistern). */
  felderVon?: (typId: string) => Feld[] | undefined;
  /** Felder und Trefferlisten eines anderen Typs (Tabelle, #1030); fehlt: aus `felderVon` ohne eigene Trefferlisten. */
  typVon?: (typId: string) => Pick<Mappentyp, 'felder' | 'trefferlisten' | 'trefferliste'> | undefined;
  /** „Ist Teil einer anderen Mappe“ (#1031): andere Typen und eigene Systemart; fehlt: nur die Angaben am Typ selbst prüfen. */
  teile?: Omit<TeilKontext, 'eigeneId'>;
}

/** Ist Teil einer anderen Mappe (#1031): ein Pflicht-Verweis auf genau einen anderen Typ, keine Ketten (teile.ts). */
function pruefeTeil(d: MappentypDaten, ctx: TypKontext, p: Pruefergebnis) {
  const k: TeilKontext = { typVon: () => undefined, teiltypenAuf: () => [], ...ctx.teile, eigeneId: ctx.eigeneId };
  for (const x of teilProbleme({ ...d, register: d.register ?? [] }, k)) melde(p, 'grunddaten', x);
}

/** Allgemeine Meldung mit Bereich des Editors (#144). */
function melde(p: Pruefergebnis, ort: string, text: string) {
  p.allgemein.push(text);
  (p.orte ??= []).push(ort);
}

function pruefeRegister(mappentypDaten: MappentypDaten, ctx: TypKontext, p: Pruefergebnis) {
  const reg = mappentypDaten.register ?? [];
  if (!reg.length) {
    melde(p, 'register', t('gemeinsam.model.der-mappentyp-braucht-mindestens'));
    return;
  }
  const keys = new Set<string>();
  const feldAuf = new Map<string, string>();
  for (const r of reg) {
    const name = (r.name ?? '').trim() || r.key;
    if (!(r.name ?? '').trim()) melde(p, 'register', t('gemeinsam.model.jedes-register-braucht-einen'));
    if (!SCHLUESSEL_MUSTER.test(r.key ?? '')) melde(p, 'register', t('gemeinsam.model.register-ungueltige-kennung', { name }));
    else if (keys.has(r.key)) melde(p, 'register', t('gemeinsam.model.die-register-kennung-kommt', { key: r.key }));
    keys.add(r.key);
    if (!(r.art in REGISTERARTEN)) melde(p, 'register', t('gemeinsam.model.register-unbekannte-art', { name }));
    if (r.art === 'felder') {
      for (const k of r.felder ?? []) {
        if (feldAuf.has(k))
          melde(
            p,
            'register',
            t('gemeinsam.model.das-feld-liegt-auf', { wert: mappentypDaten.felder.find((f) => f.key === k)?.label ?? k }),
          );
        feldAuf.set(k, r.key);
      }
    }
    if (r.art === 'verknuepfungen') {
      for (const q of r.quellen ?? []) {
        const felder = q.typId === ctx.eigeneId ? mappentypDaten.felder : ctx.felderVon?.(q.typId);
        const f = felder?.find((x) => x.key === q.feldKey);
        if (!f || f.typ !== 'referenz' || !zielErlaubt(f, ctx.eigeneId))
          melde(p, 'register', t('gemeinsam.model.register-eine-quelle-verweist', { name }));
      }
    }
  }
  // Ausblenden (#655): Ein Register muss die Mappe zeigen.
  if (reg.every((r) => r.ausgeblendet)) melde(p, 'register', t('gemeinsam.model.ein-register-muss-sichtbar'));
  if (mappentypDaten.felder.length && !reg.some((r) => r.art === 'felder')) melde(p, 'register', t('gemeinsam.model.es-gibt-felder-aber'));
  const ohne = mappentypDaten.felder.filter((f) => !feldAuf.has(f.key));
  if (ohne.length && reg.some((r) => r.art === 'felder'))
    melde(p, 'register', t('gemeinsam.model.diese-felder-liegen-auf', { map: ohne.map((f) => f.label || f.key).join(', ') }));
}

/** Tabellen (#1030) haben keinen Wert – weder im Titel noch als Spalte einer Trefferliste. */
function pruefeTabellenOhneWert(mappentypDaten: MappentypDaten, p: Pruefergebnis) {
  const istT = (k: string) => mappentypDaten.felder.some((f) => f.key === k && f.typ === 'tabelle');
  const imTitel = vorlageFelder(mappentypDaten.titelVorlage ?? '').filter(istT);
  if (imTitel.length) melde(p, 'titel', t('gemeinsam.tabelle.nicht-im-titel', { map: imTitel.map((k) => `{${k}}`).join(', ') }));
  if ([...(mappentypDaten.trefferliste ?? []), ...(mappentypDaten.trefferlisten ?? []).flatMap((l) => l.spalten)].some(istT))
    melde(p, 'trefferlisten', t('gemeinsam.tabelle.keine-spalte'));
}

export function pruefeMappentyp(mappentypDaten: MappentypDaten, ctx: TypKontext): Pruefergebnis {
  const p: Pruefergebnis = { allgemein: [], felder: {} };
  const name = (mappentypDaten.name ?? '').trim();
  if (!name) melde(p, 'grunddaten', t('gemeinsam.model.der-mappentyp-braucht-einen'));
  else if (ctx.namenAndererTypen.some((n) => n.trim().toLowerCase() === name.toLowerCase()))
    melde(p, 'grunddaten', t('gemeinsam.model.es-gibt-bereits-einen', { name }));
  if (mappentypDaten.schluessel !== undefined) {
    if (!TYP_KENNUNG.test(mappentypDaten.schluessel)) melde(p, 'grunddaten', t('gemeinsam.model.kennung-des-mappentyps-nur'));
    else if ((ctx.schluesselAndererTypen ?? []).includes(mappentypDaten.schluessel))
      melde(p, 'grunddaten', t('gemeinsam.model.die-kennung-hat-schon', { schluessel: mappentypDaten.schluessel }));
  }
  if (!Array.isArray(mappentypDaten.felder)) {
    melde(p, 'felder', t('gemeinsam.model.die-felder-fehlen'));
    return p;
  }
  const unbekannt = vorlageFelder(mappentypDaten.titelVorlage ?? '').filter(
    (k) => !istIndexplatzhalter(k) && !mappentypDaten.felder.some((f) => f.key === k),
  );
  if (unbekannt.length) melde(p, 'titel', t('gemeinsam.model.die-titel-vorlage-nennt', { map: unbekannt.map((k) => `{${k}}`).join(', ') }));
  const geheim = vorlageFelder(mappentypDaten.titelVorlage ?? '').filter((k) =>
    mappentypDaten.felder.some((f) => f.key === k && f.typ === 'passwort'),
  );
  if (geheim.length)
    melde(p, 'titel', t('gemeinsam.model.passwortfelder-duerfen-nicht-im', { map: geheim.map((k) => `{${k}}`).join(', ') }));
  pruefeTabellenOhneWert(mappentypDaten, p);
  pruefeTeil(mappentypDaten, ctx, p);
  for (const x of pruefeTitelFilter({ felder: mappentypDaten.felder, titelVorlage: mappentypDaten.titelVorlage ?? '' }))
    melde(p, 'titel', x);
  if ((mappentypDaten.trefferliste ?? []).some((k) => mappentypDaten.felder.some((f) => f.key === k && f.typ === 'passwort')))
    melde(p, 'trefferlisten', t('gemeinsam.model.passwortfelder-koennen-keine-spalte'));
  pruefeRegister(mappentypDaten, ctx, p);

  const gesehen = new Set<string>();
  mappentypDaten.felder.forEach((f, i) => {
    const m: string[] = [];
    if (!(f.label ?? '').trim()) m.push(t('gemeinsam.model.bezeichnung-fehlt'));
    if (!(f.typ in FELDTYPEN)) m.push(t('gemeinsam.model.unbekannte-feldart'));
    if (!SCHLUESSEL_MUSTER.test(f.key ?? '')) m.push(t('gemeinsam.model.kennung-nur-kleinbuchstaben-ziffern'));
    else if (gesehen.has(f.key)) m.push(t('gemeinsam.model.kennung-kommt-doppelt-vor', { key: f.key }));
    else if (istIndexplatzhalter(f.key))
      m.push(t('gemeinsam.model.kennung-ist-fuer-den', { key: f.key, INDEXPLATZHALTER: INDEXPLATZHALTER[f.key as Indexplatzhalter] }));
    gesehen.add(f.key);
    if (f.typ === 'referenz') {
      // Ziele (#1036): ein oder mehrere Mappentypen; nur aus einem Paket mit optionalen Zielen darf die Liste (noch) leer sein.
      const ziele = zieleVon(f);
      if (jedeMappe(f)) {
        if (!f.system) m.push(t('gemeinsam.model.ziel-mappentyp-auswaehlen'));
      } else if (!ziele.length) {
        if (!f.zielOptional?.length) m.push(t('gemeinsam.model.ziel-mappentyp-auswaehlen'));
      } else if (ziele.some((z) => z !== ctx.eigeneId && !ctx.existiertTyp(z))) m.push(t('gemeinsam.model.der-ziel-mappentyp-existiert'));
      else if (f.auswahlFilter?.length && ctx.auswahlProbleme) {
        // Auswahlfilter (#172): Bedingungen gegen die Felder des Zieltyps – bei mehreren gegen die Felder, die alle haben.
        const listen = ziele.map((z) => (z === ctx.eigeneId ? mappentypDaten.felder : ctx.felderVon?.(z)));
        if (listen.every(Boolean))
          for (const x of ctx.auswahlProbleme(f.auswahlFilter, gemeinsameFelder(listen as Feld[][]), {
            felder: mappentypDaten.felder,
            feldKey: f.key,
          }))
            m.push(`Auswahlfilter: ${x}`);
      }
      // „Alle vom selben Typ“ (#1036) nur mit mehreren Mappen; mit (noch) einem Zieltyp schadet es nicht – optionale können kommen.
      if (f.gleicherTyp && !f.mehrfach) m.push(t('gemeinsam.model.gleicher-typ-nur-mehrfach'));
      // Folgt aus (#886): Quelle und Zielfeld gibt es und sie passen; Kreise meldet die Prüfung unten.
      if (f.folgtAus)
        m.push(...folgtAusProbleme(mappentypDaten.felder, f, (id) => (id === ctx.eigeneId ? mappentypDaten.felder : ctx.felderVon?.(id))));
    }
    // Aus Datum ableiten (#1648): Datumsfeld hier, Feld mit dem Jahr im Zieltyp.
    if (f.ausDatum)
      m.push(...ausDatumProbleme(mappentypDaten.felder, f, (id) => (id === ctx.eigeneId ? mappentypDaten.felder : ctx.felderVon?.(id))));
    // Reihenfolge der Auswahl (#1671): Feld des (einen) Zieltyps, nach dem sich sortieren lässt, oder eine Systemspalte.
    if (f.auswahlReihenfolge)
      m.push(...auswahlReihenfolgeProbleme(f, (id) => (id === ctx.eigeneId ? mappentypDaten.felder : ctx.felderVon?.(id))));
    // Beim Auswählen übernehmen (#1037): Felder gibt es und sie passen zusammen; nie aus oder in Passwortfelder.
    if (f.vorbelegen?.length)
      m.push(...vorbelegenProbleme(mappentypDaten.felder, f, (id) => (id === ctx.eigeneId ? mappentypDaten.felder : ctx.felderVon?.(id))));
    // Tabelle (#1030): Quelle wie bei einem Verknüpfungsregister – das Feld des anderen Typs muss hierher verweisen.
    if (f.typ === 'tabelle') {
      m.push(
        ...tabellenProbleme(f, {
          eigeneId: ctx.eigeneId,
          zielErlaubt,
          listen: trefferlistenVon,
          typ: (id) =>
            id === ctx.eigeneId ? mappentypDaten : (ctx.typVon?.(id) ?? (ctx.felderVon?.(id) ? { felder: ctx.felderVon(id)! } : undefined)),
        }),
      );
      if (f.pflicht || f.eindeutig) m.push(t('gemeinsam.tabelle.kein-wert'));
    }
    // Zusammengesetzt (#1050): Vorlage mit Platzhaltern aus geeigneten Feldern dieses Typs.
    if (f.typ === 'zusammengesetzt') m.push(...zusammengesetztProbleme(mappentypDaten.felder, f));
    if (f.typ === 'auswahl' && !(f.optionen ?? []).length) m.push(t('gemeinsam.model.mindestens-einen-auswahlwert'));
    if ((f.typ === 'text' || f.typ === 'langtext' || f.typ === 'formatiert') && f.minLen != null && f.maxLen != null && f.minLen > f.maxLen)
      m.push(t('gemeinsam.model.mindestlaenge-ist-groesser-als'));
    if (
      (f.typ === 'zahl' || f.typ === 'betrag' || f.typ === 'prozent') &&
      typeof f.min === 'number' &&
      typeof f.max === 'number' &&
      f.min > f.max
    )
      m.push(t('gemeinsam.model.minimum-ist-groesser-als'));
    // Betrag (#1035): Ein Minimum unter 0 verlangt „negative Beträge erlauben“.
    if (f.typ === 'betrag' && !f.negativ && typeof f.min === 'number' && f.min < 0) m.push(t('gemeinsam.feldarten.minimum-negativ'));
    if (f.typ === 'zeitraum' && f.standard != null && f.standard !== '' && !istZeitraum(leseZeitraum(f.standard)))
      m.push(t('gemeinsam.feldarten.standard-zeitraum'));
    if (f.typ === 'prozent' && f.standard != null && f.standard !== '' && !Number.isFinite(leseProzent(f.standard)))
      m.push(t('gemeinsam.feldarten.standard-prozent'));
    // Format und Datumsgrenzen (#535).
    m.push(...pruefeFormatDefinition(f, mappentypDaten.felder));
    // Prüfmuster (#1315): gültig, nicht zu lang, ohne verschachtelte Wiederholungen (ReDoS, muster.ts).
    if (f.typ === 'text' && f.muster) {
      const problem = musterProblem(f.muster);
      if (problem) m.push(musterText(problem));
    }
    // Nummernkreis im Standardwert (#171): nur an Textfeldern, den Kreis muss es geben.
    const kreis = kreisImStandard(f.standard);
    if (kreis) {
      if (f.typ !== 'text') m.push(t('gemeinsam.model.einen-nummernkreis-gibt-es'));
      else if (ctx.nummernkreise && !ctx.nummernkreise.includes(kreis)) m.push(t('gemeinsam.model.den-nummernkreis-gibt-es', { kreis }));
    }
    if (m.length) p.felder[String(i)] = m;
  });
  // Folgt aus (#886): keine Kreise (Organisation aus Niederlassung und Niederlassung aus Organisation).
  const kreis = folgtAusKreis(mappentypDaten.felder);
  if (kreis.length) {
    const namen = kreis.map((k) => `„${mappentypDaten.felder.find((f) => f.key === k)?.label || k}“`).join(', ');
    mappentypDaten.felder.forEach((f, i) => {
      if (kreis.includes(f.key)) (p.felder[String(i)] ??= []).push(t('gemeinsam.folgtaus.kreis', { felder: namen }));
    });
  }
  return p;
}

export interface MappenKontext {
  /** Typ-Id der Mappe mit dieser Id, oder undefined, wenn es sie nicht gibt. */
  typVon: (mappeId: string) => string | undefined;
  /** Titel einer anderen Mappe desselben Typs mit gleichem Wert ('' = vorhanden, aber nicht lesbar), sonst undefined. */
  doppelt: (feldKey: string, wert: string | number) => string | undefined;
  /** Felder, die gerade nicht zu sehen sind (Anzeige-Bedingungen, #1033): nie Pflicht. Siehe `pruefeMitAnzeige`. */
  verborgen?: Set<string>;
}

/** Prüft die Werte einer Mappe gegen die aktuelle Definition ihres Typs. */
export function pruefeMappe(pick: Pick<Mappentyp, 'felder'>, werte: Werte, ctx: MappenKontext): Pruefergebnis {
  const p: Pruefergebnis = { allgemein: [], felder: {} };
  const fehler = (k: string, msg: string) => {
    p.felder[k] = [msg];
  };

  for (const f of pick.felder) {
    const v = werte?.[f.key];
    // Nummernkreis (#171): Wert vergibt das DMS, keine Prüfung der Eingabe.
    if (kreisVon(f)) continue;
    if (istLeer(v)) {
      if (f.pflicht && f.typ !== 'janein' && !ctx.verborgen?.has(f.key)) fehler(f.key, t('gemeinsam.model.pflichtfeld-bitte-ausfuellen'));
      continue;
    }
    switch (f.typ) {
      case 'text':
      case 'langtext':
      case 'formatiert': {
        if (typeof v !== 'string') {
          fehler(f.key, t('gemeinsam.model.text-erwartet'));
          break;
        }
        if (f.minLen != null && v.length < f.minLen) fehler(f.key, t('gemeinsam.model.mindestens-zeichen', { minLen: f.minLen }));
        else if (f.maxLen != null && v.length > f.maxLen) fehler(f.key, t('gemeinsam.model.hoechstens-zeichen', { maxLen: f.maxLen }));
        else if (f.typ === 'text' && f.muster) {
          // ReDoS (#1315): nur kurze Eingaben gegen das Muster; ein unsicheres Muster prüft Ablago nicht (der Mappentyp meldet es).
          if (v.length > MUSTER_EINGABE_MAX) fehler(f.key, t('gemeinsam.model.zu-lang-fuer-muster', { max: MUSTER_EINGABE_MAX }));
          else if (!musterProblem(f.muster)) {
            if (!new RegExp('^(?:' + f.muster + ')$').test(v)) fehler(f.key, t('gemeinsam.model.passt-nicht-zum-vorgegebenen'));
          }
        }
        break;
      }
      case 'zahl':
      case 'prozent':
      case 'betrag': {
        const x = f.typ === 'betrag' ? (v as Betrag)?.betrag : v;
        if (typeof x !== 'number' || !Number.isFinite(x)) {
          fehler(
            f.key,
            f.typ === 'betrag'
              ? t('gemeinsam.model.kein-gueltiger-betrag')
              : f.typ === 'prozent'
                ? t('gemeinsam.feldarten.kein-prozent')
                : t('gemeinsam.model.keine-gueltige-zahl'),
          );
          break;
        }
        // Negativer Betrag (#1035) nur, wenn das Feld es erlaubt – Vorgabe wie bisher ≥ 0.
        if (f.typ === 'betrag' && !f.negativ && x < 0) fehler(f.key, t('gemeinsam.feldarten.betrag-nicht-negativ'));
        else if (typeof f.min === 'number' && x < f.min)
          fehler(f.key, t('gemeinsam.model.mindestens', { min: f.min.toLocaleString(gebietsschema()) }));
        else if (typeof f.max === 'number' && x > f.max)
          fehler(f.key, t('gemeinsam.model.hoechstens', { max: f.max.toLocaleString(gebietsschema()) }));
        else if ((f.typ === 'zahl' || f.typ === 'prozent') && f.nachkomma != null && (String(x).split('.')[1] ?? '').length > f.nachkomma)
          fehler(f.key, t('gemeinsam.model.hoechstens-nachkommastellen', { nachkomma: f.nachkomma }));
        if (f.typ === 'betrag' && !p.felder[f.key] && !/^[A-Z]{3}$/.test((v as Betrag).waehrung ?? ''))
          fehler(f.key, t('gemeinsam.model.waehrung-als-dreistelliger-code'));
        break;
      }
      case 'datum':
        if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v)))
          fehler(f.key, t('gemeinsam.model.kein-gueltiges-datum'));
        break;
      case 'zusammengesetzt':
        // Berechnet beim Speichern (#1050) – ein Text.
        if (typeof v !== 'string') fehler(f.key, t('gemeinsam.model.text-erwartet'));
        break;
      case 'zeitraum':
        // Gespeichert immer als { anzahl, einheit } (#1035); Texte wie „3 Monate“ gleicht bereinigeWerte vorher an.
        if (!istZeitraum(v)) fehler(f.key, t('gemeinsam.feldarten.kein-zeitraum', { max: ZEITRAUM_ANZAHL_MAX }));
        break;
      case 'janein':
        if (typeof v !== 'boolean') fehler(f.key, t('gemeinsam.model.ja-oder-nein-erwartet'));
        break;
      case 'auswahl': {
        const liste = Array.isArray(v) ? v : [v];
        if (!f.mehrfach && Array.isArray(v)) {
          fehler(f.key, t('gemeinsam.model.nur-ein-wert-erlaubt'));
          break;
        }
        const falsch = liste.filter((x) => !(f.optionen ?? []).includes(String(x)));
        if (falsch.length) fehler(f.key, t('gemeinsam.model.nicht-in-der-auswahlliste', { falsch: falsch.join(', ') }));
        break;
      }
      case 'passwort':
        // Auf dem Server verschlüsselt (Text), in der Oberfläche als PasswortWert.
        if (typeof v !== 'string' && !istPasswortWert(v)) fehler(f.key, t('gemeinsam.model.ungueltiger-wert-fuer-ein'));
        break;
      case 'referenz': {
        const ids = Array.isArray(v) ? v : [v];
        if (!f.mehrfach && Array.isArray(v)) {
          fehler(f.key, t('gemeinsam.model.nur-ein-verweis-erlaubt'));
          break;
        }
        if (ids.some((id) => typeof id !== 'string' || ctx.typVon(id) === undefined))
          fehler(f.key, t('gemeinsam.model.verweist-auf-eine-mappe'));
        else if (ids.some((id) => !zielErlaubt(f, ctx.typVon(id as string)))) fehler(f.key, t('gemeinsam.model.verweist-auf-eine-mappe-2'));
        // „Alle vom selben Typ“ (#1036): wie die erste Mappe.
        else if (f.gleicherTyp && f.mehrfach && new Set(ids.map((id) => ctx.typVon(id as string))).size > 1)
          fehler(f.key, t('gemeinsam.model.gleicher-typ'));
        break;
      }
    }
    if (!p.felder[f.key] && f.eindeutig && f.typ === 'zusammengesetzt') {
      // Kombination (#1050): Meldung mit den beteiligten Feldern am ersten davon, das man sieht (Hinweis Qualität).
      const titel = ctx.doppelt(f.key, v as string);
      if (titel !== undefined) {
        const felder = new Intl.ListFormat(gebietsschema(), { type: 'conjunction' }).format(
          teileVon(pick.felder, f).map((x) => feldLabelVon(x)),
        );
        const ort = meldefeld(pick.felder, f, ctx.verborgen);
        (p.felder[ort] ??= []).push(
          titel ? t('gemeinsam.zusammengesetzt.doppelt-in', { felder, titel }) : t('gemeinsam.zusammengesetzt.doppelt', { felder }),
        );
      }
    } else if (!p.felder[f.key] && f.eindeutig && (f.typ === 'text' || f.typ === 'zahl')) {
      const titel = ctx.doppelt(f.key, v as string | number);
      // Leer: die andere Mappe darf der Benutzer nicht sehen – dann ohne ihren Titel (#743).
      if (titel !== undefined)
        fehler(f.key, titel ? t('gemeinsam.model.bereits-vergeben-in', { titel }) : t('gemeinsam.model.bereits-vergeben'));
    }
  }
  return p;
}

/** Alle Verweise einer Mappe: [feldKey, zielId] je Referenzwert. */
export function verweiseVon(t: Pick<Mappentyp, 'felder'>, werte: Werte): Array<{ feldKey: string; zielId: string }> {
  const out: Array<{ feldKey: string; zielId: string }> = [];
  for (const f of t.felder) {
    if (f.typ !== 'referenz') continue;
    const v = werte?.[f.key];
    if (istLeer(v)) continue;
    for (const id of Array.isArray(v) ? v : [v]) if (typeof id === 'string') out.push({ feldKey: f.key, zielId: id });
  }
  return out;
}

/**
 * Mappen, deren Titel eine Trefferliste zu dieser Mappe braucht: Verweise und (#1333) in formatierten Feldern erwähnte
 * Mappen. Der Server liefert sie je Seite gesammelt als `bezuege` – nach den Rechten der lesenden Person maskiert.
 */
export function bezugsZiele(t: Pick<Mappentyp, 'felder'>, werte: Werte): string[] {
  const erwaehnt = t.felder.flatMap((f) => {
    const v = werte?.[f.key];
    return f.typ === 'formatiert' && typeof v === 'string' ? erwaehnungen(v) : [];
  });
  return [...verweiseVon(t, werte).map((v) => v.zielId), ...erwaehnt];
}
