/**
 * Umbau (#1041) ausführen – in der Transaktion der Paketverwaltung (pakete.ts, legeMitUmbau), nach dem Anlegen bzw.
 * Ergänzen der Typen und Vorgaben. Je Schritt: beim Zusammenlegen den Zieltyp vorbereiten (eigene Felder, „Übernommen
 * aus“, Rechte-Regeln des alten Typs), Mappen umziehen (Werte, Notiz, Historie, Dokumente), Verweise umleiten, KI-Sperre
 * und „Paket verwehrt“ mitnehmen, den alten Typ abgeben bzw. entfernen.
 *
 * Ansichten (#1125): Was der Umbau an Ansichten anderer Pakete ändert, gilt nicht als Änderung des Administrators – ihr
 * Stand zieht mit (sichtstand.ts), so ersetzt das nächste Update jenes Pakets sie durch seine Fassung.
 */
import { randomUUID } from 'node:crypto';
import { teileKennung } from '../../../shared/src/kennungen';
import { istLeer, NOTIZ_MAX, verweiseVon, zieleVon, type Feld, type Mappe, type Mappentyp, type Register, type Wert } from '../../../shared/src/model';
import type { InstalliertesPaket } from '../../../shared/src/pakete';
import { regelwerkVon, type Regelwerk } from '../../../shared/src/rechte';
import { regelnMitnehmen, UMBAU_FELD, UMBAU_SCHREIBER } from '../../../shared/src/umbau';
import { istVorgabeWert } from '../../../shared/src/vorgaben';
import { Fachfehler } from '../fehler';
import { protokoll } from '../protokoll';
import { t } from '../sprache';
import { merkeSichtAenderung, sichtPruefwert, standNachUmbau, type SichtAenderungen } from './sichtstand';
import { archivDanach, benenneRegelnUm, paketVerwehrt, setzenWert, umbenennung, type GeplanterSchritt, type UmbauDienst, type UmbauLage } from './umbau';
import { aenderungen, neueWerte, titelKennung, type TitelSuche, type TypVon } from './umbau-werte';

const log = protokoll.modul('werkbank');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Daten für den übernommenen Typ (erster Durchgang der neuen Typen): die Definition aus dem Paket, dazu die Felder,
 * die als eigene Felder bleiben, und die Dokumentregister des alten Typs, die das Paket nicht kennt (dort liegen noch
 * Dokumente). Regeln, KI-Zulassung und Ansichten hängen an der Id und bleiben; der Archivmodus mit umbenanntem Stichtag.
 */
export function uebernahmeDaten<T extends { felder: Array<{ key: string }>; register: Array<{ key: string }> }>(g: GeplanterSchritt, daten: T): T & { archiv: Mappentyp['archiv'] } {
  const bleiben = g.felder.filter((x) => x.aktion.art === 'feld' && !daten.felder.some((y) => y.key === x.feld.key)).map((x) => x.feld);
  const dokRegister = g.alt.register.filter((r) => r.art === 'dokumente' && !daten.register.some((y) => y.key === r.key));
  return { ...daten, felder: [...daten.felder, ...bleiben], register: [...daten.register, ...dokRegister], archiv: archivDanach(g) };
}

export interface UmbauAuftrag {
  lage: UmbauLage;
  paket: { id: string; name: string; version: string };
  /** Zieltyp-Id je eigenem Schlüssel nach dem Anlegen bzw. Übernehmen. */
  typId: (schluessel: string) => string | undefined;
  /** Id der Mappe einer Vorgabe (`{ vorgabe: … }` in `setzen`). */
  vorgabeId: (verweis: string) => Promise<string | null>;
  von: { id: string | null; email: string | null };
}

export interface UmbauErgebnis {
  /** Alte Typ-Id → Ziel-Id und Feldumbenennung, für Automatisierungen nach der Transaktion. */
  umgeleitet: Array<{ alt: string; neu: string; felder: Record<string, string> }>;
  /** Eigene frühere Typen, die aus dem Eintrag dieses Pakets fallen. */
  eigeneWeg: string[];
  /** Einstellungen vor dem Umbau, zum Zurücknehmen (die Einstellungen laufen nicht in der Transaktion). */
  einstellungenVorher: { ki_typen: unknown; paket_verwehrt: unknown } | null;
  /** Ansichten, die der Umbau geändert hat (#1125): Prüfwert vorher und nachher – für den Stand des eigenen Pakets. */
  sichten: SichtAenderungen;
}

/** Zieltyp vorbereiten: eigene Felder, „Übernommen aus“ und Dokumentregister dazu, Regeln mitnehmen bzw. umbenennen. */
async function bereiteZielVor(d: UmbauDienst, g: GeplanterSchritt, ziel: Mappentyp, umbenannt: Map<string, string>): Promise<{ ziel: Mappentyp; mitnehmen: boolean }> {
  const repo = d.kern.repo;
  if (ziel.id === g.alt.id) {
    // Übernahme: Die Regeln fragen jetzt die neuen Kennungen ab.
    return { ziel: g.alt.berechtigungen ? await repo.setzeBerechtigungen(ziel.id, benenneRegelnUm(g.alt.berechtigungen, umbenannt)) : ziel, mitnehmen: false };
  }
  // Rechte (Entscheidung Thomas): Regeln des alten Typs vor die des Zieltyps, nur für Mappen „umbau_aus = alter Typ“.
  const rw: Regelwerk | null = regelnMitnehmen(benenneRegelnUm(regelwerkVon(g.alt), umbenannt), regelwerkVon(ziel), g.schritt.von, g.alt.name, randomUUID);
  const dazu = g.felder.filter((x) => x.aktion.art === 'feld' && !ziel.felder.some((f) => f.key === x.feld.key)).map((x) => x.feld);
  if (rw && !ziel.felder.some((f) => f.key === UMBAU_FELD)) dazu.push({ key: UMBAU_FELD, label: t('pakete.umbau.feld'), hilfe: t('pakete.umbau.feld-hilfe'), typ: 'text', berechnetVon: UMBAU_SCHREIBER });
  const docs: Register[] = ziel.register.some((r) => r.art === 'dokumente') ? [] : g.alt.register.filter((r) => r.art === 'dokumente');
  let neu = ziel;
  if (dazu.length || docs.length) {
    // Ins erste Feldregister, damit man sie sieht.
    const erstes = ziel.register.findIndex((r) => r.art === 'felder');
    const register = ziel.register.map((r, i) => (i === erstes ? { ...r, felder: [...(r.felder ?? []), ...dazu.map((f) => f.key)] } : r));
    neu = await repo.aendereTyp(ziel.id, { ...ziel, felder: [...ziel.felder, ...dazu], register: [...register, ...docs] });
  }
  return { ziel: rw ? await repo.setzeBerechtigungen(ziel.id, rw) : neu, mitnehmen: !!rw };
}

/** Feste Werte aus `setzen`; Vorgaben über ihre feste Kennung (#1038), Zeiträume als `{ anzahl, einheit }` (#1125). */
async function festeWerte(g: GeplanterSchritt, ziel: Mappentyp, vorgabeId: UmbauAuftrag['vorgabeId']): Promise<Map<string, Wert>> {
  const erg = new Map<string, Wert>();
  for (const [k, w] of Object.entries(g.schritt.setzen)) {
    if (!istVorgabeWert(w)) { const v = setzenWert(w, ziel.felder.find((f) => f.key === k)?.typ); if (v !== null) erg.set(k, v as Wert); continue; }
    const id = await vorgabeId(w.vorgabe);
    if (id) erg.set(k, ziel.felder.find((f) => f.key === k)?.mehrfach ? [id] : id);
  }
  return erg;
}

/**
 * Mappen nach Titel (#1125, Auswahl → Verweis): je Typ einmal gelesen, im Stand dieses Schritts (Mappen früherer
 * Schritte sind schon umgezogen, Vorgaben angelegt). `titel` merkt sich die Titel gefundener Mappen für die Historie.
 */
function titelSuche(d: UmbauDienst, typen: string[], titel: Map<string, string>): Promise<TitelSuche> {
  return (async () => {
    const index = new Map<string, Map<string, string[]>>();
    for (const id of typen) {
      const je = new Map<string, string[]>();
      for (const m of await d.listeMappen(id)) {
        if (!m.titel) continue;
        const k = titelKennung(m.titel);
        je.set(k, [...(je.get(k) ?? []), m.id]);
        titel.set(m.id, m.titel);
      }
      index.set(id, je);
    }
    return (ziele: string[], text: string) => [...new Set(ziele.flatMap((z) => index.get(z)?.get(titelKennung(text)) ?? []))];
  })();
}

/** Zieltypen der Verweisfelder, in die eine Auswahl oder ein Text zieht (#1125). */
const titelTypen = (g: GeplanterSchritt, ziel: Mappentyp): string[] => [...new Set(g.felder.flatMap((x) => {
  if (x.aktion.art !== 'nach' || !['auswahl', 'text'].includes(x.feld.typ)) return [];
  const key = x.aktion.ziel;
  const f = ziel.felder.find((y) => y.key === key);
  return f?.typ === 'referenz' ? zieleVon(f) : [];
}))];

/** Ids, auf die ein Wert verweisen kann. */
const verweisIds = (m: Mappe): string[] => Object.values(m.werte).flatMap((v) => (Array.isArray(v) ? v : [v])).filter((x): x is string => typeof x === 'string' && UUID.test(x));

/** Mappen eines Schritts umziehen: Typ, Werte, Notiz, Historie, Dokumente, Titel. */
async function zieheMappenUm(d: UmbauDienst, g: GeplanterSchritt, x: { ziel: Mappentyp; mitnehmen: boolean; a: UmbauAuftrag; typVon: TypVon }): Promise<number> {
  const { ziel, a } = x;
  const repo = d.kern.repo;
  const mappen = await d.listeMappen(g.alt.id);
  if (!mappen.length) return 0;
  const titel = await repo.titelVon(mappen.flatMap(verweisIds));
  const suche = await titelSuche(d, titelTypen(g, ziel), titel);
  const titelVon = (id: string) => titel.get(id) || t('meldungen.dienst.ohne-titel');
  const setzen = await festeWerte(g, ziel, a.vorgabeId);
  if (ziel.id !== g.alt.id) await repo.setzeMappenTyp(mappen.map((m) => m.id), ziel.id);
  const text = `${t('pakete.umbau.historie', { paket: a.paket.name, version: a.paket.version })}${ziel.id !== g.alt.id ? ` ${t('pakete.umbau.historie-aus', { typ: g.alt.name })}` : ''}`;
  const kopf = t('pakete.umbau.notiz', { paket: a.paket.name, version: a.paket.version, typ: g.alt.name });
  const schritt = { alt: g.alt, ziel, felder: g.felder };
  for (const m of mappen) {
    const { werte, notiz } = neueWerte(schritt, m.werte, titelVon, { typVon: x.typVon, titel: suche });
    for (const [k, w] of setzen) if (istLeer(werte[k])) werte[k] = w;
    if (x.mitnehmen) werte[UMBAU_FELD] = g.schritt.von;
    await repo.aendereMappe(m.id, werte, verweiseVon(ziel, werte), a.von.id);
    const voll = `${kopf}\n\n${notiz.join('\n')}`;
    if (notiz.length) await repo.legeNotizAn({ id: randomUUID(), mappeId: m.id, text: voll.slice(0, NOTIZ_MAX), erstellt: '', erstelltVon: a.von.id, geaendert: '', geaendertVon: a.von.id });
    await repo.historieSchreibe([{ mappeId: m.id, benutzerId: a.von.id, art: 'geaendert', daten: { aenderungen: aenderungen(schritt, m.werte, werte, titelVon), text, umbau: { paket: a.paket.id, version: a.paket.version, von: g.schritt.von, nach: g.schritt.nach } } }]);
  }
  await verschiebeDokumente(d, g, ziel, mappen);
  await d.aktualisiereTitel(mappen.map((m) => m.id));
  return mappen.length;
}

/** Dokumente: gleicher Registerschlüssel, sonst wie im Schritt angegeben, sonst das erste Dokumentregister des Ziels. */
async function verschiebeDokumente(d: UmbauDienst, g: GeplanterSchritt, ziel: Mappentyp, mappen: Mappe[]) {
  const dok = ziel.register.filter((r) => r.art === 'dokumente').map((r) => r.key);
  for (const doc of await d.kern.repo.dokumenteVon(mappen.map((m) => m.id))) {
    const nach = g.schritt.register[doc.registerKey] ?? (dok.includes(doc.registerKey) ? doc.registerKey : dok[0]);
    if (nach && nach !== doc.registerKey) await d.kern.repo.verschiebeDokument(doc.id, doc.mappeId, nach);
  }
}

/** Ein Feld, das auf den alten Typ zeigt, zeigt danach auf den Zieltyp (Verweisziele, Tabellen); null = unverändert. */
function feldUmgeleitet(f: Feld, altId: string, neuId: string, feld: (k: string) => string): Feld | null {
  if (f.typ === 'referenz' && altId !== neuId && zieleVon(f).includes(altId)) return { ...f, zielTypen: [...new Set(zieleVon(f).map((z) => (z === altId ? neuId : z)))] };
  if (f.typ === 'tabelle' && f.quelle?.typId === altId) return { ...f, quelle: { ...f.quelle, typId: neuId, feldKey: feld(f.quelle.feldKey) } };
  return null;
}

/**
 * Verweise umleiten: Verweisfelder, Tabellen und Verknüpfungsregister aller Typen zeigen auf den Zieltyp (mit den neuen
 * Feldkennungen), Ansichten über den alten Typ auf den Zieltyp. Bei der Übernahme (gleiche Id) nur die Feldkennungen.
 * Geänderte Ansichten landen in `sichten` (#1125); Bedingungen auf Felder ohne Ziel bleiben stehen (die Vorschau sagt
 * es, das Protokoll auch) – eine Ansicht zeigt so eher weniger als mehr.
 */
async function leiteUm(d: UmbauDienst, g: GeplanterSchritt, neuId: string, umbenannt: Map<string, string>, sichten: SichtAenderungen) {
  const altId = g.alt.id;
  const repo = d.kern.repo;
  const feld = (k: string) => umbenannt.get(k) ?? k;
  for (const typ of (await d.listeTypen()).filter((x) => x.id !== altId)) {
    const felder = typ.felder.map((f) => feldUmgeleitet(f, altId, neuId, feld) ?? f);
    const register = typ.register.map((r) => (r.quellen?.some((q) => q.typId === altId) ? { ...r, quellen: r.quellen.map((q) => (q.typId === altId ? { typId: neuId, feldKey: feld(q.feldKey) } : q)) } : r));
    if (JSON.stringify([felder, register]) !== JSON.stringify([typ.felder, typ.register])) await repo.aendereTyp(typ.id, { ...typ, felder, register });
  }
  for (const s of (await d.listeSichten()).filter((x) => x.typen.includes(altId))) {
    const bedingungen = s.bedingungen.map((b) => (b.art === 'feld' && umbenannt.has(b.feld) ? { ...b, feld: feld(b.feld) } : b.art === 'frist' && b.feld && umbenannt.has(b.feld) ? { ...b, feld: feld(b.feld) } : b));
    const neu = await repo.aendereSicht(s.id, { ...s, typen: [...new Set(s.typen.map((x) => (x === altId ? neuId : x)))], bedingungen });
    merkeSichtAenderung(sichten, s.id, sichtPruefwert(s), sichtPruefwert(neu));
  }
  for (const a of g.plan.ansichten.filter((x) => x.felder.length)) log.info('Paket-Umbau: Ansicht fragt Felder ab, die es nicht mehr gibt', { ansicht: a.name, felder: a.felder, schritt: `${g.schritt.von} → ${g.schritt.nach}` });
}

/** KI-Sperre und „Paket verwehrt“ des alten Typs gelten danach auch für den Zieltyp (nie breiter, #796). */
async function schraenkeEin(d: UmbauDienst, g: GeplanterSchritt, zielId: string) {
  const e = d.kern.einstellungen;
  if (!e) return;
  if (g.plan.rechte.ki) {
    const v = await e.lies('ki_typen') as { zugelassen?: string[]; hinweis?: boolean } | null;
    if (v?.zugelassen?.includes(zielId)) await e.schreibe('ki_typen', { ...v, zugelassen: v.zugelassen.filter((x) => x !== zielId) });
  }
  const verwehrt = await paketVerwehrt(d);
  const dazu = (verwehrt[g.alt.id] ?? []).filter((x) => !(verwehrt[zielId] ?? []).includes(x));
  if (dazu.length) await e.schreibe('paket_verwehrt', { ...verwehrt, [zielId]: [...(verwehrt[zielId] ?? []), ...dazu] });
}

/** Der alte Typ gehört seinem Paket nicht mehr; beim Zusammenlegen verschwindet er (mit Mappen im Papierkorb: bleibt als eigener). */
async function gibAb(d: UmbauDienst, g: GeplanterSchritt, a: UmbauAuftrag, quellen: InstalliertesPaket[]): Promise<string | null> {
  const vk = teileKennung(g.schritt.von);
  const eigen = vk.paket === a.paket.id;
  if (!eigen) {
    const q = quellen.find((x) => x.id === g.quelle.id) ?? structuredClone(g.quelle);
    delete q.typen[vk.schluessel];
    if (q.typStand) delete q.typStand[g.alt.id];
    if (!quellen.includes(q)) quellen.push(q);
  }
  if (g.plan.art === 'zusammenlegen') {
    if ((await d.kern.repo.papierkorb({ typId: g.alt.id })).length) await d.kern.repo.setzeTypKennung(g.alt.id, vk.schluessel);
    else await d.loescheTyp(g.alt.id);
  }
  return eigen ? vk.schluessel : null;
}

/**
 * Den Umbau ausführen. Je Schritt Zieltyp vorbereiten, Mappen umziehen, Verweise umleiten, Rechte mitnehmen, alten Typ
 * abgeben; zuletzt die Einträge der abgebenden Pakete speichern. Ein Fehler bricht ab – die Transaktion nimmt alles zurück.
 */
export async function fuehreUmbauAus(d: UmbauDienst, a: UmbauAuftrag): Promise<UmbauErgebnis> {
  const e = d.kern.einstellungen;
  const erg: UmbauErgebnis = { umgeleitet: [], eigeneWeg: [], einstellungenVorher: e ? { ki_typen: await e.lies('ki_typen'), paket_verwehrt: await e.lies('paket_verwehrt') } : null, sichten: new Map() };
  // Typ jeder Mappe, auf die ein umziehender Wert verweist – nach dem Umbau (Mappen umgebauter Typen im Zieltyp).
  const zielId = (g: GeplanterSchritt) => g.ziel?.id ?? (g.eigenerZiel ? a.typId(g.eigenerZiel) : undefined) ?? g.alt.id;
  const nachUmbau = new Map(a.lage.schritte.map((g) => [g.alt.id, zielId(g)] as const));
  const verwiesen = await d.kern.repo.typenVon((await Promise.all(a.lage.schritte.map((g) => d.listeMappen(g.alt.id)))).flat().flatMap(verweisIds));
  const typVon: TypVon = (id) => { const ty = verwiesen.get(id); return ty ? nachUmbau.get(ty) ?? ty : undefined; };
  const quellen: InstalliertesPaket[] = [];
  for (const g of a.lage.schritte) {
    const roh = (await d.listeTypen()).find((x) => x.id === zielId(g));
    if (!roh) throw new Fachfehler(422, t('meldungen.pakete.umbau.ziel-nicht-da', { name: g.alt.name, nach: g.schritt.nach }));
    const umbenannt = umbenennung(g.felder);
    const { ziel, mitnehmen } = await bereiteZielVor(d, g, roh, umbenannt);
    const anzahl = await zieheMappenUm(d, g, { ziel, mitnehmen, a, typVon });
    await leiteUm(d, g, ziel.id, umbenannt, erg.sichten);
    if (ziel.id !== g.alt.id) await schraenkeEin(d, g, ziel.id);
    const weg = await gibAb(d, g, a, quellen);
    if (weg) erg.eigeneWeg.push(weg);
    erg.umgeleitet.push({ alt: g.alt.id, neu: ziel.id, felder: Object.fromEntries([...umbenannt].filter(([x, y]) => x !== y)) });
    log.info('Paket-Umbau', { paket: a.paket.id, version: a.paket.version, von: a.von.email, schritt: `${g.schritt.von} → ${g.schritt.nach}`, art: g.plan.art, mappen: anzahl, regelnMit: mitnehmen, kiGesperrt: g.plan.rechte.ki, verwehrt: g.plan.rechte.verwehrt });
  }
  // Ansichten anderer Pakete (#1125): Der Stand zieht mit, was nur der Umbau geändert hat, gilt als unverändert.
  for (const p of await d.kern.repo.listePakete()) {
    if (p.id === a.paket.id) continue;
    const q = quellen.find((x) => x.id === p.id) ?? structuredClone(p);
    if (standNachUmbau(q, erg.sichten) && !quellen.includes(q)) quellen.push(q);
  }
  for (const q of quellen) await d.kern.repo.speicherePaket(q);
  return erg;
}

/** Einstellungen nach einem Abbruch zurück (sie liegen außerhalb der Transaktion). */
export async function nimmEinstellungenZurueck(d: Pick<UmbauDienst, 'kern'>, vorher: UmbauErgebnis['einstellungenVorher']) {
  const e = d.kern.einstellungen;
  if (!e || !vorher) return;
  await e.schreibe('ki_typen', vorher.ki_typen ?? null);
  await e.schreibe('paket_verwehrt', vorher.paket_verwehrt ?? null);
}
