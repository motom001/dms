/** Papierkorb (Arbeitsspeicher, #43, #344, #424) und Löschprotokoll (#470). */
import { passt as passtLoesch } from '../../../../shared/src/loeschprotokoll';
import type { Dokument } from '../../../../shared/src/model';
import type { RepoTeil } from '..';
import { alsDokEintrag, alsEintrag, jetzt, kopie, loeschDok, loeschVersion } from './hilfen';
import type { SpeicherKontext } from './kontext';
import type { V } from './zustand';

/** Mappen in den Papierkorb, zurück und endgültig löschen. */
export function speicherPapierkorb(sp: SpeicherKontext) {
  const { mappen, verweise, dokumente, versionen, aufgaben, notizen, ablaeufe, dokKorb, korb } = sp;
  return {
    async legeInPapierkorb(id, benutzerId) {
      const m = mappen.get(id);
      if (!m) return;
      korb.set(id, {
        mappe: kopie(m),
        verweise: kopie(verweise.get(id) ?? []),
        dokumente: [...dokumente.values()].filter((d) => d.mappeId === id).map(kopie),
        versionen: [...dokumente.values()]
          .filter((d) => d.mappeId === id && versionen.has(d.id))
          .map((d) => [d.id, kopie(versionen.get(d.id)!)] as [string, V[]]),
        notizen: [...notizen.values()].filter((n) => n.mappeId === id).map(kopie),
        aufgaben: [...aufgaben.values()].filter((a) => a.mappeId === id).map(kopie),
        erinnerungen: [...ablaeufe.values()].filter((e) => e.mappeId === id).map(kopie),
        geloescht: jetzt(),
        geloeschtVon: benutzerId,
      });
      await this.loescheMappe(id);
    },
    async legeVorgangInPapierkorb(ids, benutzerId, vorgang, entkoppelt) {
      const alle = [...new Set(ids)].filter((id) => mappen.has(id));
      const weg = new Set(alle);
      // Wie der Fremdschlüssel in PostgreSQL: verweist noch eine Mappe außerhalb darauf, geht nichts.
      for (const [q, vs] of verweise)
        if (!weg.has(q) && mappen.has(q) && vs.some((v) => weg.has(v.zielId)))
          throw new Error('Auf eine der Mappen verweist noch eine andere Mappe.');
      for (const id of alle) {
        await this.legeInPapierkorb(id, benutzerId);
        const k = korb.get(id)!;
        k.vorgang = vorgang;
        k.entkoppelt = kopie(entkoppelt[id] ?? []);
      }
    },
    async papierkorb(f = {}) {
      return [...korb.values()]
        .filter((k) => (!f.von || k.geloeschtVon === f.von) && (!f.vor || k.geloescht < f.vor) && (!f.typId || k.mappe.typId === f.typId))
        .sort((a, b) => b.geloescht.localeCompare(a.geloescht) || a.mappe.id.localeCompare(b.mappe.id))
        .map(alsEintrag);
    },
    async holeAusPapierkorb(id) {
      const k = korb.get(id);
      return k && alsEintrag(k);
    },
    async stelleWiederHer(id) {
      return this.stelleMehrereWiederHer([id]);
    },
    async stelleMehrereWiederHer(ids) {
      // Erst alle Mappen, dann die Verweise (#424: auch untereinander und im Kreis).
      const ks = [...new Set(ids)].map((id) => korb.get(id)).filter((k) => !!k);
      for (const k of ks) mappen.set(k.mappe.id, kopie(k.mappe));
      let entfallen = 0;
      for (const k of ks) {
        const id = k.mappe.id;
        const bleiben = k.verweise.filter((v) => mappen.has(v.zielId));
        entfallen += k.verweise.length - bleiben.length;
        verweise.set(id, bleiben);
        for (const d of k.dokumente) dokumente.set(d.id, kopie(d));
        for (const [d, v] of k.versionen ?? []) versionen.set(d, kopie(v));
        for (const n of k.notizen ?? []) notizen.set(n.id, kopie(n));
        for (const a of k.aufgaben ?? []) aufgaben.set(a.id, kopie(a));
        for (const e of k.erinnerungen ?? [])
          ablaeufe.set(e.id, { ...kopie(e), vorlage: e.vorlage ?? 'erinnern', angehalten: e.angehalten ?? null });
        korb.delete(id);
      }
      return { verweiseEntfallen: entfallen };
    },
    async leerePapierkorb(ids) {
      const dateien = new Set<string>();
      for (const id of ids) {
        const k = korb.get(id);
        if (!k) continue;
        for (const d of k.dokumente) dateien.add(d.sha256);
        for (const [, v] of k.versionen ?? []) for (const x of v) dateien.add(x.sha256);
        korb.delete(id);
      }
      return [...dateien];
    },
    async zaehlePapierkorb(von) {
      return [...korb.values(), ...dokKorb.values()].filter((k) => !von || k.geloeschtVon === von).length;
    },
  } satisfies RepoTeil;
}

/** Einzelne Dokumente im Papierkorb (#344). */
export function speicherDokumentPapierkorb(sp: SpeicherKontext) {
  const { mappen, dokumente, versionen, texte, dokKorb, ohneHauptdokument } = sp;
  return {
    async legeDokumentInPapierkorb(id, benutzerId) {
      const d = dokumente.get(id);
      if (!d) return;
      dokKorb.set(id, {
        dokument: kopie(d),
        text: texte.get(id) ?? null,
        versionen: kopie(versionen.get(id) ?? []),
        geloescht: jetzt(),
        geloeschtVon: benutzerId,
      });
      dokumente.delete(id);
      versionen.delete(id);
      texte.delete(id);
      ohneHauptdokument(id);
    },
    async papierkorbDokumente(f = {}) {
      return [...dokKorb.values()]
        .filter(
          (k) =>
            (!f.von || k.geloeschtVon === f.von) &&
            (!f.vor || k.geloescht < f.vor) &&
            (!f.mappeIds || f.mappeIds.includes(k.dokument.mappeId)),
        )
        .sort((a, b) => b.geloescht.localeCompare(a.geloescht) || a.dokument.id.localeCompare(b.dokument.id))
        .map(alsDokEintrag);
    },
    async holeDokumentAusPapierkorb(id) {
      const k = dokKorb.get(id);
      return k && alsDokEintrag(k);
    },
    async stelleDokumentWiederHer(id) {
      const k = dokKorb.get(id);
      if (!k) return;
      if (!mappen.has(k.dokument.mappeId)) throw new Error('Mappe fehlt');
      const nr = k.dokument.archivnummer?.toLowerCase();
      const belegt = !!nr && [...dokumente.values()].some((x) => x.archivnummer?.toLowerCase() === nr);
      const wieder: Dokument = { ...kopie(k.dokument), ...(belegt ? { archivnummer: null } : {}) };
      // Anlagen (#998): wieder an ihr Hauptdokument, wenn es in derselben Mappe ist – sonst ein eigenes Dokument.
      if (wieder.anlageZu && dokumente.get(wieder.anlageZu)?.mappeId !== wieder.mappeId) {
        delete wieder.anlageZu;
        delete wieder.anlageNr;
      }
      dokumente.set(id, wieder);
      if (k.versionen.length) versionen.set(id, kopie(k.versionen));
      texte.set(id, k.text);
      dokKorb.delete(id);
    },
    async leereDokumentPapierkorb(ids) {
      const dateien = new Set<string>();
      for (const id of ids) {
        const k = dokKorb.get(id);
        if (!k) continue;
        dateien.add(k.dokument.sha256);
        for (const v of k.versionen) dateien.add(v.sha256);
        dokKorb.delete(id);
      }
      return [...dateien];
    },
  } satisfies RepoTeil;
}

/** Inhalt des Papierkorbs für das Löschprotokoll (#470) und das Protokoll selbst. */
export function speicherLoeschprotokoll(sp: SpeicherKontext) {
  const { loeschprotokoll, dokKorb, korb } = sp;
  return {
    async papierkorbInhalt(ids) {
      return ids
        .map((id) => korb.get(id))
        .filter((k) => !!k)
        .map((k) => ({
          id: k.mappe.id,
          typId: k.mappe.typId,
          werte: kopie(k.mappe.werte),
          demo: !!k.mappe.demo,
          vorgang: k.vorgang ?? null,
          entkoppelt: (k.entkoppelt ?? []).length,
          notizen: (k.notizen ?? []).length,
          dokumente: [...k.dokumente.map(loeschDok), ...(k.versionen ?? []).flatMap(([, v]) => v.map(loeschVersion))],
        }));
    },
    async papierkorbDokumentInhalt(ids) {
      return ids
        .map((id) => dokKorb.get(id))
        .filter((k) => !!k)
        .map((k) => ({
          id: k.dokument.id,
          mappeId: k.dokument.mappeId,
          dokumente: [loeschDok(k.dokument), ...k.versionen.map(loeschVersion)],
        }));
    },
    async loeschprotokollSchreibe(e) {
      loeschprotokoll.push(...e.map(kopie));
    },
    async loeschprotokoll(f) {
      const alle = loeschprotokoll
        .filter((e) => passtLoesch(e, f))
        .sort((a, b) => b.zeit.localeCompare(a.zeit) || (a.art === b.art ? 0 : a.art === 'mappe' ? -1 : 1));
      return { eintraege: alle.slice(0, f.max ?? 500).map(kopie), gesamt: alle.length };
    },
    async loeschprotokollAufraeumen(vor) {
      const vorher = loeschprotokoll.length;
      const bleibt = loeschprotokoll.filter((e) => e.zeit >= vor);
      loeschprotokoll.splice(0, loeschprotokoll.length, ...bleibt);
      return vorher - bleibt.length;
    },
  } satisfies RepoTeil;
}
