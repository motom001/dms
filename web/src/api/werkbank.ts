/** Schnittstelle (#1234): Ablage aufbauen in der Werkbank: Mappentypen, Sichten, Nummernkreise, Merkmale, Berechtigungen, Ansicht, Designs, Stempel, Region, Sprachen, Organisation. */
import type { Design } from '../design';
import type { Nummernkreis } from '../../../shared/src/nummernkreis';
import type { StempelVorlage } from '../../../shared/src/stempel';
import type { UebersetzenEinstellung } from '../../../shared/src/uebersetzung';
import type { Mappentyp, Wert } from '../../../shared/src/model';
import type { Feldbedingung, Sicht, SichtDaten } from '../../../shared/src/sichten';
import type { Ergebnis, Regelwerk } from '../../../shared/src/rechte';
import type { PlanOrganisation } from '../../../shared/src/einrichtungsplan';
import type { EigeneAnsicht, WerkbankAnsicht } from '../../../shared/src/werkbankansicht';
import type { Merkmale } from '../../../shared/src/merkmale';
import type { SichtRechte, SichtRegelwerk, SichtSchritt } from '../../../shared/src/sichtrechte';
import type { Sicherheit, Vorschlag } from '../../../shared/src/erkennung';
import type { OrganisationStand } from '../../../shared/src/organisation';
import { erreichbarkeit, NICHT_ERREICHBAR } from '../erreichbar';
import { istAusfall } from '../../../shared/src/erreichbarkeit';
import { t } from '../sprache';
import { sprache } from '../../../shared/src/sprache';
import type { Abdeckung, SprachpaketInfo } from '../../../shared/src/sprachpaket';
import { ApiFehler, anfrage, sendeDatei } from './anfrage';
import type { Bezuege } from './mappen';

/** „Aus Dokument ausfüllen“ (#391), wie POST /api/typen/:id/vorschlaege sie liefert. */
export interface TypVorschlaege {
  vorschlaege: Record<string, { wert: Wert; sicherheit: Sicherheit; fundstelle: string; stelle?: Vorschlag['stelle']; aus?: Vorschlag['aus']; hinweis?: string }>;
  bezuege: Bezuege;
  neu: Record<string, { typId: string; werte: Record<string, string>; fundstelle: string }>;
  verworfen: number; zeichen: number;
  /** Womit erkannt wurde (#511). */
  engine?: { art: 'eingebaut' } | { art: 'paket'; id: string; name: string };
  hinweis?: string;
  /** Das Paket hat nur einen Teil des Dokumenttexts gelesen (#564). */
  gekuerzt?: true;
  /** Aus einer E-Rechnung gelesen (#1043). */
  erechnung?: { syntax: 'ubl' | 'cii'; gutschrift: boolean; profil?: string; nummer?: string };
  /** Positionen der E-Rechnung (#1043): Mappen des Teiltyps, die beim Speichern angelegt werden. */
  positionen?: { feld: string; typId: string; feldKey: string; zeilen: Array<Record<string, Wert>>; weitere?: number; vorhanden?: number; zurueckgehalten?: number };
  /** Gehört dazu (#1043): vorhandene Mappen, die beim Speichern über ihr leeres Verweisfeld verknüpft werden. */
  dazu?: Array<{ mappeId: string; typId: string; titel: string; feldKey: string; feld: string; gruende: string[] }>;
}
export interface Zaehler {
  typen: Record<string, { anzahl: number; unpassend: number; demo: number }>; eingang: number; sichten?: Record<string, number>;
  /** Eigene Favoriten (#62). */
  favoriten?: number;
  /** Eigene Mappen im Papierkorb (#43); Tage 0 = kein Papierkorb. */
  papierkorb?: number; papierkorbTage?: number;
  /** Post (#192): Id der Sicht „Neue Post“, deren Zahl hervorgehoben wird. */
  neuePost?: string | null;
  /** #725: Id der mitgelieferten Ansicht „Favoriten“; null = gelöscht (dann gilt die feste Liste). */
  favoritenSicht?: string | null;
  /** Merkmale der Ablage (#1032) für die Anzeige-Bedingungen im Formular (#1033); fehlt bei älteren Servern. */
  merkmale?: Merkmale;
  /** Ids der eigenen Organisationen (#995) für „zeigt auf eine eigene Organisation“; fehlt bei älteren Servern. */
  eigeneOrganisationen?: string[];
}
/** Werkbank → Sprachen (#729). */
export interface SprachenStand {
  einstellung: { standard: string; erlaubt: string[] }; verfuegbar: string[];
  /** Installierte Sprachpakete (#731) mit Abdeckung und wie viele Personen sie gewählt haben. */
  pakete?: Array<SprachpaketInfo & { paket: string; name: string; version: string; abdeckung: Abdeckung; personen: number }>;
}
/** Werkbank → Sprachen → Inhalte übersetzen (#732). */
export interface UebersetzenStand {
  einstellung: UebersetzenEinstellung;
  pakete: Array<{ id: string; name: string; version: string; laeuft: boolean; netz: string[] | null }>;
  wirksam: { id: string; name: string } | null;
}
/** Region der Ablage (#726). */
export interface Region { land: string; bundesland: string | null; zeitzone: string }
export interface RegionStand { region: Region; laender: Record<string, string>; bundeslaender: Record<string, string>; zeitzonen: string[]; feiertage: Array<{ datum: string; name: string }> }
/** Katalogquelle (#189): der offizielle Katalog oder eine weitere Adresse. */
export interface WerkbankAnsichtStand { installation: WerkbankAnsicht; eingestellt: boolean; eigene: EigeneAnsicht; /** Eingerichtete Bereiche (nur GET). */ benutzt?: string[] }
export interface BerechtigungEintrag { typId: string; name: string; system: string | null; berechtigungen: Regelwerk }
export interface Testlauf extends Ergebnis { admin: boolean; /** Leserecht auf Zeit (#798) mit Grund; wirkt = die Regeln allein erlauben kein Lesen. */ aufZeit?: { aufgabe: string; seit: string; von: string | null; wirkt: boolean }; /** Konto ohne Person (#710) */ konto?: 'systemkonto' | 'paket'; unbestaetigt?: boolean; mappe: { id: string; titel: string; typId: string }; benutzer: { id: string; name: string } }
export interface NummernkreisEingabe { schluessel: string; name: string; muster: string; start: number }
export interface NummernkreisAnsicht extends Nummernkreis {
  naechste: string; naechsterZaehler: number; zeitraum: string; neubeginn: 'taeglich' | 'monatlich' | 'jaehrlich' | 'nie';
  verwendet: Array<{ typId: string; typ: string; feldKey: string; feld: string }>;
}
/** Ein Paket mit Code, das Mappen eines Typs lesen dürfte (#686, Abschnitt „Pakete“ im Mappentyp-Editor). */
export interface PaketAmTyp { id: string; name: string; ereignisse: boolean; schreiben: boolean; verwehrt: boolean }

export const werkbankApi = {
  typen: () => anfrage<Mappentyp[]>('GET', '/api/typen'),
  typAnlegen: (eintrag: unknown) => anfrage<Mappentyp>('POST', '/api/typen', eintrag),
  typAendern: (id: string, eintrag: unknown) => anfrage<Mappentyp>('PUT', `/api/typen/${id}`, eintrag),
  typLoeschen: (id: string) => anfrage<null>('DELETE', `/api/typen/${id}`),
  designs: () => anfrage<{ designs: Design[]; standard: string | null }>('GET', '/api/designs'),
  designAnlegen: (d: Omit<Design, 'id'>) => anfrage<Design>('POST', '/api/designs', d),
  designAendern: (id: string, d: Omit<Design, 'id'>) => anfrage<Design>('PUT', `/api/designs/${id}`, d),
  designLoeschen: (id: string) => anfrage<null>('DELETE', `/api/designs/${id}`),
  designLogo: async (id: string, f: File) => {
    const r = await fetch(`/api/designs/${id}/logo`, { method: 'PUT', credentials: 'same-origin', headers: { 'x-dms': '1', 'x-sprache': sprache(), 'content-type': 'application/octet-stream' }, body: f });
    const daten = await r.json().catch(() => null);
    if (istAusfall(r.status, daten)) { erreichbarkeit.ausfall(); throw new ApiFehler(r.status, NICHT_ERREICHBAR); }
    if (!r.ok) throw new ApiFehler(r.status, daten?.fehler ?? t('oberflaeche.api.fehler', { status: r.status }));
    return daten as Design;
  },
  designLogoEntfernen: (id: string) => anfrage<Design>('DELETE', `/api/designs/${id}/logo`),
  designStandard: (id: string) => anfrage<{ designs: Design[]; standard: string | null }>('PUT', '/api/designs-standard', { id }),
  sichten: () => anfrage<Zaehler>('GET', '/api/sichten'),
  /** Ohne Zählen (#512): Papierkorb-Tage und „Neue Post“ – vor den Zahlen. */
  sichtenRahmen: () => anfrage<Pick<Zaehler, 'papierkorbTage' | 'neuePost' | 'favoritenSicht' | 'merkmale' | 'eigeneOrganisationen'>>('GET', '/api/sichten/rahmen'),
  /* Sichten verwalten (#38) */
  sichtDefinitionen: () => anfrage<Sicht[]>('GET', '/api/sichten/definitionen'),
  sichtAnlegen: (s: Partial<SichtDaten>) => anfrage<Sicht>('POST', '/api/sichten/definitionen', s),
  sichtAendern: (id: string, s: Partial<SichtDaten> & { stand?: string }) => anfrage<Sicht>('PUT', `/api/sichten/definitionen/${id}`, s),
  sichtLoeschen: (id: string) => anfrage<null>('DELETE', `/api/sichten/definitionen/${id}`),
  /** Drag & Drop (#73): unter elternId an die Stelle stelle (0 = zuerst). */
  sichtVerschieben: (id: string, elternId: string | null, stelle: number) => anfrage<Sicht[]>('POST', `/api/sichten/definitionen/${id}/verschieben`, { elternId, stelle }),
  sichtenOrdnen: (elternId: string | null, ids: string[]) => anfrage<Sicht[]>('PUT', '/api/sichten/reihenfolge', { elternId, ids }),
  sichtVorschau: (id: string | null, sicht: Partial<SichtDaten>) => anfrage<{ anzahl: number }>('POST', '/api/sichten/vorschau', { id, sicht }),
  belegung: (typId: string) => anfrage<Record<string, number>>('GET', `/api/typen/${typId}/belegung`),
  berechtigungen: () => anfrage<BerechtigungEintrag[]>('GET', '/api/werkbank/berechtigungen'),
  berechtigungenSetzen: (typId: string, berechtigungen: Regelwerk, bestaetigt = false) => anfrage<{ typ: Mappentyp; niemand: number }>('PUT', `/api/werkbank/berechtigungen/${typId}`, { berechtigungen, bestaetigt }),
  // Pakete am Mappentyp (#686).
  paketeAmTyp: (typId: string) => anfrage<PaketAmTyp[]>('GET', `/api/werkbank/berechtigungen/${typId}/pakete`),
  paketVerwehren: (typId: string, paketId: string, verwehrt: boolean) => anfrage<PaketAmTyp[]>('PUT', `/api/werkbank/berechtigungen/${typId}/pakete/${encodeURIComponent(paketId)}`, { verwehrt }),
  regelKopieren: (typId: string, regelId: string, ziele: string[]) => anfrage<{ kopiert: number; ausgelassen: number }>('POST', `/api/werkbank/berechtigungen/${typId}/kopieren`, { regelId, ziele }),
  testlauf: (e: { mappeId: string; benutzerId: string; berechtigungen?: Regelwerk }) => anfrage<Testlauf>('POST', '/api/werkbank/berechtigungen/testlauf', e),
  /** Testlauf an einer Sicht (#148), auch mit ungespeicherten Regeln und Elternsicht. */
  sichtTestlauf: (e: { sichtId: string | null; benutzerId: string; elternId: string | null; berechtigungen: SichtRegelwerk | null }) =>
    anfrage<{ admin: boolean; benutzer: { id: string; name: string }; kette: Array<{ sicht: string; name: string; untersicht: boolean; grund: SichtRechte | null; spur: SichtSchritt[]; eigene: SichtRechte; stand: SichtRechte }>; wirksam?: SichtRechte }>('POST', '/api/werkbank/sichten/testlauf', e),
  wasSieht: (benutzerId: string) => anfrage<{ admin: boolean; typen: Array<{ typId: string; name: string; gesamt: number; lesbar: number; beispiele: Array<{ id: string; titel: string }> }> }>('GET', `/api/werkbank/berechtigungen/sicht/${benutzerId}`),
  /** „Aus Dokument ausfüllen“ (#391): Vorschläge aus Text bzw. Dokumenten; aus einer Datei (Foto, PDF, vCard) mit dem gelesenen Text. */
  // positionen (#1043): Die Oberfläche fragt ausdrücklich nach Positionen einer E-Rechnung und entscheidet selbst, ob der Haken an ist.
  vorschlaege: (typId: string, e: { text?: string; dokumente?: string[]; mappe?: string }) => anfrage<TypVorschlaege>('POST', `/api/typen/${typId}/vorschlaege`, { ...e, positionen: true }),
  vorschlaegeDatei: (typId: string, datei: Blob, name: string, mappe?: string) =>
    sendeDatei(`/api/typen/${typId}/vorschlaege/datei?${new URLSearchParams({ name, typ: datei.type || 'application/octet-stream', ...(mappe ? { mappe } : {}), positionen: '1' })}`, datei) as Promise<TypVorschlaege & { text: string; info: string }>,
  stempelVorlageAnlegen: (v: Omit<StempelVorlage, 'id'>) => anfrage<StempelVorlage[]>('POST', '/api/werkbank/stempel/vorlagen', v),
  stempelVorlageAendern: (id: string, v: Omit<StempelVorlage, 'id'>) => anfrage<StempelVorlage[]>('PUT', `/api/werkbank/stempel/vorlagen/${encodeURIComponent(id)}`, v),
  stempelVorlageLoeschen: (id: string) => anfrage<StempelVorlage[]>('DELETE', `/api/werkbank/stempel/vorlagen/${encodeURIComponent(id)}`),
  /** Auswahlfilter am Referenzfeld (#172): wie viele Mappen passen? */
  auswahlZaehlen: (zielTypen: string[], bedingungen: Feldbedingung[]) => anfrage<{ passen: number; gesamt: number; probleme: string[] }>('POST', '/api/werkbank/auswahlfilter/zaehlen', { zielTypen, bedingungen }),
  /* Nummernkreise (#171) */
  nummernkreise: () => anfrage<NummernkreisAnsicht[]>('GET', '/api/werkbank/nummernkreise'),
  /* Paketverwaltung (#188, #189) */
  // Ansicht der Werkbank (#281)
  werkbankAnsicht: () => anfrage<WerkbankAnsichtStand>('GET', '/api/werkbank/ansicht'),
  setzeWerkbankAnsicht: (e: { installation?: WerkbankAnsicht; eigene?: EigeneAnsicht }) => anfrage<WerkbankAnsichtStand>('PUT', '/api/werkbank/ansicht', e),
  nummernkreisAnlegen: (k: NummernkreisEingabe) => anfrage<NummernkreisAnsicht[]>('POST', '/api/werkbank/nummernkreise', k),
  nummernkreisAendern: (s: string, k: Omit<NummernkreisEingabe, 'schluessel'>) => anfrage<NummernkreisAnsicht[]>('PUT', `/api/werkbank/nummernkreise/${encodeURIComponent(s)}`, k),
  nummernkreisLoeschen: (s: string) => anfrage<NummernkreisAnsicht[]>('DELETE', `/api/werkbank/nummernkreise/${encodeURIComponent(s)}`),
  nummernkreisZaehler: (s: string, naechster: number) => anfrage<NummernkreisAnsicht[]>('POST', `/api/werkbank/nummernkreise/${encodeURIComponent(s)}/zaehler`, { naechster }),
  region: () => anfrage<RegionStand>('GET', '/api/werkbank/region'),
  regionSetzen: (e: Partial<Region>) => anfrage<RegionStand>('PUT', '/api/werkbank/region', e),
  /** Merkmale der Ablage (#1032): lesen alle, die verwalten; ändern nur „Gesamte Verwaltung“. */
  merkmale: () => anfrage<Merkmale>('GET', '/api/werkbank/merkmale'),
  setzeMerkmale: (e: Partial<Merkmale>) => anfrage<Merkmale>('PUT', '/api/werkbank/merkmale', e),
  /** Eigene Organisation (#995): Verweis auf die Mappe(n) mit dem Merkmal, Wahl für Auskünfte, Rollen, Notizen. */
  organisation: () => anfrage<OrganisationStand>('GET', '/api/werkbank/organisation'),
  setzeOrganisation: (e: Record<string, unknown>) => anfrage<OrganisationStand>('PUT', '/api/werkbank/organisation', e),
  organisationUebernehmen: () => anfrage<OrganisationStand>('POST', '/api/werkbank/organisation/uebernehmen'),
  /** „Deine Organisation“ aus dem Einrichtungsassistenten (#1045). */
  organisationAnlegen: (o: PlanOrganisation) => anfrage<OrganisationStand>('POST', '/api/werkbank/organisation/anlegen', o),
  sprachen: () => anfrage<SprachenStand>('GET', '/api/werkbank/sprachen'),
  sprachenSetzen: (e: Partial<SprachenStand['einstellung']>) => anfrage<SprachenStand>('PUT', '/api/werkbank/sprachen', e),
  uebersetzenStand: () => anfrage<UebersetzenStand>('GET', '/api/werkbank/uebersetzen'),
  uebersetzenSetzen: (e: Partial<UebersetzenEinstellung>) => anfrage<UebersetzenStand>('PUT', '/api/werkbank/uebersetzen', e),
};
