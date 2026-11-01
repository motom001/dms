/**
 * Baum-Sammlung über Verweise (#396, #424) – der Algorithmus. Typen und Optionen: shared/src/baum.ts.
 *
 * Breitensuche Ebene für Ebene: je Ebene ein Zugriff auf die Verweise (beide Richtungen), die Mappen
 * und die Lesbarkeit – nicht je Mappe. Nicht lesbare Mappen werden weder aufgenommen noch
 * weiterverfolgt (sonst ließe sich über sie etwas erfahren); sie zählen nur in `verborgen`.
 * Die Datenquelle (`BaumQuelle`) baut der Dienst aus Repo und Zugriff; Tests können sie selbst bauen.
 *
 * Mit `nurZugehoerigkeit` (#424, #472) wird über eine Mappe, die nur über „Bezug“ dranhängt, nicht
 * weitergesammelt. Erreicht die Sammlung sie später doch über eine „Zugehörigkeit“, hängt sie dort ein
 * und wird weiterverfolgt; innerhalb einer Ebene haben Wege über Zugehörigkeit Vorrang.
 */
import { aufbewahrenBis, inFrist } from '../../shared/src/archiv';
import { AUSSEN_MAX, verweisartVon, type AussenVerweis, type Baum, type BaumKante, type BaumKnoten, type BaumOptionen, type BaumRichtung } from '../../shared/src/baum';
import type { Mappe, MappenBezug, Mappentyp } from '../../shared/src/model';
import { NICHTS, type Rechte } from '../../shared/src/rechte';
import { Fachfehler } from './fehler';
import type { Kante } from './repo';

export interface BaumQuelle {
  /** Mappentypen, die der Aufrufer überhaupt sehen darf (Zugriff.typen). */
  typen: Map<string, Mappentyp>;
  mappen(ids: string[]): Promise<Mappe[]>;
  kanten(ids: string[]): Promise<Kante[]>;
  lesbare(ids: string[]): Promise<Set<string>>;
  bezuege(ids: string[]): Promise<Map<string, MappenBezug>>;
  dokumente(ids: string[]): Promise<Map<string, number>>;
  rechte(ms: Mappe[]): Promise<Map<string, Rechte>>;
  jetzt?: Date;
}

/** Ids je Zugriff (Abfragen mit ANY(...)). */
const PAKET = 500;
async function inPaketen<T>(ids: string[], f: (teil: string[]) => Promise<T[]>): Promise<T[]> {
  const r: T[] = [];
  for (let i = 0; i < ids.length; i += PAKET) r.push(...await f(ids.slice(i, i + PAKET)));
  return r;
}
async function mapInPaketen<V>(ids: string[], f: (teil: string[]) => Promise<Map<string, V>>): Promise<Map<string, V>> {
  const r = new Map<string, V>();
  for (let i = 0; i < ids.length; i += PAKET) for (const [k, v] of await f(ids.slice(i, i + PAKET))) r.set(k, v);
  return r;
}
async function setInPaketen(ids: string[], f: (teil: string[]) => Promise<Set<string>>): Promise<Set<string>> {
  const r = new Set<string>();
  for (let i = 0; i < ids.length; i += PAKET) for (const k of await f(ids.slice(i, i + PAKET))) r.add(k);
  return r;
}

const kantenSchluessel = (k: Kante) => `${k.quelleId}|${k.feldKey}|${k.zielId}`;
const NICHT_SICHTBAR = 'nicht sichtbare Mappe';

/**
 * Sammelt den Baum ab `startId`. 404, wenn es die Start-Mappe nicht gibt oder der Aufrufer sie nicht
 * lesen darf.
 */
export async function sammleBaum(q: BaumQuelle, startId: string, opt: BaumOptionen): Promise<Baum> {
  const [start] = await q.mappen([startId]);
  if (!start || !q.typen.has(start.typId) || !(await q.lesbare([start.id])).has(start.id)) {
    throw new Fachfehler(404, 'Diese Mappe gibt es nicht oder du darfst sie nicht sehen.', { verborgen: true });
  }
  const ohne = new Set(opt.ohneTypen);
  const feldName = (typId: string | undefined, key: string) => (typId ? q.typen.get(typId)?.felder.find((f) => f.key === key)?.label : undefined) ?? key;

  /** `bezug`: nur über Bezug verbunden (mit nurZugehoerigkeit) – Blatt, wird nicht weiterverfolgt. */
  interface Eintrag { mappe: Mappe; ebene: number; ueber: BaumKante | null; auchUeber: BaumKante[]; richtung: BaumRichtung | null; reihe: number; bezug: boolean }
  const gesammelt = new Map<string, Eintrag>([[start.id, { mappe: start, ebene: 0, ueber: null, auchUeber: [], richtung: null, reihe: 0, bezug: false }]]);
  const reihenfolge: string[] = [start.id];
  const benutzt = new Set<string>();
  const verborgen = new Set<string>();
  const ausgeschlossen = new Set<string>();
  let kreise = 0;
  let abgeschnitten = false;
  let rand: Eintrag[] = [gesammelt.get(start.id)!];

  /** Nachbarn eines Rand-Knotens über die Kanten, in den erlaubten Richtungen. */
  const nachbarn = (e: Eintrag, kanten: Kante[]) => {
    if (e.bezug) return [];
    const erlaubt = e.richtung === null || opt.seitwaerts ? opt.richtungen : [e.richtung];
    const r: Array<{ id: string; kante: Kante; richtung: BaumRichtung }> = [];
    for (const k of kanten) {
      if (k.quelleId === k.zielId) continue;
      if (k.zielId === e.mappe.id && erlaubt.includes('verwiesenVon')) r.push({ id: k.quelleId, kante: k, richtung: 'verwiesenVon' });
      if (k.quelleId === e.mappe.id && erlaubt.includes('verweistAuf')) r.push({ id: k.zielId, kante: k, richtung: 'verweistAuf' });
    }
    return r;
  };
  const kanteVon = (e: Eintrag, n: { kante: Kante; richtung: BaumRichtung }, typVonQuelle: string | undefined): BaumKante =>
    ({ vonId: e.mappe.id, richtung: n.richtung, feldKey: n.kante.feldKey, feld: feldName(typVonQuelle, n.kante.feldKey), verweisart: verweisartVon(typVonQuelle ? q.typen.get(typVonQuelle) : undefined, n.kante.feldKey) });

  // Alle Kanten je Knoten merken – für die Verweise nach außen am Ende (die letzte Ebene wird nachgeladen).
  const kantenJe = new Map<string, Kante[]>();
  const ladeKanten = async (ids: string[]) => {
    const fehlt = ids.filter((id) => !kantenJe.has(id));
    for (const id of fehlt) kantenJe.set(id, []);
    for (const k of await inPaketen(fehlt, (t) => q.kanten(t))) {
      kantenJe.get(k.quelleId)?.push(k);
      if (k.zielId !== k.quelleId) kantenJe.get(k.zielId)?.push(k);
    }
  };

  for (let ebene = 1; ebene <= opt.tiefe && rand.length && !abgeschnitten && opt.richtungen.length; ebene++) {
    await ladeKanten(rand.map((e) => e.mappe.id));
    const kandidaten: Array<{ von: Eintrag; id: string; kante: Kante; richtung: BaumRichtung }> = [];
    for (const e of rand) for (const n of nachbarn(e, kantenJe.get(e.mappe.id) ?? [])) kandidaten.push({ von: e, ...n });
    const neueIds = [...new Set(kandidaten.map((k) => k.id).filter((id) => !gesammelt.has(id) && !verborgen.has(id) && !ausgeschlossen.has(id)))];
    const mappen = new Map((await inPaketen(neueIds, (t) => q.mappen(t))).map((m) => [m.id, m] as const));
    const lesbar = await setInPaketen([...mappen.keys()], (t) => q.lesbare(t));
    for (const id of neueIds) {
      const m = mappen.get(id);
      if (!m || !lesbar.has(id) || !q.typen.has(m.typId)) verborgen.add(id);
      else if (ohne.has(m.typId)) ausgeschlossen.add(id);
    }
    const neu: Eintrag[] = [];
    const hochgestuft = new Set<string>();
    const mitKante = kandidaten.map((k) => {
      const quelleTyp = (k.kante.quelleId === k.von.mappe.id ? k.von.mappe : gesammelt.get(k.id)?.mappe ?? mappen.get(k.id))?.typId;
      return { ...k, baumKante: kanteVon(k.von, k, quelleTyp) };
    });
    // Wege über Zugehörigkeit zuerst (stabil sortiert): Wer auch zugehört, wird nicht nur als Bezug-Blatt aufgenommen.
    if (opt.nurZugehoerigkeit) mitKante.sort((a, b) => Number(a.baumKante.verweisart !== 'zugehoerigkeit') - Number(b.baumKante.verweisart !== 'zugehoerigkeit'));
    for (const k of mitKante) {
      const s = kantenSchluessel(k.kante);
      if (benutzt.has(s)) continue;
      if (verborgen.has(k.id) || ausgeschlossen.has(k.id)) continue;
      benutzt.add(s);
      const kante = k.baumKante;
      const bezug = opt.nurZugehoerigkeit && kante.verweisart !== 'zugehoerigkeit';
      const da = gesammelt.get(k.id);
      if (da) {
        kreise++;
        // Bisher nur über Bezug dran, jetzt über Zugehörigkeit erreicht: dort einhängen und weiterverfolgen.
        const pos = reihenfolge.indexOf(da.mappe.id);
        if (da.bezug && !bezug && pos >= 0 && !hochgestuft.has(da.mappe.id)) {
          if (da.ueber) da.auchUeber.push(da.ueber);
          Object.assign(da, { ueber: kante, ebene, richtung: k.richtung, bezug: false });
          reihenfolge.splice(pos, 1);
          hochgestuft.add(da.mappe.id);
          neu.push(da);
        } else da.auchUeber.push(kante);
        continue;
      }
      if (gesammelt.size >= opt.max) { abgeschnitten = true; continue; }
      const m = mappen.get(k.id)!;
      const x: Eintrag = { mappe: m, ebene, ueber: kante, auchUeber: [], richtung: k.richtung, reihe: 0, bezug };
      gesammelt.set(m.id, x);
      neu.push(x);
    }
    // Innerhalb einer Ebene: nach Eltern (in deren Reihenfolge), dann Typ und Titel.
    const reihe = new Map(reihenfolge.map((id, i) => [id, i] as const));
    const typName = (m: Mappe) => q.typen.get(m.typId)?.name ?? '';
    neu.sort((a, b) => (reihe.get(a.ueber!.vonId)! - reihe.get(b.ueber!.vonId)!) || typName(a.mappe).localeCompare(typName(b.mappe), 'de') || (a.mappe.titel ?? '').localeCompare(b.mappe.titel ?? '', 'de'));
    for (const x of neu) { x.reihe = reihenfolge.length; reihenfolge.push(x.mappe.id); }
    rand = neu;
  }

  // Letzte Ebene: Kanten nachladen (für „tiefer möglich“ und die Verweise nach außen).
  const ids = [...reihenfolge];
  await ladeKanten(ids);
  let tieferMoeglich = false;
  for (const e of rand) for (const n of nachbarn(e, kantenJe.get(e.mappe.id) ?? [])) if (!gesammelt.has(n.id)) tieferMoeglich = true;
  // Unbekannte Nachbarn (außerhalb des Baums): Titel und Typ, Lesbarkeit.
  const aussenIds = new Set<string>();
  for (const id of ids) for (const k of kantenJe.get(id) ?? []) for (const x of [k.quelleId, k.zielId]) if (!gesammelt.has(x)) aussenIds.add(x);
  const bez = await mapInPaketen([...aussenIds], (t) => q.bezuege(t));
  const aussenLesbar = await setInPaketen([...aussenIds], (t) => q.lesbare(t));
  const [doks, rechte] = await Promise.all([
    mapInPaketen(ids, (t) => q.dokumente(t)),
    q.rechte(ids.map((id) => gesammelt.get(id)!.mappe)),
  ]);
  const jetzt = q.jetzt ?? new Date();

  const knoten: BaumKnoten[] = ids.map((id) => {
    const e = gesammelt.get(id)!;
    const typ = q.typen.get(e.mappe.typId);
    const aussen: BaumKnoten['aussen'] = { verweistAuf: [], verwiesenVon: [], anzahl: { verweistAuf: 0, verwiesenVon: 0 } };
    for (const k of kantenJe.get(id) ?? []) {
      const richtung: BaumRichtung | null = k.quelleId === id && !gesammelt.has(k.zielId) ? 'verweistAuf' : k.zielId === id && !gesammelt.has(k.quelleId) ? 'verwiesenVon' : null;
      if (!richtung) continue;
      const anderer = richtung === 'verweistAuf' ? k.zielId : k.quelleId;
      aussen.anzahl[richtung]++;
      if (aussen[richtung].length >= AUSSEN_MAX) continue;
      const b = bez.get(anderer);
      const sichtbar = !!b && aussenLesbar.has(anderer) && q.typen.has(b.typId);
      const quelleTyp = richtung === 'verweistAuf' ? e.mappe.typId : b?.typId;
      const v: AussenVerweis = sichtbar
        ? { mappeId: anderer, typId: b!.typId, titel: b!.titel, feldKey: k.feldKey, feld: feldName(quelleTyp, k.feldKey) }
        : { mappeId: null, typId: null, titel: NICHT_SICHTBAR, feldKey: k.feldKey, feld: sichtbar || richtung === 'verweistAuf' ? feldName(quelleTyp, k.feldKey) : '', verborgen: true };
      aussen[richtung].push(v);
    }
    const bis = aufbewahrenBis(typ?.archiv, e.mappe);
    return {
      id, typId: e.mappe.typId, typ: typ?.name ?? '', titel: e.mappe.titel ?? '', ebene: e.ebene, ueber: e.ueber, auchUeber: e.auchUeber, ...(e.bezug ? { nurBezug: true } : {}),
      dokumente: doks.get(id) ?? 0, aussen, aufbewahrenBis: bis, gesperrt: inFrist(bis, jetzt), rechte: rechte.get(id) ?? { ...NICHTS },
    };
  });
  return { startId: start.id, optionen: opt, knoten, abgeschnitten, kreise, verborgen: verborgen.size, tieferMoeglich };
}
