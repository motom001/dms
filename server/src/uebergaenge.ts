/**
 * Übergangsausnahmen mit Ablaufdatum (#902).
 *
 * Sonderwege für alte Pakete, alte Dateien oder alte Namen stehen hier, je mit der Version, mit der sie entfallen.
 * `uebergaenge.test.ts` schlägt fehl, sobald die Version in package.json diese Version erreicht – dann die Ausnahme
 * entfernen (Code, Eintrag hier, Handbuch) und im Änderungsprotokoll der API nennen. Neue Ausnahmen bitte nur mit
 * Eintrag hier; `fundstellen` nennt Dateien (ab der Wurzel des Repos) und einen Text, der dort stehen muss, damit die
 * Liste beim Entfernen nicht veraltet.
 */
export interface Uebergang {
  /** Was weiterhin geht, obwohl es veraltet ist. */
  was: string;
  /** Issue, mit dem es veraltet ist, und seit welcher Version. */
  seit: string;
  /** Mit dieser Version entfällt die Ausnahme (spätestens 1.0.0). */
  entfaelltMit: string;
  fundstellen: Array<{ datei: string; text: string }>;
}

export const UEBERGAENGE: Uebergang[] = [
  {
    was: 'PUT /api/v1/sicherungen/{name}/extern: Rückmeldung der Kopie außer Haus von Paketen mit Schreibschlüssel',
    seit: '#636, 0.158.1 (Rückmeldung über die Antwort auf sicherung.fertig)',
    entfaelltMit: '1.0.0',
    fundstellen: [
      { datei: 'server/src/routen.ts', text: "const SICHERUNG_EXTERN_PFAD = '/api/v1/sicherungen/:name/extern';" },
      { datei: 'server/src/sicherung/sicherung.routen.ts', text: "pfad: '/api/sicherungen/:name/extern'" },
      { datei: 'server/src/api-v1.ts', text: "pfad: '/sicherungen/{name}/extern'" },
    ],
  },
  {
    was: 'Ereignis texterkennung.fertig als alter Name für volltext.fertig',
    seit: '#724, 0.133.0',
    entfaelltMit: '1.0.0',
    fundstellen: [
      { datei: 'shared/src/ereignisse.ts', text: "export const VERALTETE_EREIGNISSE = { 'texterkennung.fertig': 'volltext.fertig' }" },
    ],
  },
  {
    was: 'dms:ablageort als Alias für basis:ablageort (Inhalte und code.rechte)',
    seit: '#883, 0.212',
    entfaelltMit: '1.0.0',
    fundstellen: [
      { datei: 'shared/src/pakete.ts', text: "export const DMS_ALIAS: Record<string, string> = { ablageort: 'basis:ablageort' };" },
    ],
  },
  {
    was: 'Ältere Pakete: fremde_typen mit Kennung der Form <paket>_<schluessel> (vor #1084) – Zuordnung über die installierten Pakete',
    seit: '#1084, 0.229',
    entfaelltMit: '1.0.0',
    fundstellen: [
      { datei: 'server/src/pakete.ts', text: 'export function neueKennung(kennung: string' },
    ],
  },
  {
    was: 'Zusatzsprachen der Texterkennung unter der Id <paket>_<kennung> (vor dem Umzug auf <paket>.<kennung>, #1084)',
    seit: '#1084, 0.229',
    entfaelltMit: '1.0.0',
    fundstellen: [
      { datei: 'server/src/volltext/volltext.dienst.ts', text: "x.id.startsWith(`${p.id}_`)" },
    ],
  },
  {
    was: 'Einrichtungsdatei der Versionen 0.191 und 0.192 (administrator statt konto, erster-benutzer)',
    seit: '#821 (Abschnitt konto)',
    entfaelltMit: '1.0.0',
    fundstellen: [
      { datei: 'server/src/einrichtungsdatei.ts', text: 'function aelter(wert: unknown)' },
    ],
  },
  {
    was: 'Post: alte Feldnamen absender und fuer (jetzt von und an) – Schnittstelle v1 nimmt sie beim Schreiben an und liefert sie an der Post mit; '
      + 'Post anlegen und aus Fotos mit absender/fuer; Ereignis post.angelegt mit fuer; Platzhalter {absender}/{fuer}; Links über Mappentyp und Feldwerte',
    seit: '#1042, 0.241',
    entfaelltMit: '1.0.0',
    fundstellen: [
      { datei: 'shared/src/postfelder.ts', text: "export const POST_ALTE_KENNUNGEN = { absender: 'von', fuer: 'an' } as const;" },
      { datei: 'server/src/mappen/eingaben.ts', text: "const roh = typ.system === 'post' ? postWerteNeu(eingang) : eingang;" },
      { datei: 'server/src/api-v1.ts', text: 'export function mitAltenPostNamen(body: unknown, postId: string, tiefe = 0): unknown' },
      { datei: 'server/src/post/post.dienst.ts', text: 'const e = postWerteNeu((eingabe ?? {}) as Record<string, unknown>);' },
      { datei: 'server/src/post/foto.ts', text: 'const e = postWerteNeu((eingabe ?? {}) as Record<string, unknown>);' },
      { datei: 'shared/src/ereignisse.ts', text: "'post.angelegt': { gruppe: 'person', felder: ['mappe', 'kanal', 'an', 'fuer'], paket: true }," },
      { datei: 'server/src/automatisierung.ts', text: "const alias = typ?.system === 'post';" },
      { datei: 'shared/src/direktlink.ts', text: "typ.system === 'post' ? postKennung(rohKey) : rohKey" },
    ],
  },
];
