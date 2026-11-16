/** Pakete (Arbeitsspeicher): installierte Pakete, Code, Sprachpakete, Verlauf (#1003) und Hinweise (#1034). */
import { teileKennung } from '../../../../shared/src/kennungen';
import { VERLAUF_FEHLER, VERLAUF_MAX, VERLAUF_TAGE, type VerlaufEintrag, type VerlaufTag } from '../../../../shared/src/paketreiter';
import type { RepoTeil } from '..';
import { jetzt, kopie, mitPaket } from './hilfen';
import type { SpeicherKontext } from './kontext';

/** Installierte Pakete, ihr Code und Sprachpakete; Hinweise von Paketen (#1034). */
export function speicherPakete(sp: SpeicherKontext) {
  const { typen, mappen, pakete, paketCode, sprachpakete, verlauf, ereignisse, hinweise, synonymListe } = sp;
  return {
    async listePakete() {
      return [...pakete.values()].map(kopie).sort((a, b) => a.id.localeCompare(b.id));
    },
    async speicherePaket(p) {
      pakete.set(p.id, kopie(p));
    },
    async loeschePaket(id) {
      pakete.delete(id);
    },
    async benennePaketUm(alt, neu) {
      const p = pakete.get(alt);
      if (p) {
        pakete.delete(alt);
        pakete.set(neu, { ...p, id: neu });
      }
      for (const x of pakete.values())
        if (alt in x.abhaengigkeiten) {
          x.abhaengigkeiten[neu] = x.abhaengigkeiten[alt];
          delete x.abhaengigkeiten[alt];
        }
      const c = paketCode.get(alt);
      if (c) {
        paketCode.delete(alt);
        paketCode.set(neu, c);
      }
      for (const e of verlauf) if (e.paket === alt) e.paket = neu;
      const s = sprachpakete.get(alt);
      if (s) {
        sprachpakete.delete(alt);
        sprachpakete.set(neu, s);
      }
      for (const x of sprachpakete.values())
        if (x.beschriftungen[alt]) {
          x.beschriftungen[neu] = x.beschriftungen[alt];
          delete x.beschriftungen[alt];
        }
      for (const e of ereignisse.values()) if (e.paketId === alt) e.paketId = neu;
      for (const g of synonymListe) if (g.quelle === alt) g.quelle = neu;
      // Vorgaben (#1038): Die feste Kennung nennt das Paket.
      for (const m of mappen.values())
        if (m.vorgabe?.startsWith(`paket:${alt}:`)) m.vorgabe = `paket:${neu}:${m.vorgabe.slice(`paket:${alt}:`.length)}`;
      for (const t of typen.values())
        if (t.paket === alt && t.schluessel) {
          t.schluessel = `${neu}:${teileKennung(t.schluessel).schluessel}`;
          mitPaket(t);
        }
    },
    async speicherePaketCode(id, dateien) {
      paketCode.set(
        id,
        dateien.map((d) => ({ name: d.name, inhalt: Buffer.from(d.inhalt) })),
      );
    },
    async paketCode(id) {
      return (paketCode.get(id) ?? []).map((d) => ({ name: d.name, inhalt: Buffer.from(d.inhalt) }));
    },
    async loeschePaketCode(id) {
      paketCode.delete(id);
    },
    async speichereSprachpaket(id, d) {
      sprachpakete.set(id, structuredClone(d));
    },
    async sprachpakete() {
      return [...sprachpakete].sort(([a], [b]) => a.localeCompare(b)).map(([paketId, d]) => ({ paketId, ...structuredClone(d) }));
    },
    async loescheSprachpaket(id) {
      sprachpakete.delete(id);
    },
    async hinweise(mappeId) {
      return [...hinweise.values()]
        .filter((h) => h.mappeId === mappeId)
        .sort((a, b) => a.gesetzt.localeCompare(b.gesetzt) || a.paket.localeCompare(b.paket) || a.schluessel.localeCompare(b.schluessel))
        .map((h) => ({ paket: h.paket, schluessel: h.schluessel, text: h.text, gesetzt: h.gesetzt }));
    },
    async setzeHinweis(h) {
      if (!mappen.has(h.mappeId)) return;
      hinweise.set(`${h.mappeId}|${h.paket}|${h.schluessel}`, { ...h, gesetzt: jetzt() });
    },
    async loescheHinweis(mappeId, paket, schluessel) {
      return hinweise.delete(`${mappeId}|${paket}|${schluessel}`);
    },
    async loescheHinweiseVon(paket) {
      let n = 0;
      for (const [k, h] of hinweise)
        if (h.paket === paket) {
          hinweise.delete(k);
          n++;
        }
      return n;
    },
  } satisfies RepoTeil;
}

/** Verlauf und Auslastung der Pakete (#1003). */
export function speicherPaketVerlauf(sp: SpeicherKontext) {
  const { verlauf } = sp;
  return {
    async notiereVerlauf(liste) {
      for (const e of liste) {
        verlauf.push({
          paket: e.paket,
          nr: sp.verlaufNr++,
          zeit: jetzt(),
          art: e.art,
          was: (e.was ?? '').slice(0, 200),
          ergebnis: e.ergebnis ?? null,
          ms: e.ms ?? null,
          speicherMB: e.speicherMB ?? null,
          text: (e.text ?? '').slice(0, 500),
          wer: e.wer ?? null,
          bezug: e.bezug ? kopie(e.bezug) : null,
          netz: (e.netz ?? []).slice(0, 20),
        });
      }
      const grenze = Date.now() - VERLAUF_TAGE * 86_400_000;
      for (let i = verlauf.length - 1; i >= 0; i--)
        if (
          Date.parse(verlauf[i].zeit) < grenze ||
          verlauf.filter((x) => x.paket === verlauf[i].paket && x.nr > verlauf[i].nr).length >= VERLAUF_MAX
        )
          verlauf.splice(i, 1);
    },
    async paketVerlauf(id, f) {
      const such = f.suche?.trim().toLowerCase();
      return verlauf
        .filter(
          (e) =>
            e.paket === id &&
            (!f.vor || e.nr < f.vor) &&
            (!f.nurFehler || (e.ergebnis && VERLAUF_FEHLER.includes(e.ergebnis))) &&
            (!such || `${e.was} ${e.text}`.toLowerCase().includes(such)),
        )
        .sort((a, b) => b.nr - a.nr)
        .slice(0, f.anzahl)
        .map((e) => kopie(Object.fromEntries(Object.entries(e).filter(([k]) => k !== 'paket')) as VerlaufEintrag));
    },
    async paketAuslastung(id, tage) {
      const ab = Date.now() - tage * 86_400_000;
      const aufrufe = verlauf.filter((e) => e.paket === id && (e.art === 'ereignis' || e.art === 'aufruf'));
      const jeTag = new Map<string, VerlaufTag>();
      for (const e of aufrufe.filter((x) => Date.parse(x.zeit) >= ab)) {
        const tag = e.zeit.slice(0, 10);
        const d = jeTag.get(tag) ?? { tag, aufrufe: 0, fehler: 0, zeit: 0, speicher: 0, msSumme: 0, msMax: 0, speicherMax: 0 };
        d.aufrufe++;
        if (e.ergebnis === 'fehler' || e.ergebnis === 'zeit' || e.ergebnis === 'speicher') d.fehler++;
        if (e.ergebnis === 'zeit') d.zeit++;
        if (e.ergebnis === 'speicher') d.speicher++;
        d.msSumme += e.ms ?? 0;
        d.msMax = Math.max(d.msMax, e.ms ?? 0);
        d.speicherMax = Math.max(d.speicherMax, e.speicherMB ?? 0);
        jeTag.set(tag, d);
      }
      return { tage: [...jeTag.values()].sort((a, b) => a.tag.localeCompare(b.tag)), zuletzt: aufrufe.at(-1)?.zeit ?? null };
    },
    async loescheVerlauf(id) {
      for (let i = verlauf.length - 1; i >= 0; i--) if (verlauf[i].paket === id) verlauf.splice(i, 1);
    },
  } satisfies RepoTeil;
}
