/**
 * Arten und Gruppen der Änderungshistorie (#57, #800; #1278, vorher `shared/src/model.ts`).
 */
import { t } from '../texte';

/* ---------- Änderungshistorie (#57) ---------- */
export const HISTORIENARTEN = {
  angelegt: 'angelegt',
  geaendert: 'geändert',
  dokument_hochgeladen: t('gemeinsam.model.dokument-hochgeladen'),
  dokument_geloescht: t('gemeinsam.model.dokument-geloescht'),
  papierkorb: t('gemeinsam.model.in-den-papierkorb-gelegt'),
  wiederhergestellt: 'wiederhergestellt',
  endgueltig: t('gemeinsam.model.endgueltig-geloescht'),
  passwort_angezeigt: t('gemeinsam.model.passwort-angezeigt'),
  notiz: 'Notiz',
  aufgabe: 'Aufgabe',
  email: t('gemeinsam.model.e-mail-versendet'),
  abwesenheit: 'Abwesenheit',
  zugeordnet: t('gemeinsam.model.post-zugeordnet'),
  uebernommen: 'übernommen',
  dokument_version: t('gemeinsam.model.neue-version'),
  dokument_papierkorb: t('gemeinsam.model.dokument-in-den-papierkorb'),
  dokument_wiederhergestellt: t('gemeinsam.model.dokument-wiederhergestellt'),
  pdf_bearbeitet: 'PDF bearbeitet',
  post_geteilt: t('gemeinsam.model.post-geteilt'),
  archivnummer: 'Archivnummer',
  volltext: t('gemeinsam.model.volltext-gesetzt'),
  weitergegeben: 'weitergegeben',
  geschwaerzt: t('gemeinsam.model.geschwaerzte-fassung-erstellt'),
  auskunft: t('gemeinsam.model.auskunft-erteilt'),
  umgewandelt: t('gemeinsam.model.umgewandelte-fassung-erstellt'),
  archivfassung: t('gemeinsam.model.archivfassung-pdf-a-abgelegt'),
  leserecht: t('gemeinsam.model.leserecht-auf-zeit'),
  entsperrt: t('gemeinsam.model.passwortschutz-entfernt'),
  /** #820: im Verwaltungsmodus geöffnet, heruntergeladen, geändert … – nicht löschbar, nie ausgeblendet. */
  verwaltungsmodus: t('gemeinsam.model.im-verwaltungsmodus'),
  /** #800: Abrufe einer Datei – in der Oberfläche heruntergeladen, mit einem API-Schlüssel, über das WebDAV-Laufwerk. */
  heruntergeladen: t('gemeinsam.model.heruntergeladen'),
  abruf_api: t('gemeinsam.model.abruf-api'),
  abruf_webdav: t('gemeinsam.model.abruf-webdav'),
  /** #1039: Aktion eines Pakets im Menü „Mappe“ – Person (benutzerId) und Paket (daten.paket). */
  paketaktion: t('gemeinsam.model.paketaktion'),
  /** #998: Anlage angehängt, gelöst (zum eigenen Dokument gemacht), umbenannt oder umsortiert. */
  anlage: t('gemeinsam.model.anlage'),
} as const;
/** Was im Verwaltungsmodus mit einer fremden Mappe geschah (#820). */
export type Modusspur = 'angesehen' | 'heruntergeladen' | 'geaendert' | 'exportiert' | 'versendet';
export type Historienart = keyof typeof HISTORIENARTEN;

/**
 * Was ein Register „Historie“ zeigt (#800): die Arten von Einträgen in Gruppen. Geschrieben wird immer alles – welche
 * Gruppen ein Register zeigt, ist nur eine Frage der Anzeige. „verwaltungsmodus“ (#820) gehört zu keiner Gruppe und
 * steht immer da. Jede andere Art liegt in genau einer Gruppe.
 */
export const HISTORIENGRUPPEN = {
  anlegen: ['angelegt', 'papierkorb', 'wiederhergestellt', 'endgueltig', 'uebernommen', 'zugeordnet', 'post_geteilt', 'archivnummer'],
  felder: ['geaendert', 'passwort_angezeigt'],
  dokumente: [
    'dokument_hochgeladen',
    'dokument_geloescht',
    'dokument_version',
    'dokument_papierkorb',
    'dokument_wiederhergestellt',
    'pdf_bearbeitet',
    'volltext',
    'geschwaerzt',
    'umgewandelt',
    'archivfassung',
    'entsperrt',
    'anlage',
  ],
  notizen: ['notiz'],
  aufgaben: ['aufgabe', 'abwesenheit'],
  weitergeben: ['email', 'weitergegeben', 'auskunft'],
  rechte: ['leserecht'],
  herunterladen: ['heruntergeladen'],
  api: ['abruf_api'],
  webdav: ['abruf_webdav'],
  aktionen: ['paketaktion'],
} as const satisfies Record<string, readonly Historienart[]>;
export type Historiengruppe = keyof typeof HISTORIENGRUPPEN;
/** Arten, die jedes Register „Historie“ zeigt, gleich wie es eingestellt ist (#820). */
export const HISTORIE_IMMER: readonly Historienart[] = ['verwaltungsmodus'];
/**
 * Vorauswahl eines Registers „Historie“ ohne eigene Einstellung (#800): alles wie bisher, ohne die Abrufe – die
 * interessieren im Alltag selten. Ein weiteres Register (z. B. „Abrufe“) oder „Alles anzeigen“ zeigt sie.
 */
export const HISTORIE_VORAUSWAHL: readonly Historiengruppe[] = [
  'anlegen',
  'felder',
  'dokumente',
  'notizen',
  'aufgaben',
  'weitergeben',
  'rechte',
  'aktionen',
];
export const istHistoriengruppe = (g: unknown): g is Historiengruppe => typeof g === 'string' && Object.hasOwn(HISTORIENGRUPPEN, g);
/** Name einer Gruppe in der Sprache des Lesers. */
export const historiengruppeName = (g: Historiengruppe) => t.frei(`gemeinsam.model.historiengruppe.${g}`);
/** Die Arten zu diesen Gruppen – immer mit HISTORIE_IMMER. */
export function historienartenVon(gruppen: readonly Historiengruppe[]): Historienart[] {
  return [...new Set<Historienart>([...gruppen.flatMap((g) => HISTORIENGRUPPEN[g] ?? []), ...HISTORIE_IMMER])];
}
