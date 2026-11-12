/**
 * Repo-Hülle der Fassungen (#1006): Mappentypen (samt Rechte-Regeln), Ansichten, Nummernkreise und Automatisierungsvorlagen ändern sich auf vielen
 * Wegen – Werkbank, Pakete (Installieren, Aktualisieren, Umbau, Entfernen), Umzüge beim Start, Löschen eines Typs, das
 * Verweise anderer Typen nachzieht. Statt jeden Weg einzeln anzuschließen, hält die Hülle nach jeder schreibenden
 * Methode des Repos die Fassung fest – in derselben Transaktion (auch in `transaktion`, deren Repo ebenfalls umhüllt wird).
 * Löschen: vorher den letzten Stand, danach der Löschvermerk.
 */
import type { FassungArt } from '../../../shared/src/fassungen';
import type { Repo } from '../repo';

type Ziel = readonly [FassungArt, (args: unknown[]) => unknown];
const erstes = (a: unknown[]) => a[0];

/** Schreibende Methoden → Gegenstand und Eintrag. */
const SCHREIBT: Readonly<Record<string, Ziel>> = {
  legeTypAn: ['typ', erstes], aendereTyp: ['typ', erstes], setzeBerechtigungen: ['typ', erstes], setzeTypSchluessel: ['typ', erstes], setzeTypKennung: ['typ', erstes],
  legeSichtAn: ['sicht', erstes], aendereSicht: ['sicht', erstes], setzeSichtOrt: ['sicht', erstes],
  speichereNummernkreis: ['nummernkreis', (a) => (a[0] as { schluessel?: unknown } | undefined)?.schluessel],
  // Automatisierungsvorlagen (#1044): Werkbank, Pakete (anlegen, ersetzen, entfernen) und Zurücksetzen gehen alle hier durch.
  speichereAblaufvorlage: ['ablaufvorlage', (a) => (a[0] as { kennung?: unknown } | undefined)?.kennung],
};
/** Löschende Methoden. */
const LOESCHT: Readonly<Record<string, Ziel>> = {
  loescheTyp: ['typ', erstes], loescheSicht: ['sicht', erstes], loescheNummernkreis: ['nummernkreis', erstes], loescheAblaufvorlage: ['ablaufvorlage', erstes],
};

export interface FassungenHalten {
  halte(art: FassungArt, eintrag: string, repo: Repo): Promise<void>;
  geloescht(art: FassungArt, eintrag: string, repo: Repo, loesche: () => Promise<void>): Promise<void>;
}

/** Das Repo mit Fassungen. `f` kommt später (der Dienst baut die Fassungen nach dem Kern). */
export function mitFassungen(repo: Repo, f: () => FassungenHalten | undefined): Repo {
  const huelle = (r: Repo): Repo => {
    const p: Repo = new Proxy(r, {
      get(ziel, prop, empfaenger) {
        const wert = Reflect.get(ziel, prop, empfaenger) as unknown;
        if (typeof wert !== 'function' || typeof prop !== 'string') return wert;
        const fn = wert as (...a: unknown[]) => Promise<unknown>;
        if (prop === 'transaktion') return <T>(g: (tx: Repo) => Promise<T>) => ziel.transaktion((tx) => g(huelle(tx)));
        const s = SCHREIBT[prop];
        if (s) {
          return async (...args: unknown[]) => {
            const erg = await fn.apply(ziel, args);
            const id = s[1](args);
            const h = f();
            if (h && typeof id === 'string') await h.halte(s[0], id, p);
            return erg;
          };
        }
        const l = LOESCHT[prop];
        if (l) {
          return async (...args: unknown[]) => {
            const id = l[1](args);
            const h = f();
            if (!h || typeof id !== 'string') return fn.apply(ziel, args);
            let erg: unknown;
            await h.geloescht(l[0], id, p, async () => { erg = await fn.apply(ziel, args); });
            return erg;
          };
        }
        return wert;
      },
    });
    return p;
  };
  return huelle(repo);
}
