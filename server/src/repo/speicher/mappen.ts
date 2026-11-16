/** Mappen (Arbeitsspeicher): lesen, anlegen, ändern, Titel, Systemmappen, Stände und Verweise. */
import { kannTerminHaben } from '../../../../shared/src/fristen';
import type { Mappe, Werte } from '../../../../shared/src/model';
import { feldweise, type RepoTeil, type Rueckverweis, StandVeraltet } from '..';
import { jetzt, kopie, standWeiter } from './hilfen';
import type { SpeicherKontext } from './kontext';

/** Mappen lesen: einzeln, je Typ, mit Datum oder Frist, Titel und Typen. */
export function speicherMappenLesen(sp: SpeicherKontext) {
  const { mappen } = sp;
  return {
    async zaehleMappen(typId) {
      return [...mappen.values()].filter((m) => m.typId === typId).length;
    },
    async mappenKurz() {
      return [...mappen.values()].map((m) => ({ id: m.id, typId: m.typId, titel: m.titel ?? '' }));
    },
    async feldwerte(typId, key) {
      return [...mappen.values()].filter((m) => m.typId === typId && m.werte[key] != null).map((m) => String(m.werte[key]));
    },
    async listeMappen(typId) {
      return [...mappen.values()].filter((m) => !typId || m.typId === typId).map(kopie);
    },
    async mappenMitDatum(typId, felder, von, bis) {
      return [...mappen.values()]
        .filter(
          (m) =>
            m.typId === typId &&
            felder.some((k) => {
              const w = m.werte[k];
              return typeof w === 'string' && w >= von && w <= bis;
            }),
        )
        .map(kopie);
    },
    async fristKandidaten(typId, felder, ab, bis) {
      // Wie PostgreSQL (#918): Vorfilter über die Datumswerte (JJJJ-MM-TT), nur die Werte dieser Felder.
      return [...mappen.values()]
        .filter(
          (m) =>
            m.typId === typId &&
            felder.some((f) => {
              const w = m.werte[f.key];
              return typeof w === 'string' && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(w) && kannTerminHaben(w, f.monate, ab, bis);
            }),
        )
        .map((m) => ({
          id: m.id,
          typId: m.typId,
          titel: m.titel ?? null,
          werte: Object.fromEntries(felder.filter((f) => f.key in m.werte).map((f) => [f.key, kopie(m.werte[f.key])])),
        }));
    },
    async holeMappe(id) {
      const m = mappen.get(id);
      return m && kopie(m);
    },
    async holeMappen(ids) {
      return [...new Set(ids)]
        .map((id) => mappen.get(id))
        .filter((m): m is Mappe => !!m)
        .map(kopie);
    },
    async titelVon(ids) {
      const r = new Map<string, string>();
      for (const id of ids) {
        const m = mappen.get(id);
        if (m) r.set(id, m.titel ?? '');
      }
      return r;
    },
    async typenVon(ids) {
      const r = new Map<string, string>();
      for (const id of ids) {
        const m = mappen.get(id);
        if (m) r.set(id, m.typId);
      }
      return r;
    },
  } satisfies RepoTeil;
}

/** Mappen anlegen, ändern und löschen. */
export function speicherMappenSchreiben(sp: SpeicherKontext) {
  const { mappen, zieheSync, verweise, dokumente, versionen, aufgaben, notizen, hinweise, ablaeufe } = sp;
  return {
    async legeMappeAn(id, typId, werte: Werte, vs, benutzerId, demo = false, systemKennung = null, nummern) {
      werte = kopie(werte);
      for (const n of nummern?.felder ?? []) werte[n.feldKey] = zieheSync(n.kreis, id, nummern!.jetzt);
      const m: Mappe = {
        id,
        typId,
        werte: kopie(werte),
        erstellt: jetzt(),
        erstelltVon: benutzerId,
        geaendert: jetzt(),
        geaendertVon: benutzerId,
        demo,
        passt: true,
        problem: null,
        systemKennung,
      };
      mappen.set(id, m);
      verweise.set(id, kopie(vs));
      return kopie(m);
    },
    async aktualisiereStatistik() {
      /* nur PostgreSQL */
    },
    async legeMappenAn(liste) {
      const t = jetzt();
      for (const m of liste) {
        mappen.set(m.id, {
          id: m.id,
          typId: m.typId,
          werte: kopie(m.werte),
          titel: m.titel,
          erstellt: t,
          erstelltVon: m.benutzerId,
          geaendert: t,
          geaendertVon: m.benutzerId,
          demo: m.demo,
          passt: true,
          problem: null,
        });
        verweise.set(m.id, kopie(m.verweise));
      }
    },
    async aendereMappe(id, werte, vs, benutzerId, fw) {
      const a = mappen.get(id)!;
      // Feldweise (#609) wie in PostgreSQL: nur Geändertes auf den aktuellen Stand legen.
      if (fw?.stand !== undefined && a.geaendert !== fw.stand) throw new StandVeraltet();
      const neu = fw ? feldweise(a.werte, fw.basis, werte) : werte;
      const titel = fw?.titel?.(neu);
      const m = {
        ...a,
        werte: kopie(neu),
        geaendert: standWeiter(a.geaendert),
        geaendertVon: benutzerId,
        passt: true,
        problem: null,
        ...(titel !== undefined ? { titel } : {}),
      };
      mappen.set(id, m);
      verweise.set(id, kopie(fw ? fw.verweise(neu) : vs));
      return kopie(m);
    },
    async setzeMappenTyp(ids, typId) {
      for (const id of ids) {
        const m = mappen.get(id);
        if (m) mappen.set(id, { ...m, typId, geaendert: standWeiter(m.geaendert) });
      }
    },
    async beruehreMappe(id, benutzerId) {
      const m = mappen.get(id);
      if (m) mappen.set(id, { ...m, geaendert: standWeiter(m.geaendert), geaendertVon: benutzerId });
    },
    async loescheMappe(id) {
      mappen.delete(id);
      verweise.delete(id);
      for (const [k, n] of notizen) if (n.mappeId === id) notizen.delete(k);
      for (const [k, h] of hinweise) if (h.mappeId === id) hinweise.delete(k);
      for (const [k, a] of aufgaben) if (a.mappeId === id) aufgaben.delete(k);
      for (const [k, e] of ablaeufe) if (e.mappeId === id) ablaeufe.delete(k);
      for (const [k, d] of dokumente)
        if (d.mappeId === id) {
          dokumente.delete(k);
          versionen.delete(k);
        }
    },
  } satisfies RepoTeil;
}

/** Titel setzen, Mappen ohne Titel, doppelte Werte finden. */
export function speicherMappenTitel(sp: SpeicherKontext) {
  const { mappen } = sp;
  return {
    async setzeTitel(liste) {
      for (const { id, titel } of liste) {
        const m = mappen.get(id);
        if (m) m.titel = titel;
      }
    },
    async ohneTitel() {
      return [...mappen.values()].filter((m) => m.titel === undefined).map((m) => m.id);
    },
    async findeDoppelt(typId, feldKey, wert, ausser) {
      const w = wert.trim().toLowerCase();
      const m = [...mappen.values()].find(
        (x) => x.id !== ausser && x.typId === typId && x.werte[feldKey] != null && String(x.werte[feldKey]).trim().toLowerCase() === w,
      );
      return m && kopie(m);
    },
    async findeDoppelte(typId, liste) {
      const erg = new Map<string, { id: string; titel: string }>();
      for (const x of liste) {
        const d = await this.findeDoppelt(typId, x.feldKey, x.wert, x.mappeId ?? undefined);
        if (d) erg.set(`${x.mappeId ?? ''}|${x.feldKey}`, { id: d.id, titel: d.titel ?? '' });
      }
      return erg;
    },
  } satisfies RepoTeil;
}

/** Systemmappen und Vorgaben; Haushalts- und Mappenstand (#741). */
export function speicherSystemmappen(sp: SpeicherKontext) {
  const { mappen } = sp;
  return {
    async holeSystemMappe(kennung) {
      const m = [...mappen.values()].find((x) => x.systemKennung === kennung);
      return m && kopie(m);
    },
    async setzeSystemKennung(id, kennung) {
      const m = mappen.get(id);
      if (m) m.systemKennung = kennung;
    },
    async setzeVorgabe(id, kennung) {
      const m = mappen.get(id);
      if (!m) return;
      if (kennung) m.vorgabe = kennung;
      else delete m.vorgabe;
    },
    async mappenMitVorgabe(praefix) {
      return [...mappen.values()].filter((m) => m.vorgabe?.startsWith(praefix)).map((m) => kopie(m));
    },
  } satisfies RepoTeil;
}

/** Verweise zwischen Mappen: Quellen, Bezüge, Rückverweise, Kanten. */
export function speicherVerweise(sp: SpeicherKontext) {
  const { mappen, verweise } = sp;
  return {
    async quellenVon(zielIds) {
      const z = new Set(zielIds);
      return [...verweise].filter(([q, vs]) => mappen.has(q) && vs.some((v) => z.has(v.zielId))).map(([q]) => q);
    },
    async bezuege(ids) {
      const r = new Map<string, { titel: string; typId: string }>();
      for (const id of ids) {
        const m = mappen.get(id);
        if (m) r.set(id, { titel: m.titel ?? '', typId: m.typId });
      }
      return r;
    },
    async rueckverweise(zielId) {
      const r: Rueckverweis[] = [];
      for (const [quelleId, vs] of verweise)
        for (const v of vs)
          if (v.zielId === zielId)
            r.push({ quelleId, quelleTypId: mappen.get(quelleId)!.typId, feldKey: v.feldKey, titel: mappen.get(quelleId)!.titel ?? '' });
      return r.sort((a, b) => a.titel.toLowerCase().localeCompare(b.titel.toLowerCase()));
    },
    async kantenVon(ids) {
      const z = new Set(ids);
      const r: Array<{ quelleId: string; feldKey: string; zielId: string }> = [];
      for (const [quelleId, vs] of verweise) {
        if (!mappen.has(quelleId)) continue;
        for (const v of vs) if (z.has(quelleId) || z.has(v.zielId)) r.push({ quelleId, feldKey: v.feldKey, zielId: v.zielId });
      }
      return r;
    },
  } satisfies RepoTeil;
}
