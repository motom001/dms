import { createHash, randomUUID } from 'node:crypto';
import {
  ersterGrund, FELDTYPEN, istLeer, istSystemspalte, sortierbar, istOk, leseZahl, MAX_DATEIGROESSE, pruefeMappe, pruefeMappentyp, REGISTERARTEN, schluesselAus,
  standardRegister, titelAus, verweiseVon,
  type Feld, type Mappe, type Mappentyp, type MappentypDaten, type Register, type Werte,
} from '../../shared/src/model';
import type { Dateispeicher } from './dateispeicher';
import { Auftraege } from './auftrag';
import { protokoll } from './protokoll';
import { Fachfehler } from './fehler';
import { istUuid, type NeueMappe, type Repo, type SortierungIntern } from './repo';

/* ---------- Eingaben bereinigen: nur bekannte Eigenschaften übernehmen ---------- */

const text = (v: unknown) => (v == null ? '' : String(v)).trim();
function zahlOderNull(v: unknown): number | null {
  const n = leseZahl(v);
  return n == null || Number.isNaN(n) ? null : n;
}

export function bereinigeFeld(e: unknown): Feld {
  const f = (e ?? {}) as Record<string, unknown>;
  const typ = (text(f.typ) in FELDTYPEN ? text(f.typ) : 'text') as Feld['typ'];
  const std = f.standard;
  return {
    key: text(f.key),
    label: text(f.label),
    typ,
    pflicht: !!f.pflicht,
    eindeutig: !!f.eindeutig && (typ === 'text' || typ === 'zahl'),
    hilfe: text(f.hilfe),
    standard: std == null || std === '' ? null : typeof std === 'boolean' ? std : String(std),
    minLen: zahlOderNull(f.minLen),
    maxLen: zahlOderNull(f.maxLen),
    muster: text(f.muster),
    min: zahlOderNull(f.min),
    max: zahlOderNull(f.max),
    nachkomma: zahlOderNull(f.nachkomma),
    waehrung: typ === 'betrag' ? (text(f.waehrung) || 'EUR').toUpperCase().slice(0, 3) : undefined,
    optionen: Array.isArray(f.optionen) ? f.optionen.map(text).filter(Boolean) : [],
    mehrfach: !!f.mehrfach && (typ === 'auswahl' || typ === 'referenz'),
    zielTyp: typ === 'referenz' ? text(f.zielTyp) : '',
    verweisart: f.verweisart === 'zugehoerigkeit' ? 'zugehoerigkeit' : 'bezug',
  };
}

export function bereinigeRegister(e: unknown, felder: Feld[]): Register[] {
  if (!Array.isArray(e) || !e.length) return standardRegister(felder);
  const bekannt = new Set(felder.map((f) => f.key));
  const reg = e.map((x: Record<string, unknown>): Register => {
    const art = (String(x?.art) in REGISTERARTEN ? x.art : 'felder') as Register['art'];
    const r: Register = { key: text(x?.key) || schluesselAus(text(x?.name)), name: text(x?.name), art };
    if (art === 'felder') r.felder = (Array.isArray(x?.felder) ? x.felder.map(text) : []).filter((k) => bekannt.has(k));
    if (art === 'verknuepfungen') {
      r.quellen = (Array.isArray(x?.quellen) ? x.quellen : [])
        .map((q: Record<string, unknown>) => ({ typId: text(q?.typId), feldKey: text(q?.feldKey) }))
        .filter((q) => q.typId && q.feldKey);
    }
    return r;
  });
  // Felder ohne Register landen auf dem ersten Feldregister.
  const erstes = reg.find((r) => r.art === 'felder');
  if (erstes) {
    const vergeben = new Set(reg.flatMap((r) => r.felder ?? []));
    for (const f of felder) if (!vergeben.has(f.key)) erstes.felder!.push(f.key);
  }
  return reg;
}

export function bereinigeTyp(e: unknown): MappentypDaten {
  const t = (e ?? {}) as Record<string, unknown>;
  const felder = Array.isArray(t.felder) ? t.felder.map(bereinigeFeld) : [];
  return {
    name: text(t.name),
    beschreibung: text(t.beschreibung),
    // Altes Format: titelFeld → Vorlage {feld}
    titelVorlage: text(t.titelVorlage) || (text(t.titelFeld) ? `{${text(t.titelFeld)}}` : ''),
    felder,
    register: bereinigeRegister(t.register, felder),
    // Nur bekannte Spalten, jede einmal; Spalten entfernter Felder fallen still weg.
    trefferliste: [...new Set((Array.isArray(t.trefferliste) ? t.trefferliste : []).map(text))]
      .filter((k) => (istSystemspalte(k) && k !== '_typ') || felder.some((f) => f.key === k)),
  };
}

const SYSTEMSORTIERUNG: Record<string, SortierungIntern['art']> = {
  _titel: 'titel', _typ: 'typ', _erstellt: 'erstellt', _geaendert: 'geaendert', _erstelltVon: 'erstelltVon', _geaendertVon: 'geaendertVon',
};
/** Sortierung aus Spalte und Richtung; unbekannte oder nicht sortierbare Spalten → nach Titel. */
export function sortierungAus(spalte: string, absteigend: boolean, typ?: Mappentyp): SortierungIntern | undefined {
  if (!spalte) return undefined;
  if (SYSTEMSORTIERUNG[spalte]) return { art: SYSTEMSORTIERUNG[spalte], absteigend };
  const f = typ?.felder.find((x) => x.key === spalte);
  if (!f || !sortierbar(spalte, typ)) return undefined;
  const art = f.typ === 'zahl' || f.typ === 'betrag' || f.typ === 'datum' || f.typ === 'janein' ? f.typ : 'text';
  return { art, key: f.key, absteigend };
}

/** Dateiname ohne Pfadanteile und Steuerzeichen. */
function dateiname(v: unknown): string {
  // eslint-disable-next-line no-control-regex
  const s = text(v).split(/[\\/]/).pop()!.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (s || 'Dokument').slice(0, 200);
}

/** Nur PDF und gängige Bilder werden im Browser angezeigt – erkannt am Inhalt, nicht am Namen. */
export function erkenneAnzeigbar(b: Buffer): string | null {
  const kopf = b.subarray(0, 12).toString('latin1');
  if (kopf.startsWith('%PDF-')) return 'application/pdf';
  if (b[0] === 0x89 && kopf.slice(1, 4) === 'PNG') return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (kopf.startsWith('GIF87a') || kopf.startsWith('GIF89a')) return 'image/gif';
  if (kopf.startsWith('RIFF') && kopf.slice(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** Nur Werte zu bekannten Feldern; leere Eingaben werden zu null. */
function bereinigeWerte(typ: Mappentyp, eingabe: unknown, bisher: Werte = {}): Werte {
  const roh = (eingabe && typeof eingabe === 'object' ? eingabe : {}) as Record<string, unknown>;
  const bekannt = new Set(typ.felder.map((f) => f.key));
  const werte: Werte = {};
  // Werte aus entfernten Feldern bleiben erhalten.
  for (const [k, v] of Object.entries(bisher)) if (!bekannt.has(k)) werte[k] = v;
  for (const f of typ.felder) {
    const v = f.key in roh ? roh[f.key] : bisher[f.key];
    werte[f.key] = istLeer(v) ? (f.typ === 'janein' ? false : null) : (v as Werte[string]);
  }
  return werte;
}

/* ---------- Fachlogik ---------- */

export class Dienst {
  /** Hintergrundaufträge, z. B. Demo-Daten erzeugen. */
  readonly auftraege = new Auftraege((m) => protokoll.modul('werkbank').info(m));

  constructor(private repo: Repo, private dateien: Dateispeicher) {}

  listeTypen() { return this.repo.listeTypen(); }

  private async pruefeTyp(d: MappentypDaten, eigeneId: string) {
    const alle = await this.repo.listeTypen();
    // Quellen von Verknüpfungsregistern, deren Feld es nicht mehr gibt, still entfernen.
    for (const r of d.register) {
      if (r.art !== 'verknuepfungen') continue;
      r.quellen = (r.quellen ?? []).filter((q) => {
        const felder = q.typId === eigeneId ? d.felder : alle.find((t) => t.id === q.typId)?.felder;
        const f = felder?.find((x) => x.key === q.feldKey);
        return f?.typ === 'referenz' && f.zielTyp === eigeneId;
      });
    }
    const p = pruefeMappentyp(d, {
      eigeneId,
      namenAndererTypen: alle.filter((t) => t.id !== eigeneId).map((t) => t.name),
      existiertTyp: (id) => alle.some((t) => t.id === id),
      felderVon: (id) => alle.find((t) => t.id === id)?.felder,
    });
    if (!istOk(p)) throw new Fachfehler(422, 'Der Mappentyp ist so nicht gültig.', p);
  }

  async legeTypAn(eingabe: unknown): Promise<Mappentyp> {
    const roh = (eingabe ?? {}) as { id?: unknown };
    // Die Oberfläche darf die Id vorgeben, damit ein neuer Typ auf sich selbst verweisen kann.
    const id = istUuid(roh.id) && !(await this.repo.holeTyp(roh.id)) ? roh.id : randomUUID();
    const d = bereinigeTyp(eingabe);
    await this.pruefeTyp(d, id);
    return this.repo.legeTypAn(id, d);
  }

  async aendereTyp(id: string, eingabe: unknown): Promise<Mappentyp> {
    const alt = await this.repo.holeTyp(id);
    if (!alt) throw new Fachfehler(404, 'Diesen Mappentyp gibt es nicht.');
    const d = bereinigeTyp(eingabe);
    await this.pruefeTyp(d, id);
    const bleiben = new Set(d.register.filter((r) => r.art === 'dokumente').map((r) => r.key));
    for (const [key, n] of await this.repo.dokumenteJeRegister(id)) {
      if (bleiben.has(key)) continue;
      const name = alt.register.find((r) => r.key === key)?.name ?? key;
      throw new Fachfehler(409, `Im Register „${name}“ liegen noch ${n} Dokument${n === 1 ? '' : 'e'}. Entferne oder verschiebe sie zuerst.`);
    }
    const typ = await this.repo.aendereTyp(id, d);
    // Vorlage oder Felder können sich geändert haben: Titel aller Mappen dieses Typs neu berechnen.
    await this.aktualisiereTitel((await this.repo.listeMappen(id)).map((m) => m.id));
    await this.pruefePassung(id);
    return typ;
  }

  async loescheTyp(id: string): Promise<void> {
    if (!(await this.repo.holeTyp(id))) throw new Fachfehler(404, 'Diesen Mappentyp gibt es nicht.');
    const gruende: string[] = [];
    const n = await this.repo.zaehleMappen(id);
    if (n) gruende.push(`${n} ${n === 1 ? 'Mappe gehört' : 'Mappen gehören'} zu diesem Typ.`);
    for (const t of await this.repo.listeTypen()) {
      if (t.id === id) continue;
      for (const f of t.felder) if (f.typ === 'referenz' && f.zielTyp === id) gruende.push(`Das Feld ${t.name} › ${f.label} verweist auf diesen Typ.`);
    }
    if (gruende.length) throw new Fachfehler(409, 'Dieser Mappentyp kann noch nicht gelöscht werden.', { gruende });
    await this.repo.loescheTyp(id);
  }

  listeMappen(typId?: string) { return this.repo.listeMappen(typId); }

  async holeMappe(id: string) {
    const mappe = await this.repo.holeMappe(id);
    if (!mappe) throw new Fachfehler(404, 'Diese Mappe gibt es nicht.');
    const typ = await this.repo.holeTyp(mappe.typId);
    const ziele = typ ? verweiseVon(typ, mappe.werte).map((v) => v.zielId) : [];
    return {
      mappe,
      rueckverweise: await this.repo.rueckverweise(id),
      dokumente: await this.repo.listeDokumente(id),
      /** Titel und Typ der Mappen, auf die diese verweist. */
      bezuege: Object.fromEntries(await this.repo.bezuege(ziele)),
    };
  }

  /* ---------- Sichten: seitenweise und gezählt ---------- */

  /** Eine Seite einer Sicht („eingang“ oder Typ-Id), nach Titel sortiert, mit den Bezügen für die Anzeige. */
  async seite(ich: { id: string; rolle: string }, q: { sicht?: string; von?: unknown; anzahl?: unknown; suche?: unknown; sortierung?: unknown; absteigend?: unknown }) {
    const von = Math.max(0, Math.floor(Number(q.von) || 0));
    const anzahl = Math.min(500, Math.max(1, Math.floor(Number(q.anzahl) || 100)));
    const suche = text(q.suche).slice(0, 200) || undefined;
    const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t] as const));
    const sortierung = sortierungAus(text(q.sortierung), q.absteigend === 'true' || q.absteigend === true, q.sicht === 'eingang' ? undefined : typen.get(String(q.sicht)));
    const r = q.sicht === 'eingang'
      ? await this.repo.seite({ eingang: { benutzerId: ich.id, admin: ich.rolle === 'admin' }, suche, von, anzahl, sortierung })
      : await this.repo.seite({ typId: q.sicht, suche, von, anzahl, sortierung });
    const ziele = r.mappen.flatMap((m) => { const t = typen.get(m.typId); return t ? verweiseVon(t, m.werte).map((v) => v.zielId) : []; });
    return { gesamt: r.gesamt, von, mappen: r.mappen, bezuege: Object.fromEntries(await this.repo.bezuege(ziele)) };
  }

  /** Anzahl Mappen je Typ (davon unpassend, Demo) und im Eingang des Benutzers. */
  async zaehler(ich: { id: string; rolle: string }) {
    const z = await this.repo.zaehler(ich.id, ich.rolle === 'admin');
    return { typen: Object.fromEntries(z.typen), eingang: z.eingang };
  }

  async belegung(typId: string) {
    if (!(await this.repo.holeTyp(typId))) throw new Fachfehler(404, 'Diesen Mappentyp gibt es nicht.');
    return this.repo.belegung(typId);
  }

  /* ---------- Passung: passt eine Mappe zur aktuellen Definition? ---------- */

  /** Prüft alle Mappen eines Typs (nach einer Änderung des Typs) und speichert das Ergebnis. */
  async pruefePassung(typId: string): Promise<number> {
    const typ = await this.repo.holeTyp(typId);
    if (!typ) return 0;
    const mappen = await this.repo.listeMappen(typId);
    const typVon = await this.repo.typenVon(mappen.flatMap((m) => verweiseVon(typ, m.werte).map((v) => v.zielId)).filter(istUuid));
    // Eindeutige Felder: gleiche Werte im Arbeitsspeicher suchen statt je Mappe in der Datenbank.
    const gleiche = new Map<string, Map<string, Mappe[]>>();
    for (const f of typ.felder) {
      if (!f.eindeutig || (f.typ !== 'text' && f.typ !== 'zahl')) continue;
      const nachWert = new Map<string, Mappe[]>();
      for (const m of mappen) {
        if (istLeer(m.werte[f.key])) continue;
        const w = String(m.werte[f.key]).trim().toLowerCase();
        nachWert.set(w, [...(nachWert.get(w) ?? []), m]);
      }
      gleiche.set(f.key, nachWert);
    }
    const ergebnis = mappen.map((m) => {
      const p = pruefeMappe(typ, m.werte, {
        typVon: (id) => typVon.get(id),
        doppelt: (k, v) => {
          const andere = gleiche.get(k)?.get(String(v).trim().toLowerCase())?.find((x) => x.id !== m.id);
          return andere ? andere.titel || 'Ohne Titel' : undefined;
        },
      });
      return { id: m.id, problem: ersterGrund(typ, p), alt: m.problem ?? null, passtAlt: m.passt };
    });
    await this.repo.setzePassung(ergebnis.filter((e) => e.problem !== e.alt || e.passtAlt === undefined).map(({ id, problem }) => ({ id, problem })));
    return ergebnis.filter((e) => e.problem).length;
  }

  /**
   * Nach dem Speichern einer Mappe: Andere Mappen desselben Typs, die bisher nicht passten,
   * können jetzt passen (z. B. weil ein doppelter Wert geändert wurde). Das sind meist wenige.
   */
  private async pruefeUnpassende(typ: Mappentyp) {
    const ids = await this.repo.unpassende(typ.id);
    if (!ids.length) return;
    const liste: Array<{ id: string; problem: string | null }> = [];
    for (const m of await this.repo.holeMappen(ids)) {
      const typen = await this.repo.typenVon(verweiseVon(typ, m.werte).map((v) => v.zielId).filter(istUuid));
      const doppelt = new Map<string, string>();
      for (const f of typ.felder) {
        if (!f.eindeutig || istLeer(m.werte[f.key]) || (f.typ !== 'text' && f.typ !== 'zahl')) continue;
        const d = await this.repo.findeDoppelt(typ.id, f.key, String(m.werte[f.key]), m.id);
        if (d) doppelt.set(f.key, d.titel || 'Ohne Titel');
      }
      const problem = ersterGrund(typ, pruefeMappe(typ, m.werte, { typVon: (id) => typen.get(id), doppelt: (k) => doppelt.get(k) }));
      if (problem !== m.problem) liste.push({ id: m.id, problem });
    }
    await this.repo.setzePassung(liste);
  }

  /** Beim Start: Passung für Typen nachholen, deren Mappen noch nie geprüft wurden. */
  async passungNachziehen(): Promise<number> {
    const typen = await this.repo.typenOhnePassung();
    for (const t of typen) await this.pruefePassung(t);
    return typen.length;
  }

  private async titel(m: Mappe): Promise<string> {
    return m.titel || titelAus(await this.repo.holeTyp(m.typId), m.werte, undefined, m) || 'Ohne Titel';
  }

  /* ---------- Titel ---------- */

  /**
   * Berechnet die gespeicherten Titel der angegebenen Mappen neu. Ändert sich ein Titel,
   * werden die Mappen nachgezogen, die auf sie verweisen (deren Titel kann ihn enthalten).
   * Bei Verweisen im Kreis endet das nach einigen Runden.
   */
  async aktualisiereTitel(ids: string[]): Promise<Map<string, string>> {
    const neu = new Map<string, string>();
    if (!ids.length) return neu;
    const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t] as const));
    let offen = [...new Set(ids)];
    for (let runde = 0; offen.length && runde < 6; runde++) {
      const geaendert: Array<{ id: string; titel: string }> = [];
      for (let i = 0; i < offen.length; i += 2000) {
        const mappen = await this.repo.holeMappen(offen.slice(i, i + 2000));
        const ziele = mappen.flatMap((m) => { const t = typen.get(m.typId); return t ? verweiseVon(t, m.werte).map((v) => v.zielId) : []; });
        const gespeichert = await this.repo.titelVon(ziele.filter((z) => !neu.has(z)));
        const titelVon = (z: string) => neu.get(z) || gespeichert.get(z) || 'Ohne Titel';
        for (const m of mappen) {
          const t = titelAus(typen.get(m.typId), m.werte, titelVon, m);
          neu.set(m.id, t);
          if (t !== m.titel) geaendert.push({ id: m.id, titel: t });
        }
      }
      await this.repo.setzeTitel(geaendert);
      offen = geaendert.length ? await this.repo.quellenVon(geaendert.map((g) => g.id)) : [];
    }
    return neu;
  }

  /** Beim Start: Titel berechnen, die noch fehlen (z. B. nach dem Update auf eine Version mit gespeicherten Titeln). */
  async titelNachziehen(): Promise<number> {
    const ids = await this.repo.ohneTitel();
    await this.aktualisiereTitel(ids);
    return ids.length;
  }

  private async pruefeWerte(typ: Mappentyp, werte: Werte, eigeneId?: string) {
    const ids = [...new Set(verweiseVon(typ, werte).map((v) => v.zielId))].filter(istUuid);
    const typen = await this.repo.typenVon(ids);
    const doppelt = new Map<string, string>();
    for (const f of typ.felder) {
      if (!f.eindeutig || istLeer(werte[f.key]) || (f.typ !== 'text' && f.typ !== 'zahl')) continue;
      const d = await this.repo.findeDoppelt(typ.id, f.key, String(werte[f.key]), eigeneId);
      if (d) doppelt.set(f.key, await this.titel(d));
    }
    const p = pruefeMappe(typ, werte, { typVon: (id) => typen.get(id), doppelt: (k) => doppelt.get(k) });
    if (!istOk(p)) throw new Fachfehler(422, 'Bitte die markierten Felder prüfen.', p);
  }

  async legeMappeAn(eingabe: unknown, benutzerId: string | null = null, demo = false): Promise<Mappe> {
    const e = (eingabe ?? {}) as { id?: unknown; typId?: unknown; werte?: unknown };
    const typ = istUuid(e.typId) ? await this.repo.holeTyp(e.typId) : undefined;
    if (!typ) throw new Fachfehler(422, 'Unbekannter Mappentyp.');
    const werte = bereinigeWerte(typ, e.werte);
    await this.pruefeWerte(typ, werte);
    const id = istUuid(e.id) && !(await this.repo.holeMappe(e.id)) ? e.id : randomUUID();
    const m = await this.repo.legeMappeAn(id, typ.id, werte, verweiseVon(typ, werte), benutzerId, demo);
    const titel = (await this.aktualisiereTitel([m.id])).get(m.id);
    if (typ.felder.some((f) => f.eindeutig)) await this.pruefeUnpassende(typ);
    return { ...m, titel };
  }

  async aendereMappe(id: string, eingabe: unknown, benutzerId: string | null = null): Promise<Mappe> {
    const m = await this.repo.holeMappe(id);
    if (!m) throw new Fachfehler(404, 'Diese Mappe gibt es nicht.');
    const typ = await this.repo.holeTyp(m.typId);
    if (!typ) throw new Fachfehler(500, 'Der Mappentyp dieser Mappe fehlt.');
    const werte = bereinigeWerte(typ, (eingabe as { werte?: unknown })?.werte, m.werte);
    await this.pruefeWerte(typ, werte, id);
    const neu = await this.repo.aendereMappe(id, werte, verweiseVon(typ, werte), benutzerId);
    const titel = (await this.aktualisiereTitel([id])).get(id);
    if (typ.felder.some((f) => f.eindeutig)) await this.pruefeUnpassende(typ);
    return { ...neu, titel };
  }

  /** Viele neue Mappen auf einmal (Demo-Daten); Werte sind bereits geprüft. */
  legeMappenAn(liste: NeueMappe[]) { return this.repo.legeMappenAn(liste); }

  async loescheMappe(id: string): Promise<void> {
    if (!(await this.repo.holeMappe(id))) throw new Fachfehler(404, 'Diese Mappe gibt es nicht.');
    const fremd = (await this.repo.rueckverweise(id)).filter((r) => r.quelleId !== id);
    if (fremd.length) {
      throw new Fachfehler(409, `Auf diese Mappe ${fremd.length === 1 ? 'verweist noch eine andere Mappe' : `verweisen noch ${fremd.length} andere Mappen`}. Entferne erst diese Verweise.`, { rueckverweise: fremd });
    }
    const dokumente = await this.repo.listeDokumente(id);
    const typ = await this.repo.holeTyp((await this.repo.holeMappe(id))!.typId);
    await this.repo.loescheMappe(id);
    if (typ?.felder.some((f) => f.eindeutig)) await this.pruefeUnpassende(typ);
    for (const sha of new Set(dokumente.map((d) => d.sha256))) await this.raeumeAuf(sha);
  }

  /* ---------- Demo-Daten ---------- */

  async demoUebersicht() {
    const demo = await this.repo.zaehleDemo();
    const z = (await this.repo.zaehler('', false)).typen;
    return (await this.repo.listeTypen()).map((t) => ({
      typId: t.id, name: t.name, demo: demo.get(t.id) ?? 0, gesamt: z.get(t.id)?.anzahl ?? 0,
    }));
  }

  async entferneDemo() {
    const echte = await this.repo.echteVerweiseAufDemo();
    if (echte) throw new Fachfehler(409, `${echte} echte ${echte === 1 ? 'Mappe verweist' : 'Mappen verweisen'} auf Demo-Mappen. Entferne zuerst diese Verweise.`);
    const { anzahl, dateien } = await this.repo.loescheDemo();
    for (const sha of dateien) await this.raeumeAuf(sha);
    return { entfernt: anzahl };
  }

  /* ---------- Dokumente ---------- */

  /** Löscht die Datei, wenn kein Dokument mehr auf sie zeigt. */
  private async raeumeAuf(sha256: string) {
    if (!(await this.repo.dokumenteMitSha(sha256)).length) await this.dateien.loesche(sha256);
  }

  async ladeHoch(mappeId: string, e: { register?: string; name?: string; typ?: string }, inhalt: unknown, benutzerId: string | null) {
    const m = await this.repo.holeMappe(mappeId);
    if (!m) throw new Fachfehler(404, 'Diese Mappe gibt es nicht.');
    const typ = await this.repo.holeTyp(m.typId);
    const reg = typ?.register.find((r) => r.key === e.register && r.art === 'dokumente');
    if (!reg) throw new Fachfehler(422, 'Dieses Dokumentenregister gibt es an der Mappe nicht.');
    if (!Buffer.isBuffer(inhalt) || inhalt.length === 0) throw new Fachfehler(422, 'Die Datei ist leer.');
    if (inhalt.length > MAX_DATEIGROESSE) throw new Fachfehler(413, 'Die Datei ist zu groß.');

    const sha256 = createHash('sha256').update(inhalt).digest('hex');
    const erkannt = erkenneAnzeigbar(inhalt);
    const angegeben = /^[\w.+-]+\/[\w.+-]+$/.test(e.typ ?? '') ? e.typ! : 'application/octet-stream';
    const gleicherInhalt = await this.repo.dokumenteMitSha(sha256);
    await this.dateien.schreibe(sha256, inhalt);
    const dokument = await this.repo.legeDokumentAn({
      id: randomUUID(), mappeId, registerKey: reg.key, name: dateiname(e.name), mime: erkannt ?? angegeben,
      groesse: inhalt.length, sha256, anzeigbar: !!erkannt, erstellt: new Date().toISOString(), erstelltVon: benutzerId,
    });
    const bezuege = await this.repo.bezuege(gleicherInhalt.map((d) => d.mappeId));
    return { dokument, gleicherInhalt: gleicherInhalt.map((d) => ({ mappeId: d.mappeId, name: d.name, ...bezuege.get(d.mappeId) })) };
  }

  async dokumentInhalt(id: string) {
    const dokument = await this.repo.holeDokument(id);
    if (!dokument) throw new Fachfehler(404, 'Dieses Dokument gibt es nicht.');
    return { dokument, inhalt: await this.dateien.lies(dokument.sha256) };
  }

  async loescheDokument(id: string) {
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, 'Dieses Dokument gibt es nicht.');
    await this.repo.loescheDokument(id);
    await this.raeumeAuf(d.sha256);
  }
}
