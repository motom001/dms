/**
 * Gemeinsamer Stand beim Lesen eines Pakets (#1278, Schritt 6a-2; vorher Teil von `liesPaket`): Dateien, Fehler,
 * Manifest und was alle Schritte brauchen – dazu das Lesen der YAML-Dateien und die Prüfung der Kopfangaben im Manifest.
 */
import { parse as yamlLesen } from 'yaml';
import { BEREICH, PAKET_ID, VERSION, liesErgaenzt, liesErsetzt, punktIdFehler } from '../../../../shared/src/pakete';
import { istHerausgeber } from '../../../../shared/src/kennungen';
import { Fachfehler } from '../../grundlagen/fehler';
import { t } from '../../sprache/sprache';
import { KB } from '../../grundlagen/grenzen';
import { istObjekt, str } from './format';

/** Stand eines Lesens: Dateien, gesammelte Fehler, Manifest, Id, Abhängigkeiten und Inhaltsangaben. */
export interface LeseLauf {
  dateien: Map<string, Buffer>;
  fehler: string[];
  m: Record<string, unknown>;
  /** Id des Pakets laut Manifest (als Text). */
  id: string;
  abh: Record<string, unknown>;
  inhalt: Record<string, unknown>;
}

/** Ein Ordner davor (z. B. beim selbst gepackten ZIP) stört nicht. */
export function ohneOrdner(roh: Map<string, Buffer>): Map<string, Buffer> {
  let dateien = roh;
  if (!roh.has('manifest.yaml')) {
    const oben = [...roh.keys()].find((n) => /^[^/]+\/manifest\.yaml$/.test(n));
    if (oben) {
      const vor = oben.slice(0, oben.indexOf('/') + 1);
      dateien = new Map([...roh].filter(([n]) => n.startsWith(vor)).map(([n, d]) => [n.slice(vor.length), d]));
    }
  }
  return dateien;
}

/** Eine YAML-Datei des Pakets; fehlt sie oder ist sie kaputt, ein Fehler und undefined. */
function liesYaml(dateien: Map<string, Buffer>, fehler: string[], name: string): unknown {
  const d = dateien.get(name);
  if (!d) {
    fehler.push(t('meldungen.pakete.fehlt-im-paket', { name }));
    return undefined;
  }
  try {
    return yamlLesen(d.toString('utf8'), { maxAliasCount: 50 });
  } catch (e) {
    fehler.push(`${name}: kein gültiges YAML (${(e as Error).message.split('\n')[0]}).`);
    return undefined;
  }
}

/** manifest.yaml als Objekt; ohne lesbares Manifest wirft es sofort mit den bisherigen Gründen. */
export function liesManifest(dateien: Map<string, Buffer>, fehler: string[]): Record<string, unknown> {
  const m = liesYaml(dateien, fehler, 'manifest.yaml');
  if (!istObjekt(m))
    throw new Fachfehler(422, t('meldungen.pakete.das-paket-ist-ungueltig'), {
      gruende: fehler.length ? fehler : [t('meldungen.pakete.manifest-yaml-ist-leer')],
    });
  return m;
}

/** Neuer Lauf zum gelesenen Manifest. */
export function neuerLeseLauf(dateien: Map<string, Buffer>, fehler: string[], m: Record<string, unknown>): LeseLauf {
  return {
    dateien,
    fehler,
    m,
    id: str(m.id),
    abh: istObjekt(m.abhaengigkeiten) ? m.abhaengigkeiten : {},
    inhalt: istObjekt(m.inhalt) ? m.inhalt : {},
  };
}

/** Kopfangaben: Format, Id, Version, Name, Ablago-Version, Abhängigkeiten, Ergänzung, ersetzte Ids und Herausgeber. */
export function pruefeKopf(l: LeseLauf) {
  const { m, abh, fehler } = l;
  if (m.schema !== 1) fehler.push(t('meldungen.pakete.manifest-yaml-format-kennt', { wert: str(m.schema) || '–' }));
  if (!PAKET_ID.test(str(m.id))) fehler.push(t('meldungen.pakete.manifest-yaml-ungueltige-id'));
  if (str(m.id) === 'dms') fehler.push(t('meldungen.pakete.manifest-yaml-die-id'));
  if (!VERSION.test(str(m.version))) fehler.push(t('meldungen.pakete.manifest-yaml-ungueltige-version'));
  if (!str(m.name).trim()) fehler.push(t('meldungen.pakete.manifest-yaml-name-fehlt'));
  if (!BEREICH.test(str(m.dms))) fehler.push(t('meldungen.pakete.manifest-yaml-ungueltige-ablago'));
  for (const [k, v] of Object.entries(abh))
    if (!PAKET_ID.test(k) || !BEREICH.test(str(v))) fehler.push(t('meldungen.pakete.manifest-yaml-abhaengigkeit-ist', { k, str: str(v) }));
  // Ergänzung eines anderen Pakets (#405): steht auch unter abhaengigkeiten.
  const erg = liesErgaenzt(m.ergaenzt, abh);
  fehler.push(...erg.fehler.map((f) => `manifest.yaml: ${f}`));
  // Punkt in der Id (#1084): ergänzt das Hauptpaket – dann muss `ergaenzt` es nennen (die Registry prüft dasselbe).
  const punkt = erg.fehler.length ? null : punktIdFehler(str(m.id), erg.ergaenzt);
  if (punkt) fehler.push(`manifest.yaml: ${punkt}`);
  // Ersetzte Ids (#1084): Umzug statt Neuinstallation.
  const fr = liesErsetzt(m.ersetzt, str(m.id));
  fehler.push(...fr.fehler.map((f) => `manifest.yaml: ${f}`));
  // Herausgeber (#1084): umgedrehte Domain. Fehlt er (ältere Pakete), gilt der Herausgeber des Katalogs (standardHerausgeber).
  if (m.herausgeber !== undefined && !istHerausgeber(m.herausgeber))
    fehler.push(t('meldungen.pakete.manifest-yaml-herausgeber', { wert: str(m.herausgeber) }));
  return { erg, fr };
}

/** Die Liste einer Inhaltsangabe (`inhalt.<art>`); fehlt die Angabe, leer – sonst Fehler, wenn es keine Liste von Objekten ist. */
export function liste(l: LeseLauf, art: string): Record<string, unknown>[] {
  const { inhalt, fehler } = l;
  if (!inhalt[art]) return [];
  const v = liesYaml(l.dateien, fehler, str(inhalt[art]).replace(/^\.\//, ''));
  if (v == null) return [];
  if (!Array.isArray(v) || !v.every(istObjekt)) {
    fehler.push(`${str(inhalt[art])}: erwartet eine Liste.`);
    return [];
  }
  return v;
}

/**
 * Eine Inhaltsangabe, die ein einzelnes Objekt ist (`inhalt.region`, #1696); fehlt die Angabe, undefined. Zu große
 * Dateien und alles außer einem Objekt sind Fehler.
 */
export function objekt(l: LeseLauf, art: string, max: number): Record<string, unknown> | undefined {
  const { inhalt, fehler } = l;
  if (!inhalt[art]) return undefined;
  const name = str(inhalt[art]).replace(/^\.\//, '');
  if ((l.dateien.get(name)?.length ?? 0) > max) {
    fehler.push(t('meldungen.pakete.datei-zu-gross', { name, kb: Math.round(max / KB) }));
    return undefined;
  }
  const v = liesYaml(l.dateien, fehler, name);
  if (v == null) return undefined;
  if (!istObjekt(v)) {
    fehler.push(t('meldungen.pakete.erwartet-objekt', { name }));
    return undefined;
  }
  return v;
}
