/** Dokumente (Arbeitsspeicher): lesen, anlegen, verschieben, Anlagen, Versionen (#194) und Dateien. */
import type { Dokument } from '../../../../shared/src/model';
import type { RepoTeil } from '..';
import { jetzt, kopie } from './hilfen';
import type { SpeicherKontext } from './kontext';

/** Dokumente lesen, anlegen, verschieben, löschen; Anlagen (#998). */
export function speicherDokumente(sp: SpeicherKontext) {
  const { mappen, dokumente, versionen, ohneHauptdokument } = sp;
  return {
    async listeDokumente(mappeId) {
      return [...dokumente.values()]
        .filter((d) => d.mappeId === mappeId)
        .map((d) => ({ ...kopie(d), aeltere: versionen.get(d.id)?.length ?? 0 }))
        .reverse();
    },
    async zaehleDokumente(ids) {
      const z = new Set(ids);
      const r = new Map<string, number>();
      for (const d of dokumente.values()) if (z.has(d.mappeId)) r.set(d.mappeId, (r.get(d.mappeId) ?? 0) + 1);
      return r;
    },
    async dokumenteVon(mappeIds) {
      const ids = new Set(mappeIds);
      return [...dokumente.values()]
        .filter((d) => ids.has(d.mappeId))
        .map((d) => ({ ...kopie(d), aeltere: versionen.get(d.id)?.length ?? 0 }))
        .reverse();
    },
    async holeDokument(id) {
      const d = dokumente.get(id);
      return d && { ...kopie(d), aeltere: versionen.get(d.id)?.length ?? 0 };
    },
    async setzeDokumentErstellt(id, erstellt) {
      const d = dokumente.get(id);
      if (d) d.erstellt = erstellt;
    },
    async legeDokumentAn(d) {
      const n: Dokument = { version: 1, herkunft: null, ...kopie(d), archivnummer: null, ocr: d.ocr ?? { stand: 'keiner' as const } };
      delete n.leerseiten;
      delete n.anlageZu;
      delete n.anlageNr;
      delete n.eingangNr;
      if (!n.originalEmail) delete n.originalEmail;
      dokumente.set(d.id, n);
      return kopie(n);
    },
    async setzeEingang(id, x) {
      const d = dokumente.get(id);
      if (!d) return;
      if (x.nr !== undefined) {
        if (x.nr && x.nr > 0) d.eingangNr = Math.round(x.nr);
        else delete d.eingangNr;
      }
      if (x.originalEmail !== undefined) {
        if (x.originalEmail) d.originalEmail = true;
        else delete d.originalEmail;
      }
    },
    async loescheDokument(id) {
      dokumente.delete(id);
      versionen.delete(id);
      ohneHauptdokument(id);
    },
    async verschiebeDokument(id, mappeId, registerKey) {
      const d = dokumente.get(id);
      if (!d) return;
      // Anlagen (#998) wandern mit; eine Anlage allein in eine andere Mappe ist danach ein eigenes Dokument.
      for (const x of [d, ...[...dokumente.values()].filter((y) => y.anlageZu === id)]) {
        x.mappeId = mappeId;
        x.registerKey = registerKey;
      }
      if (d.anlageZu && dokumente.get(d.anlageZu)?.mappeId !== mappeId) {
        delete d.anlageZu;
        delete d.anlageNr;
      }
    },
    async anlagenVon(id) {
      return [...dokumente.values()]
        .filter((d) => d.anlageZu === id)
        .sort((a, b) => (a.anlageNr ?? 0) - (b.anlageNr ?? 0) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
        .map((d) => ({ ...kopie(d), aeltere: versionen.get(d.id)?.length ?? 0 }));
    },
    async setzeAnlage(id, anlageZu, nr, name) {
      const d = dokumente.get(id);
      if (!d) return false;
      if (anlageZu) {
        d.anlageZu = anlageZu;
        d.anlageNr = nr;
      } else {
        delete d.anlageZu;
        delete d.anlageNr;
      }
      if (name !== undefined) d.name = name;
      return true;
    },
    async dokumenteJeRegister(typId) {
      const r = new Map<string, number>();
      for (const d of dokumente.values()) if (mappen.get(d.mappeId)?.typId === typId) r.set(d.registerKey, (r.get(d.registerKey) ?? 0) + 1);
      return r;
    },
  } satisfies RepoTeil;
}

/** Ältere Versionen eines Dokuments (#194). */
export function speicherVersionen(sp: SpeicherKontext) {
  const { dokumente, seitenSpr, versionen, texte } = sp;
  return {
    async versionenVon(id) {
      return [...(versionen.get(id) ?? [])].reverse().map(({ volltext: _v, ...x }) => kopie(x));
    },
    async versionenVonDokumenten(ids) {
      return [...new Set(ids)].flatMap((id) => [...(versionen.get(id) ?? [])].reverse().map(({ volltext: _v, ...x }) => kopie(x)));
    },
    async holeVersion(id, nummer) {
      const v = versionen.get(id)?.find((x) => x.nummer === nummer);
      return v && kopie(v);
    },
    async ersetzeDokument(id, neu) {
      const alt = dokumente.get(id);
      if (!alt) throw new Error('Dokument fehlt');
      const nummer = alt.version ?? 1;
      versionen.set(id, [
        ...(versionen.get(id) ?? []),
        {
          dokumentId: id,
          nummer,
          name: alt.name,
          mime: alt.mime,
          groesse: alt.groesse,
          sha256: alt.sha256,
          anzeigbar: alt.anzeigbar,
          erstellt: alt.erstellt,
          erstelltVon: alt.erstelltVon,
          herkunft: alt.herkunft ?? null,
          volltext: texte.get(id) ?? null,
        },
      ]);
      const uebernehmen = neu.volltext !== undefined && neu.volltext !== null;
      texte.set(id, uebernehmen ? neu.volltext! : null);
      const d: Dokument = {
        ...alt,
        name: neu.name,
        mime: neu.mime,
        groesse: neu.groesse,
        sha256: neu.sha256,
        anzeigbar: neu.anzeigbar,
        erstellt: jetzt(),
        erstelltVon: neu.erstelltVon,
        herkunft: neu.herkunft,
        version: nummer + 1,
        ocr: { stand: uebernehmen ? 'fertig' : 'keiner' },
        weitereSprachen: [],
        teilenAb: null,
      };
      delete d.leerseiten;
      seitenSpr.delete(id);
      dokumente.set(id, d);
      return { ...kopie(d), aeltere: versionen.get(id)!.length };
    },
    async kuerzeVersionen(id, behalten) {
      const v = versionen.get(id) ?? [];
      const weg = v.slice(0, Math.max(0, v.length - Math.max(0, behalten)));
      versionen.set(id, v.slice(weg.length));
      return [...new Set(weg.map((x) => x.sha256))];
    },
    async loescheVersion(id, nummer) {
      const v = versionen.get(id) ?? [];
      const weg = v.find((x) => x.nummer === nummer);
      if (!weg) return null;
      versionen.set(
        id,
        v.filter((x) => x !== weg),
      );
      return weg.sha256;
    },
  } satisfies RepoTeil;
}

/** Dateien über alle Dokumente: Prüfsummen, Arten, große PDFs. */
export function speicherDateien(sp: SpeicherKontext) {
  const { dokumente, versionen, dokKorb, korb } = sp;
  return {
    async alleDateien() {
      return [...dokumente.values()].flatMap((d) => [
        { sha256: d.sha256, groesse: d.groesse, dokumentId: d.id, mappeId: d.mappeId, name: d.name, version: d.version ?? 1 },
        ...(versionen.get(d.id) ?? []).map((v) => ({
          sha256: v.sha256,
          groesse: v.groesse,
          dokumentId: d.id,
          mappeId: d.mappeId,
          name: v.name,
          version: v.nummer,
        })),
      ]);
    },
    async dokumenteMitSha(sha) {
      return [...dokumente.values()].filter((d) => d.sha256 === sha).map(kopie);
    },
    async dokumenteMitTyp(mimes) {
      return [...dokumente.values()]
        .filter((d) => mimes.includes(d.mime))
        .sort((a, b) => a.erstellt.localeCompare(b.erstellt) || a.id.localeCompare(b.id))
        .map(kopie);
    },
    async dokumentTypen() {
      const z: Record<string, number> = {};
      for (const d of dokumente.values()) z[d.mime] = (z[d.mime] ?? 0) + 1;
      return z;
    },
    async grossePdfs(ab, max) {
      return [...dokumente.values()]
        .filter((d) => d.mime === 'application/pdf' && d.groesse >= ab)
        .sort((a, b) => b.groesse - a.groesse)
        .slice(0, max)
        .map((d) => ({ ...kopie(d), aeltere: versionen.get(d.id)?.length ?? 0 }));
    },
    async dateiBenutzt(sha) {
      if ([...dokKorb.values()].some((k) => k.dokument.sha256 === sha || k.versionen.some((v) => v.sha256 === sha))) return true;
      return (
        [...dokumente.values()].some((d) => d.sha256 === sha) ||
        [...versionen.values()].some((v) => v.some((x) => x.sha256 === sha)) ||
        [...korb.values()].some(
          (k) => k.dokumente.some((d) => d.sha256 === sha) || (k.versionen ?? []).some(([, v]) => v.some((x) => x.sha256 === sha)),
        )
      );
    },
  } satisfies RepoTeil;
}
