/**
 * Feldart „Tabelle“ (#1030): eine Seite der Mappen, die über das Verweisfeld der Quelle auf eine Mappe verweisen – mit
 * den Spalten der gewählten Trefferliste des anderen Typs. Gehört zu den Sichten, weil es eine Liste ist wie sie: dieselbe
 * Seite aus dem Repo (Lesefilter, Sortierung, Blättern), dieselben Bezüge.
 *
 * Rechte (Ergänzung Sicherheit): Lesen an der Mappe selbst; Zeilen nur aus Mappen, die die Person lesen darf – auch die
 * Gesamtzahl zählt nur sie (der Lesefilter steht in der Anfrage ans Repo, nicht hinterher). Verweise in den Zellen auf
 * nicht lesbare Mappen kommen als „(nicht sichtbar)“ ohne Titel (`maskiereBezuege`). Passwortfelder sind nie Spalte.
 */
import { trefferlistenVon, verweiseVon, type Mappe, type MappenBezug, type Mappentyp } from '../../../shared/src/model';
import { TABELLE_SEITE, tabellenSpalten } from '../../../shared/src/tabelle';
import { teileVon } from '../../../shared/src/zusammengesetzt';
import { Fachfehler } from '../fehler';
import type { Repo, SortierungIntern } from '../repo';
import { t } from '../sprache';
import type { Zugriff } from '../kern';
import type { ZugriffDienst } from '../zugriff';

const text = (v: unknown) => (v == null ? '' : String(v)).trim();

/** Antwort: eine Seite der Tabelle. */
export interface Tabellenseite {
  /** Typ der Zeilen (der andere Mappentyp). */
  typId: string;
  /** Spalten (Feldschlüssel oder Systemspalten), ohne Passwortfelder. */
  spalten: string[];
  /** Zahl der Zeilen, die die Person lesen darf – nie mehr. */
  gesamt: number;
  von: number;
  mappen: Mappe[];
  bezuege: Record<string, MappenBezug>;
}

export interface TabellenTeile {
  repo: () => Repo;
  rechte: Pick<ZugriffDienst, 'pruefeRecht' | 'maskiereBezuege'>;
  typen: (z?: Zugriff) => Promise<Map<string, Mappentyp>>;
  sortierungAus: (spalte: string, absteigend: boolean, typ?: Mappentyp) => SortierungIntern | undefined;
}

/**
 * Eine Seite der Tabelle `feldKey` an der Mappe `id`. `q.von` blättert (je {@link TABELLE_SEITE} Zeilen), `q.sortierung`
 * und `q.absteigend` sortieren wie in der Trefferliste des anderen Typs (ohne: nach Titel).
 */
export async function tabellenSeite(teile: TabellenTeile, id: string, feldKey: string, q: { von?: unknown; sortierung?: unknown; absteigend?: unknown; gesamt?: unknown }, z?: Zugriff): Promise<Tabellenseite> {
  const mappe = await teile.rechte.pruefeRecht(z, id, 'R');
  const typen = await teile.typen(z);
  const typ = typen.get(mappe.typId);
  const f = typ?.felder.find((x) => x.key === feldKey && x.typ === 'tabelle');
  if (!f?.quelle) throw new Fachfehler(404, t('meldungen.tabelle.gibt-es-nicht'));
  const quelltyp = typen.get(f.quelle.typId);
  // Den anderen Typ kennt der Zugriff nicht (Dienstkonto eines Pakets ohne Leserecht darauf) oder es gibt ihn nicht mehr:
  // dann wie eine leere Tabelle – ohne zu verraten, ob es Zeilen gäbe.
  if (!quelltyp) return { typId: f.quelle.typId, spalten: ['_titel'], gesamt: 0, von: 0, mappen: [], bezuege: {} };
  const spalten = tabellenSpalten(quelltyp, f.quelle.trefferliste, trefferlistenVon);
  const von = Math.max(0, Math.floor(Number(q.von) || 0));
  const sortierung = teile.sortierungAus(text(q.sortierung), q.absteigend === 'true' || q.absteigend === true, quelltyp);
  const bekannt = Number(q.gesamt);
  const repo = teile.repo();
  const r = await repo.seite({
    klauseln: [{ typen: [quelltyp.id], filter: [{ art: 'feld', key: f.quelle.feldKey, feldart: 'referenz', op: 'zeigtAuf', a: [mappe.id] }] }],
    sortierung, lesen: z?.lesen ?? null, von, anzahl: TABELLE_SEITE,
    // Beim Blättern die Zahl vom ersten Blatt (#740) – das Repo liefert nie weniger, als bis hier geliefert ist.
    ...(von > 0 && Number.isInteger(bekannt) && bekannt >= 0 ? { gesamt: bekannt } : {}),
  });
  // Nur Werte der gezeigten Spalten verlassen den Server (keine Passwörter, nichts sonst aus der Mappe) – und nur deren Bezüge.
  // Eine zusammengesetzte Spalte (#1050) zeigt den Text aus ihren Teilen: deren Werte gehen mit (nie Passwörter).
  const teilKeys = spalten.flatMap((k) => { const g = quelltyp.felder.find((x) => x.key === k); return g?.typ === 'zusammengesetzt' ? teileVon(quelltyp.felder, g).map((x) => x.key) : []; });
  const mitWert = [...new Set([...spalten, ...teilKeys])];
  const mappen = r.mappen.map((m) => ({ ...m, werte: Object.fromEntries(mitWert.filter((k) => k in m.werte).map((k) => [k, m.werte[k]])) }));
  const ziele = mappen.flatMap((m) => verweiseVon(quelltyp, m.werte).map((v) => v.zielId));
  return { typId: quelltyp.id, spalten, gesamt: r.gesamt, von, mappen, bezuege: await teile.rechte.maskiereBezuege(z, await repo.bezuege(ziele)) };
}
