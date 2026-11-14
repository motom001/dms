/** Schnittstelle (#1234): Suche, Vektoren und Texterkennung, „Frag deine Ablage“, KI-Typen und Erkennung. */
import { messung } from '../messung';
import type { Wortgruppe } from '../../../shared/src/suche';
import type { Dokument, OcrStandArt } from '../../../shared/src/model';
import type { KiUebersicht } from '../../../shared/src/pakete';
import type { FrageZeile, FragenGrenzen, VerlaufEintrag } from '../../../shared/src/fragen';
import { erreichbarkeit, NICHT_ERREICHBAR } from '../erreichbar';
import { t } from '../sprache';
import { sprache } from '../../../shared/src/sprache';
import { ABGEMELDET, ApiFehler, anfrage } from './anfrage';

/** Erkennung per Paket (#511): Standard in der Werkbank und Pakete mit dms:erkennen. */
export interface ErkennungStand { standard: { paket: string | null; abfluss?: boolean }; pakete: Array<{ id: string; name: string; netz: boolean; laeuft: boolean }> }
/** Werkbank → Suche (#356). */
export interface SucheStand { unscharf: boolean; woerter: number; synonyme: Wortgruppe[] }
/** „Frag deine Ablage“ (#444): Werkbank (Höchstmenge) und Frage stellen (Antwort als NDJSON-Strom). */
export interface FragenStand { verfuegbar: boolean; paket: string | null; grenzen: FragenGrenzen }
/**
 * Frage stellen (#444): Die Antwort kommt Zeile für Zeile (NDJSON) – erst die Ausschnitte, dann Teile, zum Schluss
 * „fertig“ oder „fehler“. Fehler vor dem Start (keine Frage, kein Paket) kommen als ApiFehler.
 */
export async function frageStellen(frage: string, verlauf: VerlaufEintrag[], zeile: (z: FrageZeile) => void, signal?: AbortSignal): Promise<void> {
  let r: Response;
  const start = performance.now();
  const seite = messung.seite;
  // Messpanel (#565): Die letzte Zeile bringt die Zeiten der externen Dienste mit.
  const mitMessung = (z: FrageZeile) => { if (z.art === 'fertig' || z.art === 'fehler') messung.erfasseStrom(seite, { methode: 'POST', url: '/api/fragen', status: r.status, start, extern: z.extern }); zeile(z); };
  try {
    r = await fetch('/api/fragen', { method: 'POST', credentials: 'same-origin', signal, headers: { 'x-dms': '1', 'x-sprache': sprache(), 'content-type': 'application/json' }, body: JSON.stringify({ frage, verlauf }) });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    erreichbarkeit.ausfall();
    throw new ApiFehler(0, NICHT_ERREICHBAR);
  }
  if (!r.ok || !r.body) {
    const d = await r.json().catch(() => null) as { fehler?: string; details?: unknown } | null;
    if (r.status === 401) dispatchEvent(new Event(ABGEMELDET));
    throw new ApiFehler(r.status, d?.fehler ?? t('oberflaeche.api.fehler', { status: r.status }), d?.details);
  }
  const leser = r.body.pipeThrough(new TextDecoderStream()).getReader();
  let rest = '';
  for (;;) {
    const { done, value } = await leser.read();
    if (value) rest += value;
    let i: number;
    while ((i = rest.indexOf('\n')) >= 0) {
      const z = rest.slice(0, i).trim();
      rest = rest.slice(i + 1);
      if (z) mitMessung(JSON.parse(z) as FrageZeile);
    }
    if (done) break;
  }
  if (rest.trim()) mitMessung(JSON.parse(rest) as FrageZeile);
}
/** Vektoren in der Werkbank (#442). */
export interface VektorStand { paket: string | null; modell: string | null; mitVektor: number; mitVolltext: number; modelle: Array<{ paket: string; modell: string; anzahl: number }>; suche: boolean; zwischenspeicherMB: number | null }
/** Volltext und Texterkennung (#45, #459): Stand, Werkzeuge und Einstellungen für die Werkbank. */
export interface OcrEinstellungen { aktiv: boolean; auftraege: number }
export interface OcrStatus {
  zaehler: Record<OcrStandArt, number>; laufend: number;
  werkzeuge: { pdftotext: boolean; pdftoppm: boolean };
  einstellungen: OcrEinstellungen; dateitypen: Record<string, string>;
  /** #395: erkannte Sprachen (Kennung → Anzahl Dokumente). */
  erkannteSprachen?: Record<string, number>;
  /** #458: Paket, das die Texterkennung übernimmt (null = keins), mit seinen Sprachen (#459). */
  paket?: { id: string; name: string; version: string; sprachen?: string[] } | null;
  /** #459: woher der Volltext fertiger Dokumente kommt. */
  herkunft?: { pdf: number; paket: number; api: number; eingebaut: number; sonst: number; ohneText: number };
  /** #577: Pakete zum Umwandeln und je anderem Dateityp, wer zuständig ist (oder welches Paket im Katalog es wäre). */
  umwandlung?: {
    pakete: Array<{ id: string; name: string; version: string; typen: string[] }>;
    /** #614: Pakete mit dms:volltext. */
    volltextPakete?: Array<{ id: string; name: string; version: string; typen: string[] }>;
    typen: Array<{ mime: string; name: string; anzahl: number; paket: { id: string; name: string } | null; katalog: { id: string; name: string } | null;
      /** #614: Paket, das den Volltext liefert (bzw. das aus dem Katalog). */
      volltext?: { id: string; name: string } | null; volltextKatalog?: { id: string; name: string } | null }>;
  };
  /** #631: Archivfassung (PDF/A) – Pakete, Anzahl je Stand, Dokumente mit Fehler oder ausgelassen; null ohne. */
  archivfassung?: {
    pakete: Array<{ id: string; name: string; version: string; typen: string[] }>;
    zaehler: { fertig: number; bytes: number; wartet: number; ausgelassen: number; fehler: number };
    liste: Array<{ dokument: string; name: string; mappeId: string; stand: 'wartet' | 'ausgelassen' | 'fehler' | 'fertig'; info: string | null; zeit: string; paket: string | null }>;
    /** #1216: Nachlauf der Vorschaubilder aus der Archivfassung – offen, erstellt, ohne Bild; null ohne Nachlauf. */
    vorschau?: { offen: number; erledigt: number; ohne: number; seit: string; zeit: string } | null;
  } | null;
}

export const sucheApi = {
  // KI-Dienste (#796): Mappentypen für KI-Pakete zulassen bzw. sperren.
  kiTypen: () => anfrage<KiUebersicht>('GET', '/api/werkbank/ki-typen'),
  setzeKiTyp: (typId: string, zugelassen: boolean) => anfrage<KiUebersicht>('PUT', `/api/werkbank/ki-typen/${typId}`, { zugelassen }),
  texterkennung: (werkzeugeNeu = false) => anfrage<OcrStatus>('GET', `/api/werkbank/texterkennung${werkzeugeNeu ? '?neu' : ''}`),
  texterkennungSpeichern: (e: Partial<OcrEinstellungen>) => anfrage<OcrStatus>('PUT', '/api/werkbank/texterkennung', e),
  /* Vektoren (#442) */
  vektorStand: () => anfrage<VektorStand>('GET', '/api/werkbank/vektoren'),
  vektorSuche: (suche: boolean) => anfrage<VektorStand>('PUT', '/api/werkbank/vektoren', { suche }),
  vektorenNeu: () => anfrage<{ entfernt: number }>('POST', '/api/werkbank/vektoren/neu'),
  /* Suche (#356) */
  sucheStand: () => anfrage<SucheStand>('GET', '/api/werkbank/suche'),
  sucheSetze: (e: { unscharf: boolean }) => anfrage<SucheStand>('PUT', '/api/werkbank/suche', e),
  // Gleichbedeutende Wörter (#356, #992): Wörter als Liste in ihrer Reihenfolge; `stand` = `geaendert` der Gruppe (#917).
  synonymNeu: (woerter: string[]) => anfrage<SucheStand & { id: string }>('POST', '/api/werkbank/suche/synonyme', { woerter }),
  synonymAendern: (id: string, woerter: string[], stand?: string) => anfrage<SucheStand>('PUT', `/api/werkbank/suche/synonyme/${encodeURIComponent(id)}`, { woerter, ...(stand ? { stand } : {}) }),
  synonymLoeschen: (id: string) => anfrage<SucheStand>('DELETE', `/api/werkbank/suche/synonyme/${encodeURIComponent(id)}`),
  woerterNeu: () => anfrage<SucheStand>('POST', '/api/werkbank/suche/woerter'),
  /* Erkennung per Paket (#511) */
  erkennungStand: () => anfrage<ErkennungStand>('GET', '/api/werkbank/erkennung'),
  erkennungStandard: (paket: string | null, abfluss = false) => anfrage<ErkennungStand>('PUT', '/api/werkbank/erkennung', { paket, ...(abfluss ? { abfluss: true } : {}) }),
  /* „Frag deine Ablage“ (#444) */
  fragenVerfuegbar: () => anfrage<{ verfuegbar: boolean; paket: string | null }>('GET', '/api/fragen'),
  fragenStand: () => anfrage<FragenStand>('GET', '/api/werkbank/fragen'),
  fragenGrenzen: (g: FragenGrenzen) => anfrage<FragenStand>('PUT', '/api/werkbank/fragen', g),
  // Aufträge der Texterkennung (#61)
  ocrAuftraege: (stand: string, von = 0) => anfrage<{ gesamt: number; eintraege: Array<{ dokument: Dokument; mappeTitel: string; typId: string }> }>('GET', `/api/werkbank/texterkennung/auftraege?stand=${stand}&von=${von}&anzahl=100`),
  ocrNeu: (ids: string[]) => anfrage<{ eingereiht: number }>('POST', '/api/werkbank/texterkennung/auftraege/neu', { ids }),
  ocrFehlerNeu: () => anfrage<{ eingereiht: number }>('POST', '/api/werkbank/texterkennung/auftraege/fehler-neu'),
  ocrAbbrechen: (ids: string[]) => anfrage<{ abgebrochen: number }>('POST', '/api/werkbank/texterkennung/auftraege/abbrechen', { ids }),
};
