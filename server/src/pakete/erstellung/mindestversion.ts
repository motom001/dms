/**
 * Mindestversion des DMS für ein selbst erstelltes Paket (#374): welche Funktion ab welcher Version.
 */
import { BEISPIEL_DOKUMENTE_AB, DMS_WORTLISTEN_AB, VERSION, vergleicheVersion } from '../../../../shared/src/pakete';
import { type PaketEntwurf, type PaketErstellenEingabe } from '../../../../shared/src/paketerstellung';
import { t } from '../../sprache';
import { DMS_VERWEISE_AB, FREMDE_TYPEN_AB } from '../verwaltung/format';
import { DMS_TABELLE_AB } from '../../../../shared/src/tabelle';
import { DMS_VORBELEGEN_AB } from '../../../../shared/src/vorbelegen';
import { DMS_TEILE_AB } from '../../../../shared/src/teile';
import { DMS_ARCHIV_PAKET_AB } from '../../../../shared/src/archiv';
import { DMS_ZUSAMMENGESETZT_AB } from '../../../../shared/src/zusammengesetzt';
import { DMS_VORGABEN_AB } from '../../../../shared/src/vorgaben';
import { DMS_ORGANISATION_AB } from '../../../../shared/src/organisation';

/**
 * Ab dieser Version kennt Ablago die Feldarten Zeitraum und Prozent und negative Beträge (#1035). Beim Einreihen auf die
 * Version setzen, mit der sie erscheinen.
 */
export const FELDARTEN_AB = '0.227.0';

/** Ab dieser Version verstehen DMS Verweise zwischen Beispielen (#347). */
const BEISPIELVERWEISE_AB = '0.79.0';

/**
 * Mindestversion von Ablago (#651): Grundlage ist die Version, mit der „Paket erstellen“ kam; jede benutzte
 * Funktion kann sie anheben. Neue Funktionen im Paketformat bitte hier eintragen (Entwicklerhandbuch → Pakete).
 */
export const MINDEST_GRUNDLAGE = '0.86.0';

export const MINDEST_FUNKTIONEN = {
  dmsVerweise: { ab: DMS_VERWEISE_AB, grund: t('meldungen.paketerstellung.verweise-auf-mappentypen-von') },
  beispielVerweise: { ab: BEISPIELVERWEISE_AB, grund: t('meldungen.paketerstellung.verweise-zwischen-beispielen') },
  erkennung: { ab: '0.113.0', grund: t('meldungen.paketerstellung.erkennung-an-feldern-aus') },
  feldformate: { ab: '0.121.0', grund: t('meldungen.paketerstellung.feldformate-und-datumsgrenzen') },
  feldarten: { ab: FELDARTEN_AB, grund: t('meldungen.paketerstellung.feldarten') },
  tabelle: { ab: DMS_TABELLE_AB, grund: t('meldungen.paketerstellung.tabelle') },
  vorbelegen: { ab: DMS_VORBELEGEN_AB, grund: t('meldungen.paketerstellung.vorbelegen') },
  teile: { ab: DMS_TEILE_AB, grund: t('meldungen.paketerstellung.teile') },
  zusammengesetzt: { ab: DMS_ZUSAMMENGESETZT_AB, grund: t('meldungen.paketerstellung.zusammengesetzt') },
  vorgaben: { ab: DMS_VORGABEN_AB, grund: t('meldungen.paketerstellung.vorgaben') },
  archiv: { ab: DMS_ARCHIV_PAKET_AB, grund: t('meldungen.paketerstellung.archiv') },
  organisation: { ab: DMS_ORGANISATION_AB, grund: t('meldungen.paketerstellung.organisation') },
  wortlisten: { ab: DMS_WORTLISTEN_AB, grund: t('meldungen.paketerstellung.wortlisten') },
  fremdeTypen: { ab: FREMDE_TYPEN_AB, grund: t('meldungen.paketerstellung.ansichten-mit-mappentypen-die') },
  beispielDokumente: { ab: BEISPIEL_DOKUMENTE_AB, grund: t('meldungen.paketerstellung.beispiel-dokumente') },
  // Mitgelieferte Automatisierungen mit `eingeschaltet` (#1082, seit 0.233.0) – so liefert „Paket erstellen“ sie (#680).
  automatisierungen: { ab: '0.233.0', grund: t('meldungen.paketerstellung.automatisierungen-version') },
} as const;

export type MindestFunktion = keyof typeof MINDEST_FUNKTIONEN;

/** Minor-Versionen, die es nie gab (übersprungen); erscheinen nicht in der Auswahl. */
const NIE_ERSCHIENEN = new Set(['0.157.0']);

export const DMS_ANGABE = /^>=(\d+)\.(\d+)\.0$/;

/** Mindestversion aus den benutzten Funktionen: höchste Untergrenze und die Gründe dafür. */
export function mindestversion(genutzt: Iterable<MindestFunktion>): { version: string; gruende: string[] } {
  let v = MINDEST_GRUNDLAGE;
  const alle = [...new Set(genutzt)].map((k) => MINDEST_FUNKTIONEN[k]);
  for (const f of alle) if (vergleicheVersion(f.ab, v) > 0) v = f.ab;
  return {
    version: v,
    gruende: alle
      .filter((f) => vergleicheVersion(f.ab, MINDEST_GRUNDLAGE) > 0)
      .sort((a, b) => vergleicheVersion(b.ab, a.ab))
      .map((f) => `${f.grund} (ab ${f.ab})`),
  };
}

/** Wählbare Angaben „>=X.Y.0“ von der Mindestversion bis zur eigenen Version, älteste zuerst. */
export function dmsOptionen(mindest: string, eigene: string): string[] {
  const [ma, mb] = mindest.split('.').map(Number);
  const e = eigene.replace(/^v/, '').split('-')[0];
  if (!VERSION.test(e)) return [`>=${ma}.${mb}.0`];
  const [ea, eb] = e.split('.').map(Number);
  const r: string[] = [];
  const dazu = (a: number, b: number) => {
    const v = `${a}.${b}.0`;
    if (!NIE_ERSCHIENEN.has(v)) r.push(`>=${v}`);
  };
  if (ma === ea) for (let b = mb; b <= eb; b++) dazu(ma, b);
  else if (ma < ea) {
    // Über eine Hauptversion hinweg: die Minor-Versionen der alten kennt Ablago nicht – nur die Mindestversion.
    dazu(ma, mb);
    for (let a = ma + 1; a <= ea; a++) for (let b = 0; b <= (a === ea ? eb : 0); b++) dazu(a, b);
  }
  return r.length ? r : [`>=${ma}.${mb}.0`];
}

/** Höchste Version, die der Empfänger schon haben kann: Entwurf oder hochgeladene letzte Version. */
export function bekannteVersion(e: PaketErstellenEingabe, entwurf: PaketEntwurf | null): string | null {
  const l = [entwurf?.version, e.bekannteVersion?.trim()].filter((v): v is string => !!v && VERSION.test(v)).sort(vergleicheVersion);
  return l.pop() ?? null;
}
