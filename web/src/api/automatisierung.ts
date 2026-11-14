/** Schnittstelle (#1234): Automatisierungen und Ablaufvorlagen (#675, #1172–#1177). */
import type { AussenZiel, AutomatisierungAnsicht, AutomatisierungDaten, Fehlschlag, Kontextdaten, Lauf } from '../../../shared/src/automatisierung';
import type { AblaufAntworten, AblaufProbe, AblaufVerlauf, AblaufvorlageAnsicht, AblaufvorlageDaten, MappenAblauf } from '../../../shared/src/ablaufvorlagen';
import { anfrage } from './anfrage';

/** Eine Zustellung nach außen (#671) – ohne Inhalte. */
export interface AussenZustellung { id: string; automatisierungId: string; karte: string; art: 'url' | 'email'; ziel: string; zustand: 'offen' | 'zugestellt' | 'aufgegeben' | 'verworfen'; versuche: number; status: number | null; fehler: string | null; erstellt: string; erledigt: string | null }

export const automatisierungApi = {
  ablaufAendern: (id: string, e: { datum: string; text?: string; empfaengerId?: string }) => anfrage<MappenAblauf & { hinweis?: string }>('PUT', `/api/ablaeufe/${id}`, e),
  ablaufLoeschen: (id: string) => anfrage<null>('DELETE', `/api/ablaeufe/${id}`),
  ablaufFortsetzen: (id: string) => anfrage<MappenAblauf | null>('POST', `/api/werkbank/ablaeufe/${id}/fortsetzen`),
  /* Werkbank → Automatisierungsvorlagen (#1044) */
  ablaufvorlagen: () => anfrage<{ vorlagen: AblaufvorlageAnsicht[]; angehalten: Array<{ id: string; vorlage: string; mappeId: string; grund: string }> }>('GET', '/api/werkbank/ablaufvorlagen'),
  ablaufvorlageAnlegen: (v: Partial<AblaufvorlageDaten> & { aktiv?: boolean }) => anfrage<AblaufvorlageAnsicht>('POST', '/api/werkbank/ablaufvorlagen', v),
  ablaufvorlageAendern: (kennung: string, v: Partial<AblaufvorlageDaten> & { version: number; aktiv?: boolean }) => anfrage<AblaufvorlageAnsicht>('PUT', `/api/werkbank/ablaufvorlagen/${encodeURIComponent(kennung)}`, v),
  ablaufvorlageLoeschen: (kennung: string) => anfrage<null>('DELETE', `/api/werkbank/ablaufvorlagen/${encodeURIComponent(kennung)}`),
  ablaufvorlageSchalten: (kennung: string, aktiv: boolean) => anfrage<AblaufvorlageAnsicht>('PUT', `/api/werkbank/ablaufvorlagen/${encodeURIComponent(kennung)}/aktiv`, { aktiv }),
  ablaufvorlageKopieren: (kennung: string) => anfrage<AblaufvorlageAnsicht>('POST', `/api/werkbank/ablaufvorlagen/${encodeURIComponent(kennung)}/kopieren`),
  ablaufvorlageZuruecksetzen: (kennung: string) => anfrage<AblaufvorlageAnsicht>('POST', `/api/werkbank/ablaufvorlagen/${encodeURIComponent(kennung)}/zuruecksetzen`),
  ablaufvorlageVerlauf: (kennung: string) => anfrage<AblaufVerlauf[]>('GET', `/api/werkbank/ablaufvorlagen/${encodeURIComponent(kennung)}/verlauf`),
  ablaufvorlageBenutzt: (kennung: string) => anfrage<MappenAblauf[]>('GET', `/api/werkbank/ablaufvorlagen/${encodeURIComponent(kennung)}/benutzt`),
  ablaufvorlageAusprobieren: (kennung: string, mappeId: string, e: AblaufAntworten) => anfrage<{ zeilen: string[]; vorschau: AblaufProbe[] }>('POST', `/api/werkbank/ablaufvorlagen/${encodeURIComponent(kennung)}/ausprobieren`, { ...e, mappeId }),
  // Automatisierungen (#675)
  automatisierungen: () => anfrage<{ automatisierungen: AutomatisierungAnsicht[]; fehlgeschlagen: number; fehlschlaege: Fehlschlag[]; kontext: Kontextdaten; umgezogen: { am: string; anzahl: number } | null }>('GET', '/api/werkbank/automatisierungen'),
  automatisierungUmzugGesehen: () => anfrage<null>('POST', '/api/werkbank/automatisierungen/umzug-gesehen'),
  automatisierungAnlegen: (d: Partial<AutomatisierungDaten> & { aktiv?: boolean }) => anfrage<AutomatisierungAnsicht>('POST', '/api/werkbank/automatisierungen', d),
  automatisierungAendern: (id: string, d: Partial<AutomatisierungDaten> & { aktiv?: boolean; version: number }) => anfrage<AutomatisierungAnsicht>('PUT', `/api/werkbank/automatisierungen/${id}`, d),
  automatisierungLoeschen: (id: string) => anfrage<null>('DELETE', `/api/werkbank/automatisierungen/${id}`),
  automatisierungSchalten: (id: string, aktiv: boolean) => anfrage<AutomatisierungAnsicht>('PUT', `/api/werkbank/automatisierungen/${id}/aktiv`, { aktiv }),
  automatisierungKopieren: (id: string) => anfrage<AutomatisierungAnsicht>('POST', `/api/werkbank/automatisierungen/${id}/kopieren`),
  /** Aufruf von außen (#679): Adresse anlegen/erneuern oder neues Geheimnis – das Geheimnis steht nur in dieser Antwort. */
  automatisierungAufruf: (id: string, was: 'adresse' | 'geheimnis') => anfrage<{ adresse: string; erstellt: string; geheimnisSeit: string; geheimnis: string; oeffentlich: boolean }>('POST', `/api/werkbank/automatisierungen/${id}/aufruf`, { was }),
  automatisierungAufrufEntfernen: (id: string) => anfrage<void>('DELETE', `/api/werkbank/automatisierungen/${id}/aufruf`),
  // Nach außen (#671): Ziele, Geheimnis je Karte „URL aufrufen“ (nur in dieser Antwort), Zustellungen ohne Inhalte.
  automatisierungZiele: () => anfrage<{ ziele: AussenZiel[] }>('GET', '/api/werkbank/automatisierungen/ziele'),
  automatisierungZieleSetzen: (ziele: AussenZiel[]) => anfrage<{ ziele: AussenZiel[]; betroffen: Array<{ id: string; name: string }> }>('PUT', '/api/werkbank/automatisierungen/ziele', { ziele }),
  automatisierungGeheimnis: (id: string, karte: string) => anfrage<{ geheimnis: string; erstellt: string }>('POST', `/api/werkbank/automatisierungen/${id}/geheimnis/${encodeURIComponent(karte)}`),
  automatisierungGeheimnisEntfernen: (id: string, karte: string) => anfrage<void>('DELETE', `/api/werkbank/automatisierungen/${id}/geheimnis/${encodeURIComponent(karte)}`),
  automatisierungZustellungen: (id: string) => anfrage<AussenZustellung[]>('GET', `/api/werkbank/automatisierungen/${id}/zustellungen`),
  automatisierungLaeufe: (id: string) => anfrage<Lauf[]>('GET', `/api/werkbank/automatisierungen/${id}/laeufe?anzahl=30`),
  automatisierungLaufWiederholen: (laufId: string) => anfrage<Lauf>('POST', `/api/werkbank/automatisierungen/laeufe/${laufId}/wiederholen`),
  automatisierungLaufNichtWiederholen: (laufId: string) => anfrage<unknown>('POST', `/api/werkbank/automatisierungen/laeufe/${laufId}/nicht-wiederholen`),
  automatisierungenNichtWiederholen: () => anfrage<unknown>('POST', '/api/werkbank/automatisierungen/nicht-wiederholen'),
  automatisierungenWiederholen: (id?: string) => anfrage<unknown>('POST', id ? `/api/werkbank/automatisierungen/${id}/wiederholen` : '/api/werkbank/automatisierungen/wiederholen'),
  automatisierungTestmappen: (id: string, suche: string) => anfrage<{ mappen: Array<{ id: string; titel: string; typId: string }>; gesamt: number }>('GET', `/api/werkbank/automatisierungen/${id}/testmappen?suche=${encodeURIComponent(suche)}`),
  automatisierungWiedergeben: (id: string, mappeId: string, trocken: boolean) => anfrage<Lauf>('POST', `/api/werkbank/automatisierungen/${id}/wiedergeben`, { mappeId, trocken }),
};
