/** Paketverwaltung (#1278 aus pakete.ts): Versionen vergleichen, Abhängigkeiten auflösen, Katalog lesen. */
import {
  type Katalog,
  type ErgaenzungAngebot,
  type InstalliertesPaket,
  type NeueVersion,
  katalogPaketZu,
  BEREICH,
  type KatalogPaket,
  type KatalogVersion,
  type Ergaenzung,
  VERSION,
  liesErgaenzt,
  liesKatalogSprache,
  liesErsetzt,
  type Herkunft,
  OFFIZIELLER_KATALOG,
} from './katalog';
import { t } from '../texte';
import { PAKET_ID, istHerausgeber } from '../kennungen';
import { gebietsschema } from '../sprache';

/**
 * Ergänzungen eines Pakets im Katalog (#405): Pakete, deren neueste zur DMS-Version passende Version `ergaenzt: <basis>`
 * angibt und die noch nicht installiert sind – nach Gruppe und Namen sortiert.
 */
export function ergaenzungenVon(k: Katalog, basis: string, dms: string, installiert: Array<{ id: string }> = []): ErgaenzungAngebot[] {
  const erg: ErgaenzungAngebot[] = [];
  for (const p of k.pakete) {
    // Unter einer früheren Id installiert (#1084, `ersetzt`) zählt wie installiert – es kommt als Update.
    if (p.id === basis || installiert.some((x) => x.id === p.id || p.ersetzt?.includes(x.id))) continue;
    const v = [...p.versionen].sort((a, b) => vergleicheVersion(b.version, a.version)).find((x) => dmsPasst(dms, x.dms));
    if (v?.ergaenzt?.paket === basis)
      erg.push({
        id: p.id,
        name: p.name,
        version: v.version,
        beschreibung: p.beschreibung,
        gruppe: v.ergaenzt.gruppe ?? null,
        code: v.code,
      });
  }
  return erg.sort((a, b) => (a.gruppe ?? '').localeCompare(b.gruppe ?? '', 'de') || a.name.localeCompare(b.name, 'de'));
}

/**
 * Neuere Versionen der installierten Pakete (#1167, #1168): je Paket aus dem Katalog, aus dem es stammt, die aktuelle
 * Version – nur, wenn sie neuer ist. Abgeleitet aus den abgerufenen Katalogen und dem Stand der Installation, nicht
 * gemerkt: Nach einem Update verschwindet der Merker sofort, eine noch neuere Version steht weiter da. Umgezogene
 * Pakete (#1084) findet es unter der neuen Id. Pakete aus Quellen, die nicht abgerufen wurden, zählen nicht.
 */
export function neueVersionen(
  installiert: ReadonlyArray<Pick<InstalliertesPaket, 'id' | 'name' | 'version' | 'herkunft'>>,
  kataloge: ReadonlyArray<{ url: string; katalog: Katalog | null }>,
): NeueVersion[] {
  const erg: NeueVersion[] = [];
  for (const p of installiert) {
    if (p.herkunft.art !== 'katalog') continue;
    const url = p.herkunft.url;
    const k = kataloge.find((x) => x.url === url)?.katalog;
    const kp = k ? katalogPaketZu(k, p.id) : undefined;
    const v = kp?.versionen.find((x) => x.version === kp.aktuell) ?? kp?.versionen[0];
    if (v && vergleicheVersion(v.version, p.version) > 0)
      erg.push({ id: p.id, name: p.name, installiert: p.version, neu: v.version, quelle: url });
  }
  return erg;
}

/* ---------- Versionen ---------- */

const teile = (v: string) => v.split('.').map((x) => Number.parseInt(x, 10) || 0);

/** < 0: a älter, 0: gleich, > 0: a neuer. Vorspann wie „v“ und Zusätze wie „-rc1“ zählen nicht. */
export function vergleicheVersion(a: string, b: string): number {
  const x = teile(a.replace(/^v/, '').split('-')[0]),
    y = teile(b.replace(/^v/, '').split('-')[0]);
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
}

/**
 * Passt eine Version zu einem Bereich? „>=1.2.0“, „>1.2.0“, „=1.2.0“ bzw. „1.2.0“ (genau),
 * „^1.2.0“ (gleiche Hauptversion; bei 0.x gleiche Nebenversion), „~1.2.0“ (gleiche Nebenversion),
 * optional mit Obergrenze „ <2.0.0“.
 */
export function passt(version: string, bereich: string): boolean {
  const m = BEREICH.exec(bereich.trim());
  if (!m) return false;
  const [, op = '=', basis, , ober] = m;
  const c = vergleicheVersion(version, basis);
  const [haupt, neben] = teile(basis);
  let ok: boolean;
  switch (op) {
    case '>=':
      ok = c >= 0;
      break;
    case '>':
      ok = c > 0;
      break;
    case '^':
      ok = c >= 0 && (haupt > 0 ? vergleicheVersion(version, `${haupt + 1}.0.0`) < 0 : vergleicheVersion(version, `0.${neben + 1}.0`) < 0);
      break;
    case '~':
      ok = c >= 0 && vergleicheVersion(version, `${haupt}.${neben + 1}.0`) < 0;
      break;
    default:
      ok = c === 0;
  }
  return ok && (!ober || vergleicheVersion(version, ober) < 0);
}

/** Eine DMS-Version ohne Zahl (z. B. „Entwicklung“) gilt als passend. */
export const dmsPasst = (dms: string, bereich: string) =>
  !/^\d+\.\d+\.\d+/.test(dms.replace(/^v/, '')) || passt(dms.replace(/^v/, ''), bereich);

/** Neueste Version eines Katalogpakets, die zu einem Bereich passt. */
export function neuestePassende(p: KatalogPaket, bereich?: string): KatalogVersion | undefined {
  return [...p.versionen].sort((a, b) => vergleicheVersion(b.version, a.version)).find((v) => !bereich || passt(v.version, bereich));
}

/**
 * Reihenfolge zum Installieren: Abhängigkeiten zuerst (#460, #461). Abhängigkeiten, die nicht in der Liste
 * stehen, zählen nicht (sind schon installiert oder fehlen). null = Kreis.
 */
export function nachAbhaengigkeiten<T extends { id: string; abhaengigkeiten: Record<string, string> }>(liste: T[]): T[] | null {
  const nach = new Map(liste.map((x) => [x.id, x]));
  const fertig = new Set<string>(),
    unterwegs = new Set<string>();
  const erg: T[] = [];
  const besuche = (x: T): boolean => {
    if (fertig.has(x.id)) return true;
    if (unterwegs.has(x.id)) return false;
    unterwegs.add(x.id);
    for (const a of Object.keys(x.abhaengigkeiten)) {
      const z = nach.get(a);
      if (z && !besuche(z)) return false;
    }
    unterwegs.delete(x.id);
    fertig.add(x.id);
    erg.push(x);
    return true;
  };
  for (const x of liste) if (!besuche(x)) return null;
  return erg;
}

/** Ein Paket in einer Auswahl aus dem Katalog (#460, #461): selbst gewählt oder als Abhängigkeit mitgenommen. */
export interface AuswahlPaket {
  id: string;
  name: string;
  version: string;
  code: boolean;
  /** Selbst gewählt (sonst: kommt als Abhängigkeit mit). */
  gewaehlt: boolean;
  /** Von diesen Paketen gebraucht. */
  fuer: string[];
  abhaengigkeiten: Record<string, string>;
  /** Ergänzung eines anderen Pakets (#405). */
  ergaenzt?: Ergaenzung;
}

/**
 * Pakete aus einem Katalog auswählen (#460, #461): je Paket die neueste Version, die zur DMS-Version passt;
 * Abhängigkeiten kommen mit (neueste passende Version), außer sie sind schon passend installiert. Reihenfolge:
 * Abhängigkeiten zuerst. probleme: was sich nicht auflösen lässt (dann fehlt das Paket in der Liste).
 * versionen: für selbst gewählte Pakete eine bestimmte Version statt der neuesten (#405).
 */
export function auswahlMitAbhaengigkeiten(
  k: Katalog,
  gewaehlt: string[],
  dms: string,
  installiert: Array<{ id: string; version: string }> = [],
  versionen: Record<string, string> = {},
): { pakete: AuswahlPaket[]; probleme: string[] } {
  const plan = new Map<string, AuswahlPaket>();
  const probleme: string[] = [];
  const name = (id: string) => k.pakete.find((p) => p.id === id)?.name ?? id;
  const nimm = (id: string, bereich: string | null, von: string | null) => {
    const da = installiert.find((x) => x.id === id);
    if (von && da && (!bereich || passt(da.version, bereich))) return;
    const schon = plan.get(id);
    if (schon) {
      if (von && !schon.fuer.includes(von)) schon.fuer.push(von);
      if (bereich && !passt(schon.version, bereich))
        probleme.push(
          t('gemeinsam.pakete.braucht-gewaehlt-ist', { name: name(von ?? id), name2: schon.name, bereich, version: schon.version }),
        );
      return;
    }
    const kp = k.pakete.find((p) => p.id === id);
    if (!kp) {
      probleme.push(t('gemeinsam.pakete.braucht-das-gibt-es', { name: name(von ?? id), id }));
      return;
    }
    const fest = !von ? versionen[id] : undefined;
    const v = [...kp.versionen]
      .sort((a, b) => vergleicheVersion(b.version, a.version))
      .find((x) => (fest ? x.version === fest : !bereich || passt(x.version, bereich)) && dmsPasst(dms, x.dms));
    if (!v) {
      probleme.push(
        von
          ? t('gemeinsam.pakete.braucht-dazu-passt-keine', { name: name(von), name2: kp.name, bereich: String(bereich), dms })
          : t('gemeinsam.pakete.keine-version-passt-zu', { name: kp.name, dms }),
      );
      return;
    }
    plan.set(id, {
      id,
      name: kp.name,
      version: v.version,
      code: v.code,
      gewaehlt: !von,
      fuer: von ? [von] : [],
      abhaengigkeiten: v.abhaengigkeiten,
      ...(v.ergaenzt ? { ergaenzt: v.ergaenzt } : {}),
    });
    for (const [a, b] of Object.entries(v.abhaengigkeiten)) nimm(a, b, id);
  };
  for (const id of gewaehlt) {
    const x = plan.get(id);
    if (x) x.gewaehlt = true;
    else nimm(id, null, null);
  }
  const liste = [...plan.values()];
  const geordnet = nachAbhaengigkeiten(liste);
  if (!geordnet) probleme.push(t('gemeinsam.pakete.die-abhaengigkeiten-der-gewaehlten'));
  return { pakete: geordnet ?? liste, probleme };
}

/* ---------- Katalog lesen ---------- */

const text = (v: unknown) => (typeof v === 'string' ? v : '');

/** Prüft und vereinheitlicht einen geladenen Katalog; wirft mit verständlicher Meldung. */
/** Symbol, Kürzel und Kategorien eines Katalogeintrags (#645) – nur gültige Werte, sonst weggelassen. */
function anzeige(p: Record<string, unknown>): Pick<KatalogPaket, 'symbol' | 'kuerzel' | 'kategorien'> {
  const r: Pick<KatalogPaket, 'symbol' | 'kuerzel' | 'kategorien'> = {};
  if (typeof p.symbol === 'string' && /^[a-z0-9-]{1,60}$/.test(p.symbol)) r.symbol = p.symbol;
  if (typeof p.kuerzel === 'string' && /^[A-Za-z]{1,3}$/.test(p.kuerzel)) r.kuerzel = p.kuerzel.toUpperCase();
  const k = Array.isArray(p.kategorien)
    ? p.kategorien.filter((x): x is string => typeof x === 'string' && /^[a-z0-9_-]{1,40}$/.test(x)).slice(0, 5)
    : [];
  if (k.length) r.kategorien = k;
  return r;
}

export function liesKatalog(j: unknown): Katalog {
  const k = j as Partial<Katalog> | null;
  if (!k || typeof k !== 'object' || !Array.isArray(k.pakete)) throw new Error('Das ist kein Paketkatalog (katalog.json).');
  if (k.format !== 1) throw new Error(`Katalogformat ${String(k.format)} kennt diese Ablago-Version nicht – bitte Ablago aktualisieren.`);
  const pakete: KatalogPaket[] = [];
  for (const p of k.pakete) {
    if (!p || !PAKET_ID.test(text(p.id)) || !Array.isArray(p.versionen)) continue;
    const versionen = p.versionen
      .filter((v) => v && VERSION.test(text(v.version)) && /^[0-9a-f]{64}$/.test(text(v.sha256)) && text(v.archiv))
      .map((v) => ({
        ...v,
        dms: text(v.dms) || '>=0.0.0',
        abhaengigkeiten: v.abhaengigkeiten && typeof v.abhaengigkeiten === 'object' ? v.abhaengigkeiten : {},
        inhalt: { mappentypen: v.inhalt?.mappentypen ?? [], sichten: v.inhalt?.sichten ?? [], beispiele: Number(v.inhalt?.beispiele) || 0 },
        code: !!v.code,
        // Ergänzung (#405): ungültige Angaben zählen nicht (das Paket bleibt installierbar, nur ohne Häkchen).
        ergaenzt:
          liesErgaenzt(v.ergaenzt, v.abhaengigkeiten && typeof v.abhaengigkeiten === 'object' ? v.abhaengigkeiten : {}).ergaenzt ??
          undefined,
        sprache: liesKatalogSprache(v.sprache),
      }))
      .sort((a, b) => vergleicheVersion(b.version, a.version));
    if (!versionen.length) continue;
    const roh = p as unknown as Record<string, unknown>;
    const ersetzt = liesErsetzt(roh.ersetzt, p.id).ersetzt;
    pakete.push({
      ...(istHerausgeber(roh.herausgeber) ? { herausgeber: roh.herausgeber } : {}),
      ...(ersetzt.length ? { ersetzt } : {}),
      id: p.id,
      name: text(p.name) || p.id,
      beschreibung: text(p.beschreibung),
      autor: { name: text(p.autor?.name), github: text(p.autor?.github) },
      lizenz: text(p.lizenz),
      aktuell: VERSION.test(text(p.aktuell)) ? p.aktuell : versionen[0].version,
      versionen,
      ...anzeige(p as unknown as Record<string, unknown>),
    });
  }
  // Empfehlungen (#1048): nur gültige Ids, höchstens 20; Ungültiges zählt nicht (wie bei Symbol und Kategorien).
  const empfohlen = Array.isArray(k.empfohlen)
    ? [...new Set(k.empfohlen.filter((x): x is string => typeof x === 'string' && PAKET_ID.test(x)))].slice(0, 20)
    : [];
  return {
    format: 1,
    erstellt: text(k.erstellt),
    quelle: text(k.quelle),
    pakete: pakete.sort((a, b) => a.name.localeCompare(b.name, 'de')),
    ...(empfohlen.length ? { empfohlen } : {}),
  };
}

/** Herkunft lesbar, z. B. „offizieller Katalog“ oder „hochgeladen von … am …“. */
export function herkunftText(h: Herkunft, person: (id: string | null) => string = (x) => x ?? '–'): string {
  if (h.art === 'katalog')
    return h.url === OFFIZIELLER_KATALOG ? t('gemeinsam.pakete.offizieller-katalog') : t('gemeinsam.pakete.katalog', { url: h.url });
  return t('gemeinsam.pakete.hochgeladen-von-am', { person: person(h.von), datum: new Date(h.am).toLocaleDateString(gebietsschema()) });
}
