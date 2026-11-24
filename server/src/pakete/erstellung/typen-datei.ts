/**
 * Mappentypen als Datei exportieren (#1315): die gewählten eigenen Typen im Format von „Paket erstellen“ (`typInsPaket`),
 * ohne Mappen, Dokumente, Personen und Rechte. Reine Funktion wie `baue`.
 *
 * Verweise auf eigene Typen, die nicht dabei sind, kommen mit ihrer Kennung in die Datei und stehen als Abhängigkeit in
 * der Vorschau und in der Datei – der Empfänger braucht sie dann schon (oder nimmt sie mit in die Datei). Typen aus Paketen
 * bleiben beim Paket: Die Auswahl übergeht sie mit Hinweis; Verweise darauf nennen das Paket.
 */
import { type Mappentyp } from '../../../../shared/src/model';
import { t } from '../../sprache/sprache';
import type { PaketErstellenEingabe } from '../../../../shared/src/paketerstellung';
import {
  TYPEN_DATEI_FORMAT,
  TYPEN_DATEI_VERSION,
  type TypenDateiInhalt,
  type TypenExport,
  type TypenExportVorschau,
} from '../../../../shared/src/typendatei';
import type { ErstellenDaten } from './bau-hilfen';
import { type BauLauf, neuerLauf } from './bau-lauf';
import { eigeneTypen, typInsPaket, vergibTypSchluessel } from './bau-typen';

/** Ein Lauf wie beim Paket – ohne Angaben zum Paket, die es hier nicht gibt. */
const lauf = (typen: string[], d: ErstellenDaten): BauLauf =>
  neuerLauf({ typen, sichten: [], beispiele: [], wortlisten: [], id: 'mappentypen' } as unknown as PaketErstellenEingabe, d);

/** Was die Datei an Texten enthält, die Namen oder Nummern sein können: Auswahlwerte, Vorgabewerte, Vorlagen. */
function inhalteVon(typ: Mappentyp): TypenDateiInhalt[] {
  const r: TypenDateiInhalt[] = [];
  if (typ.titelVorlage) r.push({ feld: '', art: 'vorlage', text: typ.titelVorlage });
  for (const f of typ.felder.filter((x) => !x.system)) {
    if (f.optionen?.length) r.push({ feld: f.label, art: 'werte', text: f.optionen.join(', ') });
    if (f.standard !== undefined && f.standard !== null && f.standard !== '')
      r.push({ feld: f.label, art: 'vorgabe', text: typeof f.standard === 'string' ? f.standard : JSON.stringify(f.standard) });
    if (f.vorlage) r.push({ feld: f.label, art: 'vorlage', text: f.vorlage });
  }
  return r;
}

/**
 * Baut die Datei: erst ein Durchgang, der fehlende eigene Typen findet, dann der eigentliche – mit deren Kennungen, damit
 * die Verweise in der Datei stehen bleiben.
 */
export function baueTypenDatei(ids: string[], d: ErstellenDaten, jetzt = new Date()): TypenExport {
  const erster = lauf(ids, d);
  const eigene = eigeneTypen(erster);
  vergibTypSchluessel(erster, eigene);
  for (const x of eigene) typInsPaket(erster, x);
  const fehlend = erster.fehlend.filter((f) => f.art === 'typ');
  const l = lauf(ids, d);
  const gewaehlt = eigeneTypen(l);
  vergibTypSchluessel(l, gewaehlt);
  for (const f of fehlend) {
    const x = l.typById.get(f.id);
    if (x?.schluessel) l.schluessel[x.id] = x.schluessel;
  }
  const typen = gewaehlt.map((x) => typInsPaket(l, x));
  const abhaengigkeiten = fehlend.flatMap((f) => {
    const x = l.typById.get(f.id);
    return x?.schluessel ? [{ id: x.id, name: x.name, kennung: x.schluessel }] : [];
  });
  const probleme = [...l.probleme];
  if (!gewaehlt.length) probleme.push(t('meldungen.paketerstellung.typen-datei-leer'));
  const vorschau: TypenExportVorschau = {
    typen: gewaehlt.map((x) => ({
      id: x.id,
      name: x.name,
      kennung: l.schluessel[x.id],
      felder: x.felder.filter((f) => !f.system).length,
      register: x.register.length,
      inhalte: inhalteVon(x),
    })),
    abhaengigkeiten,
    pakete: l.abh,
    hinweise: l.hinweise,
    probleme: probleme.filter(Boolean),
  };
  if (vorschau.probleme.length || !typen.length) return { vorschau, datei: null };
  const datei = {
    format: TYPEN_DATEI_FORMAT,
    version: TYPEN_DATEI_VERSION,
    ablago: d.dmsVersion,
    erstellt: jetzt.toISOString(),
    mappentypen: typen,
    abhaengigkeiten: {
      mappentypen: abhaengigkeiten.map(({ kennung, name }) => ({ kennung, name })),
      pakete: l.abh,
    },
  };
  const name = `ablago-mappentypen-${typen.length === 1 ? typen[0].schluessel : typen.length}-${jetzt.toISOString().slice(0, 10)}.json`;
  return { vorschau, datei: { name, inhalt: `${JSON.stringify(datei, null, 2)}\n` } };
}
