/**
 * Mappentypen-Datei einspielen (#1315): planen, was neu ist, was es schon gibt (gleiche Kennung) und was sich ändern
 * würde – ohne Datenbank, die Lage kommt herein. Typverweise der Datei (Kennungen) werden hier zu Ids.
 *
 * Regeln (Ergänzung Sicherheit):
 * - Typen, die einem Paket gehören, ändert die Datei nie – das geht als Nachtrag (#654); eine solche Kennung verhindert
 *   das Einspielen.
 * - Vorhandene Typen werden nicht abgeschwächt: Archivmodus, Aufbewahrungsfrist, Sperre bis zum Stichtag und Pflichtfelder
 *   bleiben, die Feldart eines Felds mit Werten ebenso. Solche Änderungen stehen rot in der Vorschau und werden nicht
 *   übernommen; Verschärfen ist erlaubt. Felder und Register, die nicht in der Datei stehen, bleiben; Rechte,
 *   Trefferlisten und die übrigen Einstellungen des Typs auch.
 * - Neue Typen sind wie jeder neue Typ für Dienste im Netz gesperrt (#796) – die Datei kann daran nichts ändern.
 */
import { type Archiv, type Feld, type Mappentyp, type MappentypDaten, type Register } from '../../../../shared/src/model';
import type { InstalliertesPaket } from '../../../../shared/src/pakete';
import type { TypenAenderung } from '../../../../shared/src/typendatei';
import { t } from '../../sprache/sprache';
import { anzeigeMitVorgaben, anzeigeTypIds } from '../index';
import { istObjekt, type PaketFeld, type PaketTyp, paketZiele, str } from '../verwaltung/format';
import { wiederfindenAus } from '../verwaltung/update-neu';
import { bereinigeFeld } from '../../mappentypen/index';
import type { TypenDatei } from './typen-lesen';

/** Was das Planen von dieser Installation braucht. */
export interface EinspielLage {
  typen: Mappentyp[];
  pakete: InstalliertesPaket[];
  /** Typen, auf die mit dms:… verwiesen wird: Id → Kennung (benutzer, rolle, ablageort). */
  dmsTypen: Map<string, string>;
  /** Vorgaben aus Paketen (#1038), auf die Anzeige-Bedingungen zeigen: Verweis `paket:schluessel` → Id der Mappe. */
  vorgaben: Map<string, string>;
}

type Eingabe = MappentypDaten & { id?: string; sichtAnlegen?: boolean; stand?: string };

interface GeplanterTyp {
  kennung: string;
  name: string;
  id: string;
  neu: boolean;
  eingabe: Eingabe;
  aenderungen: TypenAenderung[];
}

export interface EinspielPlan {
  typen: GeplanterTyp[];
  abhaengigkeiten: Array<{ kennung: string; name: string }>;
  probleme: string[];
}

const archivAus = (a: PaketTyp['archiv']): Archiv | null =>
  a
    ? {
        jahre: a.jahre,
        stichtag: a.stichtag ?? null,
        ...(a.stichtag && a.leererStichtag === 'laeuftNicht' ? { leererStichtag: 'laeuftNicht' as const } : {}),
      }
    : null;

/**
 * Vergleich zweier Felder bzw. Register: wie gespeichert (`bereinigeFeld`), ohne leere Angaben und ohne, was Ablago selbst
 * setzt oder nur aus Paketen kommt.
 */
const OHNE = ['system', 'berechnetVon', 'merkmal', 'schreibschutz', 'ausText', 'wiederfinden', 'quellen', 'abschnitte'];
const leer = (v: unknown) => v === undefined || v === null || v === false || v === '' || (Array.isArray(v) && !v.length);
const vergleich = (f: object) =>
  JSON.stringify(
    Object.entries(f)
      .filter(([k, v]) => !leer(v) && !OHNE.includes(k))
      .sort(([a], [b]) => a.localeCompare(b)),
  );
const feldVergleich = (f: Feld) => vergleich(bereinigeFeld(f));

/** Typverweise der Datei → Ids dieser Installation; was fehlt, steht in `fehlt`. */
function aufloeser(lage: EinspielLage, ids: Map<string, string>) {
  const fehlt = new Set<string>();
  const abh = new Map<string, string>();
  const paketVon = (id: string) => lage.pakete.find((p) => Object.values(p.typen).includes(id));
  const ziel = (vw: string): string | null => {
    let id: string | undefined;
    if (vw.startsWith('dms:')) id = [...lage.dmsTypen].find(([, k]) => `dms:${k}` === vw)?.[0];
    else if (vw.includes(':')) {
      const [p, s] = vw.split(':');
      id = lage.pakete.find((x) => x.id === p)?.typen[s];
      if (id && !lage.typen.some((x) => x.id === id)) id = undefined;
    } else id = ids.get(vw) ?? lage.typen.find((x) => x.schluessel === vw && !x.system && !paketVon(x.id))?.id;
    if (!id) fehlt.add(vw);
    else if (!ids.has(vw) && !vw.startsWith('dms:')) abh.set(vw, lage.typen.find((x) => x.id === id)?.name ?? vw);
    return id ?? null;
  };
  // Optionale Ziele (#1036): ein Typ eines anderen Pakets, wenn es ihn gibt – sonst still nichts.
  const optional = (vw: string): string | null => {
    const [p, s] = vw.split(':');
    const id = lage.pakete.find((x) => x.id === p)?.typen[s];
    return id && lage.typen.some((x) => x.id === id) ? id : null;
  };
  const anzeige = (roh: unknown, felder: PaketFeld[]) =>
    anzeigeTypIds(
      anzeigeMitVorgaben(roh, (vw) => lage.vorgaben.get(vw) ?? null),
      felder,
      (vw) => ziel(vw) ?? vw,
      optional,
    );
  return { ziel, optional, anzeige, fehlt, abh, paketVon };
}

type Aufloeser = ReturnType<typeof aufloeser>;

/** Ein Typ der Datei als Eingabe für das Anlegen bzw. Ändern. */
function eingabeVon(pt: PaketTyp, id: string, a: Aufloeser): Eingabe {
  const felder = pt.felder.map(({ ziel: z, zielOptional: opt, quelle: q, ...f }) => ({
    ...f,
    wiederfinden: wiederfindenAus({ ziel: z, ...f } as PaketFeld),
    ...(f.typ === 'referenz'
      ? {
          zielTypen: [...new Set([...paketZiele({ ziel: z }).map(a.ziel), ...(opt ?? []).map(a.optional)].filter((x): x is string => !!x))],
        }
      : {}),
    ...(opt?.length ? { zielOptional: opt } : {}),
    ...(f.anzeigen ? { anzeigen: a.anzeige(f.anzeigen, pt.felder) } : {}),
    ...(f.typ === 'tabelle' && q
      ? { quelle: { typId: a.ziel(str(q.typ)) ?? '', feldKey: str(q.feld), ...(q.neu ? { neu: str(q.neu) } : {}) } }
      : {}),
  })) as unknown as Feld[];
  const register = pt.register.map((r) => ({
    ...r,
    ...(r.quellen
      ? { quellen: r.quellen.map((q) => ({ typId: a.ziel(str(q.typ)) ?? '', feldKey: str(q.feld) })).filter((q) => q.typId) }
      : {}),
    ...(Array.isArray(r.abschnitte)
      ? {
          abschnitte: (r.abschnitte as unknown[]).map((x) =>
            istObjekt(x) && x.anzeigen ? { ...x, anzeigen: a.anzeige(x.anzeigen, pt.felder) } : x,
          ),
        }
      : {}),
  })) as unknown as Register[];
  return {
    id,
    name: pt.name,
    schluessel: pt.schluessel,
    beschreibung: pt.beschreibung,
    titelVorlage: pt.titelVorlage ?? '',
    felder,
    register,
    ...(pt.trefferliste ? { trefferliste: pt.trefferliste } : {}),
    ...(pt.beschriftungen ? { beschriftungen: pt.beschriftungen } : {}),
    ...(pt.ausPost !== undefined ? { ausPost: pt.ausPost } : {}),
    ...(pt.erkennbarAn ? { erkennbarAn: pt.erkennbarAn } : {}),
    ...(pt.mehrzahl ? { mehrzahl: pt.mehrzahl } : {}),
    ...(pt.inSuche !== undefined ? { inSuche: pt.inSuche } : {}),
    teilVon: pt.gehoertZu ?? null,
    archiv: archivAus(pt.archiv),
  };
}

/** Archivmodus: nur verschärfen (einschalten, Frist verlängern, Sperre bis zum Stichtag dazu). */
function archivNachher(alt: Archiv | null | undefined, neu: Archiv | null | undefined, aend: TypenAenderung[]): Archiv | null {
  const a = alt ?? null;
  const n = neu ?? null;
  if (JSON.stringify(a) === JSON.stringify(n)) return a;
  const schwaecher =
    !!a && (!n || n.jahre < a.jahre || (n.stichtag ?? null) !== (a.stichtag ?? null) || (!!a.leererStichtag && !n.leererStichtag));
  if (schwaecher) {
    aend.push({ text: t('meldungen.paketerstellung.typen-archiv-schwaecher'), abgelehnt: true });
    return a;
  }
  aend.push({ text: t('meldungen.paketerstellung.typen-archiv', { jahre: n!.jahre }) });
  return n;
}

/** Felder: aus der Datei ersetzt oder neu; Pflicht und Feldart vorhandener Felder bleiben; eigene bleiben. */
function felderNachher(alt: Mappentyp, neu: Feld[], aend: TypenAenderung[]): Feld[] {
  const felder = alt.felder.map((f) => {
    const n = neu.find((x) => x.key === f.key);
    if (!n || f.system || feldVergleich(f) === feldVergleich(n)) return f;
    if (n.typ !== f.typ) {
      aend.push({ text: t('meldungen.paketerstellung.typen-feldart', { feld: f.label }), abgelehnt: true });
      return f;
    }
    const x = { ...n };
    if (f.pflicht && !x.pflicht) {
      aend.push({ text: t('meldungen.paketerstellung.typen-pflicht', { feld: f.label }), abgelehnt: true });
      x.pflicht = true;
    }
    if (feldVergleich(f) !== feldVergleich(x)) aend.push({ text: t('meldungen.paketerstellung.typen-feld-geaendert', { feld: x.label }) });
    return x;
  });
  for (const n of neu.filter((x) => !alt.felder.some((f) => f.key === x.key))) {
    aend.push({ text: t('meldungen.paketerstellung.typen-feld-neu', { feld: n.label }) });
    felder.push(n);
  }
  return felder;
}

/** Register: aus der Datei ersetzt oder neu, eigene bleiben; jedes Feld liegt danach auf genau einem Register. */
function registerNachher(alt: Mappentyp, neu: Register[], felder: Feld[], aend: TypenAenderung[]): Register[] {
  const ausDatei = new Set(neu.filter((r) => r.art === 'felder').flatMap((r) => r.felder ?? []));
  const register = alt.register.map((r) => {
    const n = neu.find((x) => x.key === r.key);
    if (!n) return r.art === 'felder' ? { ...r, felder: (r.felder ?? []).filter((k) => !ausDatei.has(k)) } : r;
    if (n.art !== r.art) {
      aend.push({ text: t('meldungen.paketerstellung.typen-register-art', { register: r.name }), abgelehnt: true });
      return r;
    }
    // Felder, die bisher hier lagen und die Datei nirgends hinlegt, bleiben hier.
    const x = n.art === 'felder' ? { ...n, felder: [...(n.felder ?? []), ...(r.felder ?? []).filter((k) => !ausDatei.has(k))] } : n;
    if (vergleich(r) !== vergleich(x)) aend.push({ text: t('meldungen.paketerstellung.typen-register-geaendert', { register: x.name }) });
    return x;
  });
  for (const n of neu.filter((x) => !alt.register.some((r) => r.key === x.key))) {
    aend.push({ text: t('meldungen.paketerstellung.typen-register-neu', { register: n.name }) });
    register.push(n);
  }
  return register.map((r) => (r.art === 'felder' ? { ...r, felder: (r.felder ?? []).filter((k) => felder.some((f) => f.key === k)) } : r));
}

/** Vorhandener Typ mit den Angaben der Datei – ohne ihn abzuschwächen; Rechte und Trefferlisten bleiben. */
function vereine(alt: Mappentyp, neu: Eingabe, aend: TypenAenderung[]): Eingabe {
  const { id: _i, erstellt: _e, geaendert, berechtigungen: _b, ...rest } = alt;
  const texte = {
    name: t('meldungen.paketerstellung.typen-name', { name: neu.name }),
    beschreibung: t('meldungen.paketerstellung.typen-beschreibung'),
    titelVorlage: t('meldungen.paketerstellung.typen-titel'),
    erkennbarAn: t('meldungen.paketerstellung.typen-erkennbar'),
    mehrzahl: t('meldungen.paketerstellung.typen-mehrzahl'),
  };
  for (const k of Object.keys(texte) as Array<keyof typeof texte>)
    if (neu[k] !== undefined && (neu[k] ?? '') !== (alt[k] ?? '')) aend.push({ text: texte[k] });
  const felder = felderNachher(alt, neu.felder, aend);
  return {
    ...rest,
    name: neu.name,
    beschreibung: neu.beschreibung,
    titelVorlage: neu.titelVorlage,
    ...(neu.erkennbarAn !== undefined ? { erkennbarAn: neu.erkennbarAn } : {}),
    ...(neu.mehrzahl !== undefined ? { mehrzahl: neu.mehrzahl } : {}),
    ...(neu.beschriftungen ? { beschriftungen: neu.beschriftungen } : {}),
    felder,
    register: registerNachher(alt, neu.register, felder, aend),
    archiv: archivNachher(alt.archiv, neu.archiv, aend),
    stand: geaendert,
  };
}

/** Plan: je Typ der Datei neu oder vorhanden (mit Änderungen); Verweise aufgelöst; Probleme verhindern das Einspielen. */
export function planeEinspielen(datei: TypenDatei, lage: EinspielLage, neueId: () => string): EinspielPlan {
  const probleme: string[] = [];
  const ids = new Map<string, string>();
  const paketVon = (id: string) => lage.pakete.find((p) => Object.values(p.typen).includes(id));
  for (const pt of datei.typen) {
    const alt = lage.typen.find((x) => x.schluessel === pt.schluessel);
    // Kennung eines Typs aus einem Paket (#654) oder eines Systemtyps: nie über die Datei.
    if (alt && (alt.system || paketVon(alt.id)))
      probleme.push(t('meldungen.paketerstellung.typen-paket', { name: alt.name, paket: paketVon(alt.id)?.name ?? 'Ablago' }));
    ids.set(pt.schluessel, alt?.id ?? neueId());
  }
  const a = aufloeser(lage, ids);
  const typen = datei.typen.map((pt): GeplanterTyp => {
    const id = ids.get(pt.schluessel)!;
    const alt = lage.typen.find((x) => x.id === id);
    const eingabe = eingabeVon(pt, id, a);
    const aenderungen: TypenAenderung[] = [];
    return alt
      ? { kennung: pt.schluessel, name: alt.name, id, neu: false, eingabe: vereine(alt, eingabe, aenderungen), aenderungen }
      : { kennung: pt.schluessel, name: pt.name, id, neu: true, eingabe, aenderungen };
  });
  for (const vw of a.fehlt) probleme.push(t('meldungen.paketerstellung.typen-fehlt', { vw }));
  return { typen, abhaengigkeiten: [...a.abh].map(([kennung, name]) => ({ kennung, name })), probleme };
}
