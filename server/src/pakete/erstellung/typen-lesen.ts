/**
 * Mappentypen-Datei lesen (#1315): streng, denn eine Datei von außen ist nicht vertrauenswürdig (Ergänzung Sicherheit).
 *
 * - Nur bekannte Angaben (Liste statt „alles außer …“): Was Rechte oder Wege nach außen mitbringen könnte –
 *   Berechtigungen, Automatisierungen, Paket-Aktionen, berechnete Felder (`berechnet`, `berechnetVon`), Merkmal und
 *   Schreibschutz der eigenen Organisation, Ids dieser oder einer anderen Installation – lehnt das Lesen mit Stelle ab.
 * - Grenzen für Größe, Anzahl der Typen, Felder und Register, Länge jedes Texts und jeder Liste, Tiefe.
 * - Danach derselbe Prüfer wie für Mappentypen aus Paketen (`liesTypen`) – samt Prüfmuster (ReDoS, muster.ts).
 */
import {
  TYPEN_DATEI_FELDER_MAX,
  TYPEN_DATEI_FORMAT,
  TYPEN_DATEI_LISTE_MAX,
  TYPEN_DATEI_MAX,
  TYPEN_DATEI_REGISTER_MAX,
  TYPEN_DATEI_TEXT_MAX,
  TYPEN_DATEI_TIEFE_MAX,
  TYPEN_DATEI_TYPEN_MAX,
  TYPEN_DATEI_VERSION,
} from '../../../../shared/src/typendatei';
import { Fachfehler } from '../../grundlagen/fehler';
import { KB } from '../../grundlagen/grenzen';
import { t } from '../../sprache/sprache';
import { istObjekt, type PaketTyp, str } from '../verwaltung/format';
import { neuerLeseLauf } from '../verwaltung/lesen-lauf';
import { pruefeKennungen } from '../verwaltung/lesen-inhalt';
import { liesTypen } from '../verwaltung/lesen-typen';

const OBEN = ['format', 'version', 'ablago', 'erstellt', 'mappentypen', 'abhaengigkeiten'];
const TYP = [
  'schluessel',
  'name',
  'beschreibung',
  'titelVorlage',
  'felder',
  'register',
  'trefferliste',
  'beschriftungen',
  'ausPost',
  'erkennbarAn',
  'mehrzahl',
  'gehoertZu',
  'inSuche',
  'archiv',
];
const FELD = [
  'key',
  'label',
  'typ',
  'pflicht',
  'eindeutig',
  'hilfe',
  'standard',
  'minLen',
  'maxLen',
  'muster',
  'min',
  'max',
  'nachkomma',
  'waehrung',
  'negativ',
  'optionen',
  'mehrfach',
  'ziel',
  'zielOptional',
  'gleicherTyp',
  'verweisart',
  'frist',
  'auswahlFilter',
  'folgtAus',
  'vorbelegen',
  'erkennung',
  'wiederfinden',
  'format',
  'landFeld',
  'beschriftungen',
  'ausgeblendet',
  'anzeigen',
  'quelle',
  'vorlage',
];
const REGISTER = [
  'key',
  'name',
  'art',
  'felder',
  'quellen',
  'volltext',
  'versionierung',
  'versionenBehalten',
  'zeigt',
  'beschriftungen',
  'abschnitte',
  'ausgeblendet',
];
/** Eine Id (Mappe, Typ, Person) gehört nie in die Datei – sie gälte hier für etwas anderes. */
const ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Gelesene Datei: Kopf, Typen im Paketformat und die genannten Abhängigkeiten. */
export interface TypenDatei {
  ablago: string;
  erstellt: string;
  typen: PaketTyp[];
}

/** Angaben, die nicht in der Liste stehen; `wo` nennt die Stelle. */
function fremdeAngaben(x: Record<string, unknown>, erlaubt: string[], wo: string): string[] {
  return Object.keys(x)
    .filter((k) => !erlaubt.includes(k))
    .map((k) => t('meldungen.paketerstellung.typen-datei-angabe', { wo, angabe: k }));
}

/** Grenzen für Texte, Listen und Tiefe überall in der Datei; Ids nirgends. */
function grenzenFehler(v: unknown, wo: string, tiefe = 0): string[] {
  if (tiefe > TYPEN_DATEI_TIEFE_MAX) return [t('meldungen.paketerstellung.typen-datei-tief', { wo })];
  if (typeof v === 'string') {
    if ([...v].length > TYPEN_DATEI_TEXT_MAX) return [t('meldungen.paketerstellung.typen-datei-text', { wo, max: TYPEN_DATEI_TEXT_MAX })];
    return ID.test(v) ? [t('meldungen.paketerstellung.typen-datei-id', { wo })] : [];
  }
  if (Array.isArray(v)) {
    if (v.length > TYPEN_DATEI_LISTE_MAX) return [t('meldungen.paketerstellung.typen-datei-liste', { wo, max: TYPEN_DATEI_LISTE_MAX })];
    return v.flatMap((x, i) => grenzenFehler(x, `${wo}[${i + 1}]`, tiefe + 1));
  }
  if (istObjekt(v))
    return Object.entries(v).flatMap(([k, x]) => [
      ...(ID.test(k) ? [t('meldungen.paketerstellung.typen-datei-id', { wo })] : []),
      ...grenzenFehler(x, `${wo}.${k}`, tiefe + 1),
    ]);
  return [];
}

/** Aufbau: nur bekannte Angaben an Typ, Feld und Register; Anzahl der Typen, Felder und Register. */
function aufbauFehler(roh: Record<string, unknown>): string[] {
  const fehler = fremdeAngaben(roh, OBEN, t('meldungen.paketerstellung.typen-datei-wo'));
  if (roh.format !== TYPEN_DATEI_FORMAT || roh.version !== TYPEN_DATEI_VERSION)
    return [...fehler, t('meldungen.paketerstellung.typen-datei-format', { format: TYPEN_DATEI_FORMAT, version: TYPEN_DATEI_VERSION })];
  const typen = roh.mappentypen;
  if (!Array.isArray(typen) || !typen.length || typen.length > TYPEN_DATEI_TYPEN_MAX || !typen.every(istObjekt))
    return [...fehler, t('meldungen.paketerstellung.typen-datei-typen', { max: TYPEN_DATEI_TYPEN_MAX })];
  typen.forEach((x, i) => {
    const wo = `mappentypen[${i + 1}]`;
    fehler.push(...fremdeAngaben(x, TYP, wo));
    const felder = Array.isArray(x.felder) ? x.felder : [];
    const register = Array.isArray(x.register) ? x.register : [];
    if (felder.length > TYPEN_DATEI_FELDER_MAX || register.length > TYPEN_DATEI_REGISTER_MAX)
      fehler.push(
        t('meldungen.paketerstellung.typen-datei-viele', { wo, felder: TYPEN_DATEI_FELDER_MAX, register: TYPEN_DATEI_REGISTER_MAX }),
      );
    felder.forEach((f, j) => istObjekt(f) && fehler.push(...fremdeAngaben(f, FELD, `${wo}.felder[${j + 1}]`)));
    register.forEach((r, j) => istObjekt(r) && fehler.push(...fremdeAngaben(r, REGISTER, `${wo}.register[${j + 1}]`)));
  });
  return fehler;
}

/** Liest die Datei; wirft 422 mit allen Gründen, wenn etwas nicht passt. */
export function liesTypenDatei(text: string): TypenDatei {
  const ungueltig = (gruende: string[]) => new Fachfehler(422, t('meldungen.paketerstellung.typen-datei-ungueltig'), { gruende });
  if (Buffer.byteLength(text, 'utf8') > TYPEN_DATEI_MAX)
    throw ungueltig([t('meldungen.paketerstellung.typen-datei-gross', { kb: TYPEN_DATEI_MAX / KB })]);
  let roh: unknown;
  try {
    roh = JSON.parse(text);
  } catch {
    throw ungueltig([t('meldungen.paketerstellung.typen-datei-json')]);
  }
  if (!istObjekt(roh)) throw ungueltig([t('meldungen.paketerstellung.typen-datei-json')]);
  const fehler = [...aufbauFehler(roh), ...grenzenFehler(roh, t('meldungen.paketerstellung.typen-datei-wo'))];
  if (fehler.length) throw ungueltig(fehler);
  // Derselbe Prüfer wie für Pakete: Feldarten, Ziele, Tabellen, Anzeige-Bedingungen, Archivmodus, Prüfmuster …
  const l = neuerLeseLauf(new Map([['mappentypen.json', Buffer.from(JSON.stringify(roh.mappentypen), 'utf8')]]), fehler, {
    inhalt: { mappentypen: 'mappentypen.json' },
  });
  const typen = liesTypen(l);
  pruefeKennungen(l, typen, []);
  if (fehler.length) throw ungueltig(fehler);
  return { ablago: str(roh.ablago), erstellt: str(roh.erstellt), typen };
}
