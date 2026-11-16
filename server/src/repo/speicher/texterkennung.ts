/** Texterkennung und Volltext (Arbeitsspeicher): Aufträge, Ergebnis, Sprachen (#400, #579), Leerseiten. */
import { teilenAb } from '../../../../shared/src/seitensprachen';
import { SPRACHE_MARKE, spracheAusInfo } from '../../../../shared/src/textsprache';
import { volltextHerkunft } from '../../../../shared/src/volltext';
import type { RepoTeil } from '..';
import { jetzt, kopie } from './hilfen';
import type { SpeicherKontext } from './kontext';

/** Aufträge der Texterkennung: einreihen, holen, Ergebnis setzen, zählen. */
export function speicherTexterkennung(sp: SpeicherKontext) {
  const { mappen, dokumente, seitenSpr, texte } = sp;
  return {
    async ocrEinreihen(ids) {
      for (const id of ids) {
        const d = dokumente.get(id);
        if (d) d.ocr = { stand: 'wartet' };
      }
    },
    async ocrNaechster() {
      const d = [...dokumente.values()].filter((x) => x.ocr?.stand === 'wartet').sort((a, b) => a.erstellt.localeCompare(b.erstellt))[0];
      if (!d) return undefined;
      d.ocr = { ...d.ocr!, stand: 'laeuft', zeit: jetzt() };
      return kopie(d);
    },
    async ocrSetze(id, e) {
      const d = dokumente.get(id);
      if (!d) return;
      d.ocr = { stand: e.stand, info: e.info ?? null, seiten: e.seiten ?? null, zeit: jetzt() };
      if (e.text !== undefined) texte.set(id, e.text);
      if (e.sprache !== undefined) d.sprache = e.sprache;
      if (e.text !== undefined || e.weitere !== undefined) d.weitereSprachen = e.weitere ?? [];
      if (e.text !== undefined || e.seitensprachen !== undefined) {
        if (e.seitensprachen?.length) seitenSpr.set(id, e.seitensprachen);
        else seitenSpr.delete(id);
        d.teilenAb = teilenAb(e.seitensprachen);
      }
    },
    async ocrVonSha(sha, ausser) {
      const d = [...dokumente.values()].find(
        (x) => x.sha256 === sha && x.id !== ausser && x.ocr?.stand === 'fertig' && texte.get(x.id) != null,
      );
      return d
        ? {
            text: texte.get(d.id)!,
            seiten: d.ocr?.seiten ?? null,
            info: d.ocr?.info ?? null,
            sprache: d.sprache ?? null,
            weitere: d.weitereSprachen ?? null,
            seitensprachen: seitenSpr.get(d.id) ?? null,
          }
        : undefined;
    },
    async ocrZurueckstellen() {
      let n = 0;
      for (const d of dokumente.values())
        if (d.ocr?.stand === 'laeuft') {
          d.ocr = { ...d.ocr, stand: 'wartet' };
          n++;
        }
      return n;
    },
    async ocrZaehler() {
      const z = { keiner: 0, wartet: 0, laeuft: 0, fertig: 0, fehler: 0, ausgelassen: 0, paket: 0 };
      for (const d of dokumente.values()) z[d.ocr?.stand ?? 'keiner']++;
      return z;
    },
    async ocrAuftraege({ stand, von, anzahl }) {
      const alle = [...dokumente.values()]
        .filter((d) => (d.ocr?.stand ?? 'keiner') === stand && mappen.has(d.mappeId))
        .sort((a, b) => (b.ocr?.zeit ?? b.erstellt).localeCompare(a.ocr?.zeit ?? a.erstellt));
      return {
        gesamt: alle.length,
        eintraege: alle
          .slice(von, von + anzahl)
          .map((d) => ({ dokument: kopie(d), mappeTitel: mappen.get(d.mappeId)!.titel ?? '', typId: mappen.get(d.mappeId)!.typId })),
      };
    },
    async ocrOhneVolltext() {
      return [...dokumente.values()]
        .filter((d) => (d.ocr?.stand ?? 'keiner') === 'keiner' && mappen.has(d.mappeId))
        .map((d) => ({ id: d.id, typId: mappen.get(d.mappeId)!.typId, registerKey: d.registerKey }));
    },
  } satisfies RepoTeil;
}

/** Sprache, Seitensprachen und Leerseiten eines Dokuments; Volltext lesen. */
export function speicherVolltext(sp: SpeicherKontext) {
  const { mappen, dokumente, seitenSpr, texte } = sp;
  return {
    async setzeDokumentSprache(id, sprache, weitere) {
      const d = dokumente.get(id);
      if (!d) return false;
      d.sprache = sprache;
      if (weitere !== undefined) {
        d.weitereSprachen = weitere;
        seitenSpr.delete(id);
        d.teilenAb = null;
      } else d.weitereSprachen = (d.weitereSprachen ?? []).filter((k) => k !== sprache);
      if (d.ocr?.info)
        d.ocr = {
          ...d.ocr,
          info: d.ocr.info.replace(/ · Sprache: [a-z_]{3,10}( \(\d{1,3} %\))?/, '') + (sprache ? `${SPRACHE_MARKE}${sprache}` : ''),
        };
      return true;
    },
    async seitensprachen(id) {
      return seitenSpr.get(id) ?? null;
    },
    async teilenHinweisAus(id) {
      const d = dokumente.get(id);
      if (!d) return false;
      d.teilenAb = null;
      return true;
    },
    async setzeLeerseiten(id, l) {
      const d = dokumente.get(id);
      if (!d || (l && d.sha256 !== l.sha256)) return false;
      if (l) d.leerseiten = structuredClone(l);
      else delete d.leerseiten;
      return true;
    },
    async volltextKandidaten(umfang) {
      return [...dokumente.values()]
        .filter(
          (d) =>
            mappen.has(d.mappeId) &&
            !['wartet', 'laeuft'].includes(d.ocr?.stand ?? 'keiner') &&
            (umfang === 'alle' || !(texte.get(d.id) ?? '').trim()),
        )
        .sort((a, b) => a.erstellt.localeCompare(b.erstellt))
        .map((d) => ({ id: d.id, typId: mappen.get(d.mappeId)!.typId, registerKey: d.registerKey }));
    },
    async volltextHerkunft() {
      const z = { pdf: 0, paket: 0, api: 0, eingebaut: 0, sonst: 0, ohneText: 0 };
      for (const d of dokumente.values()) {
        if (d.ocr?.stand !== 'fertig') continue;
        if (!(texte.get(d.id) ?? '').trim()) {
          z.ohneText++;
          continue;
        }
        const h = volltextHerkunft(d.ocr);
        z[h?.art === 'pdf' || h?.art === 'paket' || h?.art === 'api' || h?.art === 'eingebaut' ? h.art : 'sonst']++;
      }
      return z;
    },
    async ocrSprachen() {
      const z: Record<string, number> = {};
      for (const d of dokumente.values()) {
        const s = d.ocr?.stand === 'fertig' ? spracheAusInfo(d.ocr.info) : null;
        if (s) z[s.sprache] = (z[s.sprache] ?? 0) + 1;
      }
      return z;
    },
    async volltext(id) {
      return texte.get(id) ?? null;
    },
    async mitVolltext() {
      return [...dokumente.keys()].filter((id) => !!texte.get(id)).length;
    },
    async volltexte(ids) {
      const r = new Map<string, string>();
      for (const id of ids) {
        const t = texte.get(id);
        if (t != null) r.set(id, t);
      }
      return r;
    },
  } satisfies RepoTeil;
}
