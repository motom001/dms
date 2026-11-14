/**
 * „Was mitkommt“ (#1047) aus einem Paket: dieselben Punkte wie die Paketseite des Katalogs (shared/src/mitkommt.ts). Die
 * Namen von Mappentypen und Feldern löst der Server auf, Text macht die Oberfläche daraus. Mit `update` markiert es, was
 * mit diesem Update dazukommt („neu in dieser Version“) – aus dem Plan der Vorschau.
 */
import { bereinigeAutomatisierung } from '../../../shared/src/automatisierung';
import type { Mitkommt, MitkommtAutomatisierung, MitkommtDann, MitkommtEmpfaenger, MitkommtWenn } from '../../../shared/src/mitkommt';
import type { MappenAktion } from '../../../shared/src/paketaktionen';
import type { Einstellungsbeschreibung } from '../../../shared/src/paketeinstellungen';
import { hatNetz, type PaketCode } from '../../../shared/src/pakete';
import type { VorgabePlan } from '../../../shared/src/vorgaben';

/** Was aus dem gelesenen Paket gebraucht wird (Paket in pakete.ts). */
interface PaketAutomatisierung { schluessel: string; name: string; beschreibung: string; wenn: Record<string, unknown>; dann: unknown[]; eingeschaltet?: boolean }
interface PaketTeile {
  manifest: { code?: unknown };
  typen: Array<{ schluessel: string; name: string; beschreibung: string; felder: unknown[] }>;
  sichten: Array<{ schluessel: string; name: string; beschreibung?: string }>;
  beispiele: Array<{ dokumente?: unknown[] }>;
  wortlisten: string[][];
  automatisierungen: PaketAutomatisierung[];
  ablaufvorlagen?: Array<{ schluessel: string; daten: unknown }>;
  mappenaktionen?: MappenAktion[];
  einstellungen: Einstellungsbeschreibung | null;
  code: { info: PaketCode } | null;
  sprache?: unknown;
}
/** Was aus der Vorschau gebraucht wird (Vorschau in pakete.ts). */
interface PlanTeile {
  typen: Array<{ schluessel: string; vorhanden: boolean; uebernimmt?: string }>;
  sichten: Array<{ schluessel: string; vorhanden: boolean }>;
  vorgaben: VorgabePlan[];
  ergaenzungen: Array<{ vorlagen: number }>;
  automatisierungen: Array<{ schluessel: string; neu: boolean }>;
  ablaufvorlagen?: Array<{ schluessel: string; name: string; karten: string[]; neu: boolean; geaendert: boolean }>;
  aktionen?: Array<{ schluessel: string; neu: boolean }>;
  einstellungen: { neu: string[] } | null;
}

/** Namen auflösen: Mappentyp eines Verweises (eigener Schlüssel oder `paket:typ`) und Bezeichnung eines Felds darin. */
export interface MitkommtNamen { typ(verweis: string): string; feld(verweis: string, key: string): string }

const istObjekt = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown) => (typeof v === 'string' ? v : '');

function wennAus(a: PaketAutomatisierung, n: MitkommtNamen): MitkommtWenn {
  const w = bereinigeAutomatisierung({ name: a.name, wenn: a.wenn, dann: [] }).wenn;
  if (w.art === 'datum') return { art: 'datum', typ: n.typ(w.typ), feld: n.feld(w.typ, w.feld), vorlauf: w.vorlauf, einheit: w.einheit, uhrzeit: w.uhrzeit, wiederholung: w.wiederholung ?? null };
  if (w.art === 'zeitplan') return { art: 'zeitplan', tage: w.tage, uhrzeit: w.uhrzeit, feiertage: w.feiertage, jeBenutzer: w.jeBenutzer, profilzeit: !!w.profilzeit };
  const typ = 'typ' in w && typeof w.typ === 'string' && w.typ ? w.typ : null;
  return { art: 'ereignis', ereignis: w.art, typ: typ ? n.typ(typ) : null };
}

function empfaengerAus(e: Record<string, unknown>, typ: string, n: MitkommtNamen): MitkommtEmpfaenger | null {
  if (e.art === 'ersteller') return { art: 'ersteller' };
  if (e.art === 'ereignis') return { art: 'ereignis', feld: text(e.feld) };
  if (e.art === 'feld') return { art: 'feld', feld: typ ? n.feld(typ, text(e.feld)) : text(e.feld), sonstErsteller: e.sonst === 'ersteller' };
  return null;
}

function dannAus(d: unknown, typ: string, n: MitkommtNamen): MitkommtDann {
  if (!istObjekt(d)) return { art: 'sonst' };
  if (d.art === 'aufgabe') return { art: 'aufgabe', benachrichtigung: d.als === 'benachrichtigung', empfaenger: (Array.isArray(d.empfaenger) ? d.empfaenger : []).filter(istObjekt).map((e) => empfaengerAus(e, typ, n)).filter((e): e is MitkommtEmpfaenger => !!e) };
  if (d.art === 'feld') return { art: 'feld', felder: Object.keys(istObjekt(d.werte) ? d.werte : {}).map((k) => (typ ? n.feld(typ, k) : k)) };
  if (d.art === 'anmeldeschutz') return { art: d.was === 'sammel' ? 'sammelmeldung' : 'kontosperre' };
  if (d.art === 'zusammenfassung' || d.art === 'favoriten' || d.art === 'paket' || d.art === 'stopp') return { art: d.art };
  return { art: 'sonst' };
}

function automatisierungAus(a: PaketAutomatisierung, n: MitkommtNamen, neu: boolean): MitkommtAutomatisierung {
  const typ = istObjekt(a.wenn) && typeof a.wenn.typ === 'string' ? a.wenn.typ : '';
  return { schluessel: a.schluessel, name: a.name, ...(a.beschreibung ? { beschreibung: a.beschreibung } : {}), wenn: wennAus(a, n), dann: a.dann.map((d) => dannAus(d, typ, n)), an: a.eingeschaltet === true, ...(neu ? { neu } : {}) };
}

/**
 * Was ein Paket mitbringt. plan: die Vorschau dieses Pakets (Namen der Vorgaben, Karten der Vorlagen, was neu ist);
 * update: neu markieren – sonst (gespeichert an der Installation) ohne Markierung.
 */
export function mitkommtVon(paket: PaketTeile, plan: PlanTeile, n: MitkommtNamen, update: boolean): Mitkommt {
  const neu = (ja: boolean) => (update && ja ? { neu: true } : {});
  const vorgaben = new Map<string, { namen: string[]; neu: string[] }>();
  for (const v of plan.vorgaben) {
    const g = vorgaben.get(v.typ) ?? { namen: [], neu: [] };
    g.namen.push(v.name);
    if (update && v.zustand === 'neu') g.neu.push(v.name);
    vorgaben.set(v.typ, g);
  }
  const einstellungNeu = new Set(plan.einstellungen?.neu ?? []);
  return {
    mappentypen: paket.typen.map((x) => ({ schluessel: x.schluessel, name: x.name, ...(x.beschreibung ? { beschreibung: x.beschreibung } : {}), felder: x.felder.length,
      ...neu(!plan.typen.find((p) => p.schluessel === x.schluessel)?.vorhanden && !plan.typen.find((p) => p.schluessel === x.schluessel)?.uebernimmt) })),
    sichten: paket.sichten.map((s) => ({ schluessel: s.schluessel, name: s.name, ...(s.beschreibung ? { beschreibung: s.beschreibung } : {}), ...neu(!plan.sichten.find((p) => p.schluessel === s.schluessel)?.vorhanden) })),
    vorgaben: [...vorgaben].map(([typ, g]) => ({ typ, namen: g.namen, ...(g.neu.length ? { neu: g.neu } : {}) })),
    vorlagen: plan.vorgaben.reduce((x, v) => x + (v.vorlagen ?? 0), 0) + plan.ergaenzungen.reduce((x, e) => x + (e.vorlagen ?? 0), 0),
    beispiele: paket.beispiele.length,
    beispielDokumente: paket.beispiele.reduce((x, b) => x + (b.dokumente?.length ?? 0), 0),
    wortlisten: paket.wortlisten,
    automatisierungen: paket.automatisierungen.map((a) => automatisierungAus(a, n, update && !!plan.automatisierungen.find((x) => x.schluessel === a.schluessel)?.neu)),
    ablaufvorlagen: (plan.ablaufvorlagen ?? []).map((a) => {
      const roh = paket.ablaufvorlagen?.find((x) => x.schluessel === a.schluessel)?.daten;
      const beschreibung = istObjekt(roh) ? text(roh.beschreibung) : '';
      return { schluessel: a.schluessel, name: a.name, ...(beschreibung ? { beschreibung } : {}), karten: a.karten, ...neu(a.neu || a.geaendert) };
    }),
    aktionen: (paket.mappenaktionen ?? []).map((a) => ({ schluessel: a.schluessel, name: a.name, ...(a.beschreibung ? { beschreibung: a.beschreibung } : {}), rechte: [...a.rechte], ...neu(!!plan.aktionen?.find((x) => x.schluessel === a.schluessel)?.neu) })),
    einstellungen: (paket.einstellungen?.bloecke ?? []).map((b) => {
      const titel = b.art === 'abschnitt' ? b.titel : b.name;
      const felder = b.felder.map((f) => ({ name: f.name, typ: f.typ }));
      const namen = b.art === 'abschnitt' ? b.felder.map((f) => f.name) : [b.name, ...b.felder.map((f) => `${b.name} › ${f.name}`)];
      return { titel, felder, liste: b.art === 'liste', ...neu(namen.some((x) => einstellungNeu.has(x))) };
    }),
    code: !!paket.code || paket.manifest.code !== undefined, netz: hatNetz(paket.code?.info), sprache: !!paket.sprache,
  };
}
