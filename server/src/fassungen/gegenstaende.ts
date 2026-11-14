/**
 * Die Gegenstände mit Fassungen (#1006), die der Dienst selbst kennt: Mappentypen (samt Rechte-Regeln, Stempel und
 * Erkennung am Typ), Ansichten, Nummernkreise und Stempel-Vorlagen. Postfächer, Paket-Einstellungen und
 * Automatisierungen melden sich in ihren eigenen Klassen an. Wiederherstellen geht immer über das normale Speichern.
 */
import type { Mappentyp } from '../../../shared/src/model';
import type { Sicht } from '../../../shared/src/sichten';
import type { StempelTyp, StempelVorlage } from '../../../shared/src/stempel';
import type { AusDokument } from '../../../shared/src/erkennung';
import { OFFENES_REGELWERK } from '../../../shared/src/rechte';
import { ALLE_TYPEN } from '../../../shared/src/sichten';
import { ohne } from '../../../shared/src/fassungen';
import type { NummernkreisStand, SichtStand, StempelStand, TypStand } from '../../../shared/src/fassungsvergleich';
import type { Repo } from '../repo';
import { t } from '../sprache';
import type { Gegenstand, Wiederherstellen } from './fassungen.dienst';

/** Was die Gegenstände vom Dienst brauchen. */
export interface GegenstaendeAnschluss {
  /** Stempel und Erkennung am Typ (in den Einstellungen, #394, #391, #337). */
  amTyp(id: string): Promise<{ stempel: StempelTyp | null; ausDokument: AusDokument | null; autoZuordnen: boolean }>;
  aendereTyp(id: string, eingabe: Record<string, unknown>): Promise<unknown>;
  /** Wie viele Mappen passten nicht, wenn der Typ so aussähe. */
  unpassendMit(typ: Mappentyp): Promise<number>;
  aendereSicht(id: string, eingabe: Record<string, unknown>): Promise<unknown>;
  speichereNummernkreis(eingabe: Record<string, unknown>, von: string): Promise<unknown>;
  stempelVorlagen(): Promise<StempelVorlage[]>;
  speichereStempelVorlage(id: string, eingabe: Record<string, unknown>, von: string): Promise<unknown>;
  /** Das Repo außerhalb der Änderung (Namen nachschlagen). */
  repo(): Repo;
}

const von = (o: Wiederherstellen) => o.von.email ?? o.von.id ?? '';

/** Mappentyp: der Typ ohne Id und Zeitstempel, dazu Stempel und Erkennung am Typ. */
export function typGegenstand(a: GegenstaendeAnschluss): Gegenstand {
  const stand = async (id: string, repo: Repo) => {
    const typ = await repo.holeTyp(id);
    if (!typ) return undefined;
    const rest = ohne(typ as Mappentyp & { berechnung?: unknown }, 'id', 'erstellt', 'geaendert', 'darfAnlegen', 'paket', 'berechnung');
    const am = await a.amTyp(id);
    const daten: TypStand = { ...rest, stempel: am.stempel, ausDokument: am.ausDokument, autoZuordnen: am.autoZuordnen };
    return { name: typ.name, daten };
  };
  return {
    art: 'typ',
    stand,
    alle: async (repo) => (await repo.listeTypen()).map((x) => x.id),
    async stelleHer(id, daten, o) {
      const d = daten as TypStand;
      const jetzt = await a.repo().holeTyp(id);
      // Was in der Fassung fehlt, ist dort „nicht gesetzt“ – ausdrücklich, sonst behielte das Speichern den heutigen Wert.
      await a.aendereTyp(id, {
        ...d, beschriftungen: d.beschriftungen ?? null, berechtigungen: d.berechtigungen ?? OFFENES_REGELWERK, stempel: d.stempel ?? null, ausDokument: d.ausDokument ?? null,
        autoZuordnen: !!d.autoZuordnen, teilVon: d.teilVon ?? null, inSuche: d.inSuche ?? null, archiv: d.archiv ?? null,
        felder: d.felder.map((f) => ({ ...f, beschriftungen: f.beschriftungen ?? null, ausgeblendet: !!f.ausgeblendet, anzeigen: f.anzeigen ?? null })),
        register: d.register.map((r) => ({ ...r, beschriftungen: r.beschriftungen ?? null, ausgeblendet: !!r.ausgeblendet })),
        stand: jetzt?.geaendert, bestaetigt: o.bestaetigt, doppelteBestaetigt: o.doppelteBestaetigt,
      });
    },
    async hinweise(id, jetzt, ziel) {
      const j = jetzt as TypStand, z = ziel as TypStand;
      const repo = a.repo();
      const h: string[] = [];
      const belegung = await repo.belegung(id);
      for (const f of j.felder) {
        if (z.felder.some((x) => x.key === f.key) || f.system) continue;
        const n = belegung[f.key] ?? 0;
        if (n) h.push(t('meldungen.fassungen.feld-mit-werten', { label: f.label, anzahl: n }));
      }
      const dokumente = await repo.dokumenteJeRegister(id);
      for (const [key, n] of dokumente) if (n && !z.register.some((r) => r.key === key && r.art === 'dokumente')) {
        h.push(t('meldungen.fassungen.register-mit-dokumenten', { name: j.register.find((r) => r.key === key)?.name ?? key, anzahl: n }));
      }
      const typ = await repo.holeTyp(id);
      if (typ) {
        const n = await a.unpassendMit({ ...typ, ...z } as Mappentyp);
        if (n) h.push(t('meldungen.fassungen.passen-nicht', { anzahl: n }));
      }
      return h;
    },
    async kontext() {
      const typen = await a.repo().listeTypen();
      return { typName: (x: string) => typen.find((y) => y.id === x)?.name };
    },
  };
}

/** Ansicht: ohne Position unter den Geschwistern; Rechte an der Ansicht gehören dazu. */
export function sichtGegenstand(a: GegenstaendeAnschluss): Gegenstand {
  const daten = (s: Sicht): SichtStand => {
    return ohne(s, 'id', 'erstellt', 'geaendert', 'position', 'rechte');
  };
  return {
    art: 'sicht',
    stand: async (id, repo) => { const s = (await repo.listeSichten()).find((x) => x.id === id); return s && { name: s.name, daten: daten(s) }; },
    alle: async (repo) => (await repo.listeSichten()).map((s) => s.id),
    async stelleHer(id, d) {
      const s = d as SichtStand;
      const jetzt = (await a.repo().listeSichten()).find((x) => x.id === id);
      await a.aendereSicht(id, { ...s, berechtigungen: s.berechtigungen ?? null, symbol: s.symbol ?? null, beschriftungen: s.beschriftungen ?? null, trefferliste: s.trefferliste ?? null, stand: jetzt?.geaendert });
    },
    async hinweise(_id, _jetzt, ziel) {
      const z = ziel as SichtStand;
      const repo = a.repo();
      const typen = new Set((await repo.listeTypen()).map((x) => x.id));
      const h: string[] = [];
      const fehlen = z.typen.filter((x) => x !== ALLE_TYPEN && !typen.has(x)).length;
      if (fehlen) h.push(t('meldungen.fassungen.typ-fehlt', { anzahl: fehlen }));
      if (z.elternId && !(await repo.listeSichten()).some((x) => x.id === z.elternId)) h.push(t('meldungen.fassungen.eltern-fehlt'));
      return h;
    },
    async kontext() {
      const repo = a.repo();
      const [typen, sichten] = [await repo.listeTypen(), await repo.listeSichten()];
      return { typName: (x: string) => (x === ALLE_TYPEN ? t('meldungen.fassungen.alle-typen') : typen.find((y) => y.id === x)?.name), sichtName: (x: string) => sichten.find((y) => y.id === x)?.name };
    },
  };
}

/** Nummernkreis: Name, Muster, Start – nicht die Zählerstände (die wachsen mit jeder Nummer). */
export function nummernkreisGegenstand(a: GegenstaendeAnschluss): Gegenstand {
  return {
    art: 'nummernkreis',
    stand: async (id, repo) => {
      const k = (await repo.listeNummernkreise()).find((x) => x.schluessel === id);
      return k && { name: k.name, daten: { schluessel: k.schluessel, name: k.name, muster: k.muster, start: k.start } satisfies NummernkreisStand };
    },
    alle: async (repo) => (await repo.listeNummernkreise()).map((k) => k.schluessel),
    async stelleHer(id, d, o) { await a.speichereNummernkreis({ ...(d as NummernkreisStand), schluessel: id, neu: false }, von(o)); },
    async hinweise(_id, jetzt, ziel) {
      return (jetzt as NummernkreisStand).muster !== (ziel as NummernkreisStand).muster ? [t('meldungen.fassungen.muster-kuenftig')] : [];
    },
  };
}

/** Stempel-Vorlage. */
export function stempelGegenstand(a: GegenstaendeAnschluss): Gegenstand {
  return {
    art: 'stempel',
    stand: async (id) => {
      const v = (await a.stempelVorlagen()).find((x) => x.id === id);
      if (!v) return undefined;
      return { name: v.name, daten: ohne(v, 'id', 'umgestellt') satisfies StempelStand };
    },
    alle: async () => (await a.stempelVorlagen()).map((v) => v.id),
    async stelleHer(id, d, o) { await a.speichereStempelVorlage(id, { ...(d as StempelStand) }, von(o)); },
  };
}
