import type { RepoTeil } from '..';
import { jetzt, kopie } from './hilfen';
import type { SpeicherKontext } from './kontext';

/** Vektoren der Dokumente und Ergebnisse der Erkennung (#336). */
export function speicherErkennung(sp: SpeicherKontext) {
  const { mappen, dokumente, erkennungen, texte, vektoren } = sp;
  return {
    /* Vektoren (#442): mit dem Dokument weg wie ON DELETE CASCADE. */
    async vektorSetze(e) {
      if (!dokumente.has(e.dokumentId)) return false;
      vektoren.set(`${e.dokumentId}|${e.modell}`, {
        dokumentId: e.dokumentId,
        paket: e.paket,
        modell: e.modell,
        vektor: Float32Array.from(e.vektor),
      });
      return true;
    },
    async vektorLoesche(dokumentId, modell) {
      let n = 0;
      for (const [k, v] of vektoren)
        if (v.dokumentId === dokumentId && (modell === undefined || v.modell === modell)) {
          vektoren.delete(k);
          n++;
        }
      return n;
    },
    async vektorenLoeschePaket(paket, ausser) {
      let n = 0;
      for (const [k, v] of vektoren)
        if (v.paket === paket && v.modell !== ausser) {
          vektoren.delete(k);
          n++;
        }
      return n;
    },
    async vektorenLaden(modell, jeTeil) {
      jeTeil(
        [...vektoren.values()]
          .filter((v) => v.modell === modell && dokumente.has(v.dokumentId))
          .map((v) => ({ dokumentId: v.dokumentId, mappeId: dokumente.get(v.dokumentId)!.mappeId, vektor: Float32Array.from(v.vektor) })),
      );
    },
    async vektorVon(dokumentId, modell) {
      const v = vektoren.get(`${dokumentId}|${modell}`);
      return v && dokumente.has(dokumentId) ? Float32Array.from(v.vektor) : null;
    },
    async vektorStand() {
      const z = new Map<string, { paket: string; modell: string; anzahl: number }>();
      for (const v of vektoren.values()) {
        if (!dokumente.has(v.dokumentId)) continue;
        const k = `${v.paket}|${v.modell}`;
        z.set(k, { paket: v.paket, modell: v.modell, anzahl: (z.get(k)?.anzahl ?? 0) + 1 });
      }
      return [...z.values()].sort((a, b) => a.paket.localeCompare(b.paket) || a.modell.localeCompare(b.modell));
    },
    async ohneVektor(modell, max, nach) {
      return [...dokumente.values()]
        .filter((d) => texte.get(d.id) && !vektoren.has(`${d.id}|${modell}`) && (!nach || d.id > nach))
        .sort((a, b) => (a.id < b.id ? -1 : 1))
        .slice(0, max)
        .map((d) => ({ id: d.id, mappeId: d.mappeId }));
    },
    async erkennungLies(mappeId) {
      const e = erkennungen.get(mappeId);
      return e && mappen.has(mappeId) ? kopie({ ergebnis: e.ergebnis, zeit: e.zeit }) : undefined;
    },
    async erkennungSchreibe(mappeId, ergebnis, absenderId) {
      if (mappen.has(mappeId)) erkennungen.set(mappeId, { ergebnis: kopie(ergebnis), absenderId, zeit: jetzt() });
    },
    async erkennungenMitAbsender(absenderId, max) {
      return [...erkennungen]
        .filter(([id, e]) => e.absenderId === absenderId && mappen.has(id))
        .sort((a, b) => b[1].zeit.localeCompare(a[1].zeit))
        .slice(0, max)
        .map(([id]) => id);
    },
  } satisfies RepoTeil;
}
