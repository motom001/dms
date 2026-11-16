/** Aufgaben (Arbeitsspeicher, #54) und Aufgaben bei Personen ohne Leserecht (#798). */
import { randomUUID } from 'node:crypto';
import { t } from '../../sprache/sprache';
import type { RepoTeil } from '..';
import { jetzt, kopie } from './hilfen';
import type { SpeicherKontext } from './kontext';

/** Aufgaben anlegen, lesen, erledigen, delegieren. */
export function speicherAufgaben(sp: SpeicherKontext) {
  const { mappen, aufgaben, mitMappe } = sp;
  return {
    async aufgabenZurPassung(liste) {
      for (const { id, problem } of liste) {
        const offen = [...aufgaben.values()].find((a) => a.mappeId === id && a.art === 'passung' && !a.erledigt);
        if (problem) {
          const text = t('meldungen.repospeicher.passt-nicht-zur-definition', { problem });
          if (offen) offen.text = text;
          else if (mappen.has(id)) {
            const nid = randomUUID();
            aufgaben.set(nid, {
              id: nid,
              mappeId: id,
              empfaengerId: mappen.get(id)!.erstelltVon,
              art: 'passung',
              text,
              erstellt: jetzt(),
              erstelltVon: null,
              erledigt: null,
              erledigtVon: null,
            });
          }
        } else if (offen) offen.erledigt = jetzt();
      }
    },
    async legeAufgabeAn(a) {
      // Wie der eindeutige Index in PostgreSQL: je Mappe, Feld, Datum und Empfänger höchstens eine Frist.
      if (
        a.art === 'frist' &&
        [...aufgaben.values()].some(
          (x) =>
            x.art === 'frist' &&
            x.mappeId === a.mappeId &&
            x.feldKey === a.feldKey &&
            x.datum === a.datum &&
            (x.empfaengerId ?? null) === (a.empfaengerId ?? null),
        )
      )
        throw new Error('duplicate key value violates unique constraint "aufgaben_frist_idx"');
      const x = { ...kopie(a), erstellt: jetzt(), erledigt: null, erledigtVon: null };
      aufgaben.set(a.id, x);
      return kopie(x);
    },
    async holeAufgabe(id) {
      const a = aufgaben.get(id);
      return a && kopie(a);
    },
    async aufgabenVon(mappeId) {
      return [...aufgaben.values()]
        .filter((a) => a.mappeId === mappeId)
        .sort((a, b) => Number(!!a.erledigt) - Number(!!b.erledigt) || b.erstellt.localeCompare(a.erstellt))
        .map(kopie);
    },
    async aufgabenVonMappen(mappeIds) {
      const ids = new Set(mappeIds);
      return [...aufgaben.values()]
        .filter((a) => ids.has(a.mappeId))
        .sort(
          (a, b) =>
            a.mappeId.localeCompare(b.mappeId) || Number(!!a.erledigt) - Number(!!b.erledigt) || b.erstellt.localeCompare(a.erstellt),
        )
        .map(kopie);
    },
    async offeneAufgaben(f = {}) {
      return [...aufgaben.values()]
        .filter(
          (a) =>
            !a.erledigt &&
            mappen.has(a.mappeId) &&
            (!f.benutzerId || a.empfaengerId === f.benutzerId || (!!f.admin && !a.empfaengerId)) &&
            (!f.mappeIds || f.mappeIds.includes(a.mappeId)),
        )
        .map(mitMappe);
    },
    async erledigteAufgaben(max) {
      return [...aufgaben.values()]
        .filter((a) => a.erledigt && mappen.has(a.mappeId))
        .sort((a, b) => b.erledigt!.localeCompare(a.erledigt!))
        .slice(0, max)
        .map(mitMappe);
    },
    async erledigeAufgabe(id, von) {
      const a = aufgaben.get(id);
      if (a && !a.erledigt) {
        a.erledigt = jetzt();
        a.erledigtVon = von;
      }
    },
    async delegiereAufgabe(id, an) {
      const a = aufgaben.get(id);
      if (a) a.empfaengerId = an;
    },
    async aendereAufgabeText(id, text) {
      const a = aufgaben.get(id);
      if (a && !a.erledigt) a.text = text;
    },
    async fristAufgaben(mappeIds) {
      return [...aufgaben.values()]
        .filter((a) => a.art === 'frist' && mappen.has(a.mappeId) && (!mappeIds || mappeIds.includes(a.mappeId)))
        .sort((a, b) => a.erstellt.localeCompare(b.erstellt))
        .map(mitMappe);
    },
  } satisfies RepoTeil;
}

/** Aufgaben bei Personen ohne Leserecht (#798): Fälle und Leserecht auf Zeit. */
export function speicherFaelle(sp: SpeicherKontext) {
  const { mappen, aufgaben, faelle, mitMappeF } = sp;
  return {
    async faelleOhneLeserecht(f = {}) {
      return [...faelle.values()]
        .filter((x) => (!f.offen || !x.ende) && (!f.mappeIds || f.mappeIds.includes(x.mappeId)))
        .sort(
          (a, b) =>
            Number(!!a.ende) - Number(!!b.ende) || (b.ende ?? b.beginn).localeCompare(a.ende ?? a.beginn) || a.id.localeCompare(b.id),
        )
        .slice(0, f.max ?? 1000)
        .map(mitMappeF);
    },
    async legeFallAn(f) {
      if ([...faelle.values()].some((x) => !x.ende && x.aufgabeId === f.aufgabeId && x.benutzerId === f.benutzerId)) return false;
      faelle.set(f.id, { ...f, beginn: jetzt(), ende: null, endeGrund: null, leserechtSeit: null, leserechtVon: null });
      return true;
    },
    async beendeFall(id, grund, zeit) {
      const x = faelle.get(id);
      if (!x || x.ende) return false;
      x.ende = zeit ?? jetzt();
      x.endeGrund = grund;
      return true;
    },
    async gibLeserechtAufZeit(id, von) {
      const x = faelle.get(id);
      if (!x || x.ende || x.leserechtSeit) return false;
      x.leserechtSeit = jetzt();
      x.leserechtVon = von;
      return true;
    },
    async leserechteAufZeit(benutzerId) {
      return [...faelle.values()]
        .filter((f) => {
          const a = aufgaben.get(f.aufgabeId);
          return (
            f.benutzerId === benutzerId &&
            !f.ende &&
            f.leserechtSeit &&
            a &&
            !a.erledigt &&
            a.empfaengerId === benutzerId &&
            a.mappeId === f.mappeId &&
            mappen.has(f.mappeId)
          );
        })
        .map((f) => ({
          fallId: f.id,
          mappeId: f.mappeId,
          typId: mappen.get(f.mappeId)!.typId,
          aufgabeId: f.aufgabeId,
          aufgabentext: f.aufgabentext,
          seit: f.leserechtSeit!,
          von: f.leserechtVon,
        }));
    },
  } satisfies RepoTeil;
}
