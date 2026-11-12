/**
 * Automatisierungsvorlagen aus Paketen (#1044, dms-registry `inhalt.ablaufvorlagen`): anlegen, bei Updates ersetzen,
 * beim Entfernen wegnehmen. Teil von `MappenAblaeufe` (ablaeufe.ts), hier nur ausgelagert.
 *
 * - Je Schlüssel die Kennung `paket:schluessel`; mit `ersetzt` die Kennung der Kern-Vorgabe (Überlagerung) – offene
 *   Abläufe nennen dieselbe Kennung und bleiben gültig.
 * - Ein Update ersetzt nur Unverändertes; was ein Admin geändert hat, bleibt – auch eine geänderte Kern-Vorgabe wird nicht
 *   überlagert, und ein zweites Paket überlagert nicht, was ein anderes schon tut.
 * - Was das Paket nicht mehr mitbringt (auch beim Entfernen): weg. Überlagerungen geben die Kern-Vorgabe zurück; eine
 *   Vorlage mit offenen Abläufen bleibt als eigene stehen, damit niemand etwas verliert.
 * - Die Karten hat `pakete.ts` gegen die erlaubte Liste geprüft; hier noch einmal, bevor etwas gespeichert wird.
 */
import { protokoll } from '../protokoll';
import type { Repo } from '../repo';
import {
  type Ablaufvorlage, type AblaufvorlageDaten, bereinigeVorlage, istKernVorlage, kernVorlage, VORLAGEN_REIHENFOLGE, vorlagenEingabeFehler,
} from '../../../shared/src/ablaufvorlagen';

const log = protokoll.modul('werkbank');

/** Eine mitgelieferte Vorlage im Paket: wie im Editor, Typen als Paket-Schlüssel (`schluessel` oder `paket:typ`). */
export interface PaketAblaufvorlage { schluessel: string; ersetzt?: string | null; daten: Record<string, unknown> }

type PaketAngabe = { id: string; name: string; typen: Record<string, string> };

/** Daten der Vorlage mit den Ids der Mappentypen dieser Installation. */
function datenAus(x: PaketAblaufvorlage, typId: (vw: string) => string | null): AblaufvorlageDaten {
  const roh = bereinigeVorlage(x.daten);
  const reihenfolge = x.daten.reihenfolge !== undefined ? roh.reihenfolge : istKernVorlage(x.ersetzt) ? kernVorlage(x.ersetzt).reihenfolge : VORLAGEN_REIHENFOLGE.paket;
  return { ...roh, typen: roh.typen.map(typId).filter((y): y is string => !!y), reihenfolge };
}

/** Was das Paket nicht mehr mitbringt: Überlagerung weg (die Kern-Vorgabe gilt), mit offenen Abläufen als eigene. */
async function raeumeAuf(repo: Repo, alte: Ablaufvorlage[]) {
  for (const v of alte) {
    if (istKernVorlage(v.kennung)) await repo.loescheAblaufvorlage(v.kennung);
    else if ((await repo.ablaeufe({ vorlage: v.kennung })).length) await repo.speichereAblaufvorlage({ ...v, herkunft: 'eigen', paketId: null }, null, v.version);
    else await repo.loescheAblaufvorlage(v.kennung);
  }
}

export async function vorlagenAusPaket(repo: Repo, p: PaketAngabe, liste: PaketAblaufvorlage[]): Promise<number> {
  const pakete = await repo.listePakete();
  const typId = (vw: string): string | null => {
    const [pk, sl] = vw.includes(':') ? vw.split(':') : [p.id, vw];
    return (pk === p.id ? p.typen[sl] : pakete.find((x) => x.id === pk)?.typen[sl]) ?? null;
  };
  const gespeichert = await repo.ablaufvorlagen();
  const mein = (v: Ablaufvorlage) => v.herkunft === 'paket' && v.paketId === p.id;
  const kennungen = new Set<string>();
  let n = 0;
  for (const x of liste) {
    const kennung = istKernVorlage(x.ersetzt) ? x.ersetzt : `${p.id}:${x.schluessel}`;
    if (vorlagenEingabeFehler(x.daten).length) { log.warn('Mitgelieferte Vorlage nicht übernommen: Karte nicht erlaubt', { paket: p.id, vorlage: x.schluessel }); continue; }
    kennungen.add(kennung);
    const da = gespeichert.find((v) => v.kennung === kennung);
    // Vom Admin geändert oder von einem anderen Paket überlagert: bleibt, wie sie ist.
    if (da && (!mein(da) || da.geaendertVon !== null)) {
      if (!mein(da)) log.info('Mitgelieferte Vorlage nicht übernommen: schon geändert bzw. überlagert', { paket: p.id, vorlage: x.schluessel, kennung });
      continue;
    }
    const v: Ablaufvorlage = { ...datenAus(x, typId), kennung, aktiv: da?.aktiv ?? true, herkunft: 'paket', paketId: p.id, version: da?.version ?? 1, geaendert: null, geaendertVon: null };
    if (await repo.speichereAblaufvorlage(v, null, da ? da.version : null)) n++;
  }
  await raeumeAuf(repo, gespeichert.filter((y) => mein(y) && !kennungen.has(y.kennung)));
  if (n) log.info('Automatisierungsvorlagen aus Paket übernommen', { paket: p.id, anzahl: n, name: p.name });
  return n;
}
