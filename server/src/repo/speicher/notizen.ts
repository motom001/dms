import { ohneTitel } from '../../../../shared/src/markdown';
import type { RepoTeil } from '..';
import { jetzt, kopie } from './hilfen';
import type { SpeicherKontext } from './kontext';

/** Notizen an Mappen (#55) und Erwähnungen (#1293). */
export function speicherNotizen(sp: SpeicherKontext) {
  const { mappen, notizen } = sp;
  return {
    async notizen(mappeId) {
      return [...notizen.values()]
        .filter((n) => n.mappeId === mappeId)
        .sort((a, b) => a.erstellt.localeCompare(b.erstellt))
        .map(kopie);
    },
    async erwaehntIn(mappeId) {
      const drin = (t: unknown) => typeof t === 'string' && (t.includes(`(mappe:${mappeId})`) || t.includes(`(benutzer:${mappeId})`));
      return [
        ...[...notizen.values()]
          .filter((n) => n.mappeId !== mappeId && drin(n.text))
          .map((n) => ({ mappeId: n.mappeId, stelle: `notiz:${n.id}`, am: n.geaendert })),
        ...[...mappen.values()]
          .filter((m) => m.id !== mappeId)
          .flatMap((m) =>
            Object.entries(m.werte)
              .filter(([, w]) => drin(w))
              .map(([k]) => ({ mappeId: m.id, stelle: k, am: m.geaendert })),
          ),
      ]
        .sort((a, b) => b.am.localeCompare(a.am))
        .slice(0, 200);
    },
    async notizenVon(mappeIds) {
      const ids = new Set(mappeIds);
      return [...notizen.values()]
        .filter((n) => ids.has(n.mappeId))
        .sort((a, b) => a.mappeId.localeCompare(b.mappeId) || a.erstellt.localeCompare(b.erstellt))
        .map(kopie);
    },
    async holeNotiz(id) {
      const n = notizen.get(id);
      return n && kopie(n);
    },
    async legeNotizAn(n) {
      const x = { ...kopie(n), text: ohneTitel(n.text), erstellt: jetzt(), geaendert: jetzt(), geaendertVon: n.erstelltVon };
      notizen.set(n.id, x);
      return kopie(x);
    },
    async aendereNotiz(id, text, von) {
      const n = notizen.get(id)!;
      n.text = ohneTitel(text);
      n.geaendert = jetzt();
      n.geaendertVon = von;
      return kopie(n);
    },
    async loescheNotiz(id) {
      notizen.delete(id);
    },
  } satisfies RepoTeil;
}
