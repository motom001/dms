/** Sichten (#1278 aus sichten.ts): Felder, die eine Sicht für Bedingungen anbietet, und Prüfung einer Bedingung. */
import {
  type Operator,
  OPERATOREN_JE_ART,
  type Feldart,
  type Bedingung,
  OPERATOREN,
  DYNAMISCH,
  zeitraumWert,
  FRIST_TAGE_MAX,
} from './bedingungen';
import { zieleVon, jedeMappe, gleicheZiele, zielErlaubt } from '../verweisziele';
import { type Feld, SYSTEMSPALTEN, type Mappentyp } from '../model/basis';
import { t } from '../texte';
import { feldLabel } from '../beschriftung';
import { istMerkmal } from '../merkmale';

/**
 * Datumsfelder mit Erinnerung (#129) – gleich wie fristFelder in fristen.ts, hier ohne Kreisimport. Bis #1278 (Schritt 5)
 * in bedingungen.ts; die nennt den Mappentyp nicht mehr, weil das Feld ihre Bedingungen trägt.
 */
export const mitFrist = (t: Pick<Mappentyp, 'felder'>) => t.felder.filter((f) => f.typ === 'datum' && f.frist);

/** Operatoren für ein Feld: „zeigt auf Mappe vom Typ …“ nur bei Verweisen mit mehreren Zieltypen (#1036). */
export const operatorenFuer = (f: Pick<Bedingungsfeld, 'art' | 'feld'>): Operator[] =>
  OPERATOREN_JE_ART[f.art].filter((o) => o !== 'zeigtAufTyp' || (!!f.feld && zieleVon(f.feld).length > 1));

/* ---------- Felder, die eine Sicht für Bedingungen anbietet ---------- */

export interface Bedingungsfeld {
  key: string;
  label: string;
  art: Feldart;
  feld?: Feld;
}

const SYSTEMFELDER: Bedingungsfeld[] = [
  { key: '_erstellt', label: SYSTEMSPALTEN._erstellt, art: 'zeit' },
  { key: '_geaendert', label: SYSTEMSPALTEN._geaendert, art: 'zeit' },
  { key: '_erstelltVon', label: SYSTEMSPALTEN._erstelltVon, art: 'person' },
  { key: '_geaendertVon', label: SYSTEMSPALTEN._geaendertVon, art: 'person' },
];

/**
 * Felder für Bedingungen: bei einem Mappentyp alle seine Felder; bei mehreren nur Felder mit
 * gleichem Schlüssel und gleichem Datentyp in allen Typen (bei Referenzen auch gleichem Ziel).
 * Systemwerte gibt es immer.
 */
export function bedingungsfelder(typen: Array<Pick<Mappentyp, 'felder'>>): Bedingungsfeld[] {
  if (!typen.length) return SYSTEMFELDER;
  const [erster, ...rest] = typen;
  // Passwörter und Tabellen (#1030, ohne Wert) taugen nicht für Bedingungen.
  const gemeinsam = erster.felder.filter(
    (f) =>
      f.typ !== 'passwort' &&
      f.typ !== 'tabelle' &&
      !jedeMappe(f) &&
      rest.every((t) => t.felder.some((g) => g.key === f.key && g.typ === f.typ && (f.typ !== 'referenz' || gleicheZiele(g, f)))),
  );
  return [...gemeinsam.map((f) => ({ key: f.key, label: feldLabel(f), art: f.typ as Feldart, feld: f })), ...SYSTEMFELDER];
}

/** Warum eine Bedingung nicht (mehr) passt – z. B. weil ihr Feld entfernt wurde. null = in Ordnung. */
export function bedingungsProblem(b: Bedingung, typen: Mappentyp[]): string | null {
  if (b.art === 'feld') {
    const f = bedingungsfelder(typen).find((x) => x.key === b.feld);
    if (!f)
      return t('gemeinsam.sichten.das-feld-gibt-es', {
        feld: b.feld,
        wert: typen.length > 1 ? t('gemeinsam.sichten.nicht-in-allen-mappentypen') : t('gemeinsam.sichten.nicht-mehr'),
      });
    // Optionale Ziele (#1122): Mit `zielOptional` geht „zeigt auf Mappe vom Typ …“ auch, solange erst ein Zieltyp da ist.
    if (!operatorenFuer(f).includes(b.op) && !(b.op === 'zeigtAufTyp' && !!f.feld?.zielOptional?.length))
      return t('gemeinsam.sichten.passt-nicht-zum-feld', { wert: OPERATOREN[b.op] ?? b.op, label: f.label });
    const brauchtWert = !['leer', 'nichtLeer', 'ja', 'nein'].includes(b.op);
    if (brauchtWert && !b.wert) return t('gemeinsam.sichten.bei-fehlt-der-vergleichswert', { label: f.label });
    if ((b.op === 'zwischen' || b.op === 'ausserhalb') && !b.bis) return t('gemeinsam.sichten.bei-fehlt-der-zweite', { label: f.label });
    if (b.op === 'imZeitraum' && b.wert?.art !== 'jahr' && b.wert?.art !== 'monat') return t('gemeinsam.sichten.im-zeitraum-braucht-jahr');
    if (b.wert && (b.wert.art === 'jahr' || b.wert.art === 'monat') && b.op !== 'imZeitraum')
      return t('gemeinsam.sichten.jahr-und-monat-gehen');
    if (b.wert && (b.wert.art === 'ich' || b.wert.art === 'meineRollen') && b.op !== 'zeigtAuf')
      return t('gemeinsam.sichten.geht-nur-mit-zeigt', { DYNAMISCH: DYNAMISCH[b.wert.art] });
    if (b.wert?.art === 'heute' && f.art !== 'datum' && f.art !== 'zeit') return t('gemeinsam.sichten.heute-geht-nur-bei');
    if (f.art === 'zeitraum' && [b.wert, b.bis].some((w) => w?.art === 'fest' && Number.isNaN(zeitraumWert(w.wert))))
      return t('gemeinsam.feldarten.bedingung-zeitraum', { label: f.label });
    if (b.wert?.art === 'eigenesFeld' || b.bis?.art === 'eigenesFeld') return t('gemeinsam.sichten.werte-aus-der-eigenen');
    if (b.op === 'zeigtAuf' && b.wert?.art === 'meineRollen' && f.art === 'person')
      return t('gemeinsam.sichten.rollen-des-aktuellen-benutzers-2', { label: f.label });
    // „zeigt auf Mappe vom Typ …“ (#1036): fest gewählte Zieltypen des Felds.
    if (b.op === 'zeigtAufTyp') {
      const w = b.wert?.art === 'fest' && Array.isArray(b.wert.wert) ? b.wert.wert : null;
      if (!w?.length) return t('gemeinsam.sichten.typ-waehlen', { label: f.label });
      // Optionales Ziel, dessen Paket fehlt (#1122): Die Kennung passt zu keiner Mappe – erlaubt, trifft nie zu.
      if (w.some((x) => !zielErlaubt(f.feld!, x) && !(typeof x === 'string' && x.includes(':') && f.feld!.zielOptional?.includes(x))))
        return t('gemeinsam.sichten.typ-kein-ziel', { label: f.label });
    }
    return null;
  }
  if (b.art === 'favorit') return null;
  if (b.art === 'merkmal') return istMerkmal(b.merkmal) ? null : t('gemeinsam.merkmale.unbekannt', { merkmal: String(b.merkmal) });
  if (b.art === 'frist') {
    if (!Number.isInteger(b.tage) || b.tage < 0 || b.tage > FRIST_TAGE_MAX)
      return t('gemeinsam.sichten.die-anzahl-tage-muss', { FRIST_TAGE_MAX });
    if (!typen.length) return t('gemeinsam.sichten.fristen-brauchen-mindestens-einen');
    if (b.feld) {
      if (typen.some((t) => t.felder.find((f) => f.key === b.feld)?.typ !== 'datum'))
        return t('gemeinsam.sichten.das-datumsfeld-gibt-es', {
          feld: b.feld,
          wert: typen.length > 1 ? t('gemeinsam.sichten.nicht-in-allen-mappentypen') : t('gemeinsam.sichten.nicht-mehr'),
        });
      return null;
    }
    if (!typen.some((t) => mitFrist(t).length)) return t('gemeinsam.sichten.keiner-der-mappentypen-hat');
    return null;
  }
  if (!Number.isInteger(b.anzahl) || b.anzahl < 0) return t('gemeinsam.sichten.die-anzahl-muss-eine');
  if (b.art === 'dokumenteGesamt' || b.art === 'verknuepfungenGesamt') return null;
  if (!typen.length) return t('gemeinsam.sichten.bedingungen-auf-register-brauchen');
  // Bei mehreren Typen: gleicher Schlüssel und gleiche Art in allen (#66).
  const art = b.art === 'dokumente' ? 'dokumente' : 'verknuepfungen';
  if (typen.some((t) => t.register.find((x) => x.key === b.register)?.art !== art)) {
    const wert = typen.length > 1 ? t('gemeinsam.sichten.nicht-in-allen-mappentypen') : t('gemeinsam.sichten.nicht-mehr');
    return art === 'dokumente'
      ? t('gemeinsam.sichten.dokumentenregister-gibt-es', { register: b.register, wert })
      : t('gemeinsam.sichten.verknuepfungsregister-gibt-es', { register: b.register, wert });
  }
  return null;
}
