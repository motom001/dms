/** Schnittstelle (#1234): Einrichtung und Anbindung: Assistent, Datenbank, Neustart, Lasttest, Beispieldaten, Wiederherstellen. */
import type { LasttestStand } from '../../../shared/src/lasttest';
import type { AblaufEingabe, AblaufPlan, InstalliertesPaket, Katalog } from '../../../shared/src/pakete';
import type { DateiFehler, Einrichtungsplan, Planprobleme } from '../../../shared/src/einrichtungsplan';
import type { Auftrag } from '../../../shared/src/auftrag';
import type { Dokumentart } from '../../../shared/src/demodaten';
import { anfrage } from './anfrage';
import type { AnbindungAnsicht } from './konto';
import type { WhLauf } from './betrieb';
import type { PaketVorschau } from './pakete';

export interface AnbindungEingabe { host: string; port: number; datenbank: string; benutzer: string; passwort: string }
export type AnbindungPruefung = { ok: true; postgres: string; eingerichtet: boolean; benutzer: number } | { ok: false; art: 'nicht_erreichbar' | 'anmeldung' | 'datenbank_fehlt' | 'sonst'; text: string; anlegenMoeglich?: boolean; technisch: string };
export type EinrichtungSchritt = 'schluessel' | 'pakete' | 'optional' | 'fertig';
export interface EinrichtungStand { offen: boolean; erledigt: EinrichtungSchritt[]; uebersprungen: EinrichtungSchritt[]; mandant: string | null }
export interface AnbindungStand { anbindung: AnbindungAnsicht; datei: string; umgebung: 'fehlt' | 'gleich' | 'abweichend'; neustartNoetig: boolean; /** dms-komplett (#208) */ imContainer?: boolean; /** #943: /data/postgres ohne Volume */ ohneVolume?: boolean }
/** Sicherungen (#103–#105). */
export interface SicherungsMeta {
  format: number; datei: string; haushaltId: string;
  umgebung: { dms: string; datenbankStand: string | null; postgres: string; node: string; system: string; architektur: string };
  art: 'manuell' | 'automatisch' | 'vor-wiederherstellung'; ausgeloestVon: string; beginn: string; ende: string; dauerSekunden: number;
  anzahl: { mappen: number; dokumente: number; benutzer: number; dateien: number; tabellen: number };
  groessen: { datenbankBytes: number; dateienBytes: number; sicherungBytes: number };
  verschluesselung: { verfahren: string; fingerabdruck: string }; sha256: string; migrationen: string[];
}
/** Sicherung außer Haus (#585): schlanke Metadaten (vom Ziel) und Stand der Kopie je Paket. */
export interface SicherungSchlank { format: number; schlank: true; datei: string; groesse: number; sha256: string; beginn: string; verschluesselung: { verfahren: string; fingerabdruck: string } }
/** Wiederherstellen (#107) und Probe (#109). */
export interface WhSchritt { name: string; status: 'offen' | 'laeuft' | 'ok' | 'fehler' | 'hinweis' | 'ausgelassen'; info?: string }
export interface WhAbschluss { am: string; sicherung: string; von: string; schritte: WhSchritt[]; hinweise: string[] }
export interface WhAbgleich {
  name: string; meta: SicherungsMeta;
  vergleich: Array<{ was: string; damals: string; heute: string; urteil: 'gleich' | 'ok' | 'hinweis' | 'fehler'; info?: string }>;
  probleme: string[]; hinweise: string[]; schluesselNoetig: boolean;
}
export type DemoStufe = 'leicht' | 'realistisch' | 'schwer';
export interface DemoOptionen {
  anzahl: number;
  startwert?: string;
  dokumente?: { anteil: number; von: number; bis: number; stufe?: DemoStufe; mischung?: Record<Dokumentart, number>; duplikate: number } | null;
}
export interface DemoAbschaetzung {
  mappen: number; mappenMitRegister: number; frei: number | null; mindest: number; reicht: boolean; rastern: boolean;
  /** Mappentypen, die sich nicht erzeugen lassen (#711). */
  nichtErzeugbar?: Array<{ typ: string; anzahl: number; grund: string }>;
  dokumente: { dokumente: number; bytes: number; ocrSeiten: number; seiten: number; jeArt: Record<Dokumentart, number> } | null;
}
export interface DemoErgebnis {
  gesamt: number; erzeugt: Record<string, number>; uebersprungen: Array<{ typ: string; grund: string; anzahl?: number }>;
  startwert?: string; dauerMs?: number; abgebrochen?: string; ohneRastern?: boolean;
  dokumente?: { anzahl: number; bytes: number; seiten: number; texterkennung: number; duplikate: number; jeArt: Record<Dokumentart, number>; dauerMs: number } | null;
}
export type Verbindung = 'starttls' | 'ssl' | 'keine';
/** Server zur Adresse (#813); `gefragt`: wen Ablago dafür gefragt hat. */
export interface MailSuche {
  domain: string; gefragt: string[];
  fund: { host: string; port: number; verbindung: Verbindung; quelle: 'liste' | 'dns' | 'mx' | 'autoconfig' | 'thunderbird'; anbieter: string | null; benutzer: 'adresse' | 'lokalteil' } | null;
}

export const einrichtungApi = {
  /* Lasttest-Modus (#612) */
  lasttest: () => anfrage<LasttestStand>('GET', '/api/lasttest'),
  lasttestAngaben: (angaben: Partial<LasttestStand['angaben']>) => anfrage<LasttestStand>('POST', '/api/lasttest/angaben', angaben),
  lasttestBeenden: () => anfrage<{ ok: true }>('POST', '/api/lasttest/beenden', {}),
  /* Einrichtungsassistent (#119) */
  einrichtungCode: () => anfrage<{ ok: true }>('POST', '/api/einrichtung/code'),
  einrichtungDbPruefen: (anbindung: AnbindungEingabe) => anfrage<AnbindungPruefung>('POST', '/api/einrichtung/datenbank/pruefen', { anbindung }),
  einrichtungDbAnlegen: (anbindung: AnbindungEingabe) => anfrage<AnbindungPruefung>('POST', '/api/einrichtung/datenbank/anlegen', { anbindung }),
  einrichtungDbUebernehmen: (anbindung: AnbindungEingabe) => anfrage<{ ok: true }>('POST', '/api/einrichtung/datenbank/uebernehmen', { anbindung }),
  // Sammeln vor „Jetzt einrichten“ (#804) und Konfigurationsdatei (#806) – mit Einrichtungscode.
  einrichtungPruefen: (plan: Einrichtungsplan, passwort?: string) => anfrage<{ probleme: Planprobleme }>('POST', '/api/einrichtung/pruefen', { plan, passwort }),
  einrichtungDateiLesen: (text: string) => anfrage<{ plan: Einrichtungsplan | null; fehler: DateiFehler[]; hinweise: string[] }>('POST', '/api/einrichtung/datei/lesen', { text }),
  einrichtungDateiSchreiben: (plan: Einrichtungsplan) => anfrage<{ text: string; name: string }>('POST', '/api/einrichtung/datei/schreiben', { plan }),
  einrichtungPakete: () => anfrage<{ installiert: InstalliertesPaket[]; dms: string }>('GET', '/api/einrichtung/pakete'),
  einrichtungPaketKatalog: () => anfrage<{ kataloge: Array<{ url: string; offiziell: boolean; katalog: Katalog | null; fehler: string | null }>; abgerufen: string }>('POST', '/api/einrichtung/pakete/katalog', {}),
  einrichtungPaketPlan: (e: AblaufEingabe) => anfrage<AblaufPlan<PaketVorschau>>('POST', '/api/einrichtung/pakete/plan', { pakete: e.pakete ?? [] }),
  /** Server zur Adresse finden (#813) im Assistenten, bevor es einen Administrator gibt. */
  einrichtungMailFinden: (email: string, thunderbird = false) => anfrage<MailSuche>('POST', '/api/einrichtung/mail/finden', { email, thunderbird }),
  einrichtungStand: () => anfrage<EinrichtungStand>('GET', '/api/werkbank/einrichtung'),
  einrichtungSchritt: (schritt: EinrichtungSchritt, uebersprungen = false) => anfrage<EinrichtungStand>('POST', '/api/werkbank/einrichtung/schritt', { schritt, uebersprungen }),
  anbindung: () => anfrage<AnbindungStand>('GET', '/api/werkbank/anbindung'),
  anbindungPruefen: (anbindung: AnbindungEingabe) => anfrage<AnbindungPruefung>('POST', '/api/werkbank/anbindung/pruefen', { anbindung }),
  anbindungSpeichern: (anbindung: AnbindungEingabe, leerBestaetigt = false) => anfrage<AnbindungStand>('PUT', '/api/werkbank/anbindung', { anbindung, leerBestaetigt }),
  neustart: () => anfrage<null>('POST', '/api/werkbank/neustart'),
  whStatus: () => anfrage<{ lauf: WhLauf | null; abschluss: WhAbschluss | null }>('GET', '/api/wiederherstellung/status'),
  whAbschlussGesehen: () => anfrage<null>('POST', '/api/wiederherstellung/abschluss-gesehen'),
  whSicherungen: () => anfrage<{ art: 'frisch' | 'laufend'; ordner: string; liste: Array<{ name: string; bytes: number; meta: SicherungsMeta | null; schlank?: SicherungSchlank }> }>('GET', '/api/wiederherstellung/sicherungen'),
  whAbgleich: (name: string, schluessel?: string) => anfrage<WhAbgleich>('POST', '/api/wiederherstellung/abgleich', { name, ...(schluessel ? { schluessel } : {}) }),
  whStart: (d: { name: string; schluessel?: string; bestaetigt?: boolean }) => anfrage<WhLauf>('POST', '/api/wiederherstellung/start', d),
  beispiele: () => anfrage<null>('POST', '/api/beispiele'),
  demoUebersicht: () => anfrage<Array<{ typId: string; name: string; demo: number; gesamt: number }>>('GET', '/api/werkbank/demo'),
  demoErzeugen: (o: DemoOptionen) => anfrage<Auftrag>('POST', '/api/werkbank/demo', o),
  demoAbschaetzung: (o: DemoOptionen) => anfrage<DemoAbschaetzung>('POST', '/api/werkbank/demo/abschaetzung', o),
  demoEntfernen: () => anfrage<Auftrag>('DELETE', '/api/werkbank/demo'),
};
