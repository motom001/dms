/** Schnittstelle (#1234): Pakete in der Werkbank: Katalog, Installieren und Aktualisieren, Einstellungen, Paket-Aktionen. */
import type { AktionenEinstellung, AktionRecht, AktionsSchritt, EingebauteAktion, KernDialog } from '../../../shared/src/paketaktionen';
import type { Archiv } from '../../../shared/src/archiv';
import type { AblaufEingabe, AblaufErgebnis, AblaufInstallation, AblaufPlan, Ergaenzung, HerkunftPruefung, InstalliertesPaket, Katalog, LaeuferZustand, RechtePunkt } from '../../../shared/src/pakete';
import type { Einstellungsbeschreibung } from '../../../shared/src/paketeinstellungen';
import type { ErstellenStand, PaketErstellenEingabe, PaketPruefung, SelbstErstellt, SelbstErstelltDetail } from '../../../shared/src/paketerstellung';
import type { Entscheidung, UmwandlungsFeld, Umwandlungsvorgang, UmwandlungsVorschau } from '../../../shared/src/umwandlung';
import type { ExternerDienst, ExternKennzahlen } from '../../../shared/src/extern';
import type { Abdeckung, Sprachangabe } from '../../../shared/src/sprachpaket';
import { anfrage, sendeDatei, speichereDatei } from './anfrage';
import type { ExternZeile } from './betrieb';

export interface ExternUebersicht { stunden: number; dienste: Array<{ dienst: ExternerDienst; paket: string | null } & ExternKennzahlen>; letzte: ExternZeile[] }
/** Einstellungen eines Pakets (#197): Beschreibung, Werte (Geheimnisse nur „gesetzt“), Auswahllisten, Status. */
export interface PaketEinstellungenStand {
  beschreibung: Einstellungsbeschreibung; werte: Record<string, unknown>; fehlend: string[];
  status: { letzterLauf: string | null; meldungen: string[] } | null; laeufer: boolean;
  auswahl: { typen: Array<{ id: string; name: string; felder: Array<{ key: string; label: string }> }>; benutzer: Array<{ id: string; name: string }>; rollen: Array<{ id: string; name: string }>; sichten: Array<{ id: string; name: string }> };
}
export interface PaketQuelle {
  url: string; offiziell: boolean; aktiv: boolean; von?: string | null; am?: string;
  /** Bestätigter Schlüssel des Anbieters (#594); null: ohne Schlüssel. */
  fingerabdruck?: string | null;
  /** Gesperrt nach einem Schlüsselwechsel, bis der neue bestätigt ist (#594). */
  gesperrt?: { fingerabdruck: string; seit: string } | null;
}
/** Beispiel-Mappe, die beim Entfernen blieb (#878): geändert oder andere Mappen verweisen auf sie. */
export interface BeispielBehalten { id: string; titel: string; grund: 'geaendert' | 'verwiesen' }
/** Vorschau einer Paketinstallation bzw. eines Updates (#188). */
export interface PaketVorschau {
  paket: { id: string; name: string; version: string; beschreibung: string; lizenz: string; autor: { name: string; github: string }; dms: string; abhaengigkeiten: Record<string, string>; readme: string | null; changelog: string | null; quelle: string | null; herausgeber?: string | null; herausgeberGeprueft?: boolean };
  dmsVersion: string; dmsOk: boolean; installiert: string | null; update: boolean; herkunft: InstalliertesPaket['herkunft'] | null;
  /** Umzug (#1084): frühere Id, von der das Update die Installation auf die neue zieht. */
  umzug?: string | null;
  /** Erstmals gesetzter Herausgeber (#1084): nur mit Bestätigung (herausgeberBestaetigt). */
  herausgeberBestaetigen?: string | null;
  /** Was die Signatur über die Herkunft sagt (#594). */
  pruefung?: HerkunftPruefung | null;
  /** problem (#1168): der Eintrag aus `probleme`, wenn die installierte Version nicht passt. */
  abhaengigkeiten: Array<{ id: string; bereich: string; installiert: string | null; ok: boolean; verfuegbar: string | null; problem?: string }>;
  typen: Array<{ schluessel: string; dmsSchluessel: string; name: string; felder: number; vorhanden: boolean; neueFelder: string[]; neueRegister: string[]; erkennung?: string[]; wiederfinden?: string[]; vorbelegen?: string[]; typAngaben?: boolean; formate?: string[]; beschriftungen?: number; abschnitte?: string[]; umwandeln?: Array<{ feld: string; aus: string; anzahl: number }>; konflikt: string | null; vorschlag: string | null; geloescht?: boolean; /** Umbau (#1041): entsteht aus diesem vorhandenen Typ (gleiche Id). */ uebernimmt?: string; /** Archivmodus des neuen Typs (#1051). */ archiv?: Archiv & { stichtagName: string | null } }>;
  sichten: Array<{ schluessel: string; name: string; eltern: string | null; vorhanden: boolean; konflikt: string | null; vorschlag: string | null; ausgelassen?: string | null; ohne?: string[]; /** Vorhandene Ansicht beim Update (#1125). */ zustand?: import('../../../shared/src/pakete').SichtZustand }>;
  beispiele: number; probleme: string[]; fehlercodes?: string[];
  /** Namenskonflikte (#1123): Einträge aus `probleme`, die sich durch Umbenennen in der Vorschau lösen lassen. */
  namenskonflikte?: string[];
  hinweise: string[]; einstellungen: { neu: string[]; weg: string[] } | null;
  /** Beispiel-Dokumente zu den Beispielen (#878). */
  beispielDokumente?: { anzahl: number; bytes: number };
  /** Vorgaben (#1038) und Vorlagen an Vorgaben anderer Pakete. */
  vorgaben?: import('../../../shared/src/vorgaben').VorgabePlan[];
  /** Umbau (#1041): was umzieht, Rückfragen, Rechte; nicht leer = braucht Bestätigung (nur „Gesamte Verwaltung“). */
  umbau?: import('../../../shared/src/umbau').UmbauPlan[];
  ergaenzungen?: import('../../../shared/src/vorgaben').ErgaenzungPlan[];
  /** Mitgelieferte Automatisierungen (#712); neu = steht beim Installieren zur Wahl. */
  /** eingeschaltet (#1082): wie im Paket angegeben; fehlt = nicht angegeben (siehe vorausgewaehlt in shared/src/pakete.ts). */
  automatisierungen?: Array<{ schluessel: string; name: string; beschreibung: string; neu: boolean; eingeschaltet?: boolean; /** „täglich um 05:00“ bei „Paket nach Zeitplan ausführen“ (#1082). */ zeitplan?: string;
    /** Update (#1174): selbst geändert – bleibt; was die neue Fassung aus dem Paket anders macht. */ geaendert?: { id: string; aenderungen: string[] } }>;
  /** Automatisierungsvorlagen (#1044) für die Rechte-Vorschau: Karten in Klartext, ersetzte Kern-Vorlage, neu bzw. mit anderen Karten. */
  ablaufvorlagen?: Array<{ schluessel: string; name: string; karten: string[]; ersetzt: string | null; neu: boolean; geaendert: boolean }>;
  /** Paket mit Code (#338): Rechte, Netzwerkzugriff und Ereignisse (#449); bestaetigen = muss ausdrücklich erlaubt werden. */
  laeufer?: { rechte: RechtePunkt[]; bestaetigen: boolean } | null;
  /** Sprachpaket (#731): Sprache, Abdeckung gegen diese Version, übergangene Texte, Pakete mit Beschriftungen. */
  sprache?: (Sprachangabe & { abdeckung: Abdeckung; uebergangen: number; pakete: string[] }) | null;
  /** Aktionen im Menü „Mappe“ (#1039) mit ihren Rechten; neu = beim Update dazu oder mit anderen Rechten. */
  aktionen?: Array<{ schluessel: string; name: string; rechte: AktionRecht[]; typen: string[]; dialog?: KernDialog; neu: boolean }>;
  /** Was mitkommt (#1047), beim Update mit „neu in dieser Version“; Kurzanleitung je Sprache. */
  mitkommt?: import('../../../shared/src/mitkommt').Mitkommt;
  kurzanleitung?: Record<string, string[]> | null;
}
/** Sammeldatei (#461): geprüft, Pakete in der Reihenfolge zum Installieren (Abhängigkeiten zuerst). */
export interface SammelPaket {
  upload: string; id: string; name: string; version: string; gewaehlt: boolean; abhaengigkeiten: Record<string, string>;
  /** Ergänzt ein anderes Paket (#405). */
  ergaenzt?: Ergaenzung;
  katalog: 'gleich' | 'unbekannt'; stand: 'neu' | 'neuer' | 'gleich' | 'aelter'; installiert: string | null; vorschau: PaketVorschau;
}
export interface Sammeldatei {
  datei: { sha256: string; groesse: number; erstellt: string; quelle: string; katalog: string; dms: string | null; pruefung: HerkunftPruefung; nichtImKatalog: string[] };
  pakete: SammelPaket[];
}
/** Paket-Läufer (#338): Stand je Paket mit Code. */
export interface PaketlaeuferStand {
  laeuft: boolean; pausiert: boolean; grenzen: { speicherMB: number; sekunden: number; parallel: number };
  /** Was der Läufer gerade tut (#403); absturz: Zeit des letzten Absturzes. */
  zustand: LaeuferZustand; absturz: string | null;
  pakete: Array<{ id: string; name: string; version: string; dienstkonto: string | null; geladen: boolean; fehler: string | null; aufrufe: number; fehlgeschlagen: number; letzterAufruf: string | null; dauerMs: number | null; speicherMB: number | null; ereignisse: { offen: number; aufgegeben: number; zugestellt: number; zuletzt?: string | null }; letzte: Array<{ zeit: string; art: string; ok: boolean; text: string }>; protokoll: Array<{ zeit: string; stufe: number; text: string }> }>;
}

export const paketeApi = {
  paketAktionWeiter: (lauf: string, antworten: Record<string, unknown>) => anfrage<AktionsSchritt>('POST', `/api/paketaktionen/laeufe/${encodeURIComponent(lauf)}`, { antworten }),
  paketAktionAbbrechen: (lauf: string) => anfrage<null>('DELETE', `/api/paketaktionen/laeufe/${encodeURIComponent(lauf)}`),
  paketAktionDatei: (lauf: string, name: string) => speichereDatei(`/api/paketaktionen/laeufe/${encodeURIComponent(lauf)}/datei`, {}, name),
  mappenaktionenEinstellung: () => anfrage<AktionenEinstellung>('GET', '/api/werkbank/pakete/mappenaktionen'),
  eingebauteAktionenSetzen: (eingebautAus: EingebauteAktion[]) => anfrage<AktionenEinstellung>('PUT', '/api/werkbank/pakete/mappenaktionen', { eingebautAus }),
  paketAktionenAusSetzen: (id: string, aus: string[]) => anfrage<AktionenEinstellung>('PUT', `/api/werkbank/pakete/${encodeURIComponent(id)}/mappenaktionen`, { aus }),
  pakete: () => anfrage<{ installiert: Array<InstalliertesPaket & { einstellungenNoetig?: boolean }>; katalogUrl: string; quellen: PaketQuelle[]; dms: string }>('GET', '/api/werkbank/pakete'),
  paketKatalog: (alle: boolean) => anfrage<{ kataloge: Array<{ url: string; offiziell: boolean; katalog: Katalog | null; fehler: string | null; pruefung?: HerkunftPruefung | null }>; abgerufen: string }>('POST', '/api/werkbank/pakete/katalog', { alle }),
  /** Mit Schlüssel (#594): ohne passenden Fingerabdruck 409 mit details.fingerabdruck zum Bestätigen. */
  paketQuelleHinzu: (url: string, fingerabdruck?: string) => anfrage<PaketQuelle[]>('POST', '/api/werkbank/pakete/quellen', { url, fingerabdruck }),
  paketQuelleSchluessel: (url: string, fingerabdruck?: string) => anfrage<PaketQuelle[]>('POST', '/api/werkbank/pakete/quellen/schluessel', { url, fingerabdruck }),
  paketQuelleSchalten: (url: string, aktiv: boolean) => anfrage<PaketQuelle[]>('PUT', '/api/werkbank/pakete/quellen', { url, aktiv }),
  paketQuelleEntfernen: (url: string) => anfrage<PaketQuelle[]>('DELETE', `/api/werkbank/pakete/quellen?${new URLSearchParams({ url })}`),
  /** Ein Paket oder eine Sammeldatei mit mehreren Paketen (#461) – das DMS erkennt es am Inhalt. */
  paketHochladen: (datei: File) => sendeDatei('/api/werkbank/pakete/hochladen', datei) as Promise<{ upload: string; vorschau: PaketVorschau } | { sammeldatei: Sammeldatei }>,
  paketVorschau: (e: { id?: string; version?: string; quelle?: string; upload?: string }) => anfrage<PaketVorschau>('POST', '/api/werkbank/pakete/vorschau', e),
  /** Mehrere Pakete in einem Ablauf (#405): Plan ohne zu speichern, dann alles mit einem Knopf. */
  paketAblaufPlan: (e: AblaufEingabe) => anfrage<AblaufPlan<PaketVorschau>>('POST', '/api/werkbank/pakete/ablauf/plan', e),
  paketAblaufInstallieren: (e: AblaufInstallation) => anfrage<AblaufErgebnis>('POST', '/api/werkbank/pakete/ablauf/installieren', e),
  paketInstallieren: (e: { id?: string; version?: string; quelle?: string; upload?: string; bestaetigt?: boolean; rechteBestaetigt?: boolean; herausgeberBestaetigt?: boolean; umbauBestaetigt?: boolean; umbauEntscheidungen?: import('../../../shared/src/umbau').UmbauEntscheidungen; sichtenErsetzen?: string[]; automatisierungen?: string[]; namen?: Record<string, string>; sichtNamen?: Record<string, string>; beispiele?: boolean; mitAbhaengigkeiten?: boolean }) => anfrage<InstalliertesPaket>('POST', '/api/werkbank/pakete/installieren', e),
  paketUpdates: () => anfrage<Array<{ id: string; installiert: string; neu: string; changelog: string | null; quelle: string }>>('POST', '/api/werkbank/pakete/updates'),
  paketAktualisieren: (id: string, version?: string, bestaetigt?: boolean, rechteBestaetigt?: boolean, mehr: { automatisierungen?: string[]; herausgeberBestaetigt?: boolean; umbauBestaetigt?: boolean; umbauEntscheidungen?: import('../../../shared/src/umbau').UmbauEntscheidungen; sichtenErsetzen?: string[] } = {}) => anfrage<InstalliertesPaket>('POST', `/api/werkbank/pakete/${encodeURIComponent(id)}/aktualisieren`, { version, bestaetigt, rechteBestaetigt, ...mehr }),
  paketLaeufer: () => anfrage<PaketlaeuferStand | null>('GET', '/api/werkbank/pakete/laeufer'),
  /** Vorgaben (#1038): unbenutzte in Typen anderer Pakete nur mit `vorgaben` – ohne fragt der Server (409, `vorgaben`). */
  paketEntfernen: (id: string, einstellungenBehalten = false, spracheBestaetigt = false, vorgaben?: 'entfernen' | 'behalten') => {
    const q = [einstellungenBehalten ? 'einstellungenBehalten=1' : '', spracheBestaetigt ? 'spracheBestaetigt=1' : '', vorgaben ? `vorgaben=${vorgaben}` : ''].filter(Boolean).join('&');
    return anfrage<{ beispieleBehalten: BeispielBehalten[]; vorgabenBehalten?: Array<{ id: string; titel: string }> }>('DELETE', `/api/werkbank/pakete/${encodeURIComponent(id)}${q ? `?${q}` : ''}`);
  },
  /** Beispiele entfernen (#878): unveränderte Beispiel-Mappen samt Dokumenten; geänderte bleiben und stehen in `behalten`. */
  paketBeispieleEntfernen: (id: string) => anfrage<{ entfernt: number; behalten: BeispielBehalten[] }>('POST', `/api/werkbank/pakete/${encodeURIComponent(id)}/beispiele/entfernen`),
  paketEinstellungen: (id: string) => anfrage<PaketEinstellungenStand>('GET', `/api/werkbank/pakete/${encodeURIComponent(id)}/einstellungen`),
  /** adresseBestaetigt (#444): Hinweis zur Dienst-Adresse bestätigt – sonst 409, wenn sich eine Adresse ändert. */
  paketEinstellungenSpeichern: (id: string, werte: Record<string, unknown>, adresseBestaetigt = false) => anfrage<PaketEinstellungenStand>('PUT', `/api/werkbank/pakete/${encodeURIComponent(id)}/einstellungen`, { werte, ...(adresseBestaetigt ? { adresseBestaetigt: true } : {}) }),
  /* Paket-Update: Text in Verweis umwandeln (#534) */
  paketUmwandlungen: (id: string) => anfrage<{ felder: UmwandlungsFeld[]; vorgaenge: Umwandlungsvorgang[] }>('GET', `/api/werkbank/pakete/${encodeURIComponent(id)}/umwandlungen`),
  paketUmwandlungVorschau: (id: string, typId: string, feldKey: string) => anfrage<UmwandlungsVorschau>('POST', `/api/werkbank/pakete/${encodeURIComponent(id)}/umwandlungen/vorschau`, { typId, feldKey }),
  paketUmwandeln: (id: string, typId: string, feldKey: string, entscheidungen: Record<string, Entscheidung>) => anfrage<{ umgewandelt: number; neuePersonen: number; ausgelassen: UmwandlungsVorschau['ausgelassen'] }>('POST', `/api/werkbank/pakete/${encodeURIComponent(id)}/umwandlungen`, { typId, feldKey, entscheidungen }),
  paketUmwandlungZurueck: (id: string, vorgang: string) => anfrage<{ zurueck: number; ausgelassen: UmwandlungsVorschau['ausgelassen']; personenBehalten: number }>('POST', `/api/werkbank/pakete/${encodeURIComponent(id)}/umwandlungen/${encodeURIComponent(vorgang)}/rueckgaengig`),
  paketAktion: (id: string, aktion: string) => anfrage<{ ok: boolean; text: string }>('POST', `/api/werkbank/pakete/${encodeURIComponent(id)}/aktionen/${encodeURIComponent(aktion)}`),
  /* Paket selbst erstellen (#374) */
  paketErstellenStand: () => anfrage<ErstellenStand>('GET', '/api/werkbank/pakete/erstellen'),
  paketErstellenPruefen: (e: PaketErstellenEingabe) => anfrage<PaketPruefung>('POST', '/api/werkbank/pakete/erstellen/pruefen', e),
  /** #651: Id, Name und Version aus der zuletzt weitergegebenen .zip lesen (installiert nichts). */
  paketLetzteVersion: (datei: File) => sendeDatei('/api/werkbank/pakete/erstellen/letzte', datei) as Promise<{ id: string; name: string; version: string }>,
  /** #652: Paket erstellen ohne Download; erscheint unter „Installiert“ als selbst erstellt. */
  paketAnlegen: (e: PaketErstellenEingabe) => anfrage<SelbstErstellt & { datei: string; bytes: number }>('POST', '/api/werkbank/pakete/erstellen/anlegen', e),
  selbstErstellt: () => anfrage<SelbstErstellt[]>('GET', '/api/werkbank/pakete/selbst'),
  selbstErstelltDetail: (id: string) => anfrage<SelbstErstelltDetail>('GET', `/api/werkbank/pakete/selbst/${encodeURIComponent(id)}`),
  selbstErstelltZip: (id: string, version: string) => `/api/werkbank/pakete/selbst/${encodeURIComponent(id)}/zip?version=${encodeURIComponent(version)}`,
  selbstAusListe: (id: string) => anfrage<SelbstErstellt[]>('DELETE', `/api/werkbank/pakete/selbst/${encodeURIComponent(id)}`),
  paketExportieren: (e: PaketErstellenEingabe) => speichereDatei('/api/werkbank/pakete/erstellen/export', e, `${e.id}-${e.version}.zip`),
  paketExtern: (id: string, stunden: number) => anfrage<ExternUebersicht>('GET', `/api/werkbank/pakete/${encodeURIComponent(id)}/extern?stunden=${stunden}`),
};
