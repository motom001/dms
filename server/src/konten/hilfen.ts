/**
 * Regeln, Konstanten und Typen der Konten (#1278, vorher oben in `server/src/konten.ts`): Passwort- und E-Mail-Regeln,
 * Schutzregel „Gesamte Verwaltung“, Dauer von Sitzungen und Links, zweiter Anmeldeschritt.
 */
import { protokoll } from '../protokoll/protokoll';
import { type Benutzer, istPerson, PASSWORT_MINDESTLAENGE, istEmail } from '../../../shared/src/model';
import { hatGesamt } from '../../../shared/src/verwaltungsrecht';
import type { Schutzpruefung, SitzungsInfo } from './konto-repo';
import { t } from '../sprache/sprache';
import { heuteIn } from '../../../shared/src/sichten';
import { Fachfehler } from '../grundlagen/fehler';

export const log = protokoll.modul('konto');

export const TAG = 24 * 60 * 60 * 1000;
export const SITZUNG_TAGE = 30;
export const EINLADUNG_TAGE = 7;
export const ZURUECKSETZEN_STUNDEN = 1;

export const text = (v: unknown) => (v == null ? '' : String(v)).trim();
export const MINUTE = 60_000;

/**
 * Wer zählt für die Schutzregel (#818)? Aktive Personen mit „Gesamte Verwaltung“, die sich anmelden können: Passwort
 * gesetzt oder schon einmal angemeldet (Anbieter) – eine bloße Einladung zählt nicht (Bauvorgabe Sicherheit).
 */
export const zaehltAlsGesamt = (b: Benutzer) => istPerson(b) && b.aktiv && hatGesamt(b) && (b.hatPasswort || !!b.letzteAnmeldung);
/** Schutzregel: Mindestens eine Person behält „Gesamte Verwaltung“ – eine Änderung darf die Zahl nicht auf null bringen. */
export const schutzGesamt: Schutzpruefung = (nachher, vorher) =>
  vorher.some(zaehltAlsGesamt) && !nachher.some(zaehltAlsGesamt) ? t('konten.verwaltung.fehler.letzte') : null;
/** Datum (JJJJ-MM-TT) in der Zeitzone der Ablage – der Tagesmerker endet um Mitternacht. */
export const tagVon = (d: Date) => heuteIn(d);

export function pruefePasswortRegeln(pw: unknown): string {
  const s = typeof pw === 'string' ? pw : '';
  if (s.length < PASSWORT_MINDESTLAENGE) throw new Fachfehler(422, t('anmeldung.fehler.passwort.kurz', { anzahl: PASSWORT_MINDESTLAENGE }));
  if (s.length > 200) throw new Fachfehler(422, t('anmeldung.fehler.passwort.lang'));
  return s;
}
export function pruefeEmail(v: unknown): string {
  const e = text(v);
  if (!istEmail(e)) throw new Fachfehler(422, t('anmeldung.fehler.email'));
  return e;
}

/** Gerät und Adresse, von denen eine Anmeldung kommt. */
export type Geraet = Pick<SitzungsInfo, 'geraet' | 'ip'>;
export const OHNE_GERAET: Geraet = { geraet: '', ip: '' };
/** Zweiter Anmeldeschritt (#242, seit #744 im Kurzzustand): Schlüssel ist der Hash der Kennung. */
export const ZWEITER_SCHRITT = 'zweiter-schritt';
export const ZWEITER_SCHRITT_MS = 5 * 60_000;
export interface ZweiterSchritt {
  benutzerId: string;
  email: string;
  ip: string;
  geraet: string;
}
/** Erneute Anmeldung (#819): Passwort und Code – oder ein Passkey (#811) als `{ kennung, antwort }`. */
export interface Bestaetigung {
  passwort?: unknown;
  code?: unknown;
  passkey?: unknown;
}
/** Letzte Aktivität höchstens einmal je Minute schreiben. */
export const BERUEHREN_MS = 60_000;

export interface Ergebnis {
  benutzer: Benutzer;
  mailVerschickt: boolean;
  link?: string;
  mailFehler?: string;
}

/** „Zuletzt geöffnet“ (#940): so viele zeigt die Liste, so viele merkt sich Ablago je Person. */
export const ZULETZT_LISTE = 25;
export const ZULETZT_MERKEN = 40;
