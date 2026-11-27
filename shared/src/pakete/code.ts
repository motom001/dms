/** Paketverwaltung (#1278 aus pakete.ts): Code eines Pakets lesen und prüfen (dms.code.json). */
import {
  type PaketCode,
  CODE_MAX,
  SPRACHEN,
  EREIGNISSE,
  MAPPEN_EREIGNISSE,
  type EreignisArt,
  DMS_RECHTE_TYPEN,
  type DokumentRecht,
  DOKUMENT_RECHTE,
  SCHNITTSTELLEN,
  ALLE_TYPEN,
  type ArchivAuswahl,
  ARCHIV_ARTEN,
  type Schnittstelle,
} from './schnittstellen';
import { t } from '../texte';
import { TYPVERWEIS_ODER_ALLE } from '../kennungen';
import { MIME, kernTyp, dateitypName, UMWANDELN_TYPEN_MAX } from '../dateiumwandlung';
import { VOLLTEXT_TYPEN_MAX } from '../paketvolltext';
import { ARCHIV_TYPEN_MAX } from '../archivfassung';
import type { PaketKarte } from '../automatisierung';

import { istPaketdatenBereich, PAKETDATEN_BEREICHE, NACHWEIS_BEREICHE } from '../paketdaten';

/** Liest eine Liste von Texten; sonst ein Fehler mit der Stelle und eine leere Liste. Doppelte fallen weg. */
type ListenLeser = (v: unknown, wo: string) => string[];
const listenLeser =
  (fehler: string[]): ListenLeser =>
  (v, wo) => {
    if (v === undefined) return [];
    if (!Array.isArray(v) || v.some((y) => typeof y !== 'string')) {
      fehler.push(`${wo}: Liste von Texten erwartet.`);
      return [];
    }
    return [...new Set(v as string[])];
  };

/** Rechte aus `code.rechte`, soweit liesCode sie für die weiteren Prüfungen braucht. */
interface CodeRechte {
  lesen: string[];
  schreiben: string[];
  dokumente: DokumentRecht;
  schnittstellen: string[];
}

/**
 * Liest code: aus dem Manifest (ohne einstellungen/aktionen – die liest paketeinstellungen.ts).
 * dateien: Dateien unter code/ des Pakets (Name, Größe in Bytes) für die Größengrenze.
 */
export function liesCode(c: unknown, dateien: Array<{ name: string; groesse: number }> = []): { code: PaketCode | null; fehler: string[] } {
  const fehler: string[] = [];
  const summe = dateien.filter((d) => d.name.startsWith('code/')).reduce((n, d) => n + d.groesse, 0);
  if (summe > CODE_MAX)
    fehler.push(
      t('gemeinsam.pakete.code-die-dateien-unter', { replace: (summe / 1048576).toFixed(1).replace('.', ','), wert: CODE_MAX / 1048576 }),
    );
  if (c === undefined || c === null) return { code: null, fehler };
  if (typeof c !== 'object' || Array.isArray(c)) return { code: null, fehler: [t('gemeinsam.pakete.code-muss-ein-objekt')] };
  const x = c as Record<string, unknown>;
  const sprache = String(x.sprache ?? '');
  if (!SPRACHEN.includes(sprache)) fehler.push(t('gemeinsam.pakete.code-sprache-eine-von', { SPRACHEN: SPRACHEN.join(', ') }));
  const liste = listenLeser(fehler);
  const { ereignisse, mappentypen } = liesEreignisse(x, liste, fehler);
  const r = (x.rechte ?? {}) as Record<string, unknown>;
  const rechte = liesRechte(r, liste, fehler);
  const umwandeln = liesUmwandeln(x, rechte, ereignisse, liste, fehler);
  const volltext = liesVolltext(x, rechte, ereignisse, liste, fehler);
  const archivfassung = liesArchivfassung(x, rechte, ereignisse, liste, fehler);
  pruefeSicherung(rechte.schnittstellen, ereignisse, fehler);
  const netz = liesNetz(x, liste, fehler);
  const adressen = adressenAus(x);
  // Eigene Dann-Karten (#680): ausgeführt über das Ereignis zeitplan.ausgefuehrt.
  const karten = liesKarten(x.karten, ereignisse, fehler);
  // Einrichtung und Nachweise lesen (#1054): bekannte Bereiche, Nachweise nur, wo es welche gibt, nie mit Netz.
  const paketdaten = paketdatenRechte(r, liste, fehler, netz.length > 0 || adressen.length > 0);
  // Schreiben setzt Lesen voraus.
  const lesenAlle = [...new Set([...rechte.lesen, ...rechte.schreiben])];
  pruefeMappentypenLesbar(mappentypen, lesenAlle, fehler);
  const { schnittstellen, schreiben, dokumente } = rechte;
  return {
    code: fehler.length
      ? null
      : {
          sprache,
          ereignisse: ereignisse as EreignisArt[],
          rechte: {
            lesen: lesenAlle,
            schreiben,
            dokumente,
            ...(schnittstellen.length ? { schnittstellen: schnittstellen as Schnittstelle[] } : {}),
            ...paketdaten,
          },
          netz,
          ...(adressen.length ? { adressen } : {}),
          ...(umwandeln.length ? { umwandeln: [...new Set(umwandeln)] } : {}),
          ...(volltext.length ? { volltext: [...new Set(volltext)] } : {}),
          ...(archivfassung && schnittstellen.includes('dms:archivfassung') ? { archivfassung } : {}),
          ...(mappentypen.length ? { mappentypen } : {}),
          ...(karten.length ? { karten } : {}),
        },
    fehler,
  };
}

/** `code.ereignisse` und `code.mappentypen` (#670, #686). */
function liesEreignisse(x: Record<string, unknown>, liste: ListenLeser, fehler: string[]) {
  const ereignisse = liste(x.ereignisse, 'code.ereignisse');
  for (const e of ereignisse)
    if (!(e in EREIGNISSE)) fehler.push(t('gemeinsam.pakete.code-ereignisse-gibt-es', { e, keys: Object.keys(EREIGNISSE).join(', ') }));
  // Mappen-Ereignisse (#670): nur zu den Typen unter code.mappentypen (eigene Typen des Pakets, ohne Präfix).
  const mappentypen = liste(x.mappentypen, 'code.mappentypen');
  const mitMappen = ereignisse.filter((e) => MAPPEN_EREIGNISSE.includes(e as EreignisArt));
  // Fremde Mappentypen (#686): wie in code.rechte (paket:typ, dms:post …) oder „*“ für alle, die das Paket lesen darf.
  for (const k of mappentypen)
    if (!TYPVERWEIS_ODER_ALLE.test(k)) fehler.push(t('gemeinsam.pakete.code-mappentypen-schluessel-eines', { k }));
  if (mitMappen.length && !mappentypen.length)
    fehler.push(t('gemeinsam.pakete.code-ereignisse-braucht-code', { mitMappen: mitMappen.join(', ') }));
  if (!mitMappen.length && mappentypen.length) fehler.push(t('gemeinsam.pakete.code-mappentypen-nur-mit'));
  return { ereignisse, mappentypen };
}

/** `code.rechte`: Lesen, Schreiben, Dokumente und Schnittstellen des Kerns samt ihren Voraussetzungen. */
function liesRechte(r: Record<string, unknown>, liste: ListenLeser, fehler: string[]): CodeRechte {
  if (typeof r !== 'object' || Array.isArray(r)) fehler.push(t('gemeinsam.pakete.code-rechte-muss-ein'));
  const lesen = liste(r.lesen, 'code.rechte.lesen'),
    schreiben = liste(r.schreiben, 'code.rechte.schreiben');
  for (const text2 of [...lesen, ...schreiben])
    if (!TYPVERWEIS_ODER_ALLE.test(text2)) fehler.push(t('gemeinsam.pakete.code-rechte-ist-kein', { t: text2 }));
  // Benutzer sehen Pakete nie (auch nicht mit "*"), siehe Handbuch „Pakete mit Code“.
  for (const text2 of [...lesen, ...schreiben])
    if (text2 === 'dms:benutzer') fehler.push(t('gemeinsam.pakete.code-rechte-dms-benutzer'));
    else if (text2.startsWith('dms:') && !DMS_RECHTE_TYPEN[text2.slice(4)])
      fehler.push(
        t('gemeinsam.pakete.code-rechte-diesen-mappentyp', {
          t: text2,
          map: Object.keys(DMS_RECHTE_TYPEN)
            .map((k) => `dms:${k}`)
            .join(', '),
        }),
      );
  const dokumente = (r.dokumente ?? 'keine') as DokumentRecht;
  if (!(dokumente in DOKUMENT_RECHTE)) fehler.push(t('gemeinsam.pakete.code-rechte-dokumente-keine'));
  const schnittstellen = liste(r.schnittstellen, 'code.rechte.schnittstellen');
  pruefeSchnittstellen({ lesen, schreiben, dokumente, schnittstellen }, fehler);
  pruefeCodes({ lesen, schreiben, dokumente, schnittstellen }, fehler);
  return { lesen, schreiben, dokumente, schnittstellen };
}

/** Schnittstellen des Kerns (#442) und was sie an Rechten voraussetzen. */
function pruefeSchnittstellen({ lesen, schreiben, dokumente, schnittstellen }: CodeRechte, fehler: string[]) {
  // Schnittstellen des Kerns (#442), z. B. dms:vektoren; Vektoren gibt es nur zu Dokumenten, die das Paket lesen darf.
  for (const s of schnittstellen)
    if (!(s in SCHNITTSTELLEN))
      fehler.push(t('gemeinsam.pakete.code-rechte-schnittstellen-gibt', { s, keys: Object.keys(SCHNITTSTELLEN).join(', ') }));
  if (schnittstellen.includes('dms:vektoren') && dokumente === 'keine') fehler.push(t('gemeinsam.pakete.code-rechte-schnittstellen-dms'));
  // Hinweise an Mappen (#1034): nur an Mappen, die das Paket auch schreiben darf.
  if (schnittstellen.includes('dms:hinweise') && !schreiben.length) fehler.push(t('gemeinsam.pakete.code-hinweise-braucht-schreiben'));
  // Leerseiten (#997): markiert nur Seiten in Post – das Paket muss Post und ihre Dokumente lesen dürfen.
  if (schnittstellen.includes('dms:leerseiten') && (dokumente === 'keine' || !lesen.some((v) => v === 'dms:post' || v === ALLE_TYPEN)))
    fehler.push(t('gemeinsam.pakete.code-leerseiten-braucht-post'));
  // Anlagen (#998): legt beim Teilen einer Post Anlagen an – das Paket muss Post lesen und schreiben und Dokumente schreiben dürfen.
  const post = (l: string[]) => l.some((v) => v === 'dms:post' || v === ALLE_TYPEN);
  if (schnittstellen.includes('dms:anlagen') && (dokumente !== 'schreiben' || !post(lesen) || !post(schreiben)))
    fehler.push(t('gemeinsam.pakete.code-anlagen-braucht-post'));
}

/** Codes lesen (#1723): Das Paket liest die Seitenbilder selbst – nur von Dokumenten, die es lesen darf. */
function pruefeCodes({ lesen, dokumente, schnittstellen }: CodeRechte, fehler: string[]) {
  if (schnittstellen.includes('dms:codes') && (dokumente === 'keine' || !lesen.length))
    fehler.push(t('gemeinsam.pakete.code-codes-braucht-dokumente'));
}

/** Dateien umwandeln (#577): zuständige Dateitypen, nur mit dms:umwandeln, Lesen von Dokumenten und dem Ereignis. */
function liesUmwandeln(x: Record<string, unknown>, r: CodeRechte, ereignisse: string[], liste: ListenLeser, fehler: string[]): string[] {
  const umwandeln = liste(x.umwandeln, 'code.umwandeln').map((m) => m.toLowerCase());
  const willUmwandeln = r.schnittstellen.includes('dms:umwandeln');
  for (const m of umwandeln) {
    if (!MIME.test(m)) fehler.push(t('gemeinsam.pakete.code-umwandeln-ist-kein', { m }));
    else if (kernTyp(m)) fehler.push(t('gemeinsam.pakete.code-umwandeln-liest-ablago', { dateitypName: dateitypName(m), m }));
  }
  if (umwandeln.length > UMWANDELN_TYPEN_MAX)
    fehler.push(t('gemeinsam.pakete.code-umwandeln-hoechstens-dateitypen', { UMWANDELN_TYPEN_MAX }));
  if (willUmwandeln && !umwandeln.length) fehler.push(t('gemeinsam.pakete.code-rechte-schnittstellen-dms-2'));
  if (!willUmwandeln && umwandeln.length) fehler.push(t('gemeinsam.pakete.code-umwandeln-braucht-code'));
  if (willUmwandeln && r.dokumente === 'keine') fehler.push(t('gemeinsam.pakete.code-rechte-schnittstellen-dms-3'));
  if (willUmwandeln && !ereignisse.includes('datei.umwandeln')) fehler.push(t('gemeinsam.pakete.code-rechte-schnittstellen-dms-4'));
  if (!willUmwandeln && ereignisse.includes('datei.umwandeln')) fehler.push(t('gemeinsam.pakete.code-ereignisse-datei-umwandeln'));
  return umwandeln;
}

/** Volltext aus Paketen (#614): wie beim Umwandeln – zuständige Dateitypen, nur mit dms:volltext, Lesen und dem Ereignis. */
function liesVolltext(x: Record<string, unknown>, r: CodeRechte, ereignisse: string[], liste: ListenLeser, fehler: string[]): string[] {
  const volltext = liste(x.volltext, 'code.volltext').map((m) => m.toLowerCase());
  const willVolltext = r.schnittstellen.includes('dms:volltext');
  for (const m of volltext) {
    if (!MIME.test(m)) fehler.push(t('gemeinsam.pakete.code-volltext-ist-kein', { m }));
    else if (kernTyp(m)) fehler.push(t('gemeinsam.pakete.code-volltext-liest-ablago', { dateitypName: dateitypName(m), m }));
  }
  if (volltext.length > VOLLTEXT_TYPEN_MAX) fehler.push(t('gemeinsam.pakete.code-volltext-hoechstens-dateitypen', { VOLLTEXT_TYPEN_MAX }));
  if (willVolltext && !volltext.length) fehler.push(t('gemeinsam.pakete.code-rechte-schnittstellen-dms-5'));
  if (!willVolltext && volltext.length) fehler.push(t('gemeinsam.pakete.code-volltext-braucht-code'));
  if (willVolltext && r.dokumente === 'keine') fehler.push(t('gemeinsam.pakete.code-rechte-schnittstellen-dms-6'));
  if (willVolltext && !ereignisse.includes('datei.volltext')) fehler.push(t('gemeinsam.pakete.code-rechte-schnittstellen-dms-7'));
  if (!willVolltext && ereignisse.includes('datei.volltext')) fehler.push(t('gemeinsam.pakete.code-ereignisse-datei-volltext'));
  return volltext;
}

/** Archivfassung (#631): Dateitypen (auch PDF, JPEG, PNG), nur mit dms:archivfassung, Lesen und dem Ereignis. */
function liesArchivfassung(
  x: Record<string, unknown>,
  r: CodeRechte,
  ereignisse: string[],
  liste: ListenLeser,
  fehler: string[],
): PaketCode['archivfassung'] {
  const willArchiv = r.schnittstellen.includes('dms:archivfassung');
  let archivfassung: PaketCode['archivfassung'];
  if (x.archivfassung !== undefined) {
    const a = x.archivfassung as Record<string, unknown>;
    if (!a || typeof a !== 'object' || Array.isArray(a)) fehler.push(t('gemeinsam.pakete.code-archivfassung-ein-objekt'));
    else archivfassung = archivAus(a, x, liste, fehler);
  }
  if (willArchiv && !archivfassung?.typen.length) fehler.push(t('gemeinsam.pakete.code-rechte-schnittstellen-dms-8'));
  if (!willArchiv && x.archivfassung !== undefined) fehler.push(t('gemeinsam.pakete.code-archivfassung-braucht-code'));
  if (willArchiv && r.dokumente === 'keine') fehler.push(t('gemeinsam.pakete.code-rechte-schnittstellen-dms-9'));
  if (willArchiv && !ereignisse.includes('datei.archivfassung')) fehler.push(t('gemeinsam.pakete.code-rechte-schnittstellen-dms-10'));
  if (!willArchiv && ereignisse.includes('datei.archivfassung')) fehler.push(t('gemeinsam.pakete.code-ereignisse-datei-archivfassung'));
  return archivfassung;
}

/** `code.archivfassung` als Objekt: Dateitypen, bekannte Schlüssel und die Auswahl je Art. */
function archivAus(
  a: Record<string, unknown>,
  x: Record<string, unknown>,
  liste: ListenLeser,
  fehler: string[],
): NonNullable<PaketCode['archivfassung']> {
  const typen = liste(a.typen, 'code.archivfassung.typen').map((m) => m.toLowerCase());
  for (const m of typen) if (!MIME.test(m)) fehler.push(t('gemeinsam.pakete.code-archivfassung-typen-ist', { m }));
  if (!typen.length) fehler.push(t('gemeinsam.pakete.code-archivfassung-typen-mindestens'));
  if (typen.length > ARCHIV_TYPEN_MAX) fehler.push(t('gemeinsam.pakete.code-archivfassung-typen-hoechstens', { ARCHIV_TYPEN_MAX }));
  for (const k of Object.keys(a))
    if (k !== 'typen' && k !== 'auswahl') fehler.push(t('gemeinsam.pakete.code-archivfassung-gibt-es', { k }));
  const auswahl = a.auswahl !== undefined ? liesArchivAuswahl(a.auswahl, x, fehler) : {};
  return { typen: [...new Set(typen)], ...(Object.keys(auswahl).length ? { auswahl } : {}) };
}

/** Felder der Abschnitte unter `code.einstellungen` (keine Listen), roh. */
const abschnittsfelderRoh = (x: Record<string, unknown>): unknown[] =>
  (Array.isArray(x.einstellungen) ? x.einstellungen : []).flatMap((b) =>
    b &&
    typeof b === 'object' &&
    !Array.isArray(b) &&
    Array.isArray((b as Record<string, unknown>).felder) &&
    (b as Record<string, unknown>).liste === undefined
      ? ((b as Record<string, unknown>).felder as unknown[])
      : [],
  );

/**
 * `code.archivfassung.auswahl` (#660, #946): Je Art (PDFs mit Text, gescannte PDFs, Bilder, E-Mails) der Schlüssel einer
 * Ja/Nein-Einstellung (Abschnitt, keine Liste): an = bekommt eine Archivfassung.
 */
function liesArchivAuswahl(roh: unknown, x: Record<string, unknown>, fehler: string[]): ArchivAuswahl {
  const auswahl: ArchivAuswahl = {};
  const w = roh as Record<string, unknown>;
  const felder = abschnittsfelderRoh(x);
  if (!w || typeof w !== 'object' || Array.isArray(w)) {
    fehler.push(t('gemeinsam.pakete.code-archivfassung-auswahl-ein'));
    return auswahl;
  }
  for (const k of Object.keys(w))
    if (!(ARCHIV_ARTEN as readonly string[]).includes(k))
      fehler.push(t('gemeinsam.pakete.code-archivfassung-auswahl-gibt', { k, ARCHIV_ARTEN: ARCHIV_ARTEN.join(', ') }));
  for (const art of ARCHIV_ARTEN) {
    if (w[art] === undefined) continue;
    const f = felder.find(
      (y): y is Record<string, unknown> => !!y && typeof y === 'object' && (y as Record<string, unknown>).schluessel === w[art],
    );
    if (typeof w[art] !== 'string' || !f || f.typ !== 'janein') fehler.push(t('gemeinsam.pakete.code-archivfassung-auswahl-der', { art }));
    else auswahl[art] = w[art] as string;
  }
  return auswahl;
}

/** Sicherung außer Haus (#585, #976): Lesen nur mit dem Ereignis und umgekehrt, Holen nur mit Lesen. */
function pruefeSicherung(schnittstellen: string[], ereignisse: string[], fehler: string[]) {
  // Sicherung außer Haus (#585): Lesen der verschlüsselten Sicherung nur zusammen mit dem Ereignis – und umgekehrt.
  const willSichern = schnittstellen.includes('dms:sicherung-lesen');
  if (willSichern && !ereignisse.includes('sicherung.fertig')) fehler.push(t('gemeinsam.pakete.code-rechte-schnittstellen-dms-11'));
  if (!willSichern && ereignisse.includes('sicherung.fertig')) fehler.push(t('gemeinsam.pakete.code-ereignisse-sicherung-fertig'));
  // Entfernte Sicherungen zurückholen (#976): nur zusammen mit dem Lesen – dasselbe Ziel.
  if (schnittstellen.includes('dms:sicherung-holen') && !willSichern) fehler.push(t('gemeinsam.pakete.code-sicherung-holen'));
}

/** `code.netz`: nur https://…, ohne Zugangsdaten, Parameter und Anker. */
function liesNetz(x: Record<string, unknown>, liste: ListenLeser, fehler: string[]): string[] {
  const netz = liste(x.netz, 'code.netz');
  for (const n of netz) {
    let ok = false;
    try {
      const u = new URL(n);
      ok = u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash;
    } catch {
      /* unten */
    }
    if (!ok) fehler.push(`code.netz: „${n}“ ist keine erlaubte Adresse (nur https://…, ohne Zugangsdaten).`);
  }
  return netz;
}

/** Dienst-Adresse als Einstellung (#444): Felder vom Typ adresse in den Abschnitten (geprüft in paketeinstellungen.ts). */
const adressenAus = (x: Record<string, unknown>) =>
  abschnittsfelderRoh(x)
    .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object' && (f as Record<string, unknown>).typ === 'adresse')
    .map((f) => ({ schluessel: String(f.schluessel ?? ''), name: String(f.name ?? '') || String(f.schluessel ?? '') }));

/**
 * Ereignisse zu Mappen nur zu Typen, die das Paket lesen darf (#670) – sonst wüsste es von Mappen, die es nie sehen darf.
 * „*“ nur, wenn das Paket auch alle Mappentypen lesen darf; ob es eine einzelne Mappe sehen darf, prüft Ablago bei der
 * Zustellung (#686). Benutzer nie.
 */
function pruefeMappentypenLesbar(mappentypen: string[], lesenAlle: string[], fehler: string[]) {
  for (const k of mappentypen)
    if (!lesenAlle.includes(k) && !lesenAlle.includes(ALLE_TYPEN))
      fehler.push(
        k === ALLE_TYPEN
          ? t('gemeinsam.pakete.code-mappentypen-alle-mappentypen')
          : t('gemeinsam.pakete.code-mappentypen-das-paket', { k }),
      );
  for (const k of mappentypen) if (k === 'dms:benutzer') fehler.push(t('gemeinsam.pakete.code-mappentypen-dms-benutzer'));
}

/** Höchstzahlen für `code.karten` (#680). */
export const KARTEN_MAX = 20,
  KARTEN_FELDER_MAX = 10;
const KARTE_SCHLUESSEL = /^[a-z][a-z0-9_]{0,39}$/;
const KARTE_FELDTYPEN = ['text', 'zahl', 'janein'] as const;

/** `code.karten` (#680): Schlüssel, Name, Hilfe, Felder (Text, Zahl, Ja/Nein); nur mit dem Ereignis `zeitplan.ausgefuehrt`. */
function liesKarten(roh: unknown, ereignisse: string[], fehler: string[]): PaketKarte[] {
  if (roh === undefined) return [];
  if (!Array.isArray(roh)) {
    fehler.push(t('gemeinsam.pakete.code-karten-liste'));
    return [];
  }
  if (roh.length > KARTEN_MAX) fehler.push(t('gemeinsam.pakete.code-karten-max', { anzahl: KARTEN_MAX }));
  if (roh.length && !ereignisse.includes('zeitplan.ausgefuehrt')) fehler.push(t('gemeinsam.pakete.code-karten-ereignis'));
  const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : '');
  const aus: PaketKarte[] = [];
  for (const [i, k] of roh.slice(0, KARTEN_MAX).entries()) {
    const x = (k && typeof k === 'object' ? k : {}) as Record<string, unknown>;
    const schluessel = text(x.schluessel, 40),
      name = text(x.name, 80),
      hilfe = text(x.hilfe, 500);
    if (!KARTE_SCHLUESSEL.test(schluessel) || !name) {
      fehler.push(t('gemeinsam.pakete.code-karten-karte', { nr: i + 1 }));
      continue;
    }
    if (aus.some((y) => y.schluessel === schluessel)) {
      fehler.push(t('gemeinsam.pakete.code-karten-doppelt', { schluessel }));
      continue;
    }
    const felder = (Array.isArray(x.felder) ? x.felder : []).slice(0, KARTEN_FELDER_MAX).flatMap((f, j) => {
      const y = (f && typeof f === 'object' ? f : {}) as Record<string, unknown>;
      const fs = text(y.schluessel, 40),
        fn = text(y.name, 80),
        typ = y.typ ?? 'text';
      if (!KARTE_SCHLUESSEL.test(fs) || !fn || !(KARTE_FELDTYPEN as readonly unknown[]).includes(typ)) {
        fehler.push(t('gemeinsam.pakete.code-karten-feld', { schluessel, nr: j + 1 }));
        return [];
      }
      return [{ schluessel: fs, name: fn, typ: typ as (typeof KARTE_FELDTYPEN)[number] }];
    });
    aus.push({ schluessel, name, ...(hilfe ? { hilfe } : {}), ...(felder.length ? { felder } : {}) });
  }
  return aus;
}

/**
 * `code.rechte.einrichtung` und `code.rechte.nachweise` (#1054): Listen bekannter Bereiche. Ein Paket mit Netz (feste
 * Adresse oder Dienst-Adresse) bekommt beides nicht – die Daten sind eine Landkarte der Sicherheit des Hauses.
 */
function paketdatenRechte(
  r: Record<string, unknown>,
  liste: ListenLeser,
  fehler: string[],
  mitNetz: boolean,
): Pick<PaketCode['rechte'], 'einrichtung' | 'nachweise'> {
  const einrichtung = liste(r.einrichtung, 'code.rechte.einrichtung');
  const nachweise = liste(r.nachweise, 'code.rechte.nachweise');
  for (const b of einrichtung)
    if (!istPaketdatenBereich(b))
      fehler.push(t('gemeinsam.pakete.code-einrichtung-bereich', { b, bereiche: PAKETDATEN_BEREICHE.join(', ') }));
  for (const b of nachweise)
    if (!istPaketdatenBereich(b) || !NACHWEIS_BEREICHE.includes(b))
      fehler.push(t('gemeinsam.pakete.code-nachweise-bereich', { b, bereiche: NACHWEIS_BEREICHE.join(', ') }));
  if (mitNetz && (einrichtung.length || nachweise.length)) fehler.push(t('gemeinsam.pakete.code-paketdaten-netz'));
  const ord = (l: string[]) => PAKETDATEN_BEREICHE.filter((b) => l.includes(b));
  return { ...(einrichtung.length ? { einrichtung: ord(einrichtung) } : {}), ...(nachweise.length ? { nachweise: ord(nachweise) } : {}) };
}
