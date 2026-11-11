/**
 * Geschützte Felder (#995): Ein Feld mit `schreibschutz: 'verwaltung'` – etwa das Merkmal „eigene Organisation“ der
 * Basis – ändert nur, wer im Verwaltungsmodus den Bereich „Eigene Organisation“ verwalten darf, oder wer eine dort
 * freigegebene Rolle hat (shared/src/organisation.ts, `darfGeschuetztSchreiben`). Sonst 403 – auf allen Wegen über
 * `legeMappeAn`/`aendereMappe`: Oberfläche, API v1 (API-Schlüssel sind nie im Verwaltungsmodus), Pakete, Automatisierungen
 * (Systemkonto) und Mehrfach ändern. Interne Wege ohne Zugriff (Vorgaben und Beispiele beim Installieren) prüfen nicht.
 *
 * Dazu, was die Verwaltung erfahren soll: Änderungen am Merkmal und an den Verantwortlichen einer eigenen Organisation
 * (`organisationsNotizen`) – Notiz und Systemprotokoll schreibt der Fachbereich Organisation nach dem Speichern.
 * Schicht 2.
 */
import { istLeer, type Feld, type Mappentyp, type Werte } from '../../../shared/src/model';
import { darfGeschuetztSchreiben, geschuetzteSchreibfelder, liesOrganisationEinstellung, merkmalFeld, ORGANISATION_EINSTELLUNG, verweisFelder, VERWEISE, type OrganisationNotiz } from '../../../shared/src/organisation';
import { Fachfehler } from '../fehler';
import type { Kern, Zugriff } from '../kern';
import { t } from '../sprache';

/** Was die 403-Antwort je Feld nennt (`details.schreibschutz`). */
export interface SchreibschutzAbgelehnt { feld: string; label: string }

const gleich = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null) || (istLeer(a as Werte[string]) && istLeer(b as Werte[string]));

/**
 * Geschützte Felder, die diese Anfrage ändern will (gesendet und anders als bisher). Beim Anlegen zählt bei Ja/Nein nur
 * „ja“ – „nein“ ist die Vorgabe jeder neuen Mappe.
 */
export function geaenderteGeschuetzte(typ: Mappentyp, alt: Werte, neu: Werte, gesendet: Set<string>): Feld[] {
  return geschuetzteSchreibfelder(typ).filter((f) => gesendet.has(f.key) && !gleich(alt[f.key], neu[f.key]) && !(f.typ === 'janein' && !(f.key in alt) && neu[f.key] !== true));
}

/** Darf dieser Zugriff geschützte Felder schreiben? Ohne Zugriff (intern) ja. */
export async function darfSchreibschutz(kern: Kern, z: Zugriff | undefined): Promise<boolean> {
  if (!z) return true;
  const e = liesOrganisationEinstellung(await kern.einstellungen?.lies(ORGANISATION_EINSTELLUNG));
  const art = z.paket ? 'dienst' : z.systemkonto ? 'system' : undefined;
  return darfGeschuetztSchreiben({ verwaltungsmodus: z.admin, verwaltung: z.ich.verwaltung, ...(art ? { art } : {}), rollen: z.wer.rollen }, e);
}

/** Geschützte Felder prüfen: ohne Recht 403 mit den Feldern (Ergänzung Sicherheit, Entscheidung Thomas 10.11.2026). */
export async function pruefeSchreibschutz(kern: Kern, typ: Mappentyp, w: { alt: Werte; neu: Werte; gesendet: Set<string> }, z: Zugriff | undefined): Promise<void> {
  const felder = geaenderteGeschuetzte(typ, w.alt, w.neu, w.gesendet);
  if (!felder.length || await darfSchreibschutz(kern, z)) return;
  const abgelehnt: SchreibschutzAbgelehnt[] = felder.map((f) => ({ feld: f.key, label: f.label }));
  throw new Fachfehler(403, t('meldungen.organisation.schreibschutz', { felder: abgelehnt.map((a) => `„${a.label}“`).join(', '), anzahl: abgelehnt.length }), { schreibschutz: abgelehnt });
}

/** Welche Felder diese Person an Mappen dieses Typs nicht ändern darf (für das Formular: nur lesbar). */
export async function gesperrteSchreibfelder(kern: Kern, typ: Mappentyp | undefined, z: Zugriff | undefined): Promise<string[]> {
  const felder = geschuetzteSchreibfelder(typ);
  if (!felder.length || await darfSchreibschutz(kern, z)) return [];
  return felder.map((f) => f.key);
}

/**
 * Was die Verwaltung über diese Änderung erfahren soll (Ergänzung Sicherheit): das Merkmal „eigene Organisation“ an
 * oder aus, ein anderer Verantwortlicher oder Datenschutzbeauftragter einer eigenen Organisation (vorher oder nachher).
 */
export function organisationsNotizen(typ: Mappentyp, alt: Werte, neu: Werte): Array<OrganisationNotiz['was']> {
  const mf = merkmalFeld(typ);
  if (!mf) return [];
  const vorher = alt[mf.key] === true, nachher = neu[mf.key] === true;
  const aus: Array<OrganisationNotiz['was']> = [];
  if (vorher !== nachher) aus.push(nachher ? 'merkmal-an' : 'merkmal-aus');
  if (!vorher && !nachher) return aus;
  const vf = verweisFelder(typ);
  for (const k of VERWEISE) {
    const f = vf[k];
    if (f && !gleich(alt[f.key], neu[f.key])) aus.push(k);
  }
  return aus;
}
