import type { Einstellungen } from './einstellungen';
import { Fachfehler } from './fehler';
import { protokoll } from './protokoll';
import { t } from './sprache';
import { MELDUNG_SCHLUESSEL, pruefeAkzeptanz, type Akzeptiert, type Schwere } from '../../shared/src/meldungen';

/**
 * Bewusst akzeptierte Meldungen der Werkbank-Übersicht (#816): je Meldung, wer sie wann mit welcher Begründung zur
 * Kenntnis genommen hat. Gespeichert in der Einstellung `uebersicht_akzeptiert`, jede Änderung steht im Protokoll
 * (Modul werkbank). Rote Meldungen lassen sich nicht akzeptieren.
 */
const SCHLUESSEL = 'uebersicht_akzeptiert';
const log = protokoll.modul('werkbank');

export async function akzeptierteMeldungen(e?: Einstellungen): Promise<Akzeptiert> {
  const w = e ? await e.lies(SCHLUESSEL) : null;
  return w && typeof w === 'object' && !Array.isArray(w) ? (w as Akzeptiert) : {};
}

export async function meldungAkzeptieren(
  e: Einstellungen | undefined,
  eingabe: Record<string, unknown>,
  von: string,
  jetzt = new Date(),
): Promise<Akzeptiert> {
  if (!e) throw new Fachfehler(500, t('werkbank.uebersicht.akzeptiert.ohne-speicher'));
  const fehler = pruefeAkzeptanz(eingabe);
  if (fehler)
    throw new Fachfehler(
      400,
      t(
        fehler === 'rot'
          ? 'werkbank.uebersicht.akzeptiert.rot'
          : fehler === 'grund'
            ? 'werkbank.uebersicht.akzeptiert.grund-lang'
            : 'werkbank.uebersicht.akzeptiert.ungueltig',
      ),
    );
  const schluessel = eingabe.schluessel as string;
  const art = eingabe.art as Schwere;
  const grund = typeof eingabe.grund === 'string' && eingabe.grund.trim() ? eingabe.grund.trim() : undefined;
  const alle = await akzeptierteMeldungen(e);
  alle[schluessel] = { art, von, am: jetzt.toISOString(), ...(grund ? { grund } : {}) };
  await e.schreibe(SCHLUESSEL, alle);
  log.info('Meldung der Übersicht bewusst akzeptiert', { meldung: schluessel, art, von, ...(grund ? { grund } : {}) });
  return alle;
}

/**
 * Akzeptanz aufheben: von Hand wieder einblenden (`eingeblendet`), oder die Übersicht meldet, dass die Meldung
 * behoben ist (`erledigt`) bzw. schwerer wurde (`schwerer`). Unbekannte Schlüssel übergeht sie.
 */
export async function akzeptanzAufheben(e: Einstellungen | undefined, eingabe: Record<string, unknown>, von: string): Promise<Akzeptiert> {
  if (!e) throw new Fachfehler(500, t('werkbank.uebersicht.akzeptiert.ohne-speicher'));
  const liste = Array.isArray(eingabe.schluessel) ? eingabe.schluessel : [eingabe.schluessel];
  const anlass = eingabe.anlass === 'erledigt' || eingabe.anlass === 'schwerer' ? eingabe.anlass : 'eingeblendet';
  if (!liste.length || liste.length > 200 || liste.some((k) => typeof k !== 'string' || !MELDUNG_SCHLUESSEL.test(k)))
    throw new Fachfehler(400, t('werkbank.uebersicht.akzeptiert.ungueltig'));
  const alle = await akzeptierteMeldungen(e);
  const weg = (liste as string[]).filter((k) => k in alle);
  if (!weg.length) return alle;
  for (const k of weg) {
    log.info(
      anlass === 'eingeblendet'
        ? 'Akzeptierte Meldung wieder eingeblendet'
        : anlass === 'erledigt'
          ? 'Akzeptierte Meldung ist behoben, Akzeptanz aufgehoben'
          : 'Akzeptierte Meldung ist schwerer geworden, Akzeptanz aufgehoben',
      { meldung: k, von, akzeptiertVon: alle[k].von, akzeptiertAm: alle[k].am },
    );
    delete alle[k];
  }
  await e.schreibe(SCHLUESSEL, Object.keys(alle).length ? alle : null);
  return alle;
}
