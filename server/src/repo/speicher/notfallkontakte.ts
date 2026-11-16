import type { RepoTeil } from '..';
import { kopie, standWeiter } from './hilfen';
import type { SpeicherKontext } from './kontext';

/** Notfallkontakte: lesen, eintragen, ändern, Mailstand, löschen. */
export function speicherNotfallkontakte(sp: SpeicherKontext) {
  const { notfallListe } = sp;
  return {
    // Notfallkontakte (#812): ein Prozess – die Grenze gilt ohne Sperre.
    async notfallkontakte() {
      return notfallListe.map(kopie);
    },
    async holeNotfallkontakt(id) {
      const k = notfallListe.find((x) => x.id === id);
      return k ? kopie(k) : null;
    },
    async legeNotfallkontaktAn(k, max) {
      if (notfallListe.length >= max) return false;
      notfallListe.push(kopie(k));
      return true;
    },
    async aendereNotfallkontakt(id, w) {
      const k = notfallListe.find((x) => x.id === id);
      if (!k) return false;
      Object.assign(k, kopie(w), { geaendert: standWeiter(k.geaendert) });
      return true;
    },
    async setzeNotfallkontaktMail(id, m) {
      const k = notfallListe.find((x) => x.id === id);
      if (!k) return false;
      Object.assign(k, kopie(m));
      return true;
    },
    async loescheNotfallkontakt(id) {
      const i = notfallListe.findIndex((x) => x.id === id);
      return i < 0 ? null : notfallListe.splice(i, 1)[0];
    },
  } satisfies RepoTeil;
}
