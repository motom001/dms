/**
 * Nachweise je Monat als Daten für Pakete (#1053). Je Bereich, was im Monat geschehen ist bzw. wie es zum Stichtag
 * stand. Quellen: das Nachweis-Journal (journal.ts), Sicherungen samt Prüfung und Probe, Löschprotokoll und Post.
 *
 * Bewusst so eng wie möglich: keine Titel, Feldwerte oder Dateinamen; Fehlanmeldungen nur mit Konto (falls es das
 * Konto gibt), gekürzter Adresse und „Heimnetz/außen“; unbekannte Konten nur als Anzahl (Ergänzung Sicherheit).
 */
import { ohneGeheimnisse } from '../geheimnis-sperre';
import type { JournalArt, JournalMonat } from '../nachweisjournal';
import type { NachweisEintrag, NachweiseStand, PaketdatenBereich, PaketdatenWert } from '../../../shared/src/paketdaten';

export interface NachweisQuellen {
  /** Journal des Monats. */
  journal(monat: string): Promise<JournalMonat>;
  /** Aufstellung der Personen zum Stichtag (ohne Dienst- und Systemkonten). */
  benutzer?(): Promise<
    Array<{ konto: string; aktiv: boolean; rollen: string[]; zweifaktor: boolean; passkey: boolean; verwaltung: string[] }>
  >;
  /** Sicherungen (vorhandene) mit Beginn, Ende, Art, Prüfung und Probe. */
  sicherungen?(): Promise<
    Array<{
      name: string;
      beginn: string;
      ende: string | null;
      art: string;
      pruefung: { am: string; ok: boolean } | null;
      probe: { am: string; ok: boolean } | null;
    }>
  >;
  /** Löschprotokoll des Monats: je Eintrag Schritt, Grund und Mappentyp (ohne Titel). */
  loeschungen?(von: string, bis: string): Promise<Array<{ zeit: string; schritt: string; grund: string | null; typ: string; art: string }>>;
  /** Eingegangene Post des Monats je Weg (Kanal). */
  post?(von: string, bis: string): Promise<Record<string, number>>;
  jetzt?(): Date;
}

/** Erster und letzter Augenblick eines Monats (UTC, ISO). */
export function monatsGrenzen(monat: string): { von: string; bis: string } {
  const [j, m] = monat.split('-').map(Number);
  return { von: new Date(Date.UTC(j, m - 1, 1)).toISOString(), bis: new Date(Date.UTC(j, m, 1) - 1).toISOString() };
}
const imMonat = (zeit: string | null | undefined, g: { von: string; bis: string }) => !!zeit && zeit >= g.von && zeit <= g.bis;

/** Welche Journal-Arten zu welchem Bereich gehören. */
const JOURNAL: Partial<Record<PaketdatenBereich, JournalArt[]>> = {
  zugang: ['zugang.rechte', 'zugang.fehlanmeldung'],
  betrieb: ['betrieb.update', 'betrieb.paket', 'betrieb.wartung'],
  unveraenderbarkeit: ['unveraenderbarkeit.pruefung'],
  datenschutz: ['datenschutz.papierkorb', 'datenschutz.auskunft'],
};

type Grenzen = { von: string; bis: string };
type Teil = (q: NachweisQuellen, g: Grenzen, j: JournalMonat, aus: NachweisEintrag[]) => Promise<void>;

/** Zugang: Fehlanmeldungen mit unbekanntem Konto nur als Anzahl, Benutzer zum Stichtag. */
const zugang: Teil = async (q, _g, j, aus) => {
  aus.push({ kennung: 'zugang.fehlanmeldung_unbekannt', daten: { anzahl: j.zaehler['zugang.fehlanmeldung_unbekannt'] ?? 0 } });
  for (const b of (await q.benutzer?.()) ?? [])
    aus.push({
      kennung: 'zugang.benutzer',
      daten: { konto: b.konto, aktiv: b.aktiv, rollen: b.rollen, zweifaktor: b.zweifaktor, passkey: b.passkey, verwaltung: b.verwaltung },
    });
};

/** Sicherung: Läufe, Prüfungen und Probe-Wiederherstellungen, die in den Monat fallen. */
const sicherung: Teil = async (q, g, _j, aus) => {
  for (const s of (await q.sicherungen?.()) ?? []) {
    if (imMonat(s.beginn, g))
      aus.push({ kennung: 'sicherung.lauf', zeit: s.beginn, daten: { name: s.name, art: s.art, ende: s.ende, ok: !!s.ende } });
    if (s.pruefung && imMonat(s.pruefung.am, g))
      aus.push({ kennung: 'sicherung.pruefung', zeit: s.pruefung.am, daten: { name: s.name, ok: s.pruefung.ok } });
    if (s.probe && imMonat(s.probe.am, g))
      aus.push({ kennung: 'sicherung.probe', zeit: s.probe.am, daten: { name: s.name, ok: s.probe.ok } });
  }
};

/** Datenschutz: Löschungen nach Fristende und endgültig Gelöschtes je Mappentyp gezählt – keine Titel, keine Nummern. */
const datenschutz: Teil = async (q, g, _j, aus) => {
  if (!q.loeschungen) return;
  const liste = await q.loeschungen(g.von, g.bis);
  const zaehle = (f: (x: { schritt: string; grund: string | null; art: string }) => boolean, kennung: string) => {
    const je = new Map<string, number>();
    for (const x of liste.filter(f)) je.set(x.typ, (je.get(x.typ) ?? 0) + 1);
    for (const [typ, anzahl] of [...je].sort((a, b) => a[0].localeCompare(b[0]))) aus.push({ kennung, daten: { typ, anzahl } });
  };
  zaehle((x) => x.art === 'mappe' && x.grund === 'frist', 'datenschutz.loeschung_frist');
  zaehle((x) => x.art === 'mappe' && x.schritt === 'endgueltig', 'datenschutz.endgueltig');
};

/** Belegeingang: eingegangene Post je Weg. */
const belegeingang: Teil = async (q, g, _j, aus) => {
  if (!q.post) return;
  for (const [weg, anzahl] of Object.entries(await q.post(g.von, g.bis)).sort((a, b) => a[0].localeCompare(b[0])))
    aus.push({ kennung: 'belegeingang.post', daten: { weg, anzahl } });
};

const TEILE: Partial<Record<PaketdatenBereich, Teil>> = { zugang, sicherung, datenschutz, belegeingang };

export async function nachweise(bereich: PaketdatenBereich, monat: string, q: NachweisQuellen): Promise<NachweiseStand> {
  const g = monatsGrenzen(monat);
  const jetzt = (q.jetzt?.() ?? new Date()).toISOString();
  const stichtag = jetzt < g.bis ? jetzt : g.bis;
  const aus: NachweisEintrag[] = [];
  const j = await q.journal(monat);
  const arten = JOURNAL[bereich] ?? [];
  for (const x of j.eintraege.filter((y) => arten.includes(y.art))) aus.push({ kennung: x.art, zeit: x.zeit, daten: x.daten });
  const weitere = arten.length ? j.weitere : 0;
  await TEILE[bereich]?.(q, g, j, aus);
  aus.sort((a, b) => (a.zeit ?? '').localeCompare(b.zeit ?? '') || a.kennung.localeCompare(b.kennung));
  const stand: NachweiseStand = {
    format: 1,
    art: 'nachweise',
    bereich,
    monat,
    stichtag,
    eintraege: aus.map((x) => ({ ...x, daten: x.daten as Record<string, PaketdatenWert> })),
    ...(weitere ? { weitere } : {}),
  };
  return ohneGeheimnisse(stand);
}
