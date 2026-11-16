import type { RepoTeil } from '..';
import { jetzt, kopie } from './hilfen';
import type { SpeicherKontext } from './kontext';

/** Auskunft-Links: anlegen, abrufen, sperren, widerrufen. */
export function speicherAuskunft(sp: SpeicherKontext) {
  const { mappen, links } = sp;
  return {
    async legeAuskunftLinkAn(l) {
      links.set(l.id, {
        ...kopie(l),
        erstellt: l.erstellt || jetzt(),
        abrufe: 0,
        fehlversuche: 0,
        gesperrt: null,
        widerrufen: null,
        abgerufen: null,
      });
    },
    async auskunftLinkPerSchluessel(hash) {
      const l = [...links.values()].find((x) => x.schluessel === hash && mappen.has(x.mappeId));
      return l ? kopie(l) : undefined;
    },
    async auskunftLinks(f = {}) {
      return [...links.values()]
        .filter(
          (l) =>
            mappen.has(l.mappeId) &&
            (!f.id || l.id === f.id) &&
            (!f.mappeId || l.mappeId === f.mappeId) &&
            (!f.auskunftId || l.auskunftId === f.auskunftId),
        )
        .sort((a, b) => b.erstellt.localeCompare(a.erstellt))
        .slice(0, f.max ?? 500)
        .map(kopie);
    },
    async auskunftLinkFehlversuch(id, max) {
      const l = links.get(id);
      if (!l) return undefined;
      l.fehlversuche++;
      if (!l.gesperrt && l.fehlversuche >= max) l.gesperrt = jetzt();
      return { fehlversuche: l.fehlversuche, gesperrt: !!l.gesperrt };
    },
    async auskunftLinkAbruf(id) {
      const l = links.get(id);
      if (!l || l.abrufe >= l.maxAbrufe || Date.parse(l.ablauf) <= Date.now() || l.gesperrt || l.widerrufen) return null;
      l.abrufe++;
      l.abgerufen = jetzt();
      return l.abrufe;
    },
    async widerrufeAuskunftLink(id) {
      const l = links.get(id);
      if (!l || l.widerrufen) return false;
      l.widerrufen = jetzt();
      return true;
    },
  } satisfies RepoTeil;
}
