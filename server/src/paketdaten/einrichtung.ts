/**
 * Einrichtung je Bereich als Daten für Pakete (#1053). Nur Grundkonfiguration, keine Benutzerlisten, nie Geheimnisse.
 *
 * Die Quellen kommen schon schmal aus den Diensten (paketdaten.routen.ts); hier wird je Bereich eine flache Liste von
 * Einträgen mit fester Kennung daraus. Jede Angabe ist ausdrücklich übernommen (Liste statt „alles außer …“), damit
 * keine neue Einstellung heimlich mitkommt. Zum Schluss geht alles noch durch die zentrale Sperre (#1055).
 *
 * Bewusst weggelassen (Ergänzung Sicherheit): Benutzernamen von Postfächern (nur „Anmeldung eingerichtet“), Adressen
 * mit Benutzer, Passwort oder Query (nur der Rechner), Ausnahmen des Anmeldeschutzes (nur die Anzahl – es sind
 * Adressen des Heimnetzes), Namen von API-Schlüsseln und Personen (nur Anzahlen), Zeitstempel (Rauschen im Vergleich).
 */
import { ohneGeheimnisse } from '../geheimnis-sperre';
import { t } from '../sprache';
import { BEREICHE as WERKBANK_BEREICHE, bereichName as werkbankName } from '../../../shared/src/werkbankansicht';
import { GESAMT } from '../../../shared/src/verwaltungsrecht';
import { RECHTE_LISTE, regelwerkVon, type Regelwerk } from '../../../shared/src/rechte';
import type { Mappentyp } from '../../../shared/src/model';
import type { EinrichtungEintrag, EinrichtungStand, PaketdatenBereich, PaketdatenWert } from '../../../shared/src/paketdaten';

/** Was ein Bereich braucht; jede Quelle ist optional (fehlt der Dienst, fehlt der Abschnitt). */
export interface EinrichtungQuellen {
  version: string;
  beruflich?(): Promise<boolean>;
  organisationen?(): Promise<Array<{ id: string; angaben: Record<string, string | undefined>; verantwortlicher: string | null; datenschutzbeauftragter: string | null }>>;
  postfaecher?(): Promise<Array<{ id: string; name: string; aktiv: boolean; server: string; anmeldung: boolean }>>;
  eingangsordner?(): Promise<{ aktiv: boolean; nachher: string; doppelteUeberspringen: boolean } | null>;
  texterkennung?(): Promise<{ aktiv: boolean }>;
  typen?(): Promise<Mappentyp[]>;
  /** Ids der Mappentypen, die für KI-Dienste zugelassen sind (#796). */
  kiTypen?(): Promise<Set<string>>;
  zweifaktor?(): Promise<Record<string, boolean>>;
  passkeys?(): Promise<{ moeglich: boolean; pflicht: Record<string, boolean> }>;
  anmeldeschutz?(): Promise<{ konto: { versuche: number; minuten: number }; ip: { versuche: number; minuten: number }; ausnahmen: number; mail: boolean }>;
  webdav?(): Promise<{ aktiv: boolean; nurLesend: boolean } | null>;
  apiSchluessel?(): Promise<number>;
  rollen?(): Promise<Array<{ id: string; name: string }>>;
  /** Verwaltungsrechte aller Personen (ohne Namen – gezählt wird je Bereich). */
  verwaltung?(): Promise<Array<string[] | undefined>>;
  pakete?(): Promise<Array<{ id: string; name: string; version: string; rechte: string[]; schnittstellen: string[] }>>;
  automatisierungen?(): Promise<Array<{ id: string; name: string; aktiv: boolean; herkunft: string; paket: string | null }>>;
  assistent?(): Promise<{ verfuegbar: boolean; paket: string | null }>;
  wartung?(): Promise<{ stufe: string }>;
  sicherung?(): Promise<{
    plan: { aktiv: boolean; uhrzeit: string; haeufigkeit: string; wochentag: number; aufbewahrung: Record<string, number>; nurNeueste: boolean };
    probe: { aktiv: boolean; wochentag: number; uhrzeit: string } | null;
    verschluesselt: boolean; ziele: Array<{ paket: string; name: string; ziel: string | null }>;
  } | null>;
  datenschutz?(): Promise<{ typen: Record<string, { person: boolean; zweck: string }>; papierkorbTage: number; historieTage: number | null; loeschprotokollJahre: number; auskunftTage: number }>;
}

/** Nur Schema und Rechner einer Adresse, ohne Benutzer, Passwort, Pfad und Query (Ergänzung Sicherheit). */
export function nurRechner(adresse: string | null | undefined): string | null {
  if (!adresse) return null;
  try { const u = new URL(adresse.includes('://') ? adresse : `https://${adresse}`); return u.hostname || null; } catch { return null; }
}

const ja = (x: unknown) => x === true;
const k = (kennung: string, werte?: Record<string, string | number>) => t.frei(`pakete.daten.k.${kennung.replace(/_/g, '-')}`, werte);
const typName = (x: Pick<Mappentyp, 'name'>) => x.name;
const typKennung = (x: Pick<Mappentyp, 'id' | 'schluessel'>) => x.schluessel ?? x.id;

/** Lesbare Kurzform eines Regelwerks: Standard und je Regel Name mit Rechten (ohne Bedingungen mit Personen). */
function regeln(r: Regelwerk): { grund: string; regeln: Array<{ id: string; name: string; rechte: string }> } {
  const kurz = (x: Partial<Record<string, unknown>>) => RECHTE_LISTE.map((recht) => (x[recht] === undefined ? '' : `${recht}${x[recht] === false || x[recht] === 'nein' ? '-' : '+'}`)).filter(Boolean).join(' ');
  return { grund: RECHTE_LISTE.filter((x) => r.grund[x]).join('') || '–', regeln: r.regeln.map((x) => ({ id: x.id, name: x.name, rechte: kurz(x.dann as Record<string, unknown>) })) };
}

type Liste = EinrichtungEintrag[];
const e = (aus: Liste, kennung: string, pfad: string, bezeichnung: string, wert: PaketdatenWert) => { aus.push({ kennung, pfad, bezeichnung, wert }); };

async function allgemein(q: EinrichtungQuellen, aus: Liste) {
  e(aus, 'allgemein.version', 'allgemein.version', k('allgemein.version'), q.version);
  if (q.beruflich) e(aus, 'allgemein.beruflich', 'allgemein.beruflich', k('allgemein.beruflich'), await q.beruflich());
  for (const o of (await q.organisationen?.()) ?? []) {
    const name = o.angaben.name ?? ([o.angaben.vorname, o.angaben.nachname].filter(Boolean).join(' ') || o.id);
    for (const [angabe, wert] of Object.entries(o.angaben)) if (wert) e(aus, 'allgemein.organisation', `allgemein.organisation:${o.id}/${angabe}`, k('allgemein.organisation', { name, angabe: t.frei(`pakete.daten.angabe.${angabe}`) }), wert);
    e(aus, 'allgemein.verantwortlicher', `allgemein.verantwortlicher:${o.id}`, k('allgemein.verantwortlicher', { name }), o.verantwortlicher);
    e(aus, 'allgemein.datenschutzbeauftragter', `allgemein.datenschutzbeauftragter:${o.id}`, k('allgemein.datenschutzbeauftragter', { name }), o.datenschutzbeauftragter);
  }
}

async function belegeingang(q: EinrichtungQuellen, aus: Liste) {
  for (const p of (await q.postfaecher?.()) ?? []) {
    e(aus, 'belegeingang.postfach', `belegeingang.postfach:${p.id}`, k('belegeingang.postfach', { name: p.name }), p.aktiv);
    e(aus, 'belegeingang.postfach_server', `belegeingang.postfach_server:${p.id}`, k('belegeingang.postfach_server', { name: p.name }), nurRechner(p.server));
    e(aus, 'belegeingang.postfach_anmeldung', `belegeingang.postfach_anmeldung:${p.id}`, k('belegeingang.postfach_anmeldung', { name: p.name }), p.anmeldung);
  }
  const o = await q.eingangsordner?.();
  if (o) {
    e(aus, 'belegeingang.eingangsordner', 'belegeingang.eingangsordner', k('belegeingang.eingangsordner'), o.aktiv);
    e(aus, 'belegeingang.eingangsordner_nachher', 'belegeingang.eingangsordner_nachher', k('belegeingang.eingangsordner_nachher'), o.nachher);
    e(aus, 'belegeingang.doppelte', 'belegeingang.doppelte', k('belegeingang.doppelte'), o.doppelteUeberspringen);
  }
  if (q.texterkennung) e(aus, 'belegeingang.texterkennung', 'belegeingang.texterkennung', k('belegeingang.texterkennung'), (await q.texterkennung()).aktiv);
  // Texterkennung, PDF/A, Trennblatt und Barcodes bringen Pakete mit: je Aufgabe das zuständige Paket mit Version.
  const pakete = (await q.pakete?.()) ?? [];
  const zustaendig = (s: string) => pakete.filter((p) => p.schnittstellen.includes(s)).map((p) => `${p.name} ${p.version}`);
  e(aus, 'belegeingang.texterkennung_paket', 'belegeingang.texterkennung_paket', k('belegeingang.texterkennung_paket'), zustaendig('dms:texterkennung'));
  e(aus, 'belegeingang.pdfa', 'belegeingang.pdfa', k('belegeingang.pdfa'), zustaendig('dms:archivfassung'));
  e(aus, 'belegeingang.trennen', 'belegeingang.trennen', k('belegeingang.trennen'), [...new Set([...zustaendig('dms:leerseiten'), ...zustaendig('dms:anlagen')])]);
}

async function ablage(q: EinrichtungQuellen, aus: Liste) {
  const ki = (await q.kiTypen?.()) ?? null;
  for (const typ of ((await q.typen?.()) ?? []).filter((x) => !x.system)) {
    const s = typKennung(typ), name = typName(typ);
    e(aus, 'ablage.typ', `ablage.typ:${s}`, k('ablage.typ', { typ: name }), name);
    for (const f of typ.felder.filter((x) => !x.system)) {
      e(aus, 'ablage.feldtyp', `ablage.feldtyp:${s}/${f.key}`, k('ablage.feldtyp', { typ: name, feld: f.label }), f.typ);
      e(aus, 'ablage.pflicht', `ablage.pflicht:${s}/${f.key}`, k('ablage.pflicht', { typ: name, feld: f.label }), ja(f.pflicht));
    }
    for (const r of typ.register.filter((x) => x.art === 'dokumente')) e(aus, 'ablage.versionierung', `ablage.versionierung:${s}/${r.key}`, k('ablage.versionierung', { typ: name, register: r.name }), ja(r.versionierung));
    e(aus, 'ablage.archivmodus', `ablage.archivmodus:${s}`, k('ablage.archivmodus', { typ: name }), !!typ.archiv);
    e(aus, 'ablage.frist', `ablage.frist:${s}`, k('ablage.frist', { typ: name }), typ.archiv ? typ.archiv.jahre : null);
    e(aus, 'ablage.stichtag', `ablage.stichtag:${s}`, k('ablage.stichtag', { typ: name }), typ.archiv?.stichtag ? (typ.felder.find((f) => f.key === typ.archiv!.stichtag)?.label ?? typ.archiv.stichtag) : null);
    if (ki) e(aus, 'ablage.ki', `ablage.ki:${s}`, k('ablage.ki', { typ: name }), ki.has(typ.id));
  }
}

async function zugang(q: EinrichtungQuellen, aus: Liste) {
  await zugangAnmeldung(q, aus);
  await zugangWege(q, aus);
  await zugangRechte(q, aus);
}

/** Zwei-Faktor, Passkeys und Anmeldeschutz. */
async function zugangAnmeldung(q: EinrichtungQuellen, aus: Liste) {
  for (const [rolle, an] of Object.entries((await q.zweifaktor?.()) ?? {})) e(aus, 'zugang.zweifaktor', `zugang.zweifaktor:${rolle}`, k('zugang.zweifaktor', { rolle: t.frei(`pakete.daten.rolle.${rolle}`) }), an);
  const pk = await q.passkeys?.();
  if (pk) {
    e(aus, 'zugang.passkey_moeglich', 'zugang.passkey_moeglich', k('zugang.passkey_moeglich'), pk.moeglich);
    for (const [rolle, an] of Object.entries(pk.pflicht)) e(aus, 'zugang.passkey', `zugang.passkey:${rolle}`, k('zugang.passkey', { rolle: t.frei(`pakete.daten.rolle.${rolle}`) }), an);
  }
  const s = await q.anmeldeschutz?.();
  if (s) {
    e(aus, 'zugang.anmeldeschutz', 'zugang.anmeldeschutz:konto', k('zugang.anmeldeschutz.konto'), `${s.konto.versuche}/${s.konto.minuten}`);
    e(aus, 'zugang.anmeldeschutz', 'zugang.anmeldeschutz:ip', k('zugang.anmeldeschutz.ip'), `${s.ip.versuche}/${s.ip.minuten}`);
    e(aus, 'zugang.anmeldeschutz_ausnahmen', 'zugang.anmeldeschutz_ausnahmen', k('zugang.anmeldeschutz_ausnahmen'), s.ausnahmen);
    e(aus, 'zugang.anmeldeschutz_meldung', 'zugang.anmeldeschutz_meldung', k('zugang.anmeldeschutz_meldung'), s.mail);
  }
}

/** Wege an der Oberfläche vorbei: WebDAV und Schnittstelle. */
async function zugangWege(q: EinrichtungQuellen, aus: Liste) {
  const w = await q.webdav?.();
  if (q.webdav) e(aus, 'zugang.webdav', 'zugang.webdav', k('zugang.webdav'), !!w?.aktiv);
  if (w) e(aus, 'zugang.webdav_nurlesend', 'zugang.webdav_nurlesend', k('zugang.webdav_nurlesend'), w.nurLesend);
  if (q.apiSchluessel) e(aus, 'zugang.schnittstelle', 'zugang.schnittstelle', k('zugang.schnittstelle'), await q.apiSchluessel());
}

/** Rollen, Rechte je Mappentyp und Verwaltungsrechte (nur gezählt). */
async function zugangRechte(q: EinrichtungQuellen, aus: Liste) {
  for (const r of (await q.rollen?.()) ?? []) e(aus, 'zugang.rolle', `zugang.rolle:${r.id}`, k('zugang.rolle', { rolle: r.name }), r.name);
  for (const typ of (await q.typen?.()) ?? []) {
    const w2 = regeln(regelwerkVon(typ)), s2 = typKennung(typ);
    e(aus, 'zugang.grundrechte', `zugang.grundrechte:${s2}`, k('zugang.grundrechte', { typ: typ.name }), w2.grund);
    for (const r of w2.regeln) e(aus, 'zugang.regel', `zugang.regel:${s2}/${r.id}`, k('zugang.regel', { typ: typ.name, regel: r.name }), r.rechte);
  }
  if (q.verwaltung) {
    const alle = await q.verwaltung();
    for (const b of [GESAMT, ...WERKBANK_BEREICHE.map((x) => x.pfad)]) {
      const n = alle.filter((v) => v?.includes(b)).length;
      if (n || b === GESAMT) e(aus, 'zugang.verwaltung', `zugang.verwaltung:${b}`, k('zugang.verwaltung', { bereich: b === GESAMT ? t('pakete.daten.gesamt') : werkbankName(b) }), n);
    }
  }
}

async function betrieb(q: EinrichtungQuellen, aus: Liste) {
  for (const p of (await q.pakete?.()) ?? []) {
    e(aus, 'betrieb.paket', `betrieb.paket:${p.id}`, k('betrieb.paket', { name: p.name }), p.version);
    e(aus, 'betrieb.paket_rechte', `betrieb.paket_rechte:${p.id}`, k('betrieb.paket_rechte', { name: p.name }), p.rechte);
  }
  for (const a of (await q.automatisierungen?.()) ?? []) e(aus, 'betrieb.automatisierung', `betrieb.automatisierung:${a.id}`, k('betrieb.automatisierung', { name: a.name }), a.aktiv);
  const f = await q.assistent?.();
  if (f) {
    e(aus, 'betrieb.assistent', 'betrieb.assistent', k('betrieb.assistent'), f.verfuegbar);
    e(aus, 'betrieb.assistent_paket', 'betrieb.assistent_paket', k('betrieb.assistent_paket'), f.paket);
  }
  if (q.wartung) e(aus, 'betrieb.wartung', 'betrieb.wartung', k('betrieb.wartung'), (await q.wartung()).stufe);
}

async function sicherung(q: EinrichtungQuellen, aus: Liste) {
  if (!q.sicherung) return;
  const s = await q.sicherung();
  e(aus, 'sicherung.eingerichtet', 'sicherung.eingerichtet', k('sicherung.eingerichtet'), !!s);
  if (!s) return;
  e(aus, 'sicherung.zeitplan', 'sicherung.zeitplan', k('sicherung.zeitplan'), s.plan.aktiv);
  e(aus, 'sicherung.haeufigkeit', 'sicherung.haeufigkeit', k('sicherung.haeufigkeit'), s.plan.haeufigkeit === 'woechentlich' ? `woechentlich/${s.plan.wochentag}` : s.plan.haeufigkeit);
  e(aus, 'sicherung.uhrzeit', 'sicherung.uhrzeit', k('sicherung.uhrzeit'), s.plan.uhrzeit);
  for (const [art, n] of Object.entries(s.plan.aufbewahrung)) e(aus, 'sicherung.aufbewahrung', `sicherung.aufbewahrung:${art}`, k('sicherung.aufbewahrung', { art: t.frei(`pakete.daten.aufbewahrung.${art}`) }), n);
  e(aus, 'sicherung.nur_neueste', 'sicherung.nur_neueste', k('sicherung.nur_neueste'), s.plan.nurNeueste);
  e(aus, 'sicherung.verschluesselung', 'sicherung.verschluesselung', k('sicherung.verschluesselung'), s.verschluesselt);
  for (const z of s.ziele) e(aus, 'sicherung.ziel', `sicherung.ziel:${z.paket}`, k('sicherung.ziel', { name: z.name }), nurRechner(z.ziel));
  if (s.probe) {
    e(aus, 'sicherung.probe', 'sicherung.probe', k('sicherung.probe'), s.probe.aktiv);
    e(aus, 'sicherung.probe_zeit', 'sicherung.probe_zeit', k('sicherung.probe_zeit'), `${s.probe.wochentag}/${s.probe.uhrzeit}`);
  }
}

async function unveraenderbarkeit(q: EinrichtungQuellen, aus: Liste) {
  // „Alle Dateien prüfen“ läuft bisher nur von Hand (Werkbank → Texterkennung); einen Zeitplan gibt es noch nicht.
  e(aus, 'unveraenderbarkeit.zeitplan', 'unveraenderbarkeit.zeitplan', k('unveraenderbarkeit.zeitplan'), null);
  const typen = ((await q.typen?.()) ?? []).filter((x) => !x.system);
  e(aus, 'unveraenderbarkeit.archivmodus', 'unveraenderbarkeit.archivmodus', k('unveraenderbarkeit.archivmodus'), typen.filter((x) => x.archiv).map(typName).sort());
}

async function datenschutz(q: EinrichtungQuellen, aus: Liste) {
  if (!q.datenschutz) return;
  const d = await q.datenschutz();
  const namen = new Map(((await q.typen?.()) ?? []).map((x) => [x.id, x] as const));
  e(aus, 'datenschutz.papierkorb', 'datenschutz.papierkorb', k('datenschutz.papierkorb'), d.papierkorbTage);
  e(aus, 'datenschutz.historie', 'datenschutz.historie', k('datenschutz.historie'), d.historieTage);
  e(aus, 'datenschutz.loeschprotokoll', 'datenschutz.loeschprotokoll', k('datenschutz.loeschprotokoll'), d.loeschprotokollJahre);
  e(aus, 'datenschutz.auskunft', 'datenschutz.auskunft', k('datenschutz.auskunft'), d.auskunftTage);
  // Löschkonzept: dieselben Angaben wie im PDF der Werkbank – je Mappentyp Personenbezug, Zweck, Frist.
  for (const [id, x] of Object.entries(d.typen)) {
    const typ = namen.get(id);
    if (!typ) continue;
    const s = typKennung(typ);
    e(aus, 'datenschutz.personenbezug', `datenschutz.personenbezug:${s}`, k('datenschutz.personenbezug', { typ: typ.name }), x.person);
    e(aus, 'datenschutz.zweck', `datenschutz.zweck:${s}`, k('datenschutz.zweck', { typ: typ.name }), x.zweck || null);
    e(aus, 'datenschutz.frist', `datenschutz.frist:${s}`, k('datenschutz.frist', { typ: typ.name }), typ.archiv ? typ.archiv.jahre : null);
  }
}

function betriebspruefung(_q: EinrichtungQuellen, aus: Liste) {
  // Einen eigenen Prüferzugang gibt es (noch) nicht; die Formate stehen fest (Vollexport, Löschprotokoll).
  e(aus, 'betriebspruefung.prueferzugang', 'betriebspruefung.prueferzugang', k('betriebspruefung.prueferzugang'), false);
  e(aus, 'betriebspruefung.exportformat', 'betriebspruefung.exportformat', k('betriebspruefung.exportformat'), ['vollexport.zip', 'loeschprotokoll.pdf', 'loeschprotokoll.csv']);
}

const BAUER: Record<PaketdatenBereich, (q: EinrichtungQuellen, aus: Liste) => Promise<void> | void> = { allgemein, belegeingang, ablage, zugang, betrieb, sicherung, unveraenderbarkeit, datenschutz, betriebspruefung };

/** Stand eines Bereichs; Einträge nach Pfad sortiert, doppelte Pfade fallen weg (der erste gilt). */
export async function einrichtung(bereich: PaketdatenBereich, q: EinrichtungQuellen): Promise<EinrichtungStand> {
  const aus: Liste = [];
  await BAUER[bereich](q, aus);
  const gesehen = new Set<string>();
  const eintraege = aus.filter((x) => (gesehen.has(x.pfad) ? false : (gesehen.add(x.pfad), true))).sort((a, b) => a.pfad.localeCompare(b.pfad));
  return ohneGeheimnisse({ format: 1, art: 'einrichtung', bereich, version: q.version, eintraege } satisfies EinrichtungStand);
}
