/**
 * Paket-Update baut um (#1041): Umbau-Schritte im Manifest lesen und die Vorschau rechnen. Format, Begriffe und
 * Sicherheit stehen in shared/src/umbau.ts; Werte umwandeln in umbau-werte.ts, ausführen in umbau-ausfuehren.ts.
 *
 * Ablauf in der Paketverwaltung (pakete.ts):
 * 1. `liesUmbau` beim Lesen des Pakets – Form, Verweise auf Typen und Felder des Pakets.
 * 2. `planeUmbau` in der Vorschau und noch einmal beim Installieren – je Schritt die Art (übernehmen oder
 *    zusammenlegen), Mappen, Werte, Rückfragen, Rechte und alles, was den Umbau verhindert.
 * 3. Beim Installieren läuft alles in einer Transaktion (pakete.ts, legeMitUmbau): Ein übernommener Typ wird im ersten
 *    Durchgang der neuen Typen mit seiner Id zum Typ des Pakets, danach zieht `fuehreUmbauAus` die Werte um.
 *
 * Den Dienst bekommt das Modul als `UmbauDienst` – Schicht 3 bindet dienst.ts nicht ein.
 */
import { randomUUID } from 'node:crypto';
import { hatZeitraumform, istZeitraum, leseZeitraum, zeitraumText } from '../../../shared/src/feldarten';
import { SCHLUESSEL, TYPVERWEIS, teileKennung, typKennung } from '../../../shared/src/kennungen';
import { istLeer, zieleVon, type Feld, type Mappe, type Mappentyp } from '../../../shared/src/model';
import type { InstalliertesPaket } from '../../../shared/src/pakete';
import { regelwerkVon, type Regelwerk } from '../../../shared/src/rechte';
import type { Sicht } from '../../../shared/src/sichten';
import { archivLockerer, regelnMitnehmen, UMBAU_MAX, type UmbauAnsicht, type UmbauEntscheidungen, type UmbauPlan, type UmbauRueckfrage, type UmbauSchritt, type UmbauWahl } from '../../../shared/src/umbau';
import { istVorgabeWert } from '../../../shared/src/vorgaben';
import type { Kern } from '../kern';
import { Fachfehler } from '../fehler';
import { t } from '../sprache';
import { ohneZiel, umziehbar, wandle, type Aktion, type FeldAktion, type TitelSuche } from './umbau-werte';

const istObjekt = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

/** Was das Modul vom Dienst braucht (die Paketverwaltung reicht den Dienst herein). */
export interface UmbauDienst {
  kern: Kern;
  listeTypen(): Promise<Mappentyp[]>;
  listeMappen(typId?: string): Promise<Mappe[]>;
  listeSichten(): Promise<Sicht[]>;
  loescheTyp(id: string): Promise<void>;
  aktualisiereTitel(ids: string[]): Promise<Map<string, string>>;
}

/** Mappentyp eines Pakets, so weit der Umbau ihn braucht. */
interface PaketTypKurz { schluessel: string; name: string; felder: Array<{ key: string; typ?: string; berechnet?: boolean }> }
interface PaketKurz { id: string; abh: Record<string, unknown>; typen: PaketTypKurz[] }

/* ---------- 1. Lesen ---------- */

/** Paare „alt: neu“ mit Kennungen (felder, register); ein eigener Zieltyp muss die neuen Felder haben. */
function liesPaare(roh: unknown, wo: string, ziel: PaketTypKurz | undefined, fehler: string[]): Record<string, string> {
  const erg: Record<string, string> = {};
  if (roh !== undefined && !istObjekt(roh)) fehler.push(t('meldungen.pakete.umbau.felder', { wo }));
  for (const [a, n] of Object.entries(istObjekt(roh) ? roh : {})) {
    if (!SCHLUESSEL.test(a) || !SCHLUESSEL.test(str(n))) { fehler.push(t('meldungen.pakete.umbau.feld', { wo, alt: a, neu: str(n) })); continue; }
    const f = ziel?.felder.find((x) => x.key === str(n));
    if (ziel && !f) { fehler.push(t('meldungen.pakete.umbau.feld-fehlt', { wo, feld: str(n), typ: ziel.name })); continue; }
    if (f?.berechnet === true) { fehler.push(t('meldungen.pakete.umbau.feld-berechnet', { wo, feld: str(n) })); continue; }
    erg[a] = str(n);
  }
  return erg;
}

/**
 * Ein fester Wert für ein Feld der Art `typ` (undefined = Feldart noch nicht bekannt): Zeiträume (#1125) als
 * `{ anzahl, einheit }`; in ein Zeitraum-Feld auch als Text („P3M“, „3 Monate“). Sonst der Wert, wie er ist; null =
 * passt nicht.
 */
export function setzenWert(w: unknown, typ: string | undefined): unknown {
  if (hatZeitraumform(w)) { const z = leseZeitraum(w); return istZeitraum(z) && (typ === undefined || typ === 'zeitraum') ? z : null; }
  if (typ === 'zeitraum' && !istVorgabeWert(w)) { const z = leseZeitraum(w); return istZeitraum(z) ? z : null; }
  return w;
}

/** Feste Werte (`setzen`): Text, Zahl, Ja/Nein, Liste von Texten, `{ vorgabe: … }` oder ein Zeitraum (#1125). */
function liesSetzen(roh: unknown, wo: string, ziel: PaketTypKurz | undefined, fehler: string[]): Record<string, unknown> {
  const erg: Record<string, unknown> = {};
  if (roh !== undefined && !istObjekt(roh)) fehler.push(t('meldungen.pakete.umbau.setzen', { wo }));
  for (const [k, w] of Object.entries(istObjekt(roh) ? roh : {})) {
    const einfach = ['string', 'number', 'boolean'].includes(typeof w) || (Array.isArray(w) && w.every((y) => typeof y === 'string'));
    if (!SCHLUESSEL.test(k) || !(einfach || hatZeitraumform(w) || (istVorgabeWert(w) && TYPVERWEIS.test(w.vorgabe)))) { fehler.push(t('meldungen.pakete.umbau.setzen-wert', { wo, feld: k })); continue; }
    const f = ziel?.felder.find((x) => x.key === k);
    if (ziel && !f) { fehler.push(t('meldungen.pakete.umbau.feld-fehlt', { wo, feld: k, typ: ziel.name })); continue; }
    const wert = setzenWert(w, f?.typ);
    if (wert === null) { fehler.push(t(hatZeitraumform(w) && istZeitraum(leseZeitraum(w)) ? 'meldungen.pakete.umbau.setzen-kein-zeitraumfeld' : 'meldungen.pakete.umbau.setzen-zeitraum', { wo, feld: k })); continue; }
    erg[k] = wert;
  }
  return erg;
}

/** von und nach: Typverweise, nicht gleich, Ziel im Paket oder in einer Abhängigkeit, Quelle nicht mehr im Paket. */
function liesVonNach(x: Record<string, unknown>, wo: string, p: PaketKurz, fehler: string[]): { von: string; nach: string; ziel?: PaketTypKurz } | null {
  const von = str(x.von), nach = str(x.nach);
  if (!TYPVERWEIS.test(von)) { fehler.push(t('meldungen.pakete.umbau.von', { wo, wert: von || '–' })); return null; }
  if (!TYPVERWEIS.test(nach)) { fehler.push(t('meldungen.pakete.umbau.nach', { wo, wert: nach || '–' })); return null; }
  const vonK = von.includes(':') ? von : typKennung(p.id, von), nachK = nach.includes(':') ? nach : typKennung(p.id, nach);
  if (vonK === nachK) { fehler.push(t('meldungen.pakete.umbau.gleich', { wo })); return null; }
  const vk = teileKennung(vonK), nk = teileKennung(nachK);
  // Der alte Typ ist einer, den das Paket nicht mehr mitbringt – sonst bliebe er und würde zugleich leer.
  if (vk.paket === p.id && p.typen.some((y) => y.schluessel === vk.schluessel)) fehler.push(t('meldungen.pakete.umbau.von-noch-da', { wo, von }));
  if (vk.paket === 'dms' || nk.paket === 'dms') fehler.push(t('meldungen.pakete.umbau.dms', { wo }));
  // Ziel: ein Typ dieses Pakets oder einer Abhängigkeit (Sicherheit: Andere Typen fasst der Umbau nicht an).
  const ziel = nk.paket === p.id ? p.typen.find((y) => y.schluessel === nk.schluessel) : undefined;
  if (nk.paket === p.id && !ziel) fehler.push(t('meldungen.pakete.umbau.ziel-fehlt', { wo, nach }));
  if (nk.paket !== p.id && !((nk.paket ?? '') in p.abh)) fehler.push(t('meldungen.pakete.umbau.ziel-abhaengigkeit', { wo, nach, paket: nk.paket ?? '' }));
  return { von: vonK, nach: nachK, ziel };
}

/**
 * `umbau` aus dem Manifest. Geprüft wird, was das Paket selbst wissen kann: Form, Kennungen, Zieltyp (eigener Typ oder
 * Typ einer Abhängigkeit), Felder eines eigenen Zieltyps. Ob es den alten Typ gibt, zeigt erst die Vorschau.
 */
export function liesUmbau(roh: unknown, p: PaketKurz, fehler: string[]): UmbauSchritt[] {
  if (roh === undefined || roh === null) return [];
  if (!Array.isArray(roh)) { fehler.push(t('meldungen.pakete.umbau.liste')); return []; }
  if (roh.length > UMBAU_MAX) fehler.push(t('meldungen.pakete.umbau.zuviele', { max: UMBAU_MAX }));
  const schritte: UmbauSchritt[] = [];
  for (const [i, x] of roh.slice(0, UMBAU_MAX).entries()) {
    const wo = `manifest.yaml: umbau[${i + 1}]`;
    if (!istObjekt(x)) { fehler.push(t('meldungen.pakete.umbau.form', { wo })); continue; }
    const vn = liesVonNach(x, wo, p, fehler);
    if (!vn) continue;
    if (schritte.some((s) => s.von === vn.von)) fehler.push(t('meldungen.pakete.umbau.doppelt', { wo, von: str(x.von) }));
    schritte.push({ von: vn.von, nach: vn.nach, felder: liesPaare(x.felder, wo, vn.ziel, fehler), setzen: liesSetzen(x.setzen, wo, vn.ziel, fehler), register: liesPaare(x.register, wo, undefined, fehler) });
  }
  return schritte;
}

/* ---------- 2. Planen ---------- */

const ARCHIV_TEXT = { aus: 'meldungen.pakete.umbau.archiv-aus', jahre: 'meldungen.pakete.umbau.archiv-jahre', stichtag: 'meldungen.pakete.umbau.archiv-stichtag-anders', leer: 'meldungen.pakete.umbau.archiv-leer' } as const;

/** Ein Feld des alten Typs mit seiner Aktion – und der Rückfrage, wenn der Administrator es angelegt oder geändert hat. */
export interface FeldPlan extends FeldAktion { rueckfrage?: UmbauRueckfrage }

/** Ein Schritt, fertig geplant: was die Vorschau zeigt und was die Ausführung braucht. */
export interface GeplanterSchritt {
  schritt: UmbauSchritt;
  plan: UmbauPlan;
  alt: Mappentyp;
  /** Paket, dem der alte Typ gehört (bei einem früheren eigenen Typ das installierte Paket selbst). */
  quelle: InstalliertesPaket;
  /** Zieltyp vor dem Umbau; null bei der Übernahme (dann wird `alt` selbst zum Zieltyp). */
  ziel: Mappentyp | null;
  /** Schlüssel des Zieltyps, wenn er zu diesem Paket gehört. */
  eigenerZiel: string | null;
  felder: FeldPlan[];
  /** Felder des Zieltyps danach (für Umwandlung und Rückfragen; bei eigenen aus dem Paket). */
  zielFelder: Feld[];
}

export interface UmbauLage {
  schritte: GeplanterSchritt[];
  /** Übernahmen: Schlüssel des Pakets → Id des alten Typs (gilt wie ein vorhandener Typ). */
  uebernahme: Record<string, string>;
}

export interface UmbauKontext {
  paket: { id: string; name: string; version: string; typen: PaketTypKurz[]; umbau: UmbauSchritt[] };
  ich: InstalliertesPaket | null;
  installierte: InstalliertesPaket[];
  typen: Mappentyp[];
  herausgeber: string | null;
  herausgeberVon: (p: InstalliertesPaket) => string | null;
  /** Felder eines eigenen Typs, wie das Paket sie anlegt – für Umwandlung und Rückfragen. */
  paketFelder: (schluessel: string) => Feld[];
  /**
   * Auswahl → Verweis (#1125): Mappen nach Titel unter den Zieltypen des Verweisfelds `feld` am Zieltyp `nach` – samt
   * Vorgaben, die das Paket erst anlegt. undefined = kein Verweisfeld (bzw. ohne Zuordnung).
   */
  zielTitel?: (nach: string, feld: string) => Promise<TitelSuche | undefined>;
}

type Problem = (code: string, text: string) => void;
/** Was für alle Schritte gleich ist. */
interface Umgebung { k: UmbauKontext; lage: UmbauLage; problem: Problem; ki: Set<string>; verwehrt: Record<string, string[]>; sichten: Sicht[] }

export const aktionAus = (w: UmbauWahl, gemappt: string | undefined): Aktion =>
  (w === 'notiz' ? { art: 'notiz' } : w === 'feld' ? { art: 'feld' } : w === 'paket' ? { art: 'nach', ziel: gemappt! } : { art: 'nach', ziel: w });

/** Alte Kennung → neue für alle Felder, die danach noch da sind (umbenannt oder als eigenes Feld). */
export function umbenennung(felder: FeldAktion[]): Map<string, string> {
  return new Map(felder.flatMap((x) => (x.aktion.art === 'nach' ? [[x.feld.key, x.aktion.ziel] as const] : x.aktion.art === 'feld' ? [[x.feld.key, x.feld.key] as const] : [])));
}

/** Feldkennungen in den Bedingungen eines Regelwerks umbenennen. */
export function benenneRegelnUm(r: Regelwerk, umbenannt: Map<string, string>): Regelwerk {
  return { ...r, regeln: r.regeln.map((x) => ({ ...x, wenn: x.wenn.map((b) => (b.art === 'feld' && umbenannt.has(b.bedingung.feld) ? { ...b, bedingung: { ...b.bedingung, feld: umbenannt.get(b.bedingung.feld)! } } : b)) })) };
}

/** Archivmodus des übernommenen Typs danach: Der Stichtag zieht mit seinem Feld um (#1051). */
export function archivDanach(g: Pick<GeplanterSchritt, 'alt' | 'felder'>): Mappentyp['archiv'] {
  const a = g.alt.archiv;
  return a ? { ...a, stichtag: a.stichtag ? umbenennung(g.felder).get(a.stichtag) ?? null : null } : null;
}

/** Alter Typ und sein Paket – oder null, wenn es nichts (mehr) umzubauen gibt bzw. der Schritt nicht darf. */
function quelleVon(s: UmbauSchritt, u: Umgebung): { alt: Mappentyp; quelle: InstalliertesPaket } | null {
  const { k, problem } = u;
  const vk = teileKennung(s.von);
  const quelle = vk.paket === k.paket.id ? k.ich : k.installierte.find((x) => x.id === vk.paket);
  const alt = quelle?.typen[vk.schluessel] ? k.typen.find((x) => x.id === quelle.typen[vk.schluessel]) : undefined;
  // Nichts (mehr) umzubauen – der Typ ist schon umgezogen oder war nie da.
  if (!alt || !quelle) return null;
  if (alt.system) { problem('umbau-system', t('meldungen.pakete.umbau.system', { name: alt.name })); return null; }
  // Herausgeber (#1084, Sicherheit): Ein Paket baut nur Typen desselben, bekannten Herausgebers um.
  const h = k.herausgeberVon(quelle);
  if (quelle.id !== k.paket.id && (!k.herausgeber || h !== k.herausgeber)) {
    problem('umbau-herausgeber', t('meldungen.pakete.umbau.herausgeber', { name: alt.name, paket: quelle.name, herausgeber: h ?? t('meldungen.pakete.herausgeber-unbekannt') }));
    return null;
  }
  return { alt, quelle };
}

/** Zieltyp: vorhanden (auch von einer Übernahme in diesem Update) oder neu (dann übernimmt der Schritt den alten). */
function zielVon(s: UmbauSchritt, alt: Mappentyp, u: Umgebung): { vorhanden?: Mappentyp; frueher?: GeplanterSchritt; eigenerZiel: string | null; zielFelder: Feld[]; name: string } | null {
  const { k, lage } = u;
  const nk = teileKennung(s.nach);
  const eigenerZiel = nk.paket === k.paket.id ? nk.schluessel : null;
  const id = eigenerZiel ? k.ich?.typen[eigenerZiel] ?? lage.uebernahme[eigenerZiel] : k.installierte.find((x) => x.id === nk.paket)?.typen[nk.schluessel];
  const vorhanden = id ? k.typen.find((x) => x.id === id) : undefined;
  if (!eigenerZiel && !vorhanden) { u.problem('umbau-ziel', t('meldungen.pakete.umbau.ziel-nicht-da', { name: alt.name, nach: s.nach })); return null; }
  return { vorhanden, eigenerZiel, ...zielDanach(s, vorhanden, eigenerZiel, u) };
}

/** Wie der Zieltyp danach aussieht – auch, wenn ein früherer Schritt dieses Updates ihn übernimmt. */
function zielDanach(s: UmbauSchritt, vorhanden: Mappentyp | undefined, eigenerZiel: string | null, u: Umgebung): { frueher?: GeplanterSchritt; zielFelder: Feld[]; name: string } {
  const frueher = vorhanden ? u.lage.schritte.find((x) => x.alt.id === vorhanden.id && x.plan.art === 'uebernehmen') : undefined;
  const ausPaket = eigenerZiel ? u.k.paketFelder(eigenerZiel) : [];
  const basis = frueher?.zielFelder ?? vorhanden?.felder ?? [];
  const name = frueher?.plan.nach.name ?? vorhanden?.name ?? u.k.paket.typen.find((x) => x.schluessel === eigenerZiel)?.name ?? s.nach;
  return { frueher, zielFelder: [...basis, ...ausPaket.filter((f) => !basis.some((g) => g.key === f.key))], name };
}

/** Rückfrage zu einem Feld, das der Administrator angelegt oder geändert hat; null = kein Platz dafür. */
function rueckfrageVon(f: Feld, x: { gemappt?: string; eigen: boolean; geaendert: boolean; anzahl: number; zielFelder: Feld[] }): UmbauRueckfrage | null {
  const frei = !x.zielFelder.some((g) => g.key === f.key);
  const moeglich: UmbauRueckfrage['moeglich'] = [];
  if (x.gemappt) moeglich.push({ wahl: 'paket', text: t('pakete.umbau.wahl.paket', { feld: x.zielFelder.find((g) => g.key === x.gemappt)?.label ?? x.gemappt }) });
  if (frei) moeglich.push({ wahl: 'feld', text: t('pakete.umbau.wahl.feld') });
  // Passwörter kommen nie in eine Notiz.
  if (f.typ !== 'passwort') moeglich.push({ wahl: 'notiz', text: t('pakete.umbau.wahl.notiz') });
  for (const g of x.zielFelder.filter((g) => g.typ === f.typ && g.key !== x.gemappt && !g.berechnetVon && g.key !== f.key)) moeglich.push({ wahl: g.key, text: t('pakete.umbau.wahl.ziel', { feld: g.label }) });
  if (!moeglich.length) return null;
  const vorschlag: UmbauWahl = x.gemappt && x.geaendert ? 'paket' : frei ? 'feld' : moeglich[0].wahl;
  return { feld: f.key, label: f.label, grund: x.eigen ? 'eigen' : 'geaendert', anzahl: x.anzahl, vorschlag, moeglich };
}

/** Je Feld des alten Typs: wohin, oder eine Rückfrage. Änderungen des Administrators erkennt der Paketstand (#653). */
function feldPlaene(s: UmbauSchritt, alt: Mappentyp, x: { stand?: Array<{ key: string; werte: Record<string, unknown> }>; zielFelder: Feld[]; mappen: Mappe[]; problem: Problem }): FeldPlan[] {
  const felder: FeldPlan[] = [];
  for (const f of alt.felder.filter(umziehbar)) {
    const gemappt = s.felder[f.key];
    const imStand = x.stand?.find((y) => y.key === f.key);
    const eigen = x.stand ? !imStand : !gemappt;
    const geaendert = !!imStand && imStand.werte.typ !== undefined && imStand.werte.typ !== f.typ;
    const anzahl = x.mappen.filter((m) => !istLeer(m.werte[f.key])).length;
    const frei = !x.zielFelder.some((g) => g.key === f.key);
    if (eigen || (geaendert && anzahl > 0)) {
      const r = rueckfrageVon(f, { gemappt, eigen, geaendert, anzahl, zielFelder: x.zielFelder });
      if (r) felder.push({ feld: f, aktion: aktionAus(r.vorschlag, gemappt), rueckfrage: r });
      else x.problem('umbau-feld', t('meldungen.pakete.umbau.feld-ohne-platz', { name: alt.name, feld: f.label }));
    } else if (gemappt) felder.push({ feld: f, aktion: { art: 'nach', ziel: gemappt } });
    else if (f.typ !== 'passwort') felder.push({ feld: f, aktion: { art: 'notiz' } });
    else if (frei) felder.push({ feld: f, aktion: { art: 'feld' } });
    else x.problem('umbau-feld', t('meldungen.pakete.umbau.feld-ohne-platz', { name: alt.name, feld: f.label }));
  }
  return felder;
}

/** Was den Schritt verhindert: Felder des Ziels, Rechte-Regeln auf Felder, die wegfallen, ein lockererer Archivmodus. */
function pruefeSchritt(s: UmbauSchritt, alt: Mappentyp, z: NonNullable<ReturnType<typeof zielVon>>, felder: FeldPlan[], problem: Problem) {
  for (const n of [...Object.values(s.felder), ...Object.keys(s.setzen)]) {
    const g = z.zielFelder.find((x) => x.key === n);
    if (!g) problem('umbau-ziel', t('meldungen.pakete.umbau.feld-fehlt', { wo: alt.name, feld: n, typ: z.name }));
    else if (g.berechnetVon) problem('umbau-ziel', t('meldungen.pakete.umbau.feld-berechnet', { wo: alt.name, feld: n }));
    // Zeitraum (#1125): Am Typ einer Abhängigkeit steht die Feldart erst hier fest.
    else if (n in s.setzen && setzenWert(s.setzen[n], g.typ) === null) problem('umbau-ziel', t(g.typ === 'zeitraum' ? 'meldungen.pakete.umbau.setzen-zeitraum' : 'meldungen.pakete.umbau.setzen-kein-zeitraumfeld', { wo: alt.name, feld: g.label }));
  }
  const umbenannt = umbenennung(felder);
  // Rechte-Regeln fragen Felder ab – jedes muss danach noch da sein (sonst wären es andere Regeln).
  for (const r of regelwerkVon(alt).regeln) for (const b of r.wenn) {
    if (b.art !== 'feld' || b.bedingung.feld.startsWith('_') || umbenannt.has(b.bedingung.feld)) continue;
    problem('umbau-rechte', t('meldungen.pakete.umbau.regel-feld', { name: alt.name, feld: alt.felder.find((x) => x.key === b.bedingung.feld)?.label ?? b.bedingung.feld }));
  }
  // Archivmodus (#1051): nie lockerer. Bei der Übernahme bleibt er – sein Stichtag muss mitkommen.
  if (alt.archiv?.stichtag && !umbenannt.has(alt.archiv.stichtag)) { problem('umbau-archiv', t('meldungen.pakete.umbau.archiv-stichtag', { name: alt.name })); return; }
  if (!z.vorhanden) return;
  const lockerer = archivLockerer(alt.archiv, z.frueher ? archivDanach(z.frueher) : z.vorhanden.archiv, Object.fromEntries(umbenannt));
  if (lockerer) problem('umbau-archiv', t(ARCHIV_TEXT[lockerer], { name: alt.name, ziel: z.name }));
}

/** Rechte (Entscheidung Thomas): Regeln, KI-Sperre und „Paket verwehrt“ des alten Typs gehen beim Zusammenlegen mit. */
function rechteVon(alt: Mappentyp, z: NonNullable<ReturnType<typeof zielVon>>, felder: FeldPlan[], u: Umgebung, kennung: string): UmbauPlan['rechte'] {
  const ziel = z.vorhanden;
  if (!ziel) return { regeln: false, ki: false, verwehrt: [] };
  const zielRegeln = z.frueher ? benenneRegelnUm(regelwerkVon(z.frueher.alt), umbenennung(z.frueher.felder)) : regelwerkVon(ziel);
  const regeln = !!regelnMitnehmen(benenneRegelnUm(regelwerkVon(alt), umbenennung(felder)), zielRegeln, kennung, alt.name, randomUUID);
  const verwehrt = (u.verwehrt[alt.id] ?? []).filter((x) => !(u.verwehrt[ziel.id] ?? []).includes(x));
  return { regeln, ki: !u.ki.has(alt.id) && u.ki.has(ziel.id), verwehrt: verwehrt.map((x) => u.k.installierte.find((y) => y.id === x)?.name ?? x) };
}

/** Höchstens so viele Werte ohne passende Mappe nennt die Vorschau je Feld (#1125). */
const OHNE_ZIEL_MAX = 10;

/**
 * Je umziehendem Feld: wohin, wie viele Werte und wie viele davon (auch) in die Notiz; bei Auswahl → Verweis (#1125) die
 * Werte ohne passende Mappe. `titel` je Kennung des Zielfelds.
 */
function feldVorschau(felder: FeldPlan[], zielFelder: Feld[], mappen: Mappe[], titel: Map<string, TitelSuche>): UmbauPlan['felder'] {
  return felder.flatMap((x) => {
    if (x.aktion.art !== 'nach' || x.rueckfrage) return [];
    const key = x.aktion.ziel;
    const ziel = zielFelder.find((g) => g.key === key);
    const mit = mappen.filter((m) => !istLeer(m.werte[x.feld.key]));
    const suche = titel.get(key);
    const notiz = mit.filter((m) => { const w = ziel ? wandle(x.feld, ziel, m.werte[x.feld.key], { titel: suche }) : null; return !w || !w.genau; }).length;
    const fehlt = ziel && suche ? ohneZiel(x.feld, ziel, mit.map((m) => m.werte[x.feld.key]!), suche) : [];
    return [{ von: x.feld.label, nach: ziel?.label ?? key, anzahl: mit.length, notiz, ...(fehlt.length ? { ohneZiel: fehlt.slice(0, OHNE_ZIEL_MAX) } : {}) }];
  });
}

/** Mappen nach Titel für jedes Verweisfeld des Ziels, in das eine Auswahl oder ein Text zieht (#1125). */
async function titelSuchen(s: UmbauSchritt, felder: FeldPlan[], zielFelder: Feld[], k: UmbauKontext): Promise<Map<string, TitelSuche>> {
  const erg = new Map<string, TitelSuche>();
  for (const x of felder) {
    if (x.aktion.art !== 'nach' || !['auswahl', 'text'].includes(x.feld.typ)) continue;
    const key = x.aktion.ziel;
    if (erg.has(key) || zielFelder.find((g) => g.key === key)?.typ !== 'referenz') continue;
    const suche = await k.zielTitel?.(s.nach, key);
    if (suche) erg.set(key, suche);
  }
  return erg;
}

/** Feldkennungen, die eine Bedingung einer Ansicht abfragt (Felder und Fristen; Systemwerte nicht). */
const sichtFelder = (s: Sicht): string[] => s.bedingungen.flatMap((b) => (b.art === 'feld' && !b.feld.startsWith('_') ? [b.feld] : b.art === 'frist' && b.feld ? [b.feld] : []));

/**
 * Ansichten über den alten Typ (#1125, Fund Clients und Pakete): Bedingungen auf Felder, die es danach nicht mehr gibt,
 * und wie viele Mappen des Zieltyps eine Ansicht danach zusätzlich zeigt. Nur Ansichten mit etwas zu sagen.
 */
async function ansichtHinweise(d: UmbauDienst, alt: Mappentyp, felder: FeldPlan[], ziel: Mappentyp | undefined, u: Umgebung): Promise<UmbauAnsicht[]> {
  const bleibt = new Set(umbenennung(felder).keys());
  const breiter = ziel ? (await d.listeMappen(ziel.id)).length : 0;
  const besitzer = (id: string) => u.k.installierte.find((p) => Object.values(p.sichten).includes(id))?.name ?? null;
  return u.sichten.filter((s) => s.typen.includes(alt.id)).flatMap((s): UmbauAnsicht[] => {
    const weg = [...new Set(sichtFelder(s).filter((f) => felder.some((x) => x.feld.key === f) && !bleibt.has(f)))].map((f) => alt.felder.find((g) => g.key === f)?.label ?? f);
    const mehr = ziel && !s.typen.includes(ziel.id) ? breiter : 0;
    return weg.length || mehr ? [{ name: s.name, paket: besitzer(s.id), felder: weg, breiter: mehr }] : [];
  });
}

/** Ein fester Wert, wie die Vorschau ihn zeigt. */
function setzenText(w: unknown, f: Feld | undefined): string {
  if (istVorgabeWert(w)) return t('pakete.umbau.vorgabe', { name: w.vorgabe });
  const z = setzenWert(w, f?.typ);
  if (istZeitraum(z)) return zeitraumText(z);
  return Array.isArray(w) ? w.join(', ') : str(w);
}

/** Einen Schritt planen; null = entfällt (nichts umzubauen) oder verhindert (steht unter `probleme`). */
async function planeSchritt(d: UmbauDienst, s: UmbauSchritt, u: Umgebung): Promise<GeplanterSchritt | null> {
  const q = quelleVon(s, u);
  const z = q ? zielVon(s, q.alt, u) : null;
  if (!q || !z) return null;
  const { alt, quelle } = q;
  const mappen = await d.listeMappen(alt.id);
  const felder = feldPlaene(s, alt, { stand: quelle.typStand?.[alt.id]?.felder, zielFelder: z.zielFelder, mappen, problem: u.problem });
  pruefeSchritt(s, alt, z, felder, u.problem);
  const uebernehmen = !z.vorhanden;
  if (uebernehmen) u.lage.uebernahme[z.eigenerZiel!] = alt.id;
  const anzahl = (key: string) => mappen.filter((m) => !istLeer(m.werte[key])).length;
  const titel = await titelSuchen(s, felder, z.zielFelder, u.k);
  const plan: UmbauPlan = {
    von: { id: alt.id, kennung: s.von, name: alt.name, paket: quelle.name },
    nach: { id: z.vorhanden?.id ?? null, kennung: s.nach, name: z.name },
    art: uebernehmen ? 'uebernehmen' : 'zusammenlegen',
    mappen: mappen.length, imPapierkorb: (await d.kern.repo.papierkorb({ typId: alt.id })).length,
    felder: feldVorschau(felder, z.zielFelder, mappen, titel),
    notiz: felder.filter((x) => x.aktion.art === 'notiz' && !x.rueckfrage && anzahl(x.feld.key) > 0).map((x) => ({ feld: x.feld.label, anzahl: anzahl(x.feld.key) })),
    setzen: Object.entries(s.setzen).map(([key, w]) => { const f = z.zielFelder.find((g) => g.key === key); return { feld: f?.label ?? key, wert: setzenText(w, f) }; }),
    rueckfragen: felder.flatMap((x) => (x.rueckfrage ? [x.rueckfrage] : [])),
    rechte: rechteVon(alt, z, felder, u, s.von),
    umgeleitet: { felder: u.k.typen.flatMap((x) => x.felder.filter((f) => f.typ === 'referenz' && zieleVon(f).includes(alt.id))).length, ansichten: u.sichten.filter((x) => x.typen.includes(alt.id)).length },
    ansichten: await ansichtHinweise(d, alt, felder, z.vorhanden, u),
  };
  // Bei der Übernahme bleiben die eigenen Felder im Typ – auch für spätere Schritte in denselben Zieltyp.
  const zielFelder = uebernehmen ? [...z.zielFelder, ...felder.filter((x) => x.aktion.art === 'feld').map((x) => x.feld)] : z.zielFelder;
  return { schritt: s, plan, alt, quelle, ziel: z.vorhanden ?? null, eigenerZiel: z.eigenerZiel, felder, zielFelder };
}

/**
 * Vorschau aller Schritte. Schritte, deren alter Typ nicht (mehr) da ist, fallen weg – ein zweites Update baut nichts
 * zweimal um. `probleme` verhindern die Installation.
 */
export async function planeUmbau(d: UmbauDienst, k: UmbauKontext, probleme: Array<{ code: string; text: string }>): Promise<UmbauLage> {
  const lage: UmbauLage = { schritte: [], uebernahme: {} };
  if (!k.paket.umbau.length) return lage;
  const u: Umgebung = { k, lage, problem: (code, text) => probleme.push({ code, text }), ki: await kiTypen(d), verwehrt: await paketVerwehrt(d), sichten: await d.listeSichten() };
  // Übernahmen zuerst: Ein späterer Schritt in denselben (neuen) Zieltyp legt dann mit dem übernommenen zusammen.
  const neu = (s: UmbauSchritt) => { const nk = teileKennung(s.nach); return nk.paket === k.paket.id && !k.ich?.typen[nk.schluessel]; };
  for (const s of [...k.paket.umbau].sort((a, b) => Number(!neu(a)) - Number(!neu(b)))) {
    const g = await planeSchritt(d, s, u);
    if (g) lage.schritte.push(g);
  }
  return lage;
}

/**
 * Antworten auf die Rückfragen übernehmen (je Schritt und Feld). Ohne Antwort auf eine Rückfrage kein Umbau: 409 mit
 * den offenen Feldern – Änderungen des Administrators werden nie still überfahren.
 */
export function wendeEntscheidungenAn(lage: UmbauLage, e: UmbauEntscheidungen | undefined) {
  const offen: string[] = [];
  for (const g of lage.schritte) {
    for (const f of g.felder.filter((x) => x.rueckfrage)) {
      const w = e?.[g.schritt.von]?.[f.feld.key];
      if (w === undefined || !f.rueckfrage!.moeglich.some((m) => m.wahl === w)) offen.push(`${g.alt.name}: ${f.feld.label}`);
      else f.aktion = aktionAus(w, g.schritt.felder[f.feld.key]);
    }
  }
  if (offen.length) throw new Fachfehler(409, t('meldungen.pakete.umbau.rueckfrage', { felder: offen.join(', ') }), { umbau: 'rueckfrage', felder: offen });
}

export async function kiTypen(d: Pick<UmbauDienst, 'kern'>): Promise<Set<string>> {
  const v = await d.kern.einstellungen?.lies('ki_typen') as { zugelassen?: unknown } | null | undefined;
  return new Set(v && Array.isArray(v.zugelassen) ? v.zugelassen.map(String) : []);
}
export async function paketVerwehrt(d: Pick<UmbauDienst, 'kern'>): Promise<Record<string, string[]>> {
  const v = await d.kern.einstellungen?.lies('paket_verwehrt');
  return istObjekt(v) ? Object.fromEntries(Object.entries(v).map(([k, l]) => [k, Array.isArray(l) ? l.map(String) : []])) : {};
}
