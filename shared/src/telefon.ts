/**
 * Telefon- und Faxnummern (#1609): lesen, einheitlich zeigen und in jeder Schreibweise finden.
 *
 * - **Gespeichert bleibt, was jemand eingibt** (Musterkatalog A4) – auch im Bestand. Die einheitliche Form E.164
 *   (`+493511234567`) rechnet Ablago daraus, wenn es sie braucht: für die Anzeige, den `tel:`-Link und die Suche. Fehlt
 *   die Ländervorwahl, gilt die der Region (Werkbank → Region, #1610).
 * - **Anzeige** im Telefonformat der Region: kanonisch „+49 (351) 1234567“, DIN 5008 international „+49 351 1234567“,
 *   DIN 5008 national „0351 1234567“ (Nummern aus einem anderen Land immer international). Eine **Durchwahl** – nach
 *   DIN 5008 mit Bindestrich, „(0351) 12345-67“ – bleibt als solche stehen: „0351 12345-67“.
 * - **Nicht erkannt** (zu kurz, Buchstaben …): bleibt wie eingegeben; die Oberfläche zeigt einen Hinweis.
 * - **Vorwahlen:** Die Länge einer Ortsvorwahl (in Deutschland 2 bis 5 Stellen) kommt aus `libphonenumber-js` (MIT, die
 *   kleinen Daten „min“). Später können Regionspakete eigene Daten liefern (dms-registry #244).
 * - Beim Laden meldet sich diese Datei bei `telefon-anzeige.ts` an (Werte formatieren, `tel:`-Link).
 */
import { parsePhoneNumberFromString, type PhoneNumber } from 'libphonenumber-js/min';
import { formate, type Telefonformat } from './region';
import { meldeTelefonanzeigeAn } from './telefon-anzeige';

/** Eine erkannte Nummer: E.164 (mit Durchwahl), Ländervorwahl, Ortsvorwahl, Rufnummer und Durchwahl. */
export interface Telefonnummer {
  e164: string;
  land: string;
  vorwahl: string;
  rufnummer: string;
  durchwahl: string | null;
  /** National geschrieben, wie die Nummer im eigenen Land heißt, z. B. „0351“ als Vorwahl. */
  national: string;
}

const lies = (s: string, vorwahl: string): PhoneNumber | undefined => {
  try {
    // „0049 …“ wie „+49 …“: Die Verkehrsausscheidungsziffern hängen am Land, die Region kennt nur die Ländervorwahl.
    const p = parsePhoneNumberFromString(s.trim().replace(/^00/, '+'), { defaultCallingCode: vorwahl });
    return p?.isValid() ? p : undefined;
  } catch {
    return undefined;
  }
};

/** Ortsvorwahl und Rufnummer aus der internationalen Form „+49 351 123 45 67“ (Gruppen der Rufnummer zusammen). */
function teile(p: PhoneNumber): { vorwahl: string; rufnummer: string; national: string } {
  const [, vorwahl = '', ...rest] = p.formatInternational().split(' ');
  const [vorne = '', ...hinten] = p.formatNational().split(' ');
  return { vorwahl, rufnummer: rest.join('').replace(/\D/g, ''), national: hinten.length ? vorne : '' };
}

/**
 * Liest eine Nummer (`vorwahl`: Ländervorwahl der Region ohne „+“). Ein Bindestrich vor den letzten 1 bis 5 Ziffern ist
 * eine Durchwahl, wenn die Nummer davor schon für sich gilt („(0351) 12345-67“) – „0351-1234567“ bleibt eine Nummer.
 * null: keine Telefonnummer.
 */
export function liesTelefon(text: string, vorwahl = formate().vorwahl): Telefonnummer | null {
  const s = text.trim();
  if (!/^[+\d\s/().-]+$/.test(s) || (s.match(/\d/g)?.length ?? 0) < 5) return null;
  const dw = /^(.*\d)\s*-\s*(\d{1,5})$/.exec(s);
  const haupt = dw ? lies(dw[1], vorwahl) : undefined;
  const p = haupt ?? lies(s, vorwahl);
  if (!p) return null;
  const durchwahl = haupt && dw ? dw[2] : null;
  const t = teile(p);
  return { e164: `${p.number}${durchwahl ?? ''}`, land: p.countryCallingCode, durchwahl, ...t };
}

/** Eine erkannte Nummer im gewählten Format; aus einem anderen Land als `vorwahl` immer international. */
export function telefonText(n: Telefonnummer, format: Telefonformat = formate().telefon, vorwahl = formate().vorwahl): string {
  const dw = n.durchwahl ? `-${n.durchwahl}` : '';
  if (format === 'din-national' && n.land === vorwahl && n.national) return `${n.national} ${n.rufnummer}${dw}`;
  if (format === 'kanonisch') return `+${n.land} (${n.vorwahl}) ${n.rufnummer}${dw}`;
  return `+${n.land} ${n.vorwahl} ${n.rufnummer}${dw}`;
}

/** Anzeige einer gespeicherten Nummer: erkannt im Format der Region, sonst wie eingegeben (`erkannt: false`). */
export function telefonAnzeige(text: string): { text: string; erkannt: boolean } {
  const n = liesTelefon(text);
  return n ? { text: telefonText(n), erkannt: true } : { text, erkannt: false };
}

/** Wählbare Nummer für einen `tel:`-Link: E.164, wenn erkannt (Durchwahl angehängt), sonst nur + und Ziffern. */
export function telefonWahl(text: string): string {
  return liesTelefon(text)?.e164 ?? text.trim().replace(/[^\d+]/g, '');
}

/**
 * Suche in jeder Schreibweise (#1609): Sieht ein Suchbegriff wie eine Telefonnummer aus (mindestens 5 Ziffern, nur
 * Ziffern, +, Leerzeichen, /, (, ), -), die Ziffernfolgen, unter denen sie gespeichert sein kann: international
 * (`+49…`, `0049…`) und national (`0…`). Leer: kein Telefonbegriff.
 */
export function telefonSuchformen(begriff: string, vorwahl = formate().vorwahl): string[] {
  const s = begriff.trim();
  if (!/^[+\d\s/().-]+$/.test(s)) return [];
  const ziffern = s.replace(/\D/g, '');
  if (ziffern.length < 5) return [];
  // Ohne 0 oder + vorn ist es eine Rufnummer ohne Vorwahl (oder ein Teil davon): nur die Ziffern.
  const n = /^[+0]/.test(s) ? liesTelefon(s, vorwahl) : null;
  const e164 = n?.e164.slice(1) ?? (s.startsWith('+') ? ziffern : s.startsWith('00') ? ziffern.slice(2) : null);
  if (!e164) return [ziffern];
  const formen = [`+${e164}`, `00${e164}`];
  const land = n?.land;
  if (land === vorwahl) formen.push(`0${e164.slice(vorwahl.length)}`);
  return [...new Set(formen)];
}

/**
 * Muster für einen regulären Ausdruck, das eine Ziffernfolge in jeder Schreibweise findet: zwischen den Ziffern dürfen
 * Leerzeichen, /, (, ), - und . stehen; `+` steht für sich. Für PostgreSQL (`~`) bzw. JavaScript (`js`).
 */
export function telefonMuster(form: string, js = false): string {
  return form
    .split('')
    .map((c) => (c === '+' ? '\\+' : c))
    .join(js ? '[\\s/().-]*' : '[[:space:]/().-]*');
}

/** Steht eine der Suchformen (telefonSuchformen) in diesem Text – in welcher Schreibweise auch immer? */
export function telefonFindet(text: string, formen: readonly string[]): boolean {
  return formen.some((f) => new RegExp(telefonMuster(f, true)).test(text));
}

meldeTelefonanzeigeAn({ anzeige: telefonAnzeige, wahl: telefonWahl });
