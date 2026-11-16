import type { RepoTeil } from '..';
import { jetzt } from './hilfen';
import type { SpeicherKontext } from './kontext';

/** Favoriten und Abos (#62, #422), Zählerstand (#625), „gesehen“. */
export function speicherFavoriten(sp: SpeicherKontext) {
  const { mappen, favoriten, istFavorit, favoritSeit, favoritStumm, gesehen, zaehlerstaende, historie } = sp;
  return {
    async setzeFavorit(benutzerId, mappeId, an) {
      const s = favoriten.get(benutzerId) ?? new Set<string>();
      if (an) {
        if (!s.has(mappeId)) favoritSeit.set(`${benutzerId}|${mappeId}`, jetzt());
        s.add(mappeId);
      } else {
        s.delete(mappeId);
        favoritSeit.delete(`${benutzerId}|${mappeId}`);
        favoritStumm.delete(`${benutzerId}|${mappeId}`);
      }
      favoriten.set(benutzerId, s);
    },
    async favoritenDerMappe(mappeId) {
      return [...favoriten]
        .filter(([, s]) => s.has(mappeId))
        .map(([benutzerId]) => ({ benutzerId, benachrichtigen: !favoritStumm.has(`${benutzerId}|${mappeId}`) }));
    },
    async setzeFavoritBenachrichtigen(benutzerId, mappeId, an) {
      if (!istFavorit(mappeId, benutzerId)) return;
      if (an) favoritStumm.delete(`${benutzerId}|${mappeId}`);
      else favoritStumm.add(`${benutzerId}|${mappeId}`);
    },
    async stummeFavoriten(benutzerId, mappeIds) {
      return new Set(mappeIds.filter((id) => istFavorit(id, benutzerId) && favoritStumm.has(`${benutzerId}|${id}`)));
    },
    async zaehlerstand(benutzerId) {
      const z = zaehlerstaende.get(benutzerId);
      return z && { ...z };
    },
    async setzeZaehlerstand(benutzerId, abdruck) {
      const z = zaehlerstaende.get(benutzerId);
      if (z?.abdruck === abdruck) return { ...z };
      const neu = { stand: (z?.stand ?? 0) + 1, abdruck, geaendert: jetzt() };
      zaehlerstaende.set(benutzerId, neu);
      return { ...neu };
    },
    async merkeGesehen(benutzerId, mappeIds) {
      for (const id of mappeIds) if (mappen.has(id)) gesehen.set(`${benutzerId}|${id}`, jetzt());
    },
    async geaendertVonAnderen(benutzerId, mappeIds, arten) {
      const erg = new Set<string>();
      for (const id of new Set(mappeIds)) {
        const m = mappen.get(id);
        if (!m || !(istFavorit(id, benutzerId) || m.erstelltVon === benutzerId)) continue;
        const seit = [gesehen.get(`${benutzerId}|${id}`), favoritSeit.get(`${benutzerId}|${id}`), m.erstellt]
          .filter((x): x is string => !!x)
          .sort()
          .at(-1)!;
        if (
          historie.some(
            (h) =>
              h.mappeId === id &&
              h.zeit > seit &&
              h.benutzerId &&
              h.benutzerId !== benutzerId &&
              arten.includes(h.art) &&
              h.daten?.aufgabenart !== 'aenderung',
          )
        )
          erg.add(id);
      }
      return erg;
    },
    async alleFavoriten() {
      return [...favoriten].flatMap(([benutzerId, s]) => [...s].filter((m) => mappen.has(m)).map((mappeId) => ({ benutzerId, mappeId })));
    },
    async favoritenVon(benutzerId, mappeIds) {
      return new Set(mappeIds.filter((id) => istFavorit(id, benutzerId) && mappen.has(id)));
    },
  } satisfies RepoTeil;
}
