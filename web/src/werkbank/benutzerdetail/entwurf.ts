import { KEINE_ABWESENHEIT, type Abwesenheit, type Benutzer } from '../../../../shared/src/model';
import { GESAMT } from '../../../../shared/src/verwaltungsrecht';
import { kontoApi } from '../../api/konto';
import { t } from '../../sprache';
import type { BenutzerBereich } from './hilfen';

/** Was die Speicherleiste des Benutzers speichert. Verwaltungsrechte sortiert, damit die Reihenfolge nichts ändert. */
export interface Entwurf {
  name: string;
  rollen: string[];
  verwaltung: string[];
  abwesenheit: Abwesenheit;
}
export const entwurfVon = (b: Benutzer): Entwurf => ({
  name: b.name,
  rollen: [...(b.rollen ?? [])].sort(),
  verwaltung: [...(b.verwaltung ?? [])].sort(),
  abwesenheit: b.abwesenheit ?? KEINE_ABWESENHEIT,
});
/** Kurzinfo „Rollen und Rechte“: das Verwaltungsrecht, sonst die Zahl der Rollen. */
export const rechteKurz = (e: Entwurf) =>
  !e.verwaltung.length
    ? t('werkbank.benutzer.bereich.rechte.kurz', { anzahl: e.rollen.length })
    : e.verwaltung.includes(GESAMT)
      ? t('werkbank.verwaltungsrecht.chip.gesamt')
      : t('werkbank.verwaltungsrecht.chip.teil');
/** Kurzinfo „Vertretung“: wer vertritt, sonst „nicht abwesend“. */
export const vertretungKurz = (a: Abwesenheit, person: (id: string | null) => string) =>
  a.an ? t('werkbank.benutzer.vertreten-durch', { person: person(a.vertreterId) }) : t('werkbank.benutzer.bereich.vertretung.aus');
const gleich = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Teile, die „Benutzer speichern“ einzeln schickt – für die Meldung, was gespeichert ist und was nicht. */
export type Teil = 'name' | 'rollen' | 'verwaltung' | 'vertretung';
const teilName = (teil: Teil) => t(`werkbank.benutzer.teil.${teil}`);

/**
 * Ein Speichern für den ganzen Benutzer (#1000): nacheinander nur die geänderten Teile – Name und Rollen, das
 * Verwaltungsrecht (mit frischer Anmeldung, #819) und die Vertretung. Scheitert ein Teil, ist das Vorige gespeichert;
 * der Fehler nennt seinen Bereich, den gescheiterten Teil und was schon gespeichert ist.
 */
export async function speichereBenutzer(b: Benutzer, e: Entwurf, darfVerwaltung: boolean): Promise<void> {
  const alt = entwurfVon(b);
  const schritte: Array<[BenutzerBereich, Teil, boolean, () => Promise<unknown>]> = [
    ['grunddaten', 'name', alt.name !== e.name, () => kontoApi.benutzerAendern(b.id, { name: e.name })],
    ['rechte', 'rollen', !gleich(alt.rollen, [...e.rollen].sort()), () => kontoApi.benutzerAendern(b.id, { rollen: e.rollen })],
    [
      'rechte',
      'verwaltung',
      darfVerwaltung && !gleich(alt.verwaltung, [...e.verwaltung].sort()),
      () => kontoApi.verwaltungSetzen(b.id, e.verwaltung),
    ],
    ['vertretung', 'vertretung', !gleich(alt.abwesenheit, e.abwesenheit), () => kontoApi.benutzerAbwesenheit(b.id, e.abwesenheit)],
  ];
  const gespeichert: Teil[] = [];
  for (const [ort, teil, noetig, f] of schritte) {
    if (!noetig) continue;
    try {
      await f();
    } catch (x) {
      throw Object.assign(x as Error, { ort, teil, gespeichert });
    }
    gespeichert.push(teil);
  }
}

/** Meldung an der Speicherleiste nach einem Fehler: was gespeichert ist, was nicht und warum. */
export function teilweiseText(x: { message: string; teil?: Teil; gespeichert?: Teil[] }): string {
  if (!x.teil) return x.message;
  const werte = { fehlt: teilName(x.teil), fehler: x.message };
  return x.gespeichert?.length
    ? t('werkbank.benutzer.teilweise-gespeichert', { ...werte, gespeichert: x.gespeichert.map(teilName).join(', ') })
    : t('werkbank.benutzer.nicht-gespeichert', werte);
}
