/**
 * Beispiele, Wortlisten, Rundgänge, Tipps und Automatisierungen ins Paket (#1278, Schritt 6a; vorher Teil von `baue`).
 */
import { istLeer, type Mappe, type Mappentyp } from '../../../../shared/src/model';
import { BEISPIEL_ENDUNGEN, inMB, WORTLISTEN_MAX } from '../../../../shared/src/pakete';
import { liesWortgruppe } from '../../../../shared/src/suche';
import { t } from '../../sprache/sprache';
import { ARCHIV_MAX } from '../verwaltung/zip-lesen';
import { beispielDateiart } from '../verwaltung/beispiele';
import { mitId } from './bau-hilfen';
import { abhaengig, type BauLauf, hinweis } from './bau-lauf';
import { automatisierungenInsPaket, rundgaengeInsPaket, tippsInsPaket } from './ins-paket';

type Beispiel = { typ: string; schluessel: string; werte: Record<string, unknown> };

/** Gewählte Mappen der eigenen Typen als Beispiele: ohne Passwörter, Verweise nur auf andere Beispiele. */
function beispielMappen(l: BauLauf, eigene: Mappentyp[]) {
  const { d, schluessel } = l;
  const exportiert = new Map(eigene.map((t) => [t.id, t] as const));
  const bsp = d.mappen.filter((m) => exportiert.has(m.typId) && !m.systemKennung);
  if (d.mappen.length > bsp.length) hinweis(l, t('meldungen.paketerstellung.beispiel-mappen-gehen-nur'));
  const bspKey = new Map(bsp.map((m, i) => [m.id, `beispiel_${i + 1}`] as const));
  let beispielVerweise = false;
  let ohneZiel = 0;
  const beispiele: Beispiel[] = bsp.map((m) => {
    const t = exportiert.get(m.typId)!;
    const werte: Record<string, unknown> = {};
    for (const f of t.felder) {
      const w = m.werte[f.key];
      if (f.system || f.typ === 'passwort' || istLeer(w)) continue;
      if (f.typ === 'referenz') {
        const l = (Array.isArray(w) ? w : [w]).filter((x): x is string => typeof x === 'string');
        const z = l.filter((x) => bspKey.has(x)).map((x) => ({ beispiel: bspKey.get(x)! }));
        ohneZiel += l.length - z.length;
        if (z.length) {
          beispielVerweise = true;
          werte[f.key] = f.mehrfach ? z : z[0];
        }
        continue;
      }
      if (f.typ === 'betrag' && w && typeof w === 'object' && 'betrag' in w) {
        const b = w as { betrag: unknown; waehrung?: string };
        werte[f.key] =
          (b.waehrung ?? 'EUR') === (f.waehrung || 'EUR') && typeof b.betrag === 'number'
            ? b.betrag
            : { betrag: b.betrag, waehrung: b.waehrung };
        continue;
      }
      if (mitId(w)) continue;
      werte[f.key] = w;
    }
    return { typ: schluessel[t.id], schluessel: bspKey.get(m.id)!, werte };
  });
  return { bsp, beispiele, beispielVerweise, ohneZiel };
}

/** Beispiel-Dokumente (#878): unter inhalt/beispiele/<beispiel>/; der Name in Ablago wird zum Titel. */
function beispielDokumente(l: BauLauf, bsp: Mappe[], beispiele: Beispiel[]): Array<{ name: string; daten: Buffer }> {
  const { e, d, probleme } = l;
  const dokDateien: Array<{ name: string; daten: Buffer }> = [];
  if (e.beispielDokumente) {
    for (const [i, m] of bsp.entries()) {
      const liste = d.dokumente?.get(m.id) ?? [];
      if (!liste.length) continue;
      const belegt = new Set<string>();
      const ordner = `beispiele/${beispiele[i].schluessel}`;
      (beispiele[i] as Record<string, unknown>).dokumente = liste.map((x) => {
        const endung = x.name.slice(x.name.lastIndexOf('.') + 1).toLowerCase();
        const art = beispielDateiart(`a.${endung}`, x.inhalt)
          ? endung
          : Object.entries(BEISPIEL_ENDUNGEN).find(([k]) => beispielDateiart(`a.${k}`, x.inhalt))![0];
        const stamm =
          x.name
            .slice(0, x.name.lastIndexOf('.') > 0 ? x.name.lastIndexOf('.') : undefined)
            .normalize('NFKD')
            .replace(/[̀-ͯ]/g, '')
            .replace(/ß/g, 'ss')
            .replace(/[^A-Za-z0-9_-]+/g, '-')
            .replace(/^[-.]+|-+$/g, '')
            .slice(0, 80) || 'dokument';
        let datei = `${stamm}.${art}`;
        for (let n = 2; belegt.has(datei.toLowerCase()); n++) datei = `${stamm}-${n}.${art}`;
        belegt.add(datei.toLowerCase());
        dokDateien.push({ name: `inhalt/${ordner}/${datei}`, daten: x.inhalt });
        return { datei: `${ordner}/${datei}`, titel: x.name, datum: x.erstellt.slice(0, 10), register: x.registerKey };
      });
    }
    if (d.dokumenteZuGross)
      probleme.push(t('pakete.groesse.erstellenZuGross', { groesse: inMB(d.dokumenteZuGross), max: inMB(ARCHIV_MAX) }));
    if (dokDateien.length) hinweis(l, t('meldungen.paketerstellung.beispiel-dokumente-kommen-mit', { anzahl: dokDateien.length }));
    if (d.dokumenteAusgelassen)
      hinweis(l, t('meldungen.paketerstellung.beispiel-dokumente-ausgelassen', { anzahl: d.dokumenteAusgelassen }));
  }
  return dokDateien;
}

/** 5. Beispiele: nur ausdrücklich gewählte Mappen der eigenen Typen, ohne Passwörter und ohne Ids. */
export function beispieleInsPaket(l: BauLauf, eigene: Mappentyp[]) {
  const { bsp, beispiele, beispielVerweise, ohneZiel } = beispielMappen(l, eigene);
  const dokDateien = beispielDokumente(l, bsp, beispiele);
  if (ohneZiel) hinweis(l, t('meldungen.paketerstellung.beispiel-mappen-verweise-zeigen', { anzahl: ohneZiel }));
  if (bsp.length)
    hinweis(
      l,
      l.e.beispielDokumente
        ? t('meldungen.paketerstellung.beispiel-mappen-aus-deiner-mit-dokumenten', { bsp: bsp.length })
        : t('meldungen.paketerstellung.beispiel-mappen-aus-deiner', { bsp: bsp.length }),
    );
  return { beispiele, beispielVerweise, dokDateien };
}

/** 6. Wortlisten (#661): nur eigene Gruppen; aus Paketen nicht kopiert. Doppelte Wörter in einer Gruppe zusammengefasst. */
export function wortlistenInsPaket(l: BauLauf): Array<{ woerter: string[] }> {
  const { e, d, abh, probleme } = l;
  const wortlisten: Array<{ woerter: string[] }> = [];
  for (const wid of new Set(e.wortlisten ?? [])) {
    const g = (d.wortlisten ?? []).find((x) => x.id === wid);
    if (!g) {
      probleme.push(t('meldungen.paketerstellung.eine-gewaehlte-wortliste-gibt'));
      continue;
    }
    if (g.quelle !== 'werkbank') {
      const p = d.pakete.find((x) => x.id === g.quelle);
      if (p && abh[p.id])
        hinweis(l, t('meldungen.paketerstellung.die-wortliste-kommt-ueber', { woerter: g.woerter.join(', '), name: p.name }));
      else
        hinweis(l, t('meldungen.paketerstellung.die-wortliste-gehoert-zum', { woerter: g.woerter.join(', '), wert: p?.name ?? g.quelle }));
      continue;
    }
    const w = liesWortgruppe(g.woerter).woerter;
    if (w.length >= 2) wortlisten.push({ woerter: w });
  }
  if (wortlisten.length > WORTLISTEN_MAX) probleme.push(t('meldungen.paketerstellung.wortlisten-hoechstens-gruppen', { WORTLISTEN_MAX }));
  if (wortlisten.length) hinweis(l, t('meldungen.paketerstellung.gruppen-gleichbedeutender-woerter', { anzahl: wortlisten.length }));
  return wortlisten;
}

/** 7.–9. Eigene Rundgänge, Tipps und Automatisierungen: Mappentypen werden zu Schlüsseln im Paket bzw. zu Abhängigkeiten. */
export function entdeckenInsPaket(l: BauLauf) {
  const { e, d, schluessel, typPaket, probleme } = l;
  const abh = (p: Parameters<typeof abhaengig>[1]) => abhaengig(l, p);
  // 7. Eigene Rundgänge (#941): Mappentypen werden zu Schlüsseln im Paket bzw. zu Abhängigkeiten.
  const rundgaenge = rundgaengeInsPaket(e.rundgaenge ?? [], d, { schluessel, typPaket, abhaengig: abh, probleme });
  if (rundgaenge.length) hinweis(l, t('meldungen.paketerstellung.rundgaenge', { anzahl: rundgaenge.length }));
  // 8. Eigene Tipps (#942): Rundgänge nur, wenn sie als eigene mitkommen; Anpassungen fremder Tipps nicht (#654).
  const tipps = tippsInsPaket(e.tipps ?? [], e.rundgaenge ?? [], d, { schluessel, typPaket, abhaengig: abh, probleme });
  if (tipps.length) hinweis(l, t('meldungen.paketerstellung.tipps', { anzahl: tipps.length }));
  // 9. Eigene Automatisierungen (#680): Typen wie bei Rundgängen; feste Personen und Rollen werden zum Ersteller der Mappe.
  const automatisierungen = automatisierungenInsPaket(
    e.automatisierungen ?? [],
    d,
    { schluessel, typPaket, abhaengig: abh, probleme },
    (h) => hinweis(l, h),
  );
  if (automatisierungen.length) hinweis(l, t('meldungen.paketerstellung.automatisierungen', { anzahl: automatisierungen.length }));
  return { rundgaenge, tipps, automatisierungen };
}
