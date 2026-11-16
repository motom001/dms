/**
 * Freigabe von Einrichtung und Nachweisen je Paket (#1054). Der Administrator hakt in den Paket-Einstellungen je
 * Bereich an, was das Paket lesen darf – Vorgabe: nichts. Wer speichert, wird die hinterlegte Person: Das Paket liest in
 * ihrem Namen. Wirksam ist bei jedem Abruf die Schnittmenge aus Haken, angefragten Bereichen und den Verwaltungsrechten
 * dieser Person (Entscheidung Thomas 10.11.2026).
 *
 * Jede Änderung steht im Protokoll, im Paket-Verlauf (#1003) und im Nachweis-Journal.
 *
 * Abgelegt in der Einstellung `paketdaten:<id>` samt Zeitpunkt der Installation: Wird das Paket entfernt und neu
 * installiert, gilt die alte Freigabe nicht mehr (sonst bekäme es heimlich wieder Daten).
 */
import { Fachfehler } from '../grundlagen/fehler';
import { protokoll } from '../protokoll/protokoll';
import { t } from '../sprache/sprache';
import type { Einstellungen } from '../einstellungen/einstellungen';
import { nachweis } from '../protokoll/nachweisjournal';
import {
  bereichName,
  brauchtFrisch,
  darfPaketdaten,
  istPaketdatenBereich,
  LEERE_FREIGABE,
  PAKETDATEN_BEREICHE,
  type PaketdatenAnsicht,
  type PaketdatenArt,
  type PaketdatenBereich,
  type PaketdatenFreigabe,
} from '../../../shared/src/paketdaten';
import { hatNetz, type InstalliertesPaket } from '../../../shared/src/pakete';
import type { Benutzer } from '../../../shared/src/model';

const log = protokoll.modul('werkbank');
const VERLAUF_MAX = 50;
const schluessel = (id: string) => `paketdaten:${id}`;
type Gespeichert = PaketdatenFreigabe & { installiert: string | null };

/** Was das Paket anfragt; ein Paket mit Netz bekommt nie etwas (auch wenn das Manifest es anders sagte). */
export function angefragt(p: Pick<InstalliertesPaket, 'laeufer'> | undefined, art: PaketdatenArt): PaketdatenBereich[] {
  if (!p?.laeufer || hatNetz(p.laeufer)) return [];
  return [...((art === 'einrichtung' ? p.laeufer.rechte.einrichtung : p.laeufer.rechte.nachweise) ?? [])];
}
export const fragtAn = (p: Pick<InstalliertesPaket, 'laeufer'> | undefined) =>
  angefragt(p, 'einrichtung').length + angefragt(p, 'nachweise').length > 0;

const liste = (v: unknown): PaketdatenBereich[] => (Array.isArray(v) ? PAKETDATEN_BEREICHE.filter((b) => v.includes(b)) : []);

/** Gespeicherte Freigabe; gehört sie zu einer früheren Installation, gilt sie als leer. */
export async function liesFreigabe(
  e: Einstellungen | undefined,
  p: Pick<InstalliertesPaket, 'id' | 'installiert'>,
): Promise<PaketdatenFreigabe> {
  const v = (await e?.lies(schluessel(p.id))) as Partial<Gespeichert> | null;
  if (!v || typeof v !== 'object' || v.installiert !== p.installiert) return { ...LEERE_FREIGABE, verlauf: [] };
  return {
    einrichtung: liste(v.einrichtung),
    nachweise: liste(v.nachweise),
    benutzer: typeof v.benutzer === 'string' ? v.benutzer : null,
    am: typeof v.am === 'string' ? v.am : null,
    verlauf: Array.isArray(v.verlauf) ? v.verlauf.slice(0, VERLAUF_MAX) : [],
  };
}

/** Ansicht für die Paket-Seite. `person` sucht die hinterlegte Person (null = gibt es nicht mehr). */
export async function freigabeAnsicht(
  e: Einstellungen | undefined,
  p: InstalliertesPaket,
  ich: Benutzer,
  person: (id: string) => Promise<Benutzer | null>,
): Promise<PaketdatenAnsicht> {
  const f = await liesFreigabe(e, p);
  const hinterlegt = f.benutzer ? await person(f.benutzer) : null;
  const zeilen = (['einrichtung', 'nachweise'] as const).flatMap((art) =>
    angefragt(p, art).map((bereich) => {
      const angehakt = f[art].includes(bereich);
      return {
        art,
        bereich,
        name: bereichName(bereich),
        angehakt,
        wirksam: angehakt && !!hinterlegt?.aktiv && darfPaketdaten(hinterlegt, art, bereich),
        darf: darfPaketdaten(ich, art, bereich),
        frisch: brauchtFrisch(art, bereich),
      };
    }),
  );
  return {
    bereiche: zeilen,
    benutzer: hinterlegt ? hinterlegt.name || hinterlegt.email : f.benutzer ? t('pakete.daten.person-weg') : null,
    am: f.am,
    verlauf: f.verlauf,
  };
}

/** Eingabe prüfen: nur angefragte Bereiche, und nur solche, die `ich` verwaltet. */
function liesAuswahl(p: InstalliertesPaket, ich: Benutzer, eingabe: unknown): Record<PaketdatenArt, PaketdatenBereich[]> {
  const x = (eingabe && typeof eingabe === 'object' ? eingabe : {}) as Record<string, unknown>;
  const neu: Record<PaketdatenArt, PaketdatenBereich[]> = { einrichtung: [], nachweise: [] };
  for (const art of ['einrichtung', 'nachweise'] as const) {
    const roh = Array.isArray(x[art]) ? (x[art] as unknown[]) : [];
    for (const b of roh)
      if (!istPaketdatenBereich(b) || !angefragt(p, art).includes(b))
        throw new Fachfehler(422, t('pakete.daten.fehler.nicht-angefragt', { bereich: String(b) }));
    neu[art] = liste(roh);
    for (const b of neu[art])
      if (!darfPaketdaten(ich, art, b))
        throw new Fachfehler(
          403,
          t(art === 'nachweise' ? 'pakete.daten.fehler.nachweise-recht' : 'pakete.daten.fehler.bereich-recht', { bereich: bereichName(b) }),
          { bereich: b },
        );
  }
  return neu;
}

/**
 * Auswahl speichern. Nur angefragte Bereiche; jeder angehakte Bereich muss von `ich` verwaltet werden (die Person wird
 * die hinterlegte, also müssen alle Haken in ihrem Namen gelten) – sonst 403 mit dem Namen des Bereichs. Die frische
 * Anmeldung für Zugang und Nachweise prüft die Route (verwaltungsbereiche.ts).
 */
export async function setzeFreigabe(
  e: Einstellungen | undefined,
  p: InstalliertesPaket,
  ich: Benutzer,
  eingabe: unknown,
  o: { jetzt?: Date; verlauf?: (eintrag: { paket: string; art: 'einstellungen'; was: string; wer: string }) => Promise<void> } = {},
): Promise<PaketdatenFreigabe> {
  const { jetzt = new Date(), verlauf } = o;
  if (!e) throw new Fachfehler(404, t('meldungen.dienst.einstellungen-sind-nicht'));
  if (!fragtAn(p)) throw new Fachfehler(409, t('pakete.daten.fehler.fragt-nicht', { name: p.name }));
  const neu = liesAuswahl(p, ich, eingabe);
  const alt = await liesFreigabe(e, p);
  const am = jetzt.toISOString();
  const leer = !neu.einrichtung.length && !neu.nachweise.length;
  const gespeichert: Gespeichert = {
    ...neu,
    benutzer: leer ? null : ich.id,
    am,
    installiert: p.installiert,
    verlauf: [{ am, von: ich.email, ...neu }, ...alt.verlauf].slice(0, VERLAUF_MAX),
  };
  await e.schreibe(schluessel(p.id), gespeichert);
  const text = (l: PaketdatenBereich[]) => l.join(', ') || '–';
  // Paket-Verlauf (#1003): wie eine geänderte Einstellung, mit den Bereichen.
  await verlauf?.({
    paket: p.id,
    art: 'einstellungen',
    was: t('pakete.daten.verlauf.eintrag', { einrichtung: text(neu.einrichtung), nachweise: text(neu.nachweise) }),
    wer: ich.email,
  }).catch(() => {});
  void nachweis('zugang.rechte', { was: 'paket', paket: p.id, einrichtung: neu.einrichtung, nachweise: neu.nachweise, von: ich.email });
  log.warn('Paket: Einrichtung und Nachweise freigegeben', {
    paket: p.id,
    von: ich.email,
    einrichtung: text(neu.einrichtung),
    nachweise: text(neu.nachweise),
    vorher: `${text(alt.einrichtung)} / ${text(alt.nachweise)}`,
  });
  return { ...neu, benutzer: gespeichert.benutzer, am, verlauf: gespeichert.verlauf };
}

/**
 * Bei jedem Abruf durch das Paket: angefragt, angehakt, die hinterlegte Person aktiv und mit dem Verwaltungsrecht.
 * Sonst 403 mit dem Namen des Bereichs.
 */
export async function pruefeAbruf(
  e: Einstellungen | undefined,
  p: InstalliertesPaket | undefined,
  art: PaketdatenArt,
  bereich: PaketdatenBereich,
  person: (id: string) => Promise<Benutzer | null>,
): Promise<void> {
  const name = bereichName(bereich);
  if (!p || !angefragt(p, art).includes(bereich))
    throw new Fachfehler(403, t('pakete.daten.fehler.nicht-angefragt', { bereich: name }), { bereich });
  const f = await liesFreigabe(e, p);
  if (!f[art].includes(bereich))
    throw new Fachfehler(
      403,
      t(art === 'nachweise' ? 'pakete.daten.fehler.nachweise-nicht-frei' : 'pakete.daten.fehler.nicht-frei', { bereich: name }),
      { bereich },
    );
  const b = f.benutzer ? await person(f.benutzer) : null;
  if (!b?.aktiv || !darfPaketdaten(b, art, bereich))
    throw new Fachfehler(403, t('pakete.daten.fehler.person-recht', { bereich: name }), { bereich });
}
