/**
 * Installieren unabhängig von der Reihenfolge (#1122): Anzeige-Bedingungen, optionale Ziele und Quellen von
 * Verknüpfungsregistern. Die Paketverwaltung (pakete.ts) legt neue Typen in zwei Durchgängen an – erst, was schon geht,
 * dann den Rest. Hier steht, was dabei auf den zweiten Durchgang warten muss und wie Typverweise in Bedingungen zu Ids
 * werden. Nichts fällt still weg: Was am Ende nicht angelegt ist, nennt `quellenNachtragen` mit Stelle.
 *
 * Optionales Ziel (#1036): Ein Feld nennt unter `zielOptional` Typen anderer Pakete. Fehlt das Paket, bleibt in
 * „zeigt auf Mappe vom Typ …“ die Kennung `paket:schluessel` stehen – sie passt zu keiner Mappe, die Bedingung trifft nie
 * zu (shared/src/anzeige.ts, wartetAufPaket). Kommt das Paket, setzt `optionaleInAnzeige` die Id ein.
 */
import { zielErlaubt, type Anzeigeregel, type Feld, type Mappentyp, type Register } from '../../../shared/src/model';

type FeldZiele = { key: string; zielOptional?: string[] };
const istObjekt = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const bedingungenVon = (roh: unknown): unknown[] => (istObjekt(roh) && Array.isArray(roh.bedingungen) ? roh.bedingungen : []);

/** Die feste Liste von „zeigt auf Mappe vom Typ …“ (op zeigtAufTyp) einer inneren Bedingung – sonst null. */
function zeigtAufTyp(b: Record<string, unknown>): unknown[] | null {
  const innen = istObjekt(b.bedingung) ? b.bedingung : null;
  const w = innen && innen.op === 'zeigtAufTyp' && istObjekt(innen.wert) && innen.wert.art === 'fest' && Array.isArray(innen.wert.wert) ? innen.wert.wert : null;
  return b.art === 'feld' ? w : null;
}

/** Feld, auf das eine Bedingung schaut: `art: feld` innen, sonst `feld` (verweistyp, eigeneOrganisation, vorgabe). */
function bedingungsFeld(b: Record<string, unknown>): string {
  const innen = istObjekt(b.bedingung) ? b.bedingung : null;
  return String((b.art === 'feld' ? innen?.feld : b.feld) ?? '');
}

/** Typverweise einer Bedingung „zeigt auf Mappe vom Typ …“ (verweistyp bzw. zeigtAufTyp). */
function typVerweise(b: Record<string, unknown>): string[] {
  if (b.art === 'verweistyp') return typeof b.typ === 'string' ? [b.typ] : [];
  return (zeigtAufTyp(b) ?? []).map(String);
}

/**
 * Muss eine Regel (Feld oder Abschnitt) auf den zweiten Durchgang warten? Ja, wenn eine Bedingung auf ein Feld schaut,
 * das erst dann dazukommt (`offen`), oder auf einen Typ des Pakets, den es noch nicht gibt (`typFehlt`).
 */
export function anzeigeWartet(roh: unknown, offen: Set<string>, typFehlt: (vw: string) => boolean): boolean {
  return bedingungenVon(roh).some((b) => istObjekt(b) && (offen.has(bedingungsFeld(b)) || typVerweise(b).some(typFehlt)));
}

/**
 * Typverweise in Anzeige-Bedingungen eines Pakets → Ids (`id` wirft, wenn es den Typ nicht geben kann). Ein optionales
 * Ziel des Felds (`zielOptional`), dessen Paket fehlt, ist kein Fehler: Die Kennung bleibt stehen und trifft nie zu.
 */
export function anzeigeTypIds(roh: unknown, felder: FeldZiele[], id: (vw: string) => string, optional: (vw: string) => string | null): unknown {
  if (!istObjekt(roh) || !Array.isArray(roh.bedingungen)) return roh;
  const aufloesen = (feld: string, vw: string) => (felder.find((f) => f.key === feld)?.zielOptional?.includes(vw) ? optional(vw) ?? vw : id(vw));
  const bedingungen = roh.bedingungen.map((b) => {
    if (!istObjekt(b)) return b;
    if (b.art === 'verweistyp' && typeof b.typ === 'string') return { ...b, typ: aufloesen(String(b.feld ?? ''), b.typ) };
    const liste = zeigtAufTyp(b);
    if (!liste) return b;
    const innen = b.bedingung as Record<string, unknown>;
    return { ...b, bedingung: { ...innen, wert: { art: 'fest', wert: liste.map((x) => aufloesen(String(innen.feld ?? ''), String(x))) } } };
  });
  return { ...roh, bedingungen };
}

/**
 * Gespeicherte Regel: Kennungen optionaler Ziele, die es jetzt als Typ gibt (`kennung`: Kennung → Id), werden zu Ids –
 * nur, wo das Feld den Typ als Ziel hat. Unverändert = dasselbe Objekt.
 */
export function optionaleInAnzeige(a: Anzeigeregel | undefined, felder: Feld[], kennung: Map<string, string>): Anzeigeregel | undefined {
  if (!a) return a;
  let anders = false;
  const id = (feld: string, x: string) => {
    const f = felder.find((y) => y.key === feld);
    const neu = f?.zielOptional?.includes(x) ? kennung.get(x) : undefined;
    if (!neu || !zielErlaubt(f!, neu)) return x;
    anders = true;
    return neu;
  };
  const bedingungen = a.bedingungen.map((b) => {
    if (b.art === 'verweistyp') return { ...b, typ: id(b.feld, b.typ) };
    if (b.art !== 'feld' || b.bedingung.op !== 'zeigtAufTyp' || b.bedingung.wert?.art !== 'fest' || !Array.isArray(b.bedingung.wert.wert)) return b;
    return { ...b, bedingung: { ...b.bedingung, wert: { ...b.bedingung.wert, wert: b.bedingung.wert.wert.map((x) => id(b.bedingung.feld, String(x))) } } };
  });
  return anders ? { ...a, bedingungen } : a;
}

/** Felder und Abschnitte eines Typs mit `optionaleInAnzeige`; null = nichts geändert. */
export function optionaleInTyp(typ: Pick<Mappentyp, 'felder' | 'register'>, kennung: Map<string, string>): Pick<Mappentyp, 'felder' | 'register'> | null {
  let anders = false;
  const felder = typ.felder.map((f) => { const a = optionaleInAnzeige(f.anzeigen, typ.felder, kennung); if (a === f.anzeigen) return f; anders = true; return { ...f, anzeigen: a }; });
  const register = typ.register.map((r) => {
    if (!r.abschnitte?.some((x) => x.anzeigen)) return r;
    const abschnitte = r.abschnitte.map((x) => { const a = optionaleInAnzeige(x.anzeigen, felder, kennung); if (a === x.anzeigen) return x; anders = true; return { ...x, anzeigen: a }; });
    return { ...r, abschnitte };
  });
  return anders ? { felder, register } : null;
}

/** Eine Quelle, die ein Register laut Paket hat: `quelle` ist der Typverweis aus dem Paket (für die Meldung). */
export interface SollQuelle { register: string; typId: string; feldKey: string; quelle: string }

/**
 * Ist eine Quelle schon anlegbar? Das Feld des anderen Typs (bzw. dieses Typs: `eigeneFelder`) muss ein Verweis sein,
 * der auf diesen Typ zeigen darf – sonst entfernt das Speichern sie still (mappentypen.dienst, pruefeTyp).
 */
export function quelleAnlegbar(q: { typId: string; feldKey: string }, eigeneId: string, typen: Map<string, Pick<Mappentyp, 'felder'>>, eigeneFelder: Array<Pick<Feld, 'key' | 'typ' | 'zielTypen'>>): boolean {
  const f = (q.typId === eigeneId ? eigeneFelder : typen.get(q.typId)?.felder ?? []).find((x) => x.key === q.feldKey);
  return f?.typ === 'referenz' && zielErlaubt(f, eigeneId);
}

/**
 * Am Ende der Installation (#1122): Quellen, die das Paket an Registern dieses Typs vorsieht, aber noch fehlen, jetzt
 * eintragen, wo es geht; was nicht geht, steht in `fehlen` (die Installation bricht dann mit Stelle ab).
 */
export function quellenNachtragen(typ: Pick<Mappentyp, 'id' | 'felder' | 'register'>, soll: SollQuelle[], typen: Map<string, Pick<Mappentyp, 'felder'>>): { register: Register[]; fehlen: SollQuelle[]; geaendert: boolean } {
  const fehlen: SollQuelle[] = [];
  let geaendert = false;
  const register = typ.register.map((r) => {
    const dazu = soll.filter((q) => q.register === r.key && !(r.quellen ?? []).some((x) => x.typId === q.typId && x.feldKey === q.feldKey));
    const geht = dazu.filter((q) => quelleAnlegbar(q, typ.id, typen, typ.felder));
    fehlen.push(...dazu.filter((q) => !geht.includes(q)));
    if (!geht.length) return r;
    geaendert = true;
    return { ...r, quellen: [...(r.quellen ?? []), ...geht.map((q) => ({ typId: q.typId, feldKey: q.feldKey }))] };
  });
  return { register, fehlen, geaendert };
}
