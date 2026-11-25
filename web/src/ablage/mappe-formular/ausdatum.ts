import { feldLabel } from '../../../../shared/src/beschriftung';
import { istLeer, type Feld as FeldDef } from '../../../../shared/src/model';
import { mappenApi } from '../../api/mappen';
import { t } from '../../sprache';
import { ausRoh, zuRoh, type Roh } from '../../werte';
import type { Kern } from './kern';
import { gleichRoh, leerRoh } from './werte';

type Antwort = Awaited<ReturnType<typeof mappenApi.folgen>>['felder'][string] | undefined;

/**
 * Verweisfeld aus einem Datum ableiten (#1648) nach einer Eingabe im Datumsfeld `k`: z. B. „Bis“ geändert → Steuerjahr.
 * Nur solange das Verweisfeld leer ist oder noch den abgeleiteten Vorschlag zeigt – von Hand Gesetztes bleibt. Genau eine
 * passende Mappe: als „Vorschlag“ mit „Zurücknehmen“ eingetragen. Keine: „… anlegen“ angeboten (wie bei „Aus Dokument
 * ausfüllen“), nichts geschieht ohne Klick. Ein veralteter Vorschlag fällt weg, wenn das Datum nicht mehr passt.
 */
export function ableitenWeg(z: Kern) {
  const { typ } = z.p;
  /** Noch frei: leer oder ein unveränderter Vorschlag – sonst von Hand gesetzt. */
  const frei = (f: FeldDef) => {
    const s = z.vorschlaege[f.key];
    const jetzt = z.rohRef.current[f.key];
    return istLeer(ausRoh(f, jetzt)) || (s?.art === 'eingetragen' && gleichRoh(jetzt, zuRoh(f, s.wert)));
  };
  const ohne = <T>(x: Record<string, T>, k: string) => Object.fromEntries(Object.entries(x).filter(([y]) => y !== k));
  /** Die passende Mappe als Vorschlag eintragen. */
  function eintragen(f: FeldDef, e: NonNullable<Antwort> & { wert: string }, fundstelle: string) {
    const vorher = z.vorschlaege[f.key]?.vorher ?? z.rohRef.current[f.key] ?? leerRoh(typ, f.key);
    const neu: Roh = f.mehrfach ? [e.wert] : e.wert;
    z.merke(e.wert, { titel: e.titel ?? '', typId: e.typId ?? '' });
    z.setRoh((x) => ({ ...x, [f.key]: neu }));
    z.setVorschlaege((x) => ({ ...x, [f.key]: { wert: neu, sicherheit: 'mittel', fundstelle, art: 'eingetragen', vorher } }));
    z.setAdNeu((x) => ohne(x, f.key));
    z.oeffneAbschnitte([f.key]);
  }
  /** Keine passende Mappe: den eigenen, unveränderten Vorschlag zurücknehmen und „anlegen“ anbieten, wenn es geht. */
  function anbieten(f: FeldDef, e: Antwort, fundstelle: string) {
    const s = z.vorschlaege[f.key];
    if (s?.art === 'eingetragen' && gleichRoh(z.rohRef.current[f.key], zuRoh(f, s.wert))) {
      z.setRoh((x) => ({ ...x, [f.key]: s.vorher ?? leerRoh(typ, f.key) }));
      z.setVorschlaege((x) => ohne(x, f.key));
    }
    const n = e?.neu;
    z.setAdNeu((x) => (n ? { ...ohne(x, f.key), [f.key]: { ...n, fundstelle } } : ohne(x, f.key)));
  }
  return async function leiteAb(k: string, v: Roh) {
    const d = typ.felder.find((x) => x.key === k);
    if (!d || d.typ !== 'datum' || z.nurLesen) return;
    const offen = typ.felder.filter(
      (x) =>
        x.typ === 'referenz' && x.ausDatum?.datumFeld === k && z.geschuetzt[x.key] === undefined && !z.ausgeblendet.has(x.key) && frei(x),
    );
    if (!offen.length) return;
    const iso = ausRoh(d, v);
    const r = typeof iso === 'string' && iso ? await mappenApi.folgen(typ.id, { [k]: iso }).catch(() => null) : null;
    // Antwort zu spät (das Datum hat sich inzwischen geändert): nichts.
    if (!gleichRoh(z.rohRef.current[k], v)) return;
    const fundstelle = t('ablage.ausdatum.fundstelle', { feld: feldLabel(d), jahr: String(iso).slice(0, 4) });
    for (const f of offen) {
      const e = r?.felder[f.key];
      if (e?.wert) eintragen(f, { ...e, wert: e.wert }, fundstelle);
      else anbieten(f, e, fundstelle);
    }
  };
}
