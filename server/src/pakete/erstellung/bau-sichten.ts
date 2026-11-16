/**
 * Ansichten ins Paket (#1278, Schritt 6a; vorher Teil von `baue`): Auswahl, Kennungen, Elternansicht, Typen und
 * Bedingungen, Elternansichten zuerst.
 */
import { ALLE_TYPEN } from '../../../../shared/src/pakete';
import { SCHLUESSEL, SCHLUESSEL_MAX, typKennung } from '../../../../shared/src/kennungen';
import type { Bedingung, Sicht, WertAngabe } from '../../../../shared/src/sichten';
import { t } from '../../sprache/sprache';
import { type FremderTyp } from '../verwaltung/format';
import { frei, mitId, ohneLeere } from './bau-hilfen';
import { ausPaket, type BauLauf, hinweis, ziel } from './bau-lauf';

/** Gewählte eigene Ansichten; aus Paketen kommen sie als Abhängigkeit. */
function eigeneSichten(l: BauLauf): Sicht[] {
  const { e, sichtById, sichtPaket, probleme } = l;
  const eigene: Sicht[] = [];
  for (const sid of new Set(e.sichten)) {
    const s = sichtById.get(sid);
    if (!s) {
      probleme.push(t('meldungen.paketerstellung.eine-gewaehlte-ansicht-existiert'));
      continue;
    }
    const h = sichtPaket.get(s.id);
    if (h) ausPaket(l, t('meldungen.paketerstellung.die-ansicht'), s.name, h.p);
    else eigene.push(s);
  }
  return eigene;
}

/** Kennungen der eigenen Ansichten im Paket. */
function vergibSichtSchluessel(l: BauLauf, eigene: Sicht[]) {
  const { d, schluessel } = l;
  const belegtS = new Set<string>();
  for (const s of eigene) {
    const alt = d.entwurf?.schluessel[s.id];
    if (alt && SCHLUESSEL.test(alt) && !belegtS.has(alt) && !Object.values(schluessel).includes(alt)) {
      belegtS.add(alt);
      schluessel[s.id] = alt;
    }
  }
  for (const s of eigene) if (!schluessel[s.id]) schluessel[s.id] = frei(s.name, SCHLUESSEL_MAX, belegtS);
}

const fest = (w: WertAngabe | undefined): unknown => (!w ? undefined : w.art === 'fest' ? w.wert : w);

/** Kennung der Elternansicht im Paket; eine nicht gewählte eigene steht unter „mit aufnehmen“. */
function elternVon(l: BauLauf, s: Sicht, eigene: Sicht[]): string | undefined {
  const { sichtById, schluessel, sichtPaket, fehlend } = l;
  let eltern: string | undefined;
  if (s.elternId) {
    const ep = sichtById.get(s.elternId);
    if (ep && schluessel[ep.id] && eigene.includes(ep)) eltern = schluessel[ep.id];
    else if (ep && sichtPaket.has(ep.id))
      hinweis(l, t('meldungen.paketerstellung.ansicht-steht-unter-aus', { name: s.name, name2: ep.name }));
    else if (ep) {
      hinweis(l, t('meldungen.paketerstellung.ansicht-steht-unter-die', { name: s.name, name2: ep.name }));
      if (!fehlend.some((f) => f.id === ep.id))
        fehlend.push({
          art: 'sicht',
          id: ep.id,
          name: ep.name,
          grund: t('meldungen.paketerstellung.elternansicht-von', { name: s.name }),
          noetig: false,
        });
    }
  }
  return eltern;
}

/** Mappentypen einer Ansicht als Verweise; eigene, nicht gewählte Typen landen in `fremd`. */
function sichtTypen(l: BauLauf, s: Sicht, fremd: FremderTyp[]): string[] {
  const { d, id, typById, schluessel, typPaket, fehlend } = l;
  return s.typen
    .map((tid) => {
      if (tid === ALLE_TYPEN) return ALLE_TYPEN; // „*“ (#725): alle Mappentypen
      const eintrag = typById.get(tid);
      if (eintrag && !schluessel[tid] && !d.dmsTypen.has(tid) && !eintrag.system && !typPaket.has(tid)) {
        const frueher = (d.entwuerfe ?? []).find((x) => x.id !== id && x.schluessel[tid]);
        fremd.push({
          kennung: frueher
            ? typKennung(frueher.id, frueher.schluessel[tid])
            : eintrag.schluessel || frei(eintrag.name, SCHLUESSEL_MAX, new Set()),
          name: eintrag.name,
        });
        hinweis(l, t('meldungen.paketerstellung.ansicht-zeigt-mappen-vom', { name: s.name, name2: eintrag.name }));
        if (!fehlend.some((f) => f.id === eintrag.id))
          fehlend.push({
            art: 'typ',
            id: eintrag.id,
            name: eintrag.name,
            grund: t('meldungen.paketerstellung.vorsicht-steckt-in-der', { name: s.name }),
            noetig: false,
          });
        return null;
      }
      return ziel(l, tid, `Ansicht „${s.name}“`);
    })
    .filter((t): t is string => !!t);
}

/** Bedingungen einer Ansicht fürs Paket; was Ids dieser Installation nennt, fällt mit Hinweis weg. */
function sichtBedingungen(l: BauLauf, s: Sicht): Array<{ feld: string; operator: string; wert?: unknown }> {
  return s.bedingungen.flatMap((b: Bedingung): Array<{ feld: string; operator: string; wert?: unknown }> => {
    // Merkmal der Ablage (#1032): kennt das Paketformat der Ansichten (noch) nicht.
    if (b.art === 'merkmal') {
      hinweis(l, t('meldungen.paketerstellung.ansicht-merkmal', { name: s.name }));
      return [];
    }
    if (b.art !== 'feld') {
      hinweis(l, t('meldungen.paketerstellung.ansicht-bedingungen-auf-anzahlen', { name: s.name }));
      return [];
    }
    // „zeigt auf Mappe vom Typ …“ (#1036): Mappentypen als Typverweis statt Id.
    if (b.op === 'zeigtAufTyp') {
      const ids = b.wert?.art === 'fest' && Array.isArray(b.wert.wert) ? b.wert.wert : [];
      const typen = ids.map((id) => ziel(l, id, `Ansicht „${s.name}“`)).filter((x): x is string => !!x);
      return typen.length ? [{ feld: b.feld, operator: b.op, wert: typen }] : [];
    }
    const w = (b.op === 'zwischen' || b.op === 'ausserhalb') && b.bis ? [fest(b.wert), fest(b.bis)] : fest(b.wert);
    if (mitId(w)) {
      hinweis(l, t('meldungen.paketerstellung.ansicht-eine-bedingung-nennt', { name: s.name }));
      return [];
    }
    return [w === undefined ? { feld: b.feld, operator: b.op } : { feld: b.feld, operator: b.op, wert: w }];
  });
}

/** Eine eigene Ansicht fürs Paket. */
function sichtInsPaket(l: BauLauf, s: Sicht, eigene: Sicht[]) {
  const eltern = elternVon(l, s, eigene);
  // Eigene, nicht gewählte Typen (#656): nur ein Hinweis – der Typ bleibt über seine Kennung in der Ansicht.
  const fremd: FremderTyp[] = [];
  const typen = sichtTypen(l, s, fremd);
  const bedingungen = sichtBedingungen(l, s);
  if (s.trefferliste && s.trefferliste !== 'standard') hinweis(l, t('meldungen.paketerstellung.ansicht-zeigt-im-paket', { name: s.name }));
  if (s.berechtigungen) hinweis(l, t('meldungen.paketerstellung.ansicht-berechtigungen-an-der', { name: s.name }));
  return {
    fremd: fremd.length > 0,
    sicht: ohneLeere({
      schluessel: l.schluessel[s.id],
      name: s.name,
      beschreibung: s.beschreibung || undefined,
      beschriftungen: s.beschriftungen,
      eltern,
      typen,
      fremde_typen: fremd,
      bedingungen,
      symbol: s.symbol || undefined,
    }),
  };
}

/**
 * 4. Ansichten: gewählte eigene samt Kennungen; `paketSichten` in der Reihenfolge der Auswahl, `sortiert` mit den
 * Elternansichten zuerst. `fremdeTypen`: eine Ansicht nennt eigene, nicht gewählte Typen.
 */
export function sichtenInsPaket(l: BauLauf) {
  const eigene = eigeneSichten(l);
  vergibSichtSchluessel(l, eigene);
  let fremdeTypen = false;
  const paketSichten = eigene.map((s) => {
    const x = sichtInsPaket(l, s, eigene);
    if (x.fremd) fremdeTypen = true;
    return x.sicht;
  });
  // Elternansichten zuerst (liest sich besser; das DMS sortiert ohnehin).
  const sortiert: typeof paketSichten = [];
  const offen = [...paketSichten];
  while (offen.length) {
    const i = offen.findIndex(
      (s) => !s.eltern || sortiert.some((x) => x.schluessel === s.eltern) || !offen.some((x) => x.schluessel === s.eltern),
    );
    sortiert.push(...offen.splice(i < 0 ? 0 : i, 1));
  }
  return { paketSichten, sortiert, fremdeTypen };
}
