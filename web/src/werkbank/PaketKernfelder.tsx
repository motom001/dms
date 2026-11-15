/**
 * Feldarten des Kerns im Reiter „Einstellungen“ (#996): laden, darstellen und mit dem einen Speichern des Reiters
 * sichern. Die Werte hält Ablago an der Stelle, an der der Kern sie liest (KI-Zulassung der Mappentypen, Grenzen für
 * „Frag deine Ablage“, Standard für „Aus Dokument ausfüllen“, Aktionen im Menü „Mappe“).
 */
import type { AktionenEinstellung } from '../../../shared/src/paketaktionen';
import type { InstalliertesPaket, KiUebersicht } from '../../../shared/src/pakete';
import type { KernTyp } from '../../../shared/src/paketeinstellungen';
import { ApiFehler } from '../api/anfrage';
import { paketeApi } from '../api/pakete';
import { sucheApi, type ErkennungStand, type FragenStand } from '../api/suche';
import { abflussBestaetigen, ErkennungFeld } from './ErkennungPaket';
import { fragenEingabe, FragenGrenzenFeld, type FragenEingabe } from './FragenGrenzen';
import { KiTypenFeld } from './KiTypen';
import { PaketAktionenFeld } from './PaketAktionen';

export interface KernDaten { ki?: KiUebersicht; fragen?: FragenStand; erkennung?: ErkennungStand; aktionen?: AktionenEinstellung }
export type KernWerte = Partial<Record<KernTyp, unknown>>;
type Paket = Pick<InstalliertesPaket, 'id' | 'name' | 'mappenaktionen'>;

/** Gespeicherte Werte der Feldarten als Formularwerte. */
export function kernWerte(paket: string, d: KernDaten, arten: readonly KernTyp[]): KernWerte {
  const w: KernWerte = {};
  for (const a of arten) {
    if (a === 'ki_mappentypen' && d.ki) w[a] = d.ki.typen.filter((x) => x.zugelassen).map((x) => x.id);
    if (a === 'fragen_grenzen' && d.fragen) w[a] = fragenEingabe(d.fragen.grenzen);
    if (a === 'erkennung_standard' && d.erkennung) w[a] = d.erkennung.standard.paket === paket;
    if (a === 'mappenaktionen' && d.aktionen) w[a] = d.aktionen.paketAus[paket] ?? [];
  }
  return w;
}

/** Lädt, was die Feldarten brauchen (nur die, die das Paket hat). */
export async function ladeKern(arten: readonly KernTyp[]): Promise<KernDaten> {
  const [ki, fragen, erkennung, aktionen] = await Promise.all([
    arten.includes('ki_mappentypen') ? sucheApi.kiTypen() : undefined,
    arten.includes('fragen_grenzen') ? sucheApi.fragenStand() : undefined,
    arten.includes('erkennung_standard') ? sucheApi.erkennungStand() : undefined,
    arten.includes('mappenaktionen') ? paketeApi.mappenaktionenEinstellung() : undefined,
  ]);
  return { ki, fragen, erkennung, aktionen };
}

const gleich = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Vor dem Speichern: Datenabfluss bestätigen, wenn ein Paket mit Netz Standard der Erkennung wird. false = abgebrochen. */
export async function kernBestaetigen(paket: Paket, d: KernDaten, alt: KernWerte, neu: KernWerte): Promise<boolean> {
  const ich = d.erkennung?.pakete.find((x) => x.id === paket.id);
  if (neu.erkennung_standard === true && alt.erkennung_standard !== true && ich?.netz) return abflussBestaetigen(ich.name);
  return true;
}

/** KI-Zulassung (#796): je geändertem Mappentyp zulassen oder sperren; gibt den neuen Stand zurück. */
async function kiSpeichern(k: KiUebersicht, alt: string[], neu: string[]): Promise<KiUebersicht> {
  const vorher = new Set(alt), nachher = new Set(neu);
  let stand = k;
  for (const x of k.typen.filter((y) => vorher.has(y.id) !== nachher.has(y.id))) stand = await sucheApi.setzeKiTyp(x.id, nachher.has(x.id));
  return stand;
}

/**
 * Speichert die geänderten Feldarten (nach den Feldern des Manifests). Fehler je Feld: Schlüssel des Felds bzw.
 * `<schlüssel>.<teil>` bei den Grenzen. Gibt die neuen Daten zurück.
 */
export async function speichereKern(paket: Paket, arten: Array<{ art: KernTyp; schluessel: string }>, d: KernDaten, alt: KernWerte, neu: KernWerte): Promise<{ daten: KernDaten; fehler: Record<string, string> }> {
  const fehler: Record<string, string> = {};
  const daten = { ...d };
  for (const { art, schluessel } of arten) {
    if (gleich(alt[art], neu[art])) continue;
    try {
      if (art === 'ki_mappentypen' && d.ki) daten.ki = await kiSpeichern(d.ki, alt[art] as string[], neu[art] as string[]);
      if (art === 'fragen_grenzen') {
        const g = neu[art] as FragenEingabe;
        daten.fragen = await sucheApi.fragenGrenzen({ ausschnitte: Number(g.ausschnitte), zeichen: Number(g.zeichen) });
      }
      if (art === 'erkennung_standard') {
        const an = neu[art] === true;
        const netz = !!d.erkennung?.pakete.find((x) => x.id === paket.id)?.netz;
        daten.erkennung = await sucheApi.erkennungStandard(an ? paket.id : null, an && netz);
      }
      if (art === 'mappenaktionen') daten.aktionen = await paketeApi.paketAktionenAusSetzen(paket.id, neu[art] as string[]);
    } catch (e) {
      const ff = e instanceof ApiFehler ? (e.details as { felderFehler?: Record<string, string> } | undefined)?.felderFehler : undefined;
      if (ff) for (const [k, v] of Object.entries(ff)) fehler[`${schluessel}.${k}`] = v;
      fehler[schluessel] = (e as Error).message;
    }
  }
  return { daten, fehler };
}

/** Eine Feldart des Kerns im Formular. */
export function KernEingabe({ art, paket, d, wert, setze, fehler }: { art: KernTyp; paket: Paket; d: KernDaten; wert: unknown; setze: (v: unknown) => void; fehler: Record<string, string> }) {
  if (art === 'ki_mappentypen') return d.ki ? <KiTypenFeld paket={paket.id} k={d.ki} wert={(wert as string[]) ?? []} setze={setze} /> : null;
  if (art === 'fragen_grenzen') return wert ? <FragenGrenzenFeld wert={wert as FragenEingabe} setze={setze} fehler={fehler} /> : null;
  if (art === 'erkennung_standard') return d.erkennung ? <ErkennungFeld paket={paket.id} s={d.erkennung} wert={wert === true} setze={setze} /> : null;
  return <PaketAktionenFeld paket={paket} wert={(wert as string[]) ?? []} setze={setze} />;
}
