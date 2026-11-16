/**
 * Gemeinsamer Stand beim Planen einer Vorschau (#1278, Schritt 6a-2; vorher Teil von `plane`): Paket, Angaben des
 * Aufrufs, was in der Ablage ist, und was die Schritte sammeln (Probleme, Fehlercodes, Hinweise) – dazu die Schritte, die
 * ohne die Paketverwaltung auskommen: Sprachpaket, Hinweise, Namen, Ansichten.
 */
import { type Mappentyp } from '../../../../shared/src/model';
import { VERSION, vergleicheVersion, type InstalliertesPaket, type Katalog, type KatalogVersion } from '../../../../shared/src/pakete';
import { type Sicht } from '../../../../shared/src/sichten';
import { t } from '../../sprache/sprache';
import { sichtFassung, sichtZustand } from '../index';
import { abhaengigeTypen, abhaengigkeitsKonflikte, Namensherkunft } from '../index';
import { beispielVerweise } from './beispiele';
import { fremderTyp, type Manifest, type Paket, type PaketSicht, str } from './format';
import { freierName, sichtAusPaket } from './hilfen';
import { type PlanQuelle, type SichtPlan } from './plan';

/** Was `plane` außer dem Paket bekommt (#405: `geplant`, #1084: `quelle`, `sammel`, `ablauf`). */
export interface PlanMehr {
  geplant?: { typen: Set<string>; sichten: Set<string> };
  quelle?: PlanQuelle;
  sammel?: Set<string>;
  ablauf?: boolean;
}

/** Stand einer Planung. */
export interface PlanLauf extends PlanMehr {
  paket: Paket;
  m: Manifest;
  v?: KatalogVersion;
  katalog?: Katalog;
  namen: Record<string, string>;
  sichtNamen: Record<string, string>;
  installierte: InstalliertesPaket[];
  /** Installation dieses Pakets (auch unter einer früheren Id, #1084), sonst null. */
  ich: InstalliertesPaket | null;
  /** Frühere Id beim Umzug, sonst null. */
  umzug: string | null;
  typen: Mappentyp[];
  sichten: Sicht[];
  probleme: string[];
  fehlercodes: string[];
  hinweise: string[];
  dmsVersion: string;
  dmsOk: boolean;
  /** Herausgeber laut Paket, sonst der des Katalogs. */
  herausgeber: string | null;
}

/** Übernahme des früheren Ablageorts (#883): Typen und Ansichten mit der Id des alten. */
export type Uebernahme = { typen: Record<string, string>; sichten: Record<string, string>; name: string } | null;

/** Typverweis → Id. */
export type TypIdVon = (vw: string) => string | null;

/** Ein Problem mit Fehlercode. */
export const problem = (l: PlanLauf, code: string, text: string) => {
  l.probleme.push(text);
  l.fehlercodes.push(code);
};

/** Sprachpaket (#731): je Sprache ein Paket; was zu dieser Version nicht passt, fällt weg (Hinweis). */
export function pruefeSprachpaket(l: PlanLauf) {
  const sp = l.paket.sprache;
  if (!sp) return;
  const anderes = l.installierte.find((p) => p.id !== l.m.id && p.id !== l.umzug && p.sprache?.kennung === sp.angabe.kennung);
  if (anderes) {
    l.probleme.push(t('meldungen.sprachpakete.schon-da', { name: anderes.name, kennung: sp.angabe.kennung }));
    l.fehlercodes.push('sprache-schon-da');
  }
  if (sp.uebergangen.length) l.hinweise.push(t('meldungen.sprachpakete.uebergangen', { anzahl: sp.uebergangen.length }));
  if (VERSION.test(l.dmsVersion) && vergleicheVersion(sp.angabe.ablago, l.dmsVersion) < 0)
    l.hinweise.push(t('meldungen.sprachpakete.aelter', { ablago: sp.angabe.ablago, version: l.dmsVersion }));
}

/** Wortlisten (#356) und Beispiele, die auf Beispiele einer Abhängigkeit zeigen (#347): ohne diese bleiben die Verweise leer. */
export function inhaltsHinweise(l: PlanLauf) {
  const { paket, m } = l;
  // Wortlisten (#356): Gruppen gleichbedeutender Wörter für die Suche.
  if (paket.wortlisten.length) l.hinweise.push(t('meldungen.pakete.bringt-gruppen-gleichbedeutender', { anzahl: paket.wortlisten.length }));
  for (const p of new Set(
    paket.beispiele
      .flatMap((b) => beispielVerweise(b.werte))
      .filter((z) => z.includes(':') && !z.startsWith(`${m.id}:`))
      .map((z) => z.split(':')[0]),
  )) {
    const da = l.installierte.find((x) => x.id === p);
    if (da && !Object.keys(da.beispiele ?? {}).length)
      l.hinweise.push(t('meldungen.pakete.einige-beispiele-zeigen-auf', { name: da.name }));
  }
}

/**
 * Belegte Namen von Mappentypen (vorhandene und geplante) und Namenskonflikte (#1123) durch Typen von Abhängigkeiten,
 * die mitinstalliert würden (im Ablauf und in der Sammeldatei sind sie eigene Pakete des Plans).
 */
export function belegteNamen(l: PlanLauf) {
  const { typen, sichten, installierte, m } = l;
  const belegt = new Set([...typen.map((t) => t.name.trim().toLowerCase()), ...(l.geplant?.typen ?? [])]);
  const abhaengig =
    l.ablauf || l.sammel ? [] : abhaengigeTypen(m.abhaengigkeiten, l.katalog, (id) => installierte.some((p) => p.id === id));
  const namensHerkunft = new Namensherkunft({ typen, sichten, installierte, abhaengig });
  for (const k of abhaengigkeitsKonflikte(abhaengig, belegt, namensHerkunft)) problem(l, 'namenskonflikt-abhaengigkeit', k);
  return { belegt, namensHerkunft };
}

/** Typverweis → Id in dieser Installation (Vorschau: was es noch nicht gibt, ist null). */
export const typIdVon =
  (l: PlanLauf, dmsTypen: Map<string, Mappentyp>, ueb: Uebernahme): TypIdVon =>
  (vw) => {
    const [p, sl] = vw.includes(':') ? vw.split(':') : [l.m.id, vw];
    return (
      (p === 'dms'
        ? dmsTypen.get(sl)?.id
        : p === l.m.id
          ? (l.ich?.typen[sl] ?? ueb?.typen[sl])
          : l.installierte.find((x) => x.id === p)?.typen[sl]) ?? null
    );
  };

/**
 * Ansichten mit Mappentypen, die das Paket nicht mitbringt (#656): fehlt einer, kommt die Ansicht ohne ihn; fehlen
 * alle, wird sie (mit ihren Unteransichten) übersprungen – das übrige Paket wird trotzdem installiert.
 */
export function ausgelasseneSichten(l: PlanLauf, sortiert: PaketSicht[]): Map<string, string> {
  const { paket, typen, installierte, sammel } = l;
  const ausgelassen = new Map<string, string>();
  for (const s of sortiert) {
    if (s.eltern && ausgelassen.has(s.eltern)) {
      ausgelassen.set(
        s.schluessel,
        `Ansicht „${s.name}“ wird nicht installiert: Sie steht unter „${paket.sichten.find((x) => x.schluessel === s.eltern)?.name ?? s.eltern}“, die nicht installiert wird.`,
      );
      continue;
    }
    const fremd = s.fremdeTypen ?? [];
    const fehlt = fremd.filter((f) => !fremderTyp(f.kennung, typen, installierte));
    // Sammeldatei (#1084, Sicherheit A): Was sich weder installiert noch in der Datei zuordnen lässt, ist ein Fehler mit
    // Namen – die Installation bricht vorher ab, statt die Ansicht still ohne den Typ anzulegen.
    if (sammel) {
      for (const f of fehlt.filter((x) => !sammel.has(x.kennung))) {
        l.probleme.push(t('meldungen.pakete.sammel-fremder-typ', { sicht: s.name, typ: f.name, kennung: f.kennung }));
        l.fehlercodes.push('fremder-typ');
      }
      continue;
    }
    if (fremd.length && fehlt.length === fremd.length && !(s.typen ?? []).length)
      ausgelassen.set(
        s.schluessel,
        `Ansicht „${s.name}“ wird nicht installiert: Den Mappentyp ${fehlt.map((f) => `„${f.name}“`).join(', ')} gibt es in dieser Installation nicht.`,
      );
  }
  for (const g of ausgelassen.values()) l.hinweise.push(g);
  return ausgelassen;
}

/** Plan einer Ansicht: ausgelassen, vorhanden (mit Zustand, #1125) oder neu (mit Konflikt auf oberster Ebene). */
export function sichtPlan(
  l: PlanLauf,
  s: PaketSicht,
  x: { ausgelassen: Map<string, string>; ueb: Uebernahme; typIdJetzt: TypIdVon },
): SichtPlan {
  const { ich, typen, installierte } = l;
  if (x.ausgelassen.has(s.schluessel) && !ich?.sichten[s.schluessel])
    return {
      schluessel: s.schluessel,
      name: s.name,
      eltern: s.eltern ?? null,
      vorhanden: false,
      konflikt: null,
      vorschlag: null,
      ausgelassen: x.ausgelassen.get(s.schluessel)!,
    };
  const ohne = (s.fremdeTypen ?? []).filter((f) => !fremderTyp(f.kennung, typen, installierte)).map((f) => f.name);
  if (ohne.length && !ich?.sichten[s.schluessel])
    l.hinweise.push(t('meldungen.pakete.ansicht-kommt-ohne-den', { name: s.name, map: ohne.map((n) => `„${n}“`).join(', ') }));
  const vorhandenId = ich?.sichten[s.schluessel] ?? x.ueb?.sichten[s.schluessel];
  const vorhanden = vorhandenId ? l.sichten.find((y) => y.id === vorhandenId) : undefined;
  if (vorhanden || vorhandenId) return vorhandeneSicht(l, s, vorhanden, x.typIdJetzt);
  return neueSicht(l, s, ohne);
}

/** Vorhandene Ansicht. Prüfwert (#1125): unverändert → neue Fassung; ohne Stand (vor #1125) nur „gleich“, wenn sie der Fassung entspricht. */
function vorhandeneSicht(l: PlanLauf, s: PaketSicht, vorhanden: Sicht | undefined, typIdJetzt: TypIdVon): SichtPlan {
  const { ich, typen, installierte } = l;
  const st = ich?.sichtStand?.[s.schluessel];
  const wieImPaket =
    !st && vorhanden
      ? {
          name: vorhanden.name,
          elternId: s.eltern ? (ich?.sichten[s.eltern] ?? null) : null,
          ...sichtAusPaket(s, {
            typId: typIdJetzt,
            fremd: (s.fremdeTypen ?? []).map((f) => fremderTyp(f.kennung, typen, installierte)?.id).filter((x): x is string => !!x),
            zieltypenIn: (b) =>
              b.art === 'feld' && b.op === 'zeigtAufTyp' && b.wert?.art === 'fest' && Array.isArray(b.wert.wert)
                ? { ...b, wert: { art: 'fest', wert: b.wert.wert.map((vw) => typIdJetzt(str(vw))).filter((x): x is string => !!x) } }
                : b,
          }),
        }
      : null;
  const zustand = ich ? sichtZustand({ stand: st, fassung: sichtFassung(s), jetzt: vorhanden, wieImPaket }) : undefined;
  return {
    schluessel: s.schluessel,
    name: vorhanden?.name ?? s.name,
    eltern: s.eltern ?? null,
    vorhanden: true,
    konflikt: null,
    vorschlag: null,
    ...(zustand ? { zustand } : {}),
  };
}

/** Neue Ansicht: Name (umbenannt), Konflikt nur auf oberster Ebene – Untersichten stehen unter der neuen Elternsicht. */
function neueSicht(l: PlanLauf, s: PaketSicht, ohne: string[]): SichtPlan {
  const name = (l.sichtNamen[s.schluessel] ?? s.name).trim();
  const geschwister = s.eltern
    ? []
    : [...l.sichten.filter((x) => !x.elternId).map((x) => x.name.trim().toLowerCase()), ...(l.geplant?.sichten ?? [])];
  const konflikt = geschwister.includes(name.toLowerCase()) ? t('meldungen.pakete.eine-ansicht-gibt-es', { name }) : null;
  if (!s.eltern) l.geplant?.sichten.add(name.toLowerCase());
  return {
    schluessel: s.schluessel,
    name,
    eltern: s.eltern ?? null,
    vorhanden: false,
    konflikt,
    vorschlag: konflikt ? freierName(name, l.m.name, new Set(geschwister)) : null,
    ...(ohne.length ? { ohne } : {}),
  };
}
