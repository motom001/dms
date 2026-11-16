/**
 * Sammeldatei (#461): Verzeichnis lesen und prüfen; Typen der Pakete darin.
 */
import { type HerkunftPruefung, PAKET_ID, VERSION, type Ergaenzung } from '../../../../shared/src/pakete';
import { Fachfehler } from '../../grundlagen/fehler';
import { t } from '../../sprache/sprache';
import { ARCHIV_MAX, KLEIN_MAX, SAMMEL_MAX, SAMMEL_VERZEICHNIS_MAX as VERZEICHNIS_MAX } from '../../grundlagen/grenzen';
import { istObjekt, str } from './format';
import { type Vorschau } from './plan';

export { KLEIN_MAX };

/**
 * Sammeldatei: ein ZIP mit dem Verzeichnis sammeldatei.json und den Paket-Archiven unter pakete/<id>-<version>.zip
 * (unverändert aus dem Katalog), optional LIESMICH.txt. Format: dms-registry, schema/sammeldatei.schema.json.
 */
export const SAMMEL_VERZEICHNIS = 'sammeldatei.json';

export const SAMMEL_LIESMICH = 'LIESMICH.txt';

export { SAMMEL_MAX };

export const SAMMEL_PAKETE_MAX = 50;

export interface SammelEintrag {
  id: string;
  version: string;
  name: string;
  archiv: string;
  sha256: string;
  groesse: number;
  gewaehlt: boolean;
}

export interface SammelVerzeichnis {
  format: 1;
  erstellt: string;
  quelle: string;
  katalog: string;
  dms: string | null;
  pakete: SammelEintrag[];
}

/** Prüft sammeldatei.json; wirft mit allen Fehlern auf einmal. */
export function liesSammelVerzeichnis(roh: Buffer | undefined): SammelVerzeichnis {
  const ungueltig = (gruende: string[]) => new Fachfehler(422, t('meldungen.pakete.das-ist-keine-gueltige'), { gruende });
  if (!roh) throw ungueltig([`${SAMMEL_VERZEICHNIS} fehlt.`]);
  if (roh.length > VERZEICHNIS_MAX) throw ungueltig([t('meldungen.pakete.ist-zu-gross', { SAMMEL_VERZEICHNIS })]);
  let j: unknown;
  try {
    j = JSON.parse(roh.toString('utf8'));
  } catch {
    throw ungueltig([t('meldungen.pakete.ist-kein-gueltiges-json', { SAMMEL_VERZEICHNIS })]);
  }
  if (!istObjekt(j)) throw ungueltig([t('meldungen.pakete.ist-leer', { SAMMEL_VERZEICHNIS })]);
  const fehler: string[] = [];
  if (j.art !== 'dms-sammeldatei') fehler.push(`${SAMMEL_VERZEICHNIS}: „art“ muss „dms-sammeldatei“ sein.`);
  if (j.format !== 1) fehler.push(t('meldungen.pakete.sammeldatei-format-kennt-diese', { wert: str(j.format) || '–' }));
  const liste = Array.isArray(j.pakete) ? j.pakete : [];
  if (!liste.length) fehler.push(t('meldungen.pakete.die-sammeldatei-enthaelt-keine'));
  if (liste.length > SAMMEL_PAKETE_MAX) fehler.push(t('meldungen.pakete.die-sammeldatei-enthaelt-mehr', { SAMMEL_PAKETE_MAX }));
  const pakete: SammelEintrag[] = [];
  for (const [i, x] of liste.slice(0, SAMMEL_PAKETE_MAX).entries()) {
    const wo = `pakete[${i + 1}]`;
    if (!istObjekt(x)) {
      fehler.push(`${wo}: kein Eintrag.`);
      continue;
    }
    const id = str(x.id),
      version = str(x.version);
    if (!PAKET_ID.test(id)) {
      fehler.push(`${wo}: ungültige Id.`);
      continue;
    }
    if (!VERSION.test(version)) {
      fehler.push(`${wo}: ungültige Version.`);
      continue;
    }
    if (x.archiv !== `pakete/${id}-${version}.zip`) fehler.push(`${wo}: Archiv muss pakete/${id}-${version}.zip heißen.`);
    if (!/^[0-9a-f]{64}$/.test(str(x.sha256))) fehler.push(`${wo}: ungültige Prüfsumme (sha256).`);
    if (!Number.isInteger(x.groesse) || (x.groesse as number) <= 0 || (x.groesse as number) > ARCHIV_MAX)
      fehler.push(`${wo}: ungültige Größe.`);
    if (pakete.some((p) => p.id === id)) fehler.push(`${wo}: „${id}“ steht zweimal in der Sammeldatei.`);
    pakete.push({
      id,
      version,
      name: str(x.name).trim().slice(0, 100) || id,
      archiv: `pakete/${id}-${version}.zip`,
      sha256: str(x.sha256),
      groesse: Number(x.groesse),
      gewaehlt: x.gewaehlt !== false,
    });
  }
  if (fehler.length) throw ungueltig(fehler);
  return { format: 1, erstellt: str(j.erstellt), quelle: str(j.quelle), katalog: str(j.katalog), dms: j.dms ? str(j.dms) : null, pakete };
}

/** Ein Paket der Sammeldatei, geprüft und zum Installieren bereit (Upload-Kennung wie beim einzelnen Hochladen). */
export interface SammelPaket {
  upload: string;
  id: string;
  name: string;
  version: string;
  gewaehlt: boolean;
  abhaengigkeiten: Record<string, string>;
  /** Ergänzt ein anderes Paket (#405), aus dem Manifest. */
  ergaenzt?: Ergaenzung;
  /** Prüfsumme gegen den offiziellen Katalog (abgerufen oder signiert in der Sammeldatei): gleich, oder unbekannt. */
  katalog: 'gleich' | 'unbekannt';
  /** Gegenüber dem installierten Paket. */
  stand: 'neu' | 'neuer' | 'gleich' | 'aelter';
  installiert: string | null;
  vorschau: Vorschau;
}

export interface Sammeldatei {
  datei: {
    sha256: string;
    groesse: number;
    erstellt: string;
    quelle: string;
    katalog: string;
    dms: string | null;
    /** Herkunft (#594): mit gültig signiertem offiziellem Katalog in der Datei keine Bestätigung nötig. */
    pruefung: HerkunftPruefung;
    /** Pakete, die nicht im signierten Katalog der Sammeldatei stehen (für sie bleibt die Bestätigung). */
    nichtImKatalog: string[];
  };
  /** In der Reihenfolge zum Installieren: Abhängigkeiten zuerst. */
  pakete: SammelPaket[];
}

/** Der Katalog mit Signatur in einer Sammeldatei (motom001/dms-registry#74). */
export const SAMMEL_KATALOG = 'katalog.json';
