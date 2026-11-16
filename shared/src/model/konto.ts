/**
 * Konten (#1278, vorher `shared/src/model.ts`): Rollen, System- und Personenkonten, Abwesenheit, Sitzungen und
 * Vertretung.
 */
import { t } from '../texte';

/**
 * Wirksame Rolle in einer Anfrage (#818, #819): `admin` nur im Verwaltungsmodus einer Person mit Verwaltungsrecht
 * (oder über den Befehl `dms` im Container) – sonst immer `mitglied`. Gespeichert wird keine Rolle mehr, sondern das
 * Verwaltungsrecht an der Person (`Benutzer.verwaltung`, siehe verwaltungsrecht.ts). Einen Kontotyp „Administrator“
 * gibt es nicht mehr.
 */
export type Rolle = 'admin' | 'mitglied';
/** Systemrollen als Rollen-Mappen (`rolle:mitglied`); die frühere Systemrolle „Administrator“ ist entfallen (#818). */
export const ROLLEN: Record<'mitglied', string> = { mitglied: 'Mitglied' };

/**
 * Systemrollen für Konten, die kein Mensch sind (#673): Systemkonto (z. B. „Automatisierung“) und Paket (Dienstkonten
 * der Pakete mit Code). Sie stehen neben Administrator und Mitglied als Rollen-Mappen (`rolle:systemkonto`,
 * `rolle:paket`) und lassen sich in Regeln am Mappentyp nennen – vergeben werden sie nie an Menschen.
 */
export type Kontorolle = 'systemkonto' | 'paket';
export const KONTOROLLEN: Record<Kontorolle, string> = { systemkonto: 'Systemkonto', paket: 'Paket' };
export const kontorolleKennung = (r: Kontorolle) => `rolle:${r}`;
/** Systemkonten des DMS (#673): Kennung → Anzeigename. */
export const SYSTEMKONTEN = { automatisierung: 'Automatisierung' } as const;
export type Systemkonto = keyof typeof SYSTEMKONTEN;

export interface Benutzer {
  id: string;
  email: string;
  name: string;
  /** Wirksame Rolle dieser Anfrage: `admin` nur im Verwaltungsmodus (#819). Gespeichert ist immer `mitglied`. */
  rolle: Rolle;
  /** Verwaltungsrecht an der Person (#818): leer = verwaltet nicht, `['*']` = Gesamte Verwaltung, sonst Bereiche. */
  verwaltung?: string[];
  aktiv: boolean;
  /** false, solange der Benutzer sein Passwort noch nicht über den Link gesetzt hat. */
  hatPasswort: boolean;
  erstellt: string;
  letzteAnmeldung: string | null;
  /** Letzte Aktivität in irgendeiner gültigen Sitzung (nur in der Benutzerverwaltung). */
  zuletztAktiv?: string | null;
  /** Zeigt beim Aufruf einer Seite die Dauer der einzelnen Schritte (im eigenen Profil schaltbar). */
  entwicklermodus?: boolean;
  /** Gewählte Sprache (#729, Mein Konto); leer = die der Installation. Gilt nur, solange sie erlaubt ist. */
  sprache?: string | null;
  /** „Übersetzung anzeigen“ anbieten (#732, Mein Konto); false = für sich abgeschaltet. Vorgabe an. */
  uebersetzen?: boolean;
  /** Weitere (fachliche) Rollen: Ids der Rollen-Mappen (nur in der Benutzerverwaltung). */
  rollen?: string[];
  /** Abwesenheit mit Vertreter (#78). Der Vertreter bleibt nach dem Deaktivieren hinterlegt und wirkt dann dauerhaft. */
  abwesenheit?: Abwesenheit;
  /** Wann der Benutzer deaktiviert wurde (#77), sofern bekannt. */
  deaktiviert?: string | null;
  /** Offene Aufgaben (nur in der Benutzerverwaltung). */
  offeneAufgaben?: number;
  /**
   * Kein Mensch (#338, #673): `dienst` = Dienstkonto eines Pakets mit Code (Systemrolle „Paket“), `system` = Systemkonto
   * des DMS, z. B. „Automatisierung“ (Systemrolle „Systemkonto“). Beide melden sich nie an und stehen in keiner Auswahl.
   */
  art?: 'dienst' | 'system';
  /** Paket, zu dem das Dienstkonto gehört. */
  paketId?: string;
  /** Kennung des Systemkontos, z. B. `automatisierung`. */
  systemkonto?: string;
}

/** Ein Mensch – kein Dienst- oder Systemkonto (#673). */
export const istPerson = (b: Pick<Benutzer, 'art'> | undefined | null): boolean => !!b && !b.art;

/** Abwesenheit (#78): an/aus, optionaler Zeitraum (JJJJ-MM-TT, jeweils einschließlich), Vertreter. */
export interface Abwesenheit {
  an: boolean;
  von: string | null;
  bis: string | null;
  vertreterId: string | null;
}
export const KEINE_ABWESENHEIT: Abwesenheit = { an: false, von: null, bis: null, vertreterId: null };
/** Wirkt die Abwesenheit an diesem Tag (JJJJ-MM-TT)? */
export const abwesenheitWirkt = (a: Abwesenheit | undefined, heute: string) =>
  !!a?.an && (!a.von || a.von <= heute) && (!a.bis || a.bis >= heute);
/** Höchstens so viele Schritte folgt die Umleitung einer Vertreterkette. */
export const VERTRETER_SCHRITTE = 3;

/** Als „gerade aktiv“ gilt, wer in den letzten so vielen Minuten etwas getan hat. */
export const AKTIV_MINUTEN = 15;
export const istGeradeAktiv = (zuletzt: string | null | undefined, jetzt = Date.now()) =>
  !!zuletzt && jetzt - new Date(zuletzt).getTime() < AKTIV_MINUTEN * 60_000;

/** Eine Anmeldung auf einem Gerät. */
export interface Sitzung {
  id: string;
  benutzerId: string;
  erstellt: string;
  zuletztAktiv: string;
  ablauf: string;
  /** User-Agent des Browsers. */
  geraet: string;
  ip: string;
  /** Gesetzt, wenn ein Administrator in dieser Sitzung als der Benutzer agiert. */
  vertretungId: string | null;
  /** Die Sitzung der aktuellen Anfrage. */
  aktuell?: boolean;
}

/** Ein Administrator hat als ein anderer Benutzer agiert. */
export interface Vertretung {
  id: string;
  benutzerId: string;
  adminId: string | null;
  adminName: string;
  beginn: string;
  ende: string | null;
}

/** Kurzbeschreibung eines Browsers aus dem User-Agent, z. B. „Firefox auf Windows“. */
export function geraetText(ua: string): string {
  if (!ua) return t('gemeinsam.model.unbekanntes-geraet');
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : /curl|node|undici/i.test(ua)
              ? 'Programm'
              : 'Browser';
  const system = /iPhone|iPad/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  return system ? `${browser} auf ${system}` : browser;
}

export const PASSWORT_MINDESTLAENGE = 10;
export const istEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
