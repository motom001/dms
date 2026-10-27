import { randomUUID } from 'node:crypto';
import {
  FELDTYPEN, formatiere, istLeer, istOk, leseZahl, pruefeMappe, pruefeMappentyp, titelFeld, verweiseVon,
  type Feld, type Mappe, type Mappentyp, type MappentypDaten, type Werte,
} from '../../shared/src/model';
import { Fachfehler } from './fehler';
import { istUuid, type Repo } from './repo';

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

export function bereinigeTyp(e: unknown): MappentypDaten {
  const t = (e ?? {}) as Record<string, unknown>;
  return {
    name: text(t.name),
    beschreibung: text(t.beschreibung),
    titelFeld: text(t.titelFeld),
    felder: Array.isArray(t.felder) ? t.felder.map(bereinigeFeld) : [],
  };
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
  constructor(private repo: Repo) {}

  listeTypen() { return this.repo.listeTypen(); }

  private async pruefeTyp(d: MappentypDaten, eigeneId: string) {
    const alle = await this.repo.listeTypen();
    const p = pruefeMappentyp(d, {
      eigeneId,
      namenAndererTypen: alle.filter((t) => t.id !== eigeneId).map((t) => t.name),
      existiertTyp: (id) => alle.some((t) => t.id === id),
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
    if (!(await this.repo.holeTyp(id))) throw new Fachfehler(404, 'Diesen Mappentyp gibt es nicht.');
    const d = bereinigeTyp(eingabe);
    await this.pruefeTyp(d, id);
    return this.repo.aendereTyp(id, d);
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
    return { mappe, rueckverweise: await this.repo.rueckverweise(id) };
  }

  private async titel(m: Mappe): Promise<string> {
    const t = await this.repo.holeTyp(m.typId);
    const f = titelFeld(t);
    return (f && formatiere(f, m.werte[f.key])) || 'Ohne Titel';
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

  async legeMappeAn(eingabe: unknown, benutzerId: string | null = null): Promise<Mappe> {
    const e = (eingabe ?? {}) as { id?: unknown; typId?: unknown; werte?: unknown };
    const typ = istUuid(e.typId) ? await this.repo.holeTyp(e.typId) : undefined;
    if (!typ) throw new Fachfehler(422, 'Unbekannter Mappentyp.');
    const werte = bereinigeWerte(typ, e.werte);
    await this.pruefeWerte(typ, werte);
    const id = istUuid(e.id) && !(await this.repo.holeMappe(e.id)) ? e.id : randomUUID();
    return this.repo.legeMappeAn(id, typ.id, werte, verweiseVon(typ, werte), benutzerId);
  }

  async aendereMappe(id: string, eingabe: unknown, benutzerId: string | null = null): Promise<Mappe> {
    const m = await this.repo.holeMappe(id);
    if (!m) throw new Fachfehler(404, 'Diese Mappe gibt es nicht.');
    const typ = await this.repo.holeTyp(m.typId);
    if (!typ) throw new Fachfehler(500, 'Der Mappentyp dieser Mappe fehlt.');
    const werte = bereinigeWerte(typ, (eingabe as { werte?: unknown })?.werte, m.werte);
    await this.pruefeWerte(typ, werte, id);
    return this.repo.aendereMappe(id, werte, verweiseVon(typ, werte), benutzerId);
  }

  async loescheMappe(id: string): Promise<void> {
    if (!(await this.repo.holeMappe(id))) throw new Fachfehler(404, 'Diese Mappe gibt es nicht.');
    const fremd = (await this.repo.rueckverweise(id)).filter((r) => r.quelleId !== id);
    if (fremd.length) {
      throw new Fachfehler(409, `Auf diese Mappe ${fremd.length === 1 ? 'verweist noch eine andere Mappe' : `verweisen noch ${fremd.length} andere Mappen`}. Entferne erst diese Verweise.`, { rueckverweise: fremd });
    }
    await this.repo.loescheMappe(id);
  }
}
