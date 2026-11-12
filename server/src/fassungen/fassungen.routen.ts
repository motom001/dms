/**
 * Fassungen (#1006): je Gegenstand unter der Adresse seines Eintrags (`FASSUNG_PFAD`) – so gilt das Verwaltungsrecht
 * des Bereichs wie beim Bearbeiten (`verwaltungsbereiche.ts`). Liste, Vergleich zweier Fassungen, Vorschau und
 * Wiederherstellen; dazu die gelöschten Einträge aller Bereiche, die man verwaltet.
 */
import { darfBereich } from '../../../shared/src/verwaltungsrecht';
import { FASSUNG_ARTEN, FASSUNG_BEREICH, FASSUNG_PFAD, istFassungArt, type FassungArt } from '../../../shared/src/fassungen';
import { ok, ich } from '../http/routen-hilfen';
import type { RoutenKontext } from '../http/routen-kontext';
import type { Anfrage, Route } from '../routen';

export function fassungenRouten(k: RoutenKontext): Route[] {
  const { dienst } = k;
  const eintrag = (a: Anfrage) => a.params.id ?? a.params.schluessel ?? '';
  const je = (art: FassungArt): Route[] => {
    const p = `${FASSUNG_PFAD[art]}/fassungen`;
    return [
      { methode: 'GET', pfad: p, zugang: 'admin', handler: async (a) => ok(await dienst.fassungen.liste(art, eintrag(a))) },
      { methode: 'GET', pfad: `${p}/vergleich`, zugang: 'admin', handler: async (a) => {
        const q = a.query as { von?: unknown; bis?: unknown };
        return ok(await dienst.fassungen.vergleich(art, eintrag(a), Number(q.von), Number(q.bis)));
      } },
      { methode: 'GET', pfad: `${p}/:nr`, zugang: 'admin', handler: async (a) => ok(await dienst.fassungen.vorschau(art, eintrag(a), Number(a.params.nr))) },
      { methode: 'POST', pfad: `${p}/:nr/wiederherstellen`, zugang: 'admin', handler: async (a) => {
        const b = ich(a);
        return ok(await dienst.fassungen.stelleWiederHer(art, eintrag(a), Number(a.params.nr), a.body, { id: b.id, email: b.email ?? null }));
      } },
    ];
  };
  return [
    // Gelöschte Einträge (Nachweis): nur aus den Bereichen, die man verwaltet.
    { methode: 'GET', pfad: '/api/werkbank/fassungen/geloescht', zugang: 'admin', handler: async (a) => {
      const gewuenscht = String((a.query as { art?: unknown }).art ?? '').split(',').filter(istFassungArt);
      const arten = (gewuenscht.length ? gewuenscht : [...FASSUNG_ARTEN]).filter((x) => a.konsole || darfBereich(ich(a), FASSUNG_BEREICH[x]));
      return ok(arten.length ? await dienst.fassungen.geloeschte(arten) : []);
    } },
    ...FASSUNG_ARTEN.flatMap(je),
  ];
}
