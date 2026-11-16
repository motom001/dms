/** Abläufe an Mappen und Automatisierungsvorlagen (Arbeitsspeicher, #131, #1044). */
import type { RepoTeil } from '..';
import { jetzt, kopie } from './hilfen';
import type { SpeicherKontext } from './kontext';

/** Abläufe an Mappen (#1044): anlegen, ändern, anhalten, löschen. */
export function speicherAblaeufe(sp: SpeicherKontext) {
  const { mappen, ablaeufe, mitMappeE } = sp;
  return {
    async ablaeufe(f = {}) {
      return [...ablaeufe.values()]
        .filter(
          (e) =>
            mappen.has(e.mappeId) &&
            (!f.mappeId || e.mappeId === f.mappeId) &&
            (!f.empfaengerId || e.empfaengerId === f.empfaengerId) &&
            (!f.personId || e.erstelltVon === f.personId) &&
            (!f.vorlage || e.vorlage === f.vorlage) &&
            (!f.bis || e.datum <= f.bis) &&
            (f.angehalten === undefined || !!e.angehalten === f.angehalten),
        )
        .sort((a, b) => a.datum.localeCompare(b.datum) || a.erstellt.localeCompare(b.erstellt) || a.id.localeCompare(b.id))
        .map(mitMappeE);
    },
    async holeAblauf(id) {
      const e = ablaeufe.get(id);
      return e && kopie(e);
    },
    async legeAblaufAn(e) {
      const x = { ...kopie(e), erstellt: jetzt() };
      delete x.mappeTitel;
      delete x.typId;
      delete x.vorlageName;
      ablaeufe.set(e.id, x);
      return kopie(x);
    },
    async aendereAblauf(id, e) {
      const x = ablaeufe.get(id);
      if (!x) return undefined;
      Object.assign(x, e);
      return kopie(x);
    },
    async setzeAblaufAngehalten(id, a) {
      const x = ablaeufe.get(id);
      if (x) x.angehalten = a ? kopie(a) : null;
    },
    async loescheAblauf(id) {
      return ablaeufe.delete(id);
    },
  } satisfies RepoTeil;
}

/** Automatisierungsvorlagen (#1044) und ihr Verlauf. */
export function speicherAblaufvorlagen(sp: SpeicherKontext) {
  const { vorlagen } = sp;
  return {
    async ablaufvorlagen() {
      return [...vorlagen.values()]
        .sort((a, b) => a.reihenfolge - b.reihenfolge || a.name.localeCompare(b.name) || a.kennung.localeCompare(b.kennung))
        .map(kopie);
    },
    async speichereAblaufvorlage(v, von, erwartet) {
      const da = vorlagen.get(v.kennung);
      if (erwartet === null ? !!da : !da || da.version !== erwartet) return false;
      vorlagen.set(v.kennung, { ...kopie(v), version: erwartet === null ? 1 : erwartet + 1, geaendert: jetzt(), geaendertVon: von });
      return true;
    },
    async loescheAblaufvorlage(kennung) {
      vorlagen.delete(kennung);
    },
    async vermerkeAblauf(e) {
      sp.ablaufVerlauf.push({ ...kopie(e), zeit: e.zeit || jetzt() });
    },
    async ablaufVerlauf(f) {
      return sp.ablaufVerlauf
        .filter((e) => (!f.vorlage || e.vorlage === f.vorlage) && (!f.mappeId || e.mappeId === f.mappeId))
        .sort((a, b) => b.zeit.localeCompare(a.zeit))
        .slice(0, f.anzahl)
        .map(kopie);
    },
    async zaehleAblaufVerlauf(personId, seit, arten) {
      return sp.ablaufVerlauf.filter((e) => e.personId === personId && e.zeit >= seit && arten.includes(e.art)).length;
    },
    async raeumeAblaufVerlaufAuf(tage, je) {
      const grenze = new Date(Date.now() - tage * 86_400_000).toISOString();
      const vorher = sp.ablaufVerlauf.length;
      const nr = new Map<string, number>();
      sp.ablaufVerlauf = [...sp.ablaufVerlauf]
        .sort((a, b) => b.zeit.localeCompare(a.zeit))
        .filter((e) => {
          const n = (nr.get(e.vorlage) ?? 0) + 1;
          nr.set(e.vorlage, n);
          return n <= je && e.zeit >= grenze;
        });
      return vorher - sp.ablaufVerlauf.length;
    },
  } satisfies RepoTeil;
}
