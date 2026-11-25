/** Listen und Zahlen (Arbeitsspeicher): eine Seite Mappen mit Suche und Fundstellen (#740), Zähler und Klauseln. */
import { alsText } from '../../../../shared/src/markdown';
import { type Ausschnitt, type Mappe, TREFFER_ANFANG, TREFFER_ENDE } from '../../../../shared/src/model';
import { lesbar, werte } from '../../../../shared/src/rechte';
import { inSicht } from '../../../../shared/src/sichten';
import { falte, type Varianten } from '../../../../shared/src/suche';
import { telefonFindet, telefonSuchformen } from '../../../../shared/src/telefon';
import { ausschnittAus } from '../ausschnitt';
import type { Repo, RepoTeil } from '..';
import { enthaelt, findet, kopie, woerter } from './hilfen';
import type { SpeicherKontext } from './kontext';

/** Eine Seite Mappen (#740) mit Fundstellen. */
export function speicherSeite(sp: SpeicherKontext) {
  const { mappen, dokumente, istFavorit, offenFuer, notizen, texte, zaehl, vergleiche } = sp;
  const seiteVon: Repo['seite'] = async (o) => {
    const tf =
      o.textfilter?.text.trim() && (o.textfilter.dokumente || o.textfilter.notizen || o.textfilter.felder)
        ? { ...o.textfilter, text: o.textfilter.text.trim().toLowerCase() }
        : null;
    // Fundstellen: zur Suche oder zum Volltextfilter.
    const fund =
      o.suche && (o.volltext || o.notizen)
        ? { volltext: !!o.volltext, notizen: !!o.notizen }
        : tf
          ? { volltext: tf.dokumente, notizen: tf.notizen }
          : null;
    const q = o.suche;
    const vv: Varianten = { ...(o.varianten ?? {}) };
    for (const [k, w] of Object.entries(o.aehnlich ?? {})) vv[k] = [...(vv[k] ?? []), ...w];
    const wertText = (v: unknown) => (typeof v === 'object' ? JSON.stringify(v) : String(v));
    const inFeldern = (m: Mappe, text: string) => {
      // Telefonnummern (#1609): in jeder Schreibweise – wie im PostgreSQL-Repo.
      const tel = telefonSuchformen(text);
      return (
        enthaelt(m.titel ?? '', text, vv) ||
        Object.values(m.werte).some(
          (v) =>
            !(typeof v === 'string' && v.startsWith('dms1$')) &&
            (enthaelt(wertText(v), text, vv) || (tel.length > 0 && typeof v === 'string' && telefonFindet(v, tel))),
        )
      );
    };
    // Teile (#1031): übergeordnete Mappen, in deren Teilen der Begriff steht, zählen als Treffer.
    const auch = new Set(o.auchIds ?? []);
    const ohneLesen = [...mappen.values()]
      .filter((m) => !o.typId || m.typId === o.typId)
      .filter((m) => !o.klauseln || inSicht(m, o.klauseln, zaehl))
      .filter((m) => !o.eingang || offenFuer(m, o.eingang.benutzerId, o.eingang.admin))
      .filter((m) => !o.favoriten || istFavorit(m.id, o.favoriten.benutzerId));
    const alle = ohneLesen
      .filter((m) => lesbar(o.lesen ?? null, m, zaehl))
      .filter(
        (m) =>
          !q ||
          auch.has(m.id) ||
          inFeldern(m, q) ||
          (!!o.volltext && [...dokumente.values()].some((d) => d.mappeId === m.id && findet(texte.get(d.id), q, vv))) ||
          (!!o.notizen && [...notizen.values()].some((n) => n.mappeId === m.id && enthaelt(n.text, q, vv))),
      )
      // Erweiterte Suche (#199): Begriff in Dokumenten oder Notizen – UND mit allem anderen.
      .filter(
        (m) =>
          !tf ||
          auch.has(m.id) ||
          (!!tf.felder && inFeldern(m, tf.text)) ||
          (tf.dokumente && [...dokumente.values()].some((d) => d.mappeId === m.id && findet(texte.get(d.id), tf.text, vv))) ||
          (tf.notizen && [...notizen.values()].some((n) => n.mappeId === m.id && enthaelt(n.text, tf.text, vv))),
      )
      .sort(
        (a, b) =>
          vergleiche(a, b, o.sortierung) ||
          (a.titel ?? '').toLowerCase().localeCompare((b.titel ?? '').toLowerCase()) ||
          a.id.localeCompare(b.id),
      );
    const seite = alle.slice(o.von, o.von + o.anzahl).map(kopie);
    // Tabellenfeld (#1265): Zahl der Mappen, die ohne Lesefilter dazukämen – wie im PostgreSQL-Repo nur ohne Suche.
    if (o.mitVerborgenen && !q && !tf && o.zahl === undefined)
      return { gesamt: alle.length, verborgen: ohneLesen.length - alle.length, mappen: seite };
    if (!fund) return { gesamt: o.zahl ?? alle.length, mappen: seite };
    const ausschnitte: Record<string, Ausschnitt> = {};
    const q2 = (o.suche && (o.volltext || o.notizen) ? q! : tf!.text).toLowerCase();
    if (fund.notizen) {
      for (const m of seite) {
        const n = [...notizen.values()].find((x) => x.mappeId === m.id && x.text.toLowerCase().includes(q2));
        const t = n ? ausschnittAus(alsText(n.text), q2) : null;
        if (t) ausschnitte[m.id] = { dokument: 'Notiz', text: t };
      }
    }
    if (fund.volltext)
      for (const m of seite) {
        if (ausschnitte[m.id]) continue;
        const d = [...dokumente.values()].find((x) => x.mappeId === m.id && findet(texte.get(x.id), q2, vv));
        if (!d) continue;
        const text = texte.get(d.id)!;
        const w =
          [woerter(q2)[0], ...(vv[falte(woerter(q2)[0])] ?? []).map((x) => x.toLowerCase())].find((x) => text.toLowerCase().includes(x)) ??
          woerter(q2)[0];
        const i = Math.max(0, text.toLowerCase().indexOf(w));
        ausschnitte[m.id] = {
          dokument: d.name,
          text: `${text.slice(Math.max(0, i - 40), i)}${TREFFER_ANFANG}${text.slice(i, i + w.length)}${TREFFER_ENDE}${text.slice(i + w.length, i + w.length + 40)}`,
          ...(d.anlageZu ? { anlage: d.anlageNr ?? 1 } : {}),
        };
      }
    return { gesamt: o.zahl ?? alle.length, mappen: seite, ausschnitte };
  };
  return {
    seite: seiteVon,
    /** Nur die Ids (#1335) – hier genügt die Seite selbst. */
    async trefferIds(o) {
      const r = await seiteVon(o);
      return { gesamt: r.gesamt, ids: r.mappen.map((m) => m.id) };
    },
  } satisfies RepoTeil;
}

/** Zahlen für die Navigation (#625, #928): Bestand und Persönliches. */
export function speicherZaehler(sp: SpeicherKontext) {
  const { mappen, favoriten, offenFuer, dokKorb, korb, zaehl } = sp;
  return {
    async zaehler(benutzerId, admin, lesen) {
      const typen = new Map<string, { anzahl: number; unpassend: number; demo: number }>();
      let eingang = 0;
      for (const m of mappen.values()) {
        // Eingang ohne Lesefilter (#127, #477).
        if (offenFuer(m, benutzerId, admin)) eingang++;
        if (!lesbar(lesen ?? null, m, zaehl)) continue;
        const z = typen.get(m.typId) ?? { anzahl: 0, unpassend: 0, demo: 0 };
        z.anzahl++;
        if (m.passt !== true) z.unpassend++;
        if (m.demo) z.demo++;
        typen.set(m.typId, z);
      }
      return {
        typen,
        eingang,
        favoriten: [...(favoriten.get(benutzerId) ?? [])].filter((id) => mappen.has(id) && lesbar(lesen ?? null, mappen.get(id)!, zaehl))
          .length,
      };
    },
    async zaehleBestand(liste, lesen) {
      const typen = new Map<string, { anzahl: number; unpassend: number; demo: number }>();
      const sichten = liste.map(() => 0);
      for (const m of mappen.values()) {
        if (!lesbar(lesen ?? null, m, zaehl)) continue;
        const z = typen.get(m.typId) ?? { anzahl: 0, unpassend: 0, demo: 0 };
        z.anzahl++;
        if (m.passt !== true) z.unpassend++;
        if (m.demo) z.demo++;
        typen.set(m.typId, z);
        liste.forEach((k, i) => {
          if (inSicht(m, k, zaehl)) sichten[i]++;
        });
      }
      return { typen, sichten };
    },
    async zaehlePersoenlich(benutzerId, ohneEmpfaenger, lesen, liste = []) {
      let eingang = 0;
      for (const m of mappen.values()) if (offenFuer(m, benutzerId, ohneEmpfaenger)) eingang++;
      return {
        eingang,
        favoriten: [...(favoriten.get(benutzerId) ?? [])].filter((id) => mappen.has(id) && lesbar(lesen ?? null, mappen.get(id)!, zaehl))
          .length,
        papierkorb: [...korb.values(), ...dokKorb.values()].filter((k) => k.geloeschtVon === benutzerId).length,
        sichten: liste.map((k) => [...mappen.values()].filter((m) => inSicht(m, k, zaehl) && lesbar(lesen ?? null, m, zaehl)).length),
      };
    },
  } satisfies RepoTeil;
}

/** Gibt es Treffer oder Mappen? Klauseln, Lesbarkeit und Ausdrücke zählen. */
export function speicherKlauseln(sp: SpeicherKontext) {
  const { mappen, zaehl } = sp;
  return {
    async gibtTreffer(o) {
      return (await this.seite({ ...o, von: 0, anzahl: 1 })).gesamt > 0;
    },
    async gibtMappen(typIds) {
      const t = new Set(typIds);
      for (const m of mappen.values()) if (t.has(m.typId)) return true;
      return false;
    },
    async zaehleKlauseln(liste, lesen) {
      return liste.map((k) => [...mappen.values()].filter((m) => inSicht(m, k, zaehl) && lesbar(lesen ?? null, m, zaehl)).length);
    },
    async lesbare(ids, lesen) {
      return new Set(ids.filter((id) => mappen.has(id) && lesbar(lesen, mappen.get(id)!, zaehl)));
    },
    async inKlauseln(ids, klauseln) {
      return new Set(ids.filter((id) => mappen.has(id) && inSicht(mappen.get(id)!, klauseln, zaehl)));
    },
    async zaehleAusdruck(typId, x) {
      return [...mappen.values()].filter((m) => m.typId === typId && werte(x, m, zaehl)).length;
    },
  } satisfies RepoTeil;
}
