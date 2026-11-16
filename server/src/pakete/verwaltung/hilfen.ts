/**
 * Hilfen der Paketverwaltung ohne Zustand: Herkunft, Ansichten aus dem Paket, Namen, Meldungen, Geheimnisse.
 */
import { createHash } from 'node:crypto';
import { zieleVon, type Feld, type Mappentyp } from '../../../../shared/src/model';
import { ALLE_TYPEN, type HerkunftPruefung, type InstalliertesPaket } from '../../../../shared/src/pakete';
import { type Archiv } from '../../../../shared/src/archiv';
import { typKennung } from '../../../../shared/src/kennungen';
import { type Bedingung } from '../../../../shared/src/sichten';
import { Fachfehler } from '../../grundlagen/fehler';
import { istVerschluesselt } from '../../geheimnisse/tresor';
import { t } from '../../sprache/sprache';
import { gebietsschema } from '../../../../shared/src/sprache';
import { type UmbauLage } from '../index';
import { type Manifest, type Paket, type PaketCodeTeil, type PaketSicht, type PaketTyp } from './format';
import { bedingungAus } from './inhalt-pruefen';
import { type TypPlan } from './plan';

/** Belegt die Prüfung die Herkunft vom Projekt (offizieller Katalog, Sammeldatei mit seiner Signatur, Prüfsumme dort)? */
export const offiziellBelegt = (p: HerkunftPruefung) => (p.offiziell && p.art !== 'ungueltig') || !!p.katalogversion;

/** Vertrauen einer Herkunft (Sicherheit B): 3 offiziell belegt, 2 signierter weiterer Katalog, 1 sonst. */
export const vertrauen = (p: HerkunftPruefung) => (offiziellBelegt(p) ? 3 : p.art === 'anbieter' ? 2 : 1);

/** Kennungen der Mappentypen aller Pakete einer Sammeldatei (#1084) – neue und alte Schreibweise, für `fremde_typen`. */
export const sammelKennungen = (pakete: Paket[]) =>
  new Set(pakete.flatMap((p) => p.typen.flatMap((t) => [typKennung(p.manifest.id, t.schluessel), `${p.manifest.id}_${t.schluessel}`])));

/** Gleiche Quelle (#1084): derselbe Katalog oder beide hochgeladen – Voraussetzung für einen Umzug auf eine neue Id. */
/** Installiertes Paket unter einer früheren Id des Manifests (#1084, `ersetzt`); das erste, wenn es mehrere gäbe. */
export const installierteErsetzt = (installierte: InstalliertesPaket[], m: Manifest) => installierte.find((p) => m.ersetzt?.includes(p.id));

export const gleicheQuelle = (a: InstalliertesPaket['herkunft'], b: InstalliertesPaket['herkunft']) =>
  a.art === 'katalog' ? b.art === 'katalog' && a.url === b.url : b.art === 'hochgeladen';

/** Ansichten, die trotz Änderung ersetzt werden sollen (#1125): nur Schlüssel. */
export const ersetzenAus = (e: { sichtenErsetzen?: unknown }) =>
  new Set(Array.isArray(e.sichtenErsetzen) ? e.sichtenErsetzen.map(String) : []);

/**
 * Eine Ansicht des Pakets, wie Ablago sie anlegt (#1125: auch zum Vergleichen und Ersetzen). `typId` löst Typverweise auf
 * (null = gibt es nicht), `fremd` die Ids der `fremde_typen`, `zieltypenIn` „zeigt auf Mappe vom Typ …“ (#1036).
 */
export function sichtAusPaket(
  s: PaketSicht,
  x: { typId: (vw: string) => string | null; fremd: string[]; zieltypenIn: (b: Bedingung) => Bedingung },
) {
  const typen = [
    ...new Set([
      ...(s.typen ?? []).map((vw) => (vw === ALLE_TYPEN ? ALLE_TYPEN : x.typId(vw))).filter((y): y is string => !!y),
      ...x.fremd,
    ]),
  ];
  return {
    beschreibung: s.beschreibung ?? '',
    typen,
    bedingungen: (s.bedingungen ?? []).map(bedingungAus).map(x.zieltypenIn),
    trefferliste: s.trefferliste ?? null,
    symbol: s.symbol ?? null,
  };
}

export const modulInfo = (c: PaketCodeTeil) => {
  const m = c.dateien.find((d) => d.name === 'modul.wasm')!.inhalt;
  return { sha256: createHash('sha256').update(m).digest('hex'), groesse: m.length };
};

export const freierName = (name: string, paket: string, belegt: Set<string>) => {
  const k = (n: string) => n.trim().toLowerCase();
  let v = `${name} (${paket})`;
  for (let i = 2; belegt.has(k(v)); i++) v = `${name} (${paket} ${i})`;
  return v;
};

/** Sichten so sortieren, dass Elternsichten zuerst kommen. */
export function nachEltern(sichten: PaketSicht[]): PaketSicht[] {
  const erg: PaketSicht[] = [];
  const rest = [...sichten];
  while (rest.length) {
    const i = rest.findIndex((s) => !s.eltern || !rest.some((r) => r.schluessel === s.eltern));
    erg.push(...rest.splice(i < 0 ? 0 : i, 1));
  }
  return erg;
}

/**
 * Felder eines Typs ohne Verweise auf Typen aus `weg` (außer auf sich selbst) – zum Entfernen von Paketen, deren Typen im
 * Kreis aufeinander zeigen. Mehrere Zieltypen (#1036): nur diese Ziele gehen; das Feld bleibt, solange es andere oder
 * optionale hat.
 */
export function ohneZiele(t: Mappentyp, weg: Set<string>): Feld[] {
  const rest = (f: Feld) => zieleVon(f).filter((z) => !weg.has(z) || z === t.id);
  // Tabellen (#1030) auf Typen aus `weg` gehen mit (sie haben keinen Wert).
  return t.felder.flatMap((f) =>
    f.typ === 'tabelle'
      ? f.quelle && weg.has(f.quelle.typId) && f.quelle.typId !== t.id
        ? []
        : [f]
      : f.typ !== 'referenz' || rest(f).length === zieleVon(f).length
        ? [f]
        : rest(f).length || f.zielOptional?.length
          ? [{ ...f, zielTypen: rest(f) }]
          : [],
  );
}

/** Archivmodus aus dem Typplan (#1051) ohne die Beschriftung des Stichtags. */
export const archivOhneName = ({ jahre, stichtag, leererStichtag }: NonNullable<TypPlan['archiv']>): Archiv => ({
  jahre,
  stichtag,
  ...(leererStichtag ? { leererStichtag } : {}),
});

export const meldungen = (e: unknown): string => {
  if (!(e instanceof Error)) return String(e);
  const d = (e as Fachfehler).details as { allgemein?: string[]; felder?: Record<string, string[]>; gruende?: string[] } | undefined;
  const mehr = [...(d?.allgemein ?? []), ...Object.values(d?.felder ?? {}).flat(), ...(d?.gruende ?? [])];
  return mehr.length ? `${e.message} ${mehr.join(' ')}` : e.message;
};

/** Vorschau eines Typs, den ein Umbau-Schritt übernimmt (#1041): Name des Pakets, Konflikt ohne den alten Typ selbst. */
export function uebernahmePlan(
  paketTyp: PaketTyp,
  umbau: UmbauLage,
  x: { m: Manifest; namen: Record<string, string>; typen: Mappentyp[]; geplant?: { typen: Set<string> }; belegt: Set<string> },
): TypPlan | null {
  const alt = umbau.schritte.find((g) => g.plan.art === 'uebernehmen' && g.eigenerZiel === paketTyp.schluessel)?.alt;
  if (!alt) return null;
  const name = (x.namen[paketTyp.schluessel] ?? paketTyp.name).trim();
  const andere = new Set([...x.typen.filter((y) => y.id !== alt.id).map((y) => y.name.trim().toLowerCase()), ...(x.geplant?.typen ?? [])]);
  const konflikt = andere.has(name.toLowerCase()) ? t('meldungen.pakete.einen-mappentyp-gibt-es', { name }) : null;
  x.belegt.add(name.toLowerCase());
  return {
    schluessel: paketTyp.schluessel,
    dmsSchluessel: typKennung(x.m.id, paketTyp.schluessel),
    name,
    felder: paketTyp.felder.length,
    vorhanden: false,
    neueFelder: [],
    neueRegister: [],
    konflikt,
    vorschlag: konflikt ? freierName(name, x.m.name, andere) : null,
    uebernimmt: alt.name,
  };
}

/** Felder eines Pakettyps, wie Ablago sie anlegt – für die Vorschau des Umbaus (#1041); Verweisziele zählen dort nicht. */
export const paketFelderAus = (ty: PaketTyp | undefined, paketId: string): Feld[] =>
  (ty?.felder ?? []).map((pf) => {
    const f: Record<string, unknown> = { ...pf, ...(pf.berechnet === true ? { berechnetVon: paketId } : {}) };
    for (const k of ['ziel', 'zielOptional', 'berechnet', 'quelle']) delete f[k];
    return f as unknown as Feld;
  });

export const zeitText = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(gebietsschema(), { dateStyle: 'medium', timeStyle: 'short' });
};

/**
 * Herkunft nicht bestätigt (#189, #594). Aus dem offiziellen Katalog ohne bzw. mit nicht abrufbarer Signatur (#1351)
 * eine eigene Meldung – „kommt nicht aus dem offiziellen Katalog“ träfe dort nicht zu.
 */
export const herkunftFehler = (p: HerkunftPruefung, offiziellerKatalog = false) =>
  new Fachfehler(
    409,
    p.art === 'ungueltig'
      ? t('pakete.herkunft.fehler.ungueltig')
      : offiziellerKatalog && (p.art === 'unsigniert' || p.art === 'nichtgeprueft')
        ? t('pakete.herkunft.fehler.offiziell')
        : t('meldungen.pakete.dieses-paket-kommt-nicht'),
    { warnung: true },
  );

/** Fassungen (#1006): Geheimnisse (verschlüsselt gespeichert) nur als „gesetzt“ – nie der Wert, auch nicht verschlüsselt. */
export function ohneGeheimnisse(w: unknown): Record<string, unknown> {
  const maske = (v: unknown): unknown =>
    istVerschluesselt(v)
      ? { gesetzt: true }
      : Array.isArray(v)
        ? v.map(maske)
        : v && typeof v === 'object'
          ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, maske(x)]))
          : v;
  return (w && typeof w === 'object' ? maske(w) : {}) as Record<string, unknown>;
}
