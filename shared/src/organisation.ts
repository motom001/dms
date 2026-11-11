/**
 * Eigene Organisation (#995): Name, Anschrift, Kontakt und die Verantwortlichen im Sinne der DSGVO werden **einmal**
 * gepflegt – an einer Mappe vom Typ Organisation (Paket Basis), deren Ja/Nein-Feld das Merkmal „eigene Organisation“
 * trägt (`merkmal: 'eigeneOrganisation'`). Die Werkbank verweist nur darauf; alle Stellen, die die Angaben brauchen
 * (Datenschutz-Auskunft, Löschkonzept, Erkennung), holen sie von dort. Server und Oberfläche teilen diese Datei.
 *
 * Sicherheit (Ergänzung im Issue):
 * - **Feste Liste.** Mit Systemrechten liest Ablago nur die Angaben aus `ANGABEN` (Name, Anschrift, E-Mail, Telefon)
 *   und die beiden Verweise aus `VERWEISE` (Verantwortlicher, Datenschutzbeauftragter) – auch, wenn die Person die
 *   Mappe sonst nicht sehen darf. Nichts darüber hinaus.
 * - **Je Bedeutung genau ein Feld:** das erste Textfeld mit dieser Bedeutung („Aus Dokument füllen“ mit Erkennungsart,
 *   wie am Feld eingestellt oder aus Kennung und Bezeichnung) in Registerreihenfolge. Nur Feldart Text, nie Passwort,
 *   höchstens `ANGABE_MAX` Zeichen – so wird ein Feld mit derselben Bedeutung kein Weg, beliebige Werte zu lesen.
 *   Die Basis zeichnet Name, Kontakt und Anschrift mit `erkennung.art` aus; „Kürzel“ trägt ebenfalls `name`, steht
 *   aber hinter „Name“.
 * - Ein Verweis auf eine Person oder Organisation liest dort **dieselbe Liste** (ohne weitere Verweise).
 * - **Schreiben nur in der Ablage** mit normalen Rechten. Das Merkmal selbst trägt `schreibschutz: 'verwaltung'`:
 *   ändern darf es nur, wer im Verwaltungsmodus den Bereich „Eigene Organisation“ verwalten darf, oder wer eine der in
 *   der Werkbank freigegebenen Rollen hat (`darfGeschuetztSchreiben`).
 */
import { artVon } from './erkennung';
import { standardRegister, type Feld, type Mappentyp, type Register, type Werte } from './model';
import { t } from './texte';
import { darfBereich } from './verwaltungsrecht';

/* ---------- Merkmal und Schreibschutz am Feld ---------- */

export { FELDMERKMALE, istFeldmerkmal, istSchreibschutz, SCHREIBSCHUTZ, type Feldmerkmal, type Schreibschutz } from './feldmerkmale';

/** Werkbank-Bereich „Eigene Organisation“ (Gruppe „Benutzer und Sicherheit“). */
export const ORGANISATION_BEREICH = 'organisation';
/** Name der Einstellung: Auswahl für Auskünfte, freigegebene Rollen, Notizen an die Verwaltung. */
export const ORGANISATION_EINSTELLUNG = 'eigene_organisation';
/** Ab dieser Version kennt Ablago `merkmal` und `schreibschutz` im Paketformat (beim Einreihen prüfen). */
export const DMS_ORGANISATION_AB = '0.238.0';

/** Das Feld mit dem Merkmal „eigene Organisation“ (höchstens eines je Typ zählt: das erste Ja/Nein-Feld). */
export function merkmalFeld(typ: Pick<Mappentyp, 'felder'> | undefined): Feld | undefined {
  return typ?.felder.find((f) => f.typ === 'janein' && f.merkmal === 'eigeneOrganisation');
}
/** Ist diese Mappe eine eigene Organisation? Nur das Merkmal-Feld zählt (Entscheidung Thomas, 10.11.2026). */
export const istEigeneOrganisation = (typ: Pick<Mappentyp, 'felder'> | undefined, werte: Werte | undefined): boolean => {
  const f = merkmalFeld(typ);
  return !!f && werte?.[f.key] === true;
};
/** Felder mit Schreibschutz. */
export const geschuetzteSchreibfelder = (typ: Pick<Mappentyp, 'felder'> | undefined): Feld[] => (typ?.felder ?? []).filter((f) => !!f.schreibschutz && !f.system);

/* ---------- Einstellung ---------- */

/** Notiz an die Verwaltung: das Merkmal oder ein Verantwortlicher hat sich geändert (Ergänzung Sicherheit). */
export interface OrganisationNotiz {
  am: string;
  /** Wer geändert hat (Name oder E-Mail; Paket bzw. Systemkonto mit seinem Namen). */
  von: string;
  mappeId: string;
  titel: string;
  was: 'merkmal-an' | 'merkmal-aus' | 'verantwortlicher' | 'datenschutzbeauftragter';
}
export const NOTIZEN_MAX = 20;
const NOTIZ_ARTEN: ReadonlyArray<OrganisationNotiz['was']> = ['merkmal-an', 'merkmal-aus', 'verantwortlicher', 'datenschutzbeauftragter'];

export interface OrganisationEinstellung {
  /** „Für Auskünfte und Unterlagen gilt …“ bei mehreren eigenen Organisationen: Id der Mappe; null = keine Wahl. */
  auskunft: string | null;
  /** Rollen (Ids der Rollen-Mappen), die das Merkmal und andere geschützte Felder auch ohne Verwaltungsrecht ändern dürfen. */
  rollen: string[];
  /** Notizen an die Verwaltung, neueste zuerst; `gesehen` = zur Kenntnis genommen bis zu diesem Zeitpunkt. */
  notizen: OrganisationNotiz[];
  gesehen: string | null;
}
export const KEINE_ORGANISATION_EINSTELLUNG: OrganisationEinstellung = { auskunft: null, rollen: [], notizen: [], gesehen: null };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ROLLEN_MAX = 20;

export function liesOrganisationEinstellung(v: unknown): OrganisationEinstellung {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
  const text = (x: unknown, max: number) => (typeof x === 'string' ? x.slice(0, max) : '');
  const notizen = (Array.isArray(o.notizen) ? o.notizen : []).flatMap((n): OrganisationNotiz[] => {
    const x = n && typeof n === 'object' ? n as Record<string, unknown> : {};
    if (!NOTIZ_ARTEN.includes(x.was as OrganisationNotiz['was']) || typeof x.am !== 'string' || typeof x.mappeId !== 'string') return [];
    return [{ am: text(x.am, 40), von: text(x.von, 200), mappeId: text(x.mappeId, 40), titel: text(x.titel, 300), was: x.was as OrganisationNotiz['was'] }];
  }).slice(0, NOTIZEN_MAX);
  return {
    auskunft: typeof o.auskunft === 'string' && UUID.test(o.auskunft) ? o.auskunft : null,
    rollen: [...new Set((Array.isArray(o.rollen) ? o.rollen : []).filter((r): r is string => typeof r === 'string' && UUID.test(r)))].slice(0, ROLLEN_MAX),
    notizen,
    gesehen: typeof o.gesehen === 'string' ? o.gesehen.slice(0, 40) : null,
  };
}
/** Ungesehene Notizen (neuer als „zur Kenntnis genommen“). */
export const neueNotizen = (e: OrganisationEinstellung) => e.notizen.filter((n) => !e.gesehen || n.am > e.gesehen);

/**
 * Darf diese Person geschützte Felder (`schreibschutz: 'verwaltung'`) schreiben? Im Verwaltungsmodus mit dem Bereich
 * „Eigene Organisation“ (oder „Gesamte Verwaltung“) – oder mit einer freigegebenen Rolle. API-Schlüssel, Pakete und
 * Systemkonten sind nie im Verwaltungsmodus (#818); für sie zählt nur eine freigegebene Rolle.
 */
export function darfGeschuetztSchreiben(p: { verwaltungsmodus: boolean; verwaltung?: string[] | null; art?: string; rollen: string[] }, e: Pick<OrganisationEinstellung, 'rollen'>): boolean {
  if (p.verwaltungsmodus && darfBereich({ verwaltung: p.verwaltung ?? [], ...(p.art ? { art: p.art } : {}) }, ORGANISATION_BEREICH)) return true;
  return !p.art && p.rollen.some((r) => e.rollen.includes(r));
}

/* ---------- Angaben über die Bedeutung der Felder ---------- */

/** Die feste Liste (Ergänzung Sicherheit): Name, Anschrift, E-Mail, Telefon. Bei Personen Vor- und Nachname. */
export const ANGABEN = ['name', 'vorname', 'nachname', 'strasse', 'hausnummer', 'plz', 'ort', 'email', 'telefon'] as const;
export type Angabeart = (typeof ANGABEN)[number];
export type Angaben = Partial<Record<Angabeart, string>>;
/**
 * Verweise an der eigenen Organisation (Abschnitt „Datenschutz“ der Basis): über ihre Kennung, weil es dafür keine
 * Erkennungsart gibt. Nur Verweisfelder auf genau eine Mappe.
 */
export const VERWEISE = ['verantwortlicher', 'datenschutzbeauftragter'] as const;
export type Verweisangabe = (typeof VERWEISE)[number];
/** Höchstlänge je gelesener Angabe. */
export const ANGABE_MAX = 200;

/** Feldregister in ihrer Reihenfolge, je Register die Felder in der Reihenfolge des Formulars. */
export function felderInRegisterfolge(typ: Pick<Mappentyp, 'felder'> & { register?: Register[] }): Feld[] {
  const register = typ.register?.length ? typ.register : standardRegister(typ.felder);
  const nachKey = new Map(typ.felder.map((f) => [f.key, f] as const));
  const aus: Feld[] = [];
  const schon = new Set<string>();
  for (const r of register) {
    if (r.art !== 'felder') continue;
    for (const k of r.felder ?? []) {
      const f = nachKey.get(k);
      if (f && !schon.has(k)) { aus.push(f); schon.add(k); }
    }
  }
  return aus;
}

/** Je Bedeutung genau ein Feld: das erste Textfeld mit „Aus Dokument füllen“ und dieser Art in Registerreihenfolge. */
export function angabenFelder(typ: Pick<Mappentyp, 'felder'> & { register?: Register[] }): Partial<Record<Angabeart, Feld>> {
  const aus: Partial<Record<Angabeart, Feld>> = {};
  for (const f of felderInRegisterfolge(typ)) {
    if (f.typ !== 'text' || !f.erkennung) continue;
    const a = artVon(f);
    if (a && (ANGABEN as readonly string[]).includes(a) && !aus[a as Angabeart]) aus[a as Angabeart] = f;
  }
  return aus;
}

/** Die Verweisfelder „Verantwortlicher“ und „Datenschutzbeauftragter“, wenn es sie als Verweis auf eine Mappe gibt. */
export function verweisFelder(typ: Pick<Mappentyp, 'felder'>): Partial<Record<Verweisangabe, Feld>> {
  const aus: Partial<Record<Verweisangabe, Feld>> = {};
  for (const k of VERWEISE) {
    const f = typ.felder.find((x) => x.key === k && x.typ === 'referenz' && !x.mehrfach);
    if (f) aus[k] = f;
  }
  return aus;
}

/** Die Angaben der festen Liste aus den Werten einer Mappe – nichts sonst. */
export function liesAngaben(typ: Pick<Mappentyp, 'felder'> & { register?: Register[] }, werte: Werte): Angaben {
  const aus: Angaben = {};
  for (const [a, f] of Object.entries(angabenFelder(typ)) as Array<[Angabeart, Feld]>) {
    const v = werte[f.key];
    if (typeof v !== 'string') continue;
    const s = v.replace(/\s+/g, ' ').trim().slice(0, ANGABE_MAX);
    if (s) aus[a] = s;
  }
  return aus;
}

/** Eine Stelle hinter einem Verweis: Person oder Organisation mit derselben Liste. */
export interface Stelle { mappeId: string; typId: string; angaben: Angaben }

/** Eine eigene Organisation, so wie die Werkbank und die Auskunft sie sehen. */
export interface EigeneOrganisation {
  mappeId: string;
  typId: string;
  angaben: Angaben;
  /** Verantwortlicher: `selbst` = die Organisation selbst (leer zählt ebenso); sonst die verwiesene Stelle. */
  verantwortlicher: { selbst: true } | Stelle | null;
  datenschutzbeauftragter: Stelle | null;
}

/** Name einer Stelle: Name, sonst Vor- und Nachname. */
export const anzeigename = (a: Angaben): string => a.name ?? [a.vorname, a.nachname].filter(Boolean).join(' ');

/** Anschrift in Zeilen: Name, Straße mit Hausnummer, PLZ mit Ort. */
export function anschriftZeilen(a: Angaben): string[] {
  return [anzeigename(a), [a.strasse, a.hausnummer].filter(Boolean).join(' '), [a.plz, a.ort].filter(Boolean).join(' ')].filter(Boolean);
}
const hatAnschrift = (a: Angaben) => !!(a.strasse || a.plz || a.ort);

/**
 * Name und Anschrift des Verantwortlichen für das Deckblatt der Auskunft und das Löschkonzept (mehrzeilig): der
 * Verantwortliche (bzw. die Organisation selbst), ohne eigene Anschrift die der Organisation; dazu E-Mail, Telefon und –
 * wenn es einen gibt – der Datenschutzbeauftragte. Leer, wenn es nichts zu sagen gibt.
 */
export function verantwortlicherText(o: EigeneOrganisation): string {
  const v = o.verantwortlicher && !('selbst' in o.verantwortlicher) ? o.verantwortlicher.angaben : o.angaben;
  const fremd = v !== o.angaben;
  const zeilen: string[] = [];
  const name = anzeigename(v);
  if (name) zeilen.push(name);
  if (fremd && anzeigename(o.angaben)) zeilen.push(t('gemeinsam.organisation.fuer', { name: anzeigename(o.angaben) }));
  const anschrift = hatAnschrift(v) ? v : o.angaben;
  zeilen.push(...anschriftZeilen(anschrift).slice(anzeigename(anschrift) ? 1 : 0));
  const email = v.email ?? (fremd ? o.angaben.email : undefined);
  const telefon = v.telefon ?? (fremd ? o.angaben.telefon : undefined);
  if (email) zeilen.push(t('gemeinsam.organisation.email', { wert: email }));
  if (telefon) zeilen.push(t('gemeinsam.organisation.telefon', { wert: telefon }));
  const d = o.datenschutzbeauftragter?.angaben;
  if (d && anzeigename(d)) zeilen.push(t('gemeinsam.organisation.datenschutzbeauftragter', { wert: [anzeigename(d), d.email, d.telefon].filter(Boolean).join(', ') }));
  return zeilen.join('\n');
}

/**
 * Welche eigene Organisation für Auskünfte und Unterlagen gilt: die gewählte, solange sie noch eine ist; sonst die
 * einzige. Bei mehreren ohne Wahl keine – die Werkbank bittet dann um eine Wahl.
 */
export function geltendeOrganisation<T extends { mappeId: string }>(liste: T[], e: Pick<OrganisationEinstellung, 'auskunft'>): T | null {
  const gewaehlt = e.auskunft ? liste.find((o) => o.mappeId === e.auskunft) : undefined;
  if (gewaehlt) return gewaehlt;
  return liste.length === 1 ? liste[0] : null;
}

/** Wofür Ablago die Angaben nutzt (Werkbank zeigt das, Ergänzung Sicherheit). */
export type Verwendung = { art: 'auskunft' | 'loeschkonzept' | 'erkennung' } | { art: 'anzeige'; typId: string; typ: string };

/** Stand für die Werkbank (GET /api/werkbank/organisation). */
export interface OrganisationStand {
  /** Eigene Organisationen mit den Angaben der festen Liste – nie mehr. */
  organisationen: EigeneOrganisation[];
  /** Die für Auskünfte und Unterlagen geltende (Id) – null bei keiner oder mehreren ohne Wahl. */
  geltend: string | null;
  einstellung: OrganisationEinstellung;
  /** Mappentypen mit dem Merkmal (meist Basis → Organisation); leer = Paket Basis ab 1.7.0 fehlt. */
  typen: Array<{ id: string; name: string; feld: string }>;
  /** Wo die Angaben verwendet werden. */
  verwendungen: Verwendung[];
  /** Bisherige Angabe „Verantwortlicher“ der Auskunft (vor #995), solange sie noch nicht übernommen ist. */
  bisher: string;
  /** Rollen, die sich freigeben lassen (ohne Konten-Rollen). */
  rollen: Array<{ id: string; name: string }>;
  /** Ungesehene Notizen an die Verwaltung. */
  neu: number;
}
