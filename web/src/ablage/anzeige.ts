/**
 * Anzeige-Bedingungen im Mappenformular (#1033): aus den Werten, wie sie gerade eingegeben sind – sofort bei jeder
 * Eingabe (Art gewählt → Abschnitt erscheint). Die Auswertung selbst steht in shared/src/anzeige.ts und gilt genauso
 * auf dem Server (Pflicht); hier wird nur aus den rohen Eingaben die gespeicherte Form.
 */
import { anzeigestand, type Anzeigestand } from '../../../shared/src/anzeige';
import type { Merkmale } from '../../../shared/src/merkmale';
import { istLeer, type Feld, type Mappentyp } from '../../../shared/src/model';
import { ausRoh, werteAusRoh, type RohWerte } from '../werte';

export function anzeigeImFormular(
  typ: Mappentyp,
  roh: RohWerte,
  k: { merkmale?: Merkmale; eigene?: string[]; bekannt: Record<string, { typId: string } | undefined> },
): Anzeigestand {
  return anzeigestand(typ, werteAusRoh(typ, roh), {
    merkmale: k.merkmale,
    typVon: (id) => k.bekannt[id]?.typId,
    eigeneOrganisation: (id) => !!k.eigene?.includes(id),
  });
}

/** Steht im Feld etwas? Ein Ja/Nein-Feld zählt nur mit „ja“ – „nein“ ist seine Vorgabe, kein eingetragener Wert. */
export function hatWert(f: Feld, roh: RohWerte): boolean {
  const v = ausRoh(f, roh[f.key]);
  return f.typ === 'janein' ? v === true : !istLeer(v);
}

/** Wie viele der Felder einen Wert haben – für die ruhige Zeile „… 3 Werte bleiben gespeichert“. */
export function anzahlWerte(typ: Mappentyp, keys: string[], roh: RohWerte): number {
  return keys.filter((k) => {
    const f = typ.felder.find((x) => x.key === k);
    return !!f && hatWert(f, roh);
  }).length;
}

/**
 * Felder, die beim Anlegen keinen Wert bekommen (#1492): ausgeblendete Felder und Register (#655) und, was eine
 * Anzeige-Bedingung gerade ausblendet (#1033) – außer, die Person hat das Feld oder seinen Abschnitt mit „anzeigen“
 * aufgedeckt. So entstehen keine Angaben, die nie zu sehen waren: kein Vorgabewert, kein Vorschlag der Erkennung.
 */
export function beimAnlegenVerborgen(ausgeblendet: Set<string>, anz: Anzeigestand, aufgedeckt: Set<string>): Set<string> {
  const aus = new Set(ausgeblendet);
  for (const k of anz.felder) if (!aufgedeckt.has(`f:${k}`)) aus.add(k);
  for (const a of anz.abschnitte) if (!aufgedeckt.has(`a:${a.register}.${a.abschnitt.vor}`)) for (const k of a.felder) aus.add(k);
  return aus;
}
