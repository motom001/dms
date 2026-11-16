/**
 * Übernommene Benachrichtigungen (#678, #712, #1001; #1278): feste Ids und „Post für dich“ – was der Kern früher selbst
 * tat und jetzt Automatisierungen sind.
 */
import { uuidAus } from './hilfen';
import { type AutomatisierungDaten, bereinigeAutomatisierung } from '../../../../shared/src/automatisierung';

/** Feste Id der beim Update übernommenen Vertretungs-Aufgabe (#712/#678). */
export const UMZUG_VERTRETUNG = uuidAus('umzug|vertretung');
/**
 * Feste Ids der beim Update übernommenen Benachrichtigungen (#678): Zusammenfassung, Favoriten, Anmeldeschutz; dazu
 * „Post für dich“ (#1001).
 */
export const UMZUG = {
  zusammenfassung: uuidAus('umzug|zusammenfassung'),
  favoriten: uuidAus('umzug|favoriten'),
  sammel: uuidAus('umzug|anmeldeschutz'),
  konto: uuidAus('umzug|kontosperre'),
  post: uuidAus('umzug|post-fuer-dich'),
} as const;

/** Paket mit den mitgelieferten Benachrichtigungen (dms-registry #109, #153). */
export const BENACHRICHTIGUNGEN_PAKET = 'benachrichtigungen';

/**
 * „Post für dich“ (#1001, dms-registry #153) – so, wie der Kern die Aufgabe bis 0.256 selbst anlegte: Wenn neue Post
 * eingeht oder sich „An“ bzw. der Stand ändert, solange sie neu ist und jemand in „An“ steht → Aufgabe an diese Person
 * (bei Abwesenheit an die Vertretung). Sie heißt „Post für dich“ (Art), erledigt sich, sobald die Post nicht mehr neu ist
 * oder an jemand anderen geht, und entsteht je Post und Person nur einmal (automatisierung-karten.ts). Dieselben Karten
 * bringt das Paket „Benachrichtigungen“ ab 1.3.0 mit (Typ `dms:post`).
 */
export function postFuerDichDaten(postTyp: string, texte2: { name: string; beschreibung: string; text: string }): AutomatisierungDaten {
  return bereinigeAutomatisierung({
    name: texte2.name,
    beschreibung: texte2.beschreibung,
    wenn: { art: 'mappe.geaendert', typ: postTyp, felder: ['an', 'stand'], angelegt: true },
    und: {
      modus: 'alle',
      karten: [
        { art: 'bedingung', bedingung: { art: 'feld', feld: 'an', op: 'nichtLeer' } },
        { art: 'bedingung', bedingung: { art: 'feld', feld: 'stand', op: 'einerVon', wert: { art: 'fest', wert: ['Neu'] } } },
      ],
    },
    dann: [{ id: 'p1', art: 'aufgabe', als: 'aufgabe', empfaenger: [{ art: 'feld', feld: 'an' }], text: texte2.text }],
  });
}

/** Ist das „Post für dich“ – Wenn „Post angelegt oder gespeichert“ und eine Aufgabe an „An“? */
export function istPostFuerDich(d: Pick<AutomatisierungDaten, 'wenn' | 'dann'>, postTyp: string | null): boolean {
  const w = d.wenn;
  return (
    !!postTyp &&
    w.art === 'mappe.geaendert' &&
    w.typ === postTyp &&
    w.angelegt === true &&
    d.dann.some((k) => k.art === 'aufgabe' && k.als === 'aufgabe' && k.empfaenger.some((e) => e.art === 'feld' && e.feld === 'an'))
  );
}

/** Welche übernommene Benachrichtigung eine mitgelieferte Automatisierung ersetzt (nach ihrer ersten Dann-Karte). */
export function umzugFuer(d: AutomatisierungDaten, postTyp: string | null = null): string | null {
  const k = d.dann[0];
  if (!k) return null;
  if (k.art === 'zusammenfassung') return UMZUG.zusammenfassung;
  if (k.art === 'favoriten') return UMZUG.favoriten;
  if (k.art === 'anmeldeschutz') return k.was === 'sammel' ? UMZUG.sammel : UMZUG.konto;
  if (istPostFuerDich(d, postTyp)) return UMZUG.post;
  return null;
}
export const UMZUG_IDS = new Set<string>([UMZUG_VERTRETUNG, ...Object.values(UMZUG)]);
