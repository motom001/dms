/** Änderungshistorie (Arbeitsspeicher, #57). */
import type { RepoTeil } from '..';
import { jetzt, kopie } from './hilfen';
import type { SpeicherKontext } from './kontext';

/** Historie schreiben, lesen und aufräumen. */
export function speicherHistorie(sp: SpeicherKontext) {
  const { mappen, historie, korb } = sp;
  return {
    async historieSchreibe(e) {
      for (const x of e)
        historie.push({
          id: ++sp.historieNr,
          mappeId: x.mappeId,
          zeit: jetzt(),
          benutzerId: x.benutzerId,
          art: x.art,
          daten: kopie(x.daten ?? {}),
        });
    },
    async historie(mappeId, o = {}) {
      let x = historie.filter((h) => h.mappeId === mappeId && (!o.arten || o.arten.includes(h.art))).reverse();
      if (o.vor !== undefined) {
        const i = x.findIndex((h) => h.id === o.vor);
        x = i < 0 ? [] : x.slice(i + 1);
      }
      return (o.max ? x.slice(0, o.max) : x).map(kopie);
    },
    async letzterAbruf(mappeId, art, benutzerId, dokumentId, fassung, version, seit) {
      for (let i = historie.length - 1; i >= 0; i--) {
        const h = historie[i];
        if (h.zeit < seit) break;
        if (
          h.mappeId === mappeId &&
          h.art === art &&
          h.benutzerId === benutzerId &&
          h.daten.dokumentId === dokumentId &&
          String(h.daten.fassung ?? '') === fassung &&
          String(h.daten.version ?? '') === (version === null ? '' : String(version))
        )
          return h.zeit;
      }
      return null;
    },
    async letzteBerechnung(mappeId, benutzerId, seit) {
      for (let i = historie.length - 1; i >= 0; i--) {
        const h = historie[i];
        if (h.zeit < seit) break;
        if (h.mappeId === mappeId && h.art === 'geaendert' && h.benutzerId === benutzerId && h.daten.berechnet === true) return kopie(h);
      }
      return null;
    },
    async historieDatenErsetzen(id, daten) {
      const i = historie.findIndex((x) => x.id === id);
      if (i < 0) return;
      if (daten === null) historie.splice(i, 1);
      else historie[i].daten = kopie(daten);
    },
    async historieVon(mappeIds) {
      const ids = new Set(mappeIds);
      return historie
        .filter((h) => ids.has(h.mappeId))
        .map(kopie)
        .reverse();
    },
    async historieArt(art, max) {
      return historie
        .filter((h) => h.art === art)
        .map(kopie)
        .reverse()
        .slice(0, max);
    },
    async historieAufraeumen(vor) {
      const weg = new Set(
        historie
          .filter((h) => h.art === 'endgueltig' && h.zeit < vor && !mappen.has(h.mappeId) && !korb.has(h.mappeId))
          .map((h) => h.mappeId),
      );
      const vorher = historie.length;
      for (let i = historie.length - 1; i >= 0; i--)
        if (weg.has(historie[i].mappeId) && historie[i].art !== 'verwaltungsmodus') historie.splice(i, 1);
      return vorher - historie.length;
    },
  } satisfies RepoTeil;
}

/** Beim Auflösen einer Post: Historie, Notizen, Aufgaben und Abläufe an die Zielmappe übertragen; wohin aufgelöst wurde. */
export function speicherUebertragen(sp: SpeicherKontext) {
  const { aufgaben, faelle, notizen, ablaeufe, historie } = sp;
  return {
    async uebertrageAnMappe(von, nach) {
      const n = { historie: 0, notizen: 0, aufgaben: 0, ablaeufe: 0 };
      for (const h of historie)
        if (h.mappeId === von) {
          h.mappeId = nach;
          h.daten = { ...h.daten, ausPost: von };
          n.historie++;
        }
      for (const x of notizen.values())
        if (x.mappeId === von) {
          x.mappeId = nach;
          n.notizen++;
        }
      for (const a of aufgaben.values())
        if (a.mappeId === von && a.art !== 'post') {
          a.mappeId = nach;
          n.aufgaben++;
        }
      for (const e of ablaeufe.values())
        if (e.mappeId === von) {
          e.mappeId = nach;
          n.ablaeufe++;
        }
      for (const f of faelle.values()) if (f.mappeId === von && !f.ende) f.mappeId = nach;
      return n;
    },
    async aufgeloesteIn(ids) {
      const m = new Map<string, { ziel: string; zielTyp: string }>();
      const gesucht = new Set(ids);
      for (const h of historie) {
        if (!gesucht.has(h.mappeId) || h.art !== 'zugeordnet' || h.daten.aufgeloest !== true || typeof h.daten.ziel !== 'string') continue;
        m.set(h.mappeId, { ziel: h.daten.ziel, zielTyp: String(h.daten.zielTyp ?? '') });
      }
      return m;
    },
  } satisfies RepoTeil;
}
