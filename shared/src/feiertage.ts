/**
 * Gesetzliche Feiertage in Deutschland (#94), lokal berechnet – ohne externe Schnittstelle.
 *
 * Bundesweit und je Bundesland nur die landesweit geltenden Feiertage. Feiertage einzelner
 * Gemeinden (Mariä Himmelfahrt in Teilen Bayerns, Augsburger Friedensfest, Fronleichnam in
 * Teilen Sachsens und Thüringens) und einmalige Feiertage (z. B. 8. Mai 2020/2025 in Berlin)
 * fehlen bewusst. Ostern nach der Gaußschen Osterformel (gregorianisch).
 */
export const BUNDESLAENDER = {
  BW: 'Baden-Württemberg', BY: 'Bayern', BE: 'Berlin', BB: 'Brandenburg', HB: 'Bremen', HH: 'Hamburg',
  HE: 'Hessen', MV: 'Mecklenburg-Vorpommern', NI: 'Niedersachsen', NW: 'Nordrhein-Westfalen',
  RP: 'Rheinland-Pfalz', SL: 'Saarland', SN: 'Sachsen', ST: 'Sachsen-Anhalt', SH: 'Schleswig-Holstein', TH: 'Thüringen',
} as const;
export type Bundesland = keyof typeof BUNDESLAENDER;
export const istBundesland = (v: unknown): v is Bundesland => typeof v === 'string' && v in BUNDESLAENDER;

/** Ostersonntag nach Gauß (in der Form von Lichtenberg), gregorianischer Kalender. */
export function ostersonntag(jahr: number): Date {
  const k = Math.floor(jahr / 100);
  const m = 15 + Math.floor((3 * k + 3) / 4) - Math.floor((8 * k + 13) / 25);
  const s = 2 - Math.floor((3 * k + 3) / 4);
  const a = jahr % 19;
  const d = (19 * a + m) % 30;
  const r = Math.floor((d + Math.floor(a / 11)) / 29);
  const og = 21 + d - r;
  const sz = 7 - ((jahr + Math.floor(jahr / 4) + s) % 7);
  const oe = 7 - ((og - sz) % 7);
  return new Date(Date.UTC(jahr, 2, og + oe)); // März + Tage (läuft in den April über)
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const tag = (jahr: number, monat: number, t: number) => new Date(Date.UTC(jahr, monat - 1, t));
const plus = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

/** Buß- und Bettag: der Mittwoch vor dem 23. November. */
export function bussUndBettag(jahr: number): Date {
  const d22 = tag(jahr, 11, 22);
  return plus(d22, -((d22.getUTCDay() - 3 + 7) % 7));
}

/** Feiertage eines Jahres für ein Bundesland: Datum (JJJJ-MM-TT) → Name. */
export function feiertage(jahr: number, land: Bundesland): Map<string, string> {
  const f = new Map<string, string>();
  const setze = (d: Date, name: string, gilt = true) => { if (gilt) f.set(iso(d), name); };
  const in_ = (...l: Bundesland[]) => l.includes(land);
  const ostern = ostersonntag(jahr);
  setze(tag(jahr, 1, 1), 'Neujahr');
  setze(tag(jahr, 1, 6), 'Heilige Drei Könige', in_('BW', 'BY', 'ST'));
  setze(tag(jahr, 3, 8), 'Internationaler Frauentag', (land === 'BE' && jahr >= 2019) || (land === 'MV' && jahr >= 2023));
  setze(plus(ostern, -2), 'Karfreitag');
  setze(ostern, 'Ostersonntag', in_('BB'));
  setze(plus(ostern, 1), 'Ostermontag');
  setze(tag(jahr, 5, 1), 'Tag der Arbeit');
  setze(plus(ostern, 39), 'Christi Himmelfahrt');
  setze(plus(ostern, 49), 'Pfingstsonntag', in_('BB'));
  setze(plus(ostern, 50), 'Pfingstmontag');
  setze(plus(ostern, 60), 'Fronleichnam', in_('BW', 'BY', 'HE', 'NW', 'RP', 'SL'));
  setze(tag(jahr, 8, 15), 'Mariä Himmelfahrt', in_('SL'));
  setze(tag(jahr, 9, 20), 'Weltkindertag', land === 'TH' && jahr >= 2019);
  setze(tag(jahr, 10, 3), 'Tag der Deutschen Einheit');
  setze(tag(jahr, 10, 31), 'Reformationstag', jahr === 2017 || in_('BB', 'MV', 'SN', 'ST', 'TH') || (in_('HB', 'HH', 'NI', 'SH') && jahr >= 2018));
  setze(tag(jahr, 11, 1), 'Allerheiligen', in_('BW', 'BY', 'NW', 'RP', 'SL'));
  setze(bussUndBettag(jahr), 'Buß- und Bettag', in_('SN'));
  setze(tag(jahr, 12, 25), '1. Weihnachtstag');
  setze(tag(jahr, 12, 26), '2. Weihnachtstag');
  return f;
}

/** Name des Feiertags an diesem Tag (JJJJ-MM-TT) oder null. */
export function feiertagAm(datum: string, land: Bundesland | null | undefined): string | null {
  if (!land) return null;
  return feiertage(Number(datum.slice(0, 4)), land).get(datum) ?? null;
}
