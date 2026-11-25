/**
 * Dann-Karte „Feld in verknüpfter Mappe setzen“ (#1557): setzt Felder der Mappe(n), auf die das Verweisfeld `ueber` der
 * auslösenden Mappe zeigt – bei `mehrfach` jede. Modell, Prüfung und `nurWenn` stehen in
 * `shared/src/automatisierung-verknuepft.ts`.
 *
 * - **Rechte:** Gelesen und geschrieben wird mit dem Zugriff, unter dem die Automatisierung läuft (`c.z`), über
 *   denselben Weg wie das Formular (`aendereMappe`): Feldformate, Pflicht, Auswahllisten, Verweisziele, berechnete und
 *   geschützte Felder, Archivmodus und Fristsperre gelten wie bei „Feld ändern“. Darf die Automatisierung eine
 *   Zielmappe nicht ändern (oder nicht sehen), bleibt sie unverändert; der Lauf vermerkt es ohne Fehler und ohne ihren
 *   Titel zu nennen.
 * - **Historie** der Zielmappe: „durch Automatisierung ‚…‘“ wie bei „Feld ändern“ (`c.anlass`).
 * - Ist das Verweisfeld leer, hat die Karte nichts zu tun (übersprungen).
 */
import { feldLabel } from '../../../shared/src/beschriftung';
import {
  einzelnerPlatzhalter,
  nurWennErfuellt,
  setzbar,
  verknuepfteTypen,
  verknuepftProbleme,
  type DannKarte,
} from '../../../shared/src/automatisierung';
import { formatiere, type Feld, type Mappe, type Mappentyp } from '../../../shared/src/model';
import { heuteIn, verschiebe } from '../../../shared/src/sichten';
import { uebersetzer } from '../../../shared/src/sprache';
import texte from '../../../shared/src/sprachen/de/automatisierung.json';
import { DANN_AUSFUEHRER, KarteLeer, type KartenKontext } from './';
import { Fachfehler } from '../grundlagen/fehler';
import { istUuid } from '../repo';
import { t } from '../sprache/sprache';

const t2 = uebersetzer({ automatisierung: texte });

/**
 * Wert für ein Feld der Zielmappe: Ein einzelner Platzhalter `{feld}` übernimmt den gespeicherten Wert desselben
 * Felds der auslösenden Mappe, wenn die Feldarten gleich sind (Datum bleibt Datum); sonst wie bei „Feld ändern“.
 */
async function wertFuer(f: Feld, roh: unknown, c: KartenKontext): Promise<unknown> {
  const q = einzelnerPlatzhalter(roh);
  const qf = q ? c.typ?.felder.find((x) => x.key === q) : undefined;
  if (qf && qf.typ !== 'passwort' && qf.typ === f.typ) return c.mappe?.werte[qf.key] ?? null;
  if (typeof roh !== 'string') return roh;
  if (f.typ === 'datum') {
    const m = /^heute\s*([+-])\s*(\d{1,4})$/.exec(roh.trim()) ?? (roh.trim() === 'heute' ? ['', '+', '0'] : null);
    return m ? verschiebe(heuteIn(), (m[1] === '-' ? -1 : 1) * Number(m[2])) : roh;
  }
  if (f.typ === 'text' || f.typ === 'langtext' || f.typ === 'formatiert') return c.fuelle(roh);
  return roh;
}

const gleich = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
/** Fehlt das Recht (403) oder sieht die Automatisierung die Mappe nicht (404)? */
const ohneRecht = (e: unknown) => e instanceof Fachfehler && (e.status === 403 || e.status === 404);

/** Was in einer Zielmappe zu setzen ist und was nach `nurWenn` bleibt. */
async function werteFuer(k: Extract<DannKarte, { art: 'feld_verknuepft' }>, ziel: Mappe, zt: Mappentyp, c: KartenKontext) {
  const werte: Record<string, unknown> = {};
  const bleibt: string[] = [];
  for (const [key, roh] of Object.entries(k.werte)) {
    const f = zt.felder.find((x) => x.key === key);
    if (!f || !setzbar(f)) continue;
    const neu = await wertFuer(f, roh, c);
    if (gleich(neu, ziel.werte[key])) continue;
    if (nurWennErfuellt(k.nurWenn, f, ziel.werte[key], neu)) werte[key] = neu;
    else bleibt.push(feldLabel(f));
  }
  const zeile = Object.entries(werte)
    .map(([key, v]) => {
      const f = zt.felder.find((x) => x.key === key)!;
      return `${feldLabel(f)} = ${formatiere(f, v as never) || '–'}`;
    })
    .join(', ');
  return { werte, bleibt, zeile };
}

type Karte = Extract<DannKarte, { art: 'feld_verknuepft' }>;

/** Eine verknüpfte Mappe: Zeile fürs Protokoll, oder null, wenn die Automatisierung sie nicht ändern darf. */
async function setzeIn(k: Karte, id: string, ziele: Mappentyp[], c: KartenKontext): Promise<string | null> {
  let ziel: Mappe;
  try {
    // Mit den Rechten der Automatisierung: lesen und ändern dürfen – sonst bleibt die Mappe, wie sie ist.
    ziel = await c.dienst.rechtepruefung.pruefeRecht(c.z, id, 'U');
  } catch (e) {
    if (ohneRecht(e)) return null;
    throw e;
  }
  const titel = ziel.titel || id;
  const zt = ziele.find((x) => x.id === ziel.typId);
  if (!zt) return t2('automatisierung.karte.verknuepft.anderer-typ', { titel });
  const { werte, bleibt, zeile } = await werteFuer(k, ziel, zt, c);
  const rest = bleibt.length ? t2('automatisierung.karte.verknuepft.bleibt', { felder: bleibt.join(', ') }) : '';
  if (!zeile) return t2('automatisierung.karte.verknuepft.nichts', { titel, rest });
  if (c.trocken) return t2('automatisierung.karte.verknuepft.trocken', { titel, felder: zeile, rest });
  try {
    await c.dienst.mappen.aendereMappe(id, { werte }, c.konto.id, c.z, c.anlass);
  } catch (e) {
    if (ohneRecht(e)) return null;
    throw e;
  }
  return t2('automatisierung.karte.verknuepft.ergebnis', { titel, felder: zeile, rest });
}

DANN_AUSFUEHRER.feld_verknuepft = async (k: DannKarte, c: KartenKontext) => {
  if (k.art !== 'feld_verknuepft') throw new Fachfehler(500, t('meldungen.automatisierungkarten.falsche-karte'));
  if (!c.mappe || !c.typ) throw new Fachfehler(422, t2('automatisierung.karte.verknuepft.ohne-mappe'));
  const typen = await c.dienst.mappentypen.listeTypen();
  const [problem] = verknuepftProbleme(k, c.typ, typen);
  if (problem) throw new Fachfehler(422, problem);
  const { feld, ziele } = verknuepfteTypen(k, c.typ, typen);
  const roh = c.mappe.werte[k.ueber];
  const ids = [...new Set((Array.isArray(roh) ? roh : [roh]).filter((x): x is string => typeof x === 'string' && istUuid(x)))];
  if (!ids.length) throw new KarteLeer(t2('automatisierung.karte.verknuepft.leer', { ueber: feldLabel(feld!) }));
  const zeilen: string[] = [];
  let verwehrt = 0;
  for (const id of ids) {
    const z = await setzeIn(k, id, ziele, c);
    if (z === null) verwehrt++;
    else zeilen.push(z);
  }
  if (verwehrt) zeilen.push(t2('automatisierung.karte.verknuepft.ohne-recht', { anzahl: verwehrt }));
  // Nur fehlende Rechte: kein Fehler, nichts wiederholen – der Schritt gilt als übersprungen und nennt den Grund.
  if (verwehrt === ids.length) throw new KarteLeer(zeilen.join(' '));
  return zeilen.join(' ');
};
