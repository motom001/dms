/**
 * Was Ablago darf (#1562, intern: Vertrauensstufen) im Server: speichern, beim Update ableiten, ändern, durchsetzen.
 *
 * Gespeichert als eine Einstellung `darf` für die ganze Installation: beide Antworten, Höchstwerte vom Anbieter und ob
 * die Werte bei der Einrichtung gesetzt oder beim Update abgeleitet wurden. Neue Installationen bekommen die Vorgabe bei
 * der Einrichtung (einrichtung.ts). Bestehende Installationen bekommen beim ersten Lesen Werte, mit denen nichts
 * Installiertes angehalten wird und nichts ungefragt strenger oder lockerer wird (Thomas 24.11.2026): Frage 1 „Auch
 * Helfer, die Dienste im Netz nutzen“ – so viel, wie bisher ging (jedes Paket nach Bestätigung) –, Frage 2 „Erkennen und vorlegen“.
 * Ein einmaliger Hinweis in der Übersicht bittet, die Antworten anzusehen.
 *
 * Erhöhen braucht eine frische Anmeldung (die Route fragt sie über `frisch` ab), steht mit alt und neu im
 * Nachweis-Journal, und alle mit Verwaltungsrecht bekommen eine Mail. Es passiert nichts von selbst. Senken in Frage 1
 * nennt vorher die Pakete über der neuen Grenze (`betroffen`).
 */
import {
  DARF_EINSTELLUNG,
  DARF_VORGABE,
  erlaubt,
  hoeher,
  istPaketeGrenze,
  istSelbstStufe,
  liesDarf,
  strenger,
  ueberHoechstwert,
  type Darf,
  type DarfStand,
  type PaketeGrenze,
  type PaketStufe,
} from '../../../shared/src/darf';
import { eingebauterHelfer, paketStufe, type InstalliertesPaket } from '../../../shared/src/pakete';
import type { Einstellungen } from '../einstellungen/einstellungen';
import { Fachfehler } from '../grundlagen/fehler';
import { nachweis } from '../protokoll/nachweisjournal';
import { protokoll } from '../protokoll/protokoll';
import { t } from '../sprache/sprache';

const log = protokoll.modul('pakete');

/** Schlüssel des einmaligen Hinweises nach dem Update (#1562): „Neu: Was Ablago darf – bitte einmal ansehen“. */
export const DARF_HINWEIS = 'darf.neu';

/** Werte bei der Einrichtung einer neuen Installation. */
const darfBeiEinrichtung = (): DarfStand => ({ ...DARF_VORGABE, hoechstens: {}, herkunft: 'neu' });

const angabe = (p: InstalliertesPaket) => ({
  id: p.id,
  herausgeber: p.herausgeber,
  geprueft: p.herausgeberGeprueft !== false,
  code: p.laeufer,
});

/** Stufe eines installierten Pakets; null = eingebauter Helfer von Ablago (läuft auf jeder Antwort). */
function installierteStufe(p: InstalliertesPaket, alle: InstalliertesPaket[]): PaketStufe | null {
  const haupt = (id: string) => {
    const h = alle.find((x) => x.id === id);
    return !!h && eingebauterHelfer(angabe(h));
  };
  if (eingebauterHelfer(angabe(p), haupt)) return null;
  return p.laeufer ? paketStufe(p.laeufer) : p.code ? 'lokal' : 'vorlagen';
}

/** Grund in Worten, warum ein Paket über der Grenze liegt (Paketliste, Senken, Installieren). */
const grundIn = (name: string, stufe: PaketStufe) => t(`werkbank.darf.grund.${stufe}`, { name });

/** Installierte Pakete über einer Grenze, mit Grund in Worten. */
export function ueberGrenze(alle: InstalliertesPaket[], grenze: PaketeGrenze) {
  return alle.flatMap((p) => {
    const stufe = installierteStufe(p, alle);
    return stufe && !erlaubt(grenze, stufe) ? [{ id: p.id, name: p.name, stufe, grund: grundIn(p.name, stufe) }] : [];
  });
}

/**
 * Werte für eine bestehende Installation beim Update: Bisher ließ sich jedes Paket nach Bestätigung installieren – also
 * „Auch Helfer, die Dienste im Netz nutzen“. So wird nichts angehalten und nichts strenger; strenger stellt es erst jemand selbst ein.
 */
const updateWerte = (): DarfStand => ({ pakete: 'netz', selbst: DARF_VORGABE.selbst, hoechstens: {}, herkunft: 'update' });

/**
 * Stand lesen. Fehlt er (bestehende Installation, erstes Lesen nach dem Update), gelten die Werte für das Update; sie
 * werden gespeichert – auch bei mehreren Prozessen genau einmal (`tausche`). Ohne Speicher: die Vorgabe.
 */
export async function darfStand(einst: Einstellungen | undefined): Promise<DarfStand> {
  if (!einst) return darfBeiEinrichtung();
  const gespeichert = liesDarf(await einst.lies(DARF_EINSTELLUNG));
  if (gespeichert) return gespeichert;
  const w = updateWerte();
  if (einst.tausche) {
    if (!(await einst.tausche(DARF_EINSTELLUNG, null, w))) return liesDarf(await einst.lies(DARF_EINSTELLUNG)) ?? w;
  } else await einst.schreibe(DARF_EINSTELLUNG, w);
  log.info('Was Ablago darf: Werte für die bestehende Installation abgeleitet', { pakete: w.pakete, selbst: w.selbst });
  return w;
}

/** Was eine Änderung braucht: Pakete, Stand der Einrichtung, frische Anmeldung, Mail und wer ändert. */
export interface DarfKontext {
  pakete: () => Promise<InstalliertesPaket[]>;
  /** Läuft die Einrichtung noch? Nur dann lassen sich Höchstwerte aus der Einrichtungsdatei setzen. */
  einrichtungOffen: () => Promise<boolean>;
  /** Wirft, wenn die Anmeldung nicht frisch ist (Erhöhen). */
  frisch: () => void;
  mail: (alt: Darf, neu: Darf) => Promise<void>;
  /**
   * Senken (#1563): Pakete über der neuen Grenze anhalten. Ohne: Senken mit betroffenen Paketen wird abgelehnt.
   * Gibt die Ids der angehaltenen Pakete zurück.
   */
  anhalten?: (betroffen: Array<{ id: string; stufe: PaketStufe }>) => Promise<string[]>;
  von: string;
}

const wert = (d: Darf) => `${d.pakete}, ${d.selbst}`;

/** Höchstwerte aus der Einrichtungsdatei: nur während der Einrichtung und nur einmal. */
async function hoechstwerte(e: Record<string, unknown>, alt: DarfStand, k: DarfKontext): Promise<Partial<Darf>> {
  if (e.hoechstens === undefined) return alt.hoechstens;
  if (Object.keys(alt.hoechstens).length || !(await k.einrichtungOffen()))
    throw new Fachfehler(409, t('werkbank.darf.fehler.hoechstwerte'));
  const h = (e.hoechstens && typeof e.hoechstens === 'object' ? e.hoechstens : {}) as Record<string, unknown>;
  if ((h.pakete !== undefined && !istPaketeGrenze(h.pakete)) || (h.selbst !== undefined && !istSelbstStufe(h.selbst)))
    throw new Fachfehler(422, t('werkbank.darf.fehler.wert'));
  return { ...(h.pakete ? { pakete: h.pakete as PaketeGrenze } : {}), ...(h.selbst ? { selbst: h.selbst as Darf['selbst'] } : {}) };
}

/** Die neuen Antworten aus der Eingabe; was fehlt, bleibt. Unbekanntes: 422. */
function neueWerte(x: Record<string, unknown>, alt: Darf): Darf {
  if ((x.pakete !== undefined && !istPaketeGrenze(x.pakete)) || (x.selbst !== undefined && !istSelbstStufe(x.selbst)))
    throw new Fachfehler(422, t('werkbank.darf.fehler.wert'));
  return { pakete: (x.pakete as PaketeGrenze | undefined) ?? alt.pakete, selbst: (x.selbst as Darf['selbst'] | undefined) ?? alt.selbst };
}

/**
 * Ändern (Werkbank → Übersicht, Karte „Was Ablago darf“; Einrichtungsdatei über den Assistenten). Erhöhen: frische
 * Anmeldung, Journal, Mail. Senken in Frage 1: Pakete über der neuen Grenze erst nach Bestätigung (`bestaetigt`),
 * sonst 409 mit der Liste `betroffen`.
 */
export async function setzeDarf(einst: Einstellungen | undefined, e: unknown, k: DarfKontext): Promise<DarfStand> {
  if (!einst) throw new Fachfehler(503, t('werkbank.darf.fehler.speicher'));
  const x = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>;
  const alt = await darfStand(einst);
  const neu = neueWerte(x, alt);
  const hoechstens = await hoechstwerte(x, alt, k);
  if (ueberHoechstwert(hoechstens, neu)) throw new Fachfehler(422, t('werkbank.darf.fehler.anbieter'), { hoechstens });
  if (hoeher(alt, neu)) k.frisch();
  let angehalten: string[] = [];
  if (strenger(alt, neu)) {
    const alle = await k.pakete();
    const betroffen = ueberGrenze(alle, neu.pakete);
    if (betroffen.length) {
      if (!k.anhalten) throw new Fachfehler(409, t('werkbank.darf.fehler.entfernen'), { betroffen });
      if (x.bestaetigt !== true) throw new Fachfehler(409, t('werkbank.darf.fehler.anhalten'), { betroffen });
      angehalten = await k.anhalten(betroffen);
    }
  }
  const stand: DarfStand = { ...neu, hoechstens, herkunft: alt.herkunft };
  await einst.schreibe(DARF_EINSTELLUNG, stand);
  if (wert(alt) !== wert(neu) || hoechstens !== alt.hoechstens) {
    void nachweis('zugang.rechte', {
      was: 'darf',
      vorher: wert(alt),
      nachher: wert(neu),
      ...(angehalten.length ? { angehalten } : {}),
      von: k.von,
    });
    log.warn('Was Ablago darf geändert', { von: k.von, vorher: wert(alt), nachher: wert(neu), angehalten: angehalten.join(', ') || '–' });
  }
  if (hoeher(alt, neu))
    await k.mail(alt, neu).catch((f: Error) => log.warn('Mail zu „Was Ablago darf“ nicht gesendet', { fehler: f.message }));
  return stand;
}
