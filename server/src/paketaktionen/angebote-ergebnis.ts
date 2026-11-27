/**
 * Antwort eines Pakets auf ein Angebot beim Ausfüllen (#1724) lesen: ein Dialog (wie bei den Aktionen im Menü „Mappe“,
 * geprüft mit `liesAntwort`) oder Werte – `vorschlaege` für Felder und `verweise` für Verweisfelder. Verweise löst
 * Ablago selbst auf: Es sucht die Mappe über die Felder des Zieltyps mit `eindeutig: true` (nur, was die Person lesen
 * darf) und schlägt sonst „neue Mappe anlegen“ mit den gelieferten Werten vor. Ids von Mappen kommen nie vom Paket.
 */
import type { AktionsDialog } from '../../../shared/src/paketaktionen';
import { pruefeVorschlaege, type Vorschlaege } from '../../../shared/src/erkennung';
import { auswahlText, type Feld, type MappenBezug, type Mappentyp, zieleVon } from '../../../shared/src/model';
import { Fachfehler } from '../grundlagen/fehler';
import { AKTION_KURZ_MAX } from '../grundlagen/grenzen';
import type { Zugriff } from '../kern';
import type { Repo } from '../repo';
import { t } from '../sprache/sprache';
import type { ZugriffDienst } from '../zugriff';
import { AntwortFehler, liesAntwort, reinerText } from './dialog';

/** Höchstens so viele Verweise je Antwort und so lang ein Wert für „neu anlegen“ (Zeichen). */
const VERWEISE_MAX = 20;
const NEU_WERT_MAX = 500;

/** Werte für ein Verweisfeld: Feld des Zieltyps → Wert (z. B. { fin: "…", kennzeichen: "…" }). */
export type VerweisAngaben = Record<string, Record<string, unknown>>;
export type AngebotsAntwort =
  { art: 'dialog'; dialog: AktionsDialog; stand: unknown } | { art: 'werte'; vorschlaege: Vorschlaege; verweise: VerweisAngaben };

const istObjekt = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Antwort lesen: `{ "dialog": … }` (geprüft wie bei den Aktionen), `{ "fehler": "…" }` (verständliche Meldung) oder
 * `{ "vorschlaege": { feld: wert | { wert, sicherheit } }, "verweise": { feld: { zielfeld: wert } } }`. Fundstelle ist
 * immer der Paketname; Verweise und nicht erlaubte Felder fallen aus `vorschlaege` weg, jeder Wert geht durch die
 * Prüfung der Feldart (verworfen wird ohne Werte protokolliert).
 */
export function liesAngebotsAntwort(
  text: string,
  typ: Mappentyp,
  erlaubt: (f: Feld) => boolean,
  paket: { id: string; name: string },
  fundstelle: string,
): AngebotsAntwort & { verworfen: string[] } {
  let o: Record<string, unknown> | null = null;
  try {
    const j: unknown = JSON.parse(text);
    if (istObjekt(j)) o = j;
  } catch {
    o = null;
  }
  const ungueltig = () => new Fachfehler(502, t('meldungen.paketaktionen.ungueltig', { paket: paket.name }));
  if (!o) throw ungueltig();
  if (typeof o.fehler === 'string')
    throw new Fachfehler(
      502,
      t('meldungen.paketaktionen.angebot-meldet', { paket: paket.name, fehler: reinerText(o.fehler, AKTION_KURZ_MAX) }),
    );
  if (o.dialog !== undefined && o.vorschlaege === undefined) {
    try {
      const a = liesAntwort(text);
      if (a.art === 'dialog') return { art: 'dialog', dialog: a.dialog, stand: a.stand, verworfen: [] };
    } catch (e) {
      if (!(e instanceof AntwortFehler)) throw e;
    }
    throw ungueltig();
  }
  const v = o.vorschlaege ?? {};
  if (!istObjekt(v) || (o.verweise !== undefined && !istObjekt(o.verweise))) throw ungueltig();
  const roh = Object.fromEntries(
    Object.entries(v).map(([k, w]) => {
      const x = istObjekt(w) && 'wert' in w ? (w as { wert: unknown; sicherheit?: unknown }) : { wert: w };
      const sicherheit = x.sicherheit === 'mittel' || x.sicherheit === 'niedrig' ? x.sicherheit : 'hoch';
      return [k, { wert: x.wert, sicherheit, fundstelle }];
    }),
  );
  const { vorschlaege, verworfen } = pruefeVorschlaege(typ, roh, (f) => erlaubt(f) && f.typ !== 'referenz');
  const verweise = Object.fromEntries(
    Object.entries((o.verweise as Record<string, unknown> | undefined) ?? {})
      .filter((e): e is [string, Record<string, unknown>] => istObjekt(e[1]))
      .slice(0, VERWEISE_MAX),
  );
  return { art: 'werte', vorschlaege, verweise, verworfen: verworfen.map((x) => `${x.feld}: ${x.grund}`) };
}

/** Zum Vergleichen eindeutiger Werte: nur Buchstaben und Ziffern, groß („DD-LM 123“ = „ddlm123“). */
const vergleichbar = (s: string) => s.toUpperCase().replace(/[^\p{L}\p{N}]/gu, '');

/** Werte für den Zieltyp: nur seine Felder, geprüft wie jeder Vorschlag; für „neu anlegen“ nur Text und Zahlen. */
function werteFuer(ziel: Mappentyp, angaben: Record<string, unknown>): Record<string, string | number> {
  const roh = Object.fromEntries(Object.entries(angaben).map(([k, w]) => [k, { wert: w, sicherheit: 'hoch', fundstelle: '' }]));
  const { vorschlaege } = pruefeVorschlaege(ziel, roh, (f) => f.typ !== 'passwort' && f.typ !== 'referenz' && !f.berechnetVon);
  const r: Record<string, string | number> = {};
  for (const [k, x] of Object.entries(vorschlaege))
    if (typeof x.wert === 'number') r[k] = x.wert;
    else if (typeof x.wert === 'string' && x.wert.trim()) r[k] = x.wert.trim().slice(0, NEU_WERT_MAX);
  return r;
}

/**
 * Verweise auflösen (#1724): je Verweisfeld der erste Zieltyp, zu dem Werte passen. Gibt es genau eine lesbare Mappe,
 * deren Feld mit `eindeutig: true` einen gelieferten Wert trägt, wird sie vorgeschlagen; gibt es keine, „neue Mappe
 * anlegen“ mit den Werten (wie bei der Erkennung); mehrere: nichts – lieber kein Vorschlag als ein falscher.
 */
export async function loeseVerweise(
  o: { repo: Repo; rechte: Pick<ZugriffDienst, 'lesbare'>; z: Zugriff },
  typ: Mappentyp,
  verweise: VerweisAngaben,
  erlaubt: (f: Feld) => boolean,
  fundstelle: string,
): Promise<{
  vorschlaege: Vorschlaege;
  bezuege: Record<string, MappenBezug>;
  neu: Record<string, { typId: string; werte: Record<string, string | number>; fundstelle: string }>;
}> {
  const r = {
    vorschlaege: {} as Vorschlaege,
    bezuege: {} as Record<string, MappenBezug>,
    neu: {} as Record<string, { typId: string; werte: Record<string, string | number>; fundstelle: string }>,
  };
  for (const [key, angaben] of Object.entries(verweise)) {
    const f = typ.felder.find((x) => x.key === key && x.typ === 'referenz');
    if (!f || !erlaubt(f)) continue;
    const ziel = zieleVon(f)
      .map((id) => o.z.typen.get(id))
      .find((x): x is Mappentyp => !!x && !x.system && Object.keys(werteFuer(x, angaben)).length > 0);
    if (!ziel) continue;
    const werte = werteFuer(ziel, angaben);
    const eindeutig = ziel.felder.filter((x) => x.eindeutig && werte[x.key] !== undefined);
    const passend = eindeutig.length
      ? (await o.repo.listeMappen(ziel.id)).filter((m) =>
          eindeutig.some((e) => vergleichbar(auswahlText(m.werte[e.key])) === vergleichbar(String(werte[e.key]))),
        )
      : [];
    const lesbar = await o.rechte.lesbare(
      o.z,
      passend.map((m) => m.id),
    );
    const sichtbar = passend.filter((m) => lesbar.has(m.id));
    if (sichtbar.length === 1) {
      const m = sichtbar[0];
      r.vorschlaege[key] = { wert: f.mehrfach ? [m.id] : m.id, sicherheit: 'hoch', fundstelle };
      r.bezuege[m.id] = { titel: m.titel ?? '', typId: m.typId };
    } else if (!passend.length) r.neu[key] = { typId: ziel.id, werte, fundstelle };
  }
  return r;
}
