/**
 * Texte des Servers aus den Sprachdateien (#473): E-Mails, Fehlermeldungen der API, später PDFs.
 * Neue oder geänderte Texte kommen in `shared/src/sprachen/de/<bereich>.json` und werden hier mit
 * `t('<bereich>.<schluessel>', { platzhalter })` abgerufen; ein neuer Bereich wird unten ergänzt.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { inSprache, setzeSprachquelle, uebersetzer, type Werte } from '../../shared/src/sprache';
import { registriereEnglisch } from '../../shared/src/englisch';
import { erlaubteSprachen } from '../../shared/src/beschriftung';
import einrichtung from '../../shared/src/sprachen/de/einrichtung.json';
import entdecken from '../../shared/src/sprachen/de/entdecken.json';
import anmeldung from '../../shared/src/sprachen/de/anmeldung.json';
import mail from '../../shared/src/sprachen/de/mail.json';
import konten from '../../shared/src/sprachen/de/konten.json';
import mappen from '../../shared/src/sprachen/de/mappen.json';
import pakete from '../../shared/src/sprachen/de/pakete.json';
import systemzustand from '../../shared/src/sprachen/de/systemzustand.json';
import werkbank from '../../shared/src/sprachen/de/werkbank.json';
import api from '../../shared/src/sprachen/de/api.json';
import automatisierung from '../../shared/src/sprachen/de/automatisierung.json';
import start from '../../shared/src/sprachen/de/start.json';
import meldungen from '../../shared/src/sprachen/de/meldungen.json';
import notfall from '../../shared/src/sprachen/de/notfall.json';

export const t = uebersetzer({ api, anmeldung, einrichtung, entdecken, konten, mail, mappen, meldungen, notfall, pakete, start, systemzustand, werkbank });

/*
 * Sprache je Anfrage (#729): Meldungen gehen in der Sprache der angemeldeten Person hinaus, vor der Anmeldung in der,
 * die die Oberfläche mitschickt (`X-Sprache`), sonst in der Sprache der Installation (`setzeSprache`, sprachwahl.ts).
 * E-Mails und Notfallblatt laufen mit `mitSprache` in der Sprache der Person, für die sie sind.
 */
registriereEnglisch();
const jeAnfrage = new AsyncLocalStorage<{ sprache?: string }>();
setzeSprachquelle(() => jeAnfrage.getStore()?.sprache);
/** Führt `f` (auch asynchron) in einer Sprache aus; `undefined` = Sprache der Installation. */
export const mitSprache = <T>(spr: string | null | undefined, f: () => T): T => jeAnfrage.run({ sprache: spr ?? undefined }, f);
/** Führt `f` in der Sprache einer Person aus (E-Mails an sie, #729): ihre Wahl, wenn erlaubt, sonst die der Installation. */
export const mitSpracheVon = <T>(b: { sprache?: string | null } | null | undefined, f: () => T): T =>
  mitSprache(b?.sprache && erlaubteSprachen().includes(b.sprache) ? b.sprache : undefined, f);
/** Sprache der laufenden Anfrage festlegen, z. B. sobald die angemeldete Person feststeht. */
export function setzeAnfrageSprache(spr: string | null | undefined) {
  const s = jeAnfrage.getStore();
  if (s && spr) s.sprache = spr;
}
/** Protokollzeilen bleiben deutsch (#729) – unabhängig von der Sprache der Anfrage. */
export const tDe: typeof t = Object.assign((k: Parameters<typeof t>[0], w?: Werte) => inSprache('de', () => t(k, w)), t);
/** Texte der Automatisierungen (#678: Ergebnis der Dann-Karten, die der Server bereitstellt). */
export const tAuto = uebersetzer({ automatisierung });
