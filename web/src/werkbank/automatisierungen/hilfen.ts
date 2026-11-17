import {
  istAufruf,
  istBetrieb,
  REIHENFOLGE,
  WENN_EREIGNISSE,
  zeitplanFuerPaket,
  type AutomatisierungAnsicht,
  type AutomatisierungDaten,
  type Fehlschlag,
  type Kontextdaten,
  type WennKarte,
} from '../../../../shared/src/automatisierung';
import { ereignisSchluessel } from '../../../../shared/src/ereignisse';
import type { Mappentyp } from '../../../../shared/src/model';
import { gebietsschema } from '../../../../shared/src/sprache';
import type { BereichListe } from '../../bausteine';
import { t } from '../../sprache';

/**
 * Gemeinsame Hilfen der Automatisierungen (#675; #1279 aus Automatisierungen.tsx gezogen): Stand, Namen der Ereignisse,
 * Zustand einer Zeile, Ziel, Vorrat der Karten und was wozu passt, Bereiche des Editors.
 */

export type Stand = {
  automatisierungen: AutomatisierungAnsicht[];
  fehlgeschlagen: number;
  fehlschlaege: Fehlschlag[];
  kontext: Kontextdaten;
  umgezogen?: { am: string; anzahl: number } | null;
};

export const ereignisName = (art: string) =>
  art === 'datum'
    ? t('automatisierung.wenn.datum')
    : art === 'zeitplan'
      ? t('automatisierung.wenn.zeitplan')
      : art === 'aufruf'
        ? t('automatisierung.wenn.aufruf')
        : t.frei(`ereignisse.name.${ereignisSchluessel(art as never)}`);
/** Wenn-Karte ohne Mappe: Werkbank-Karten (#677) und „Aufruf von außen“ (#679). */
export const ohneMappeWenn = (w: WennKarte) => istBetrieb(w) || istAufruf(w);
export const zeit = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'short', timeStyle: 'short' }) : '';
export const ZUSTAND_ART: Record<string, string> = {
  abgeschlossen: 'gut',
  unzutreffend: 'leise',
  uebersprungen: 'leise',
  fehlgeschlagen: 'schlecht',
  laeuft: 'info',
  wiederholt: 'leise',
};

/** Angehalten oder mit Problem: Die Automatisierung ist an, läuft aber nicht. */
export const haengt = (a: AutomatisierungAnsicht) => a.aktiv && !!(a.angehalten || a.probleme.length);
/** Angehalten (Wiederherstellung, Bremse, passt nicht mehr) – „Alle angehaltenen wieder einschalten“ (#1172). */
export const istAngehalten = (a: AutomatisierungAnsicht) => a.aktiv && !!a.angehalten;

/** Tooltip einer Zeile: Grund fürs Anhalten bzw. Problem, Reihenfolge und letzter Lauf. */
export const zeilenTipp = (a: AutomatisierungAnsicht) =>
  [
    a.angehalten?.text ?? a.probleme[0] ?? a.rechte?.text ?? a.leer?.[0],
    [
      t('automatisierung.ui.liste.reihenfolge', { nr: a.reihenfolge }),
      a.letzterLauf &&
        t('automatisierung.ui.liste.letzter', {
          zeit: zeit(a.letzterLauf.gestartet),
          zustand: t.frei(`automatisierung.ui.zustand.${a.letzterLauf.zustand}`),
        }),
    ]
      .filter(Boolean)
      .join(' · '),
  ]
    .filter(Boolean)
    .join('\n');

/** Gruppieren (#1172): ohne, nach Auslöser (mit Reihenfolge zum Umsortieren), nach Paket oder nach Ziel. */
export type Gruppierung = 'ohne' | 'ausloeser' | 'paket' | 'ziel';
export const GRUPPIERUNGEN: Gruppierung[] = ['ohne', 'ausloeser', 'paket', 'ziel'];

/**
 * Ziel einer Automatisierung (#1172): was sie bewirkt – abgeleitet aus der ersten Dann-Karte (ohne „Stopp“). Aufgabe
 * und Benachrichtigung sind verschiedene Ziele, ebenso alles, was nach außen meldet.
 */
export function zielVon(a: Pick<AutomatisierungAnsicht, 'dann'>): string {
  const k = a.dann.find((x) => x.art !== 'stopp');
  if (!k) return 'keins';
  if (k.art === 'aufgabe') return k.als === 'benachrichtigung' ? 'benachrichtigen' : 'aufgabe';
  if (k.art === 'zusammenfassung' || k.art === 'favoriten' || k.art === 'anmeldeschutz') return 'benachrichtigen';
  if (k.art === 'url' || k.art === 'email') return 'aussen';
  return k.art;
}

export type Entwurf = AutomatisierungDaten & { aktiv: boolean };
// Neue Automatisierungen sind vorgegeben „an“ (#706) – wirksam erst mit dem Speichern.
export const LEER: Entwurf = {
  name: '',
  beschreibung: '',
  reihenfolge: REIHENFOLGE.eigen,
  wenn: { art: 'mappe.geaendert', typ: null },
  und: { modus: 'alle', karten: [] },
  dann: [],
  sonst: [],
  aktiv: true,
};
export const kopie = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
export const neueId = () => `k${Math.random().toString(36).slice(2, 8)}`;

/** Karten im Vorrat: Art und Name; „wenn“ ersetzt die Wenn-Karte, „und“/„dann“ hängen an (Dann-Karten auch an Sonst). */
const VORRAT: Array<{ bereich: 'wenn' | 'und' | 'dann'; art: string }> = [
  { bereich: 'wenn', art: 'datum' },
  { bereich: 'wenn', art: 'zeitplan' },
  { bereich: 'wenn', art: 'aufruf' },
  ...WENN_EREIGNISSE.map((a) => ({ bereich: 'wenn' as const, art: a })),
  { bereich: 'und', art: 'bedingung' },
  { bereich: 'und', art: 'ansicht' },
  { bereich: 'und', art: 'favorit' },
  { bereich: 'und', art: 'merkmal' },
  { bereich: 'und', art: 'gruppe' },
  { bereich: 'dann', art: 'feld' },
  { bereich: 'dann', art: 'aufgabe' },
  // #678: Benachrichtigungen – passen nur zu ihrer Wenn-Karte (Zeitplan je Benutzer, Favorit geändert, Zeitplan bzw. Kontosperre).
  { bereich: 'dann', art: 'zusammenfassung' },
  { bereich: 'dann', art: 'favoriten' },
  { bereich: 'dann', art: 'anmeldeschutz' },
  // #1082: nur mit „Zeitplan“ (nicht für jeden Benutzer) und wenn ein Paket Zeitpläne annimmt.
  { bereich: 'dann', art: 'paket' },
  // #677: Werkbank-Recht des Systemkontos – passt zu jeder Wenn-Karte.
  { bereich: 'dann', art: 'sicherung' },
  // #671: nach außen – passen zu jeder Wenn-Karte.
  { bereich: 'dann', art: 'url' },
  { bereich: 'dann', art: 'email' },
  { bereich: 'dann', art: 'stopp' },
];
export type VorratKarte = { bereich: 'wenn' | 'und' | 'dann'; art: string; name?: string };
/** Karten aus Paketen mit Code (#680, `code.karten`) im Vorrat: als „Paket: Name“, Art `paket:<paket>:<karte>`. */
export const PAKET_KARTE = /^paket:([^:]+):(.+)$/;
export const vorratMit = (k: Kontextdaten): VorratKarte[] => [
  ...VORRAT,
  ...(k.pakete ?? [])
    .filter((p) => p.zeitplan)
    .flatMap((p) =>
      (p.karten ?? []).map((c) => ({
        bereich: 'dann' as const,
        art: `paket:${p.id}:${c.schluessel}`,
        name: t('automatisierung.ui.karte.dann.paket.karte', { paket: p.name, karte: c.name }),
      })),
    ),
];
export type Zweig = 'dann' | 'sonst';
/** Nach Wahl der Wenn-Karte nur passende Karten: „Feld ändern“ braucht einen Mappentyp, „in Ansicht“ eine Ansicht dafür. */
export const sichtenFuer = (k: Kontextdaten, typ: Mappentyp | null) =>
  k.sichten.filter((s) => !typ || !s.typen?.length || s.typen.includes(typ.id) || s.typen.includes('*'));
// Werkbank-Karten ohne Mappe (#677) und Aufruf von außen (#679): als Bedingung nur ein Merkmal der Ablage.
export const passt = (v: { art: string }, typ: Mappentyp | null, k: Kontextdaten, w?: WennKarte) =>
  passtArt({ art: grundArt(v.art) }, typ, k, w);
/** Karten aus Paketen (#680) passen wie „Paket nach Zeitplan ausführen“. */
export const grundArt = (art: string) => (PAKET_KARTE.test(art) ? 'paket' : art);
const passtArt = (v: { art: string }, typ: Mappentyp | null, k: Kontextdaten, w?: WennKarte) =>
  w && ohneMappeWenn(w) && ['bedingung', 'ansicht', 'favorit', 'gruppe'].includes(v.art)
    ? false
    : v.art === 'feld'
      ? !!typ
      : v.art === 'ansicht'
        ? sichtenFuer(k, typ).length > 0
        : v.art === 'zusammenfassung'
          ? w?.art === 'zeitplan' && w.jeBenutzer
          : v.art === 'favoriten'
            ? w?.art === 'favorit.geaendert'
            : v.art === 'anmeldeschutz'
              ? (w?.art === 'zeitplan' && !w.jeBenutzer) || w?.art === 'benutzer.gesperrt'
              : v.art === 'paket'
                ? !!w && zeitplanFuerPaket(w) && (k.pakete ?? []).some((p) => p.zeitplan)
                : true;
export const vorratName = (v: { bereich: string; art: string; name?: string }) =>
  v.name ?? (v.bereich === 'wenn' ? ereignisName(v.art) : t.frei(`automatisierung.ui.karte.${v.bereich}.${grundArt(v.art)}`));

/** Bereiche einer Automatisierung (#1000): neu Grunddaten, Wenn und Dann; gespeichert dazu Ausprobieren, Verlauf, Fassungen. */
export type AutoBereich = 'grunddaten' | 'wenn' | 'dann' | 'ausprobieren' | 'verlauf' | 'zustellungen' | 'fassungen';
/** Zustellungen (#671) nur mit Karten nach außen. */
export function automatisierungBereiche(gespeichert: boolean, aussen = false): BereichListe<AutoBereich> {
  return [
    ['grunddaten', t('automatisierung.ui.bereich.grunddaten')],
    ['wenn', t('automatisierung.ui.wenn')],
    ['dann', t('automatisierung.ui.dann')],
    ...(gespeichert
      ? ([
          ['ausprobieren', t('automatisierung.ui.wiedergeben')],
          ['verlauf', t('automatisierung.ui.verlauf')],
        ] as const)
      : []),
    ...(gespeichert && aussen ? ([['zustellungen', t('automatisierung.ui.zustellungen')]] as const) : []),
    ...(gespeichert ? ([['fassungen', t('oberflaeche.fassungen.titel')]] as const) : []),
  ];
}
