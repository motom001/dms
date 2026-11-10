/**
 * Anzeige-Bedingungen im Mappenformular (#1033): aus den Werten, wie sie gerade eingegeben sind – sofort bei jeder
 * Eingabe (Art gewählt → Abschnitt erscheint). Die Auswertung selbst steht in shared/src/anzeige.ts und gilt genauso
 * auf dem Server (Pflicht); hier wird nur aus den rohen Eingaben die gespeicherte Form.
 */
import { anzeigestand, type Anzeigestand } from '../../../shared/src/anzeige';
import type { Merkmale } from '../../../shared/src/merkmale';
import { istLeer, type Feld, type Mappentyp } from '../../../shared/src/model';
import { ausRoh, werteAusRoh, type RohWerte } from '../werte';

export function anzeigeImFormular(typ: Mappentyp, roh: RohWerte, k: { merkmale?: Merkmale; bekannt: Record<string, { typId: string } | undefined> }): Anzeigestand {
  return anzeigestand(typ, werteAusRoh(typ, roh), { merkmale: k.merkmale, typVon: (id) => k.bekannt[id]?.typId });
}

/** Steht im Feld etwas? Ein Ja/Nein-Feld zählt nur mit „ja“ – „nein“ ist seine Vorgabe, kein eingetragener Wert. */
export function hatWert(f: Feld, roh: RohWerte): boolean {
  const v = ausRoh(f, roh[f.key]);
  return f.typ === 'janein' ? v === true : !istLeer(v);
}

/** Wie viele der Felder einen Wert haben – für die ruhige Zeile „… 3 Werte bleiben gespeichert“. */
export function anzahlWerte(typ: Mappentyp, keys: string[], roh: RohWerte): number {
  return keys.filter((k) => { const f = typ.felder.find((x) => x.key === k); return !!f && hatWert(f, roh); }).length;
}
