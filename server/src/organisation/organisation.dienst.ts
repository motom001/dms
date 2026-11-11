/**
 * Eigene Organisation (#995): Werkbank → Benutzer und Sicherheit → Eigene Organisation. Ablago kennt die eigene(n)
 * Organisation(en) über das Merkmal am Mappentyp (Paket Basis) und liest ihre Angaben **mit Systemrechten, nur die feste
 * Liste** aus shared/src/organisation.ts – auch für Verwaltende, die die Mappe selbst nicht sehen dürfen. Geschrieben wird
 * nur in der Ablage mit normalen Rechten; hier liegen nur der Verweis („für Auskünfte und Unterlagen gilt …“), die
 * freigegebenen Rollen für das Merkmal und die Notizen an die Verwaltung.
 *
 * Schicht 3 – bekommt den Kern, die Mappen (Übernehmen der bisherigen Angaben) und die Mail an die Verwaltenden.
 */
import { ANGABE_MAX, anschriftZeilen, anzeigename, geltendeOrganisation, KEINE_ORGANISATION_EINSTELLUNG, liesAngaben, liesOrganisationEinstellung, merkmalFeld, neueNotizen, NOTIZEN_MAX, ORGANISATION_EINSTELLUNG, verantwortlicherText, verweisFelder, angabenFelder, type EigeneOrganisation, type OrganisationEinstellung, type OrganisationNotiz, type OrganisationStand, type Stelle, type Verwendung } from '../../../shared/src/organisation';
import { hatEigeneOrganisationBedingung } from '../../../shared/src/anzeige';
import { liesDatenschutz } from '../../../shared/src/auskunft';
import { istLeer, type Mappe, type Mappentyp } from '../../../shared/src/model';
import { liesPlanOrganisation, ORGANISATION_ANGABEN } from '../../../shared/src/einrichtungsplan';
import { Fachfehler } from '../fehler';
import type { Kern, Zugriff } from '../kern';
import type { MappenDienst } from '../mappen';
import type { MailText } from '../mail';
import { protokoll } from '../protokoll';
import { t } from '../sprache';

const log = protokoll.modul('datenschutz');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Was die Organisation außer dem Kern braucht – vom Dienst hereingereicht. */
export interface OrganisationAnschluss {
  /** Mappen anlegen und ändern (Übernehmen der bisherigen Angaben) – mit den Rechten der Person. */
  mappen(): Pick<MappenDienst, 'legeMappeAn' | 'aendereMappe'>;
  /** Hinweis per E-Mail an alle, die den Bereich „Eigene Organisation“ verwalten (beim Start verbunden, sonst keiner). */
  anVerwaltende(): ((betreff: MailText, text: MailText) => Promise<void>) | undefined;
}

export class OrganisationDienst {
  constructor(private readonly kern: Kern, private readonly anschluss: OrganisationAnschluss) {}

  private get repo() { return this.kern.repo; }
  private get einstellungen() { return this.kern.einstellungen; }

  async einstellung(): Promise<OrganisationEinstellung> {
    return this.einstellungen ? liesOrganisationEinstellung(await this.einstellungen.lies(ORGANISATION_EINSTELLUNG)) : { ...KEINE_ORGANISATION_EINSTELLUNG };
  }

  /**
   * Die eigenen Organisationen mit **Systemrechten**, aber nur der festen Liste: Name, Anschrift, E-Mail, Telefon – je
   * Bedeutung das erste Feld –, dazu Verantwortlicher und Datenschutzbeauftragter mit derselben Liste. Keine Titel (die
   * Titel-Vorlage könnte andere Felder enthalten), keine weiteren Werte.
   */
  async liste(): Promise<EigeneOrganisation[]> {
    const ids = await this.kern.eigeneOrganisationen();
    if (!ids.length) return [];
    const typen = await this.kern.typen();
    const mappen = await this.repo.holeMappen(ids.map((x) => x.id));
    const verweise = new Set<string>();
    for (const m of mappen) {
      const vf = verweisFelder(typen.get(m.typId)!);
      for (const f of Object.values(vf)) { const v = m.werte[f!.key]; if (typeof v === 'string' && UUID.test(v) && v !== m.id) verweise.add(v); }
    }
    const ziele = new Map((await this.repo.holeMappen([...verweise])).map((m) => [m.id, m] as const));
    const stelle = (id: unknown): Stelle | null => {
      const z = typeof id === 'string' ? ziele.get(id) : undefined;
      const typ = z ? typen.get(z.typId) : undefined;
      return z && typ && !typ.system ? { mappeId: z.id, typId: z.typId, angaben: liesAngaben(typ, z.werte) } : null;
    };
    return mappen.filter((m) => typen.has(m.typId)).map((m) => {
      const typ = typen.get(m.typId)!;
      const vf = verweisFelder(typ);
      const v = vf.verantwortlicher ? m.werte[vf.verantwortlicher.key] : undefined;
      return {
        mappeId: m.id, typId: m.typId, angaben: liesAngaben(typ, m.werte),
        verantwortlicher: istLeer(v) || v === m.id ? { selbst: true } : stelle(v),
        datenschutzbeauftragter: vf.datenschutzbeauftragter ? stelle(m.werte[vf.datenschutzbeauftragter.key]) : null,
      } satisfies EigeneOrganisation;
    }).sort((a, b) => anzeigename(a.angaben).localeCompare(anzeigename(b.angaben), 'de'));
  }

  /** Die eigene Organisation für Auskünfte und Unterlagen (gewählt oder die einzige). */
  async geltende(): Promise<EigeneOrganisation | null> {
    return geltendeOrganisation(await this.liste(), await this.einstellung());
  }

  /** Name und Anschrift des Verantwortlichen für Auskunft und Löschkonzept; null = keine eigene Organisation (dann gilt die bisherige Angabe). */
  async verantwortlicherText(): Promise<string | null> {
    const o = await this.geltende();
    const text = o ? verantwortlicherText(o) : '';
    return text || null;
  }

  /** Stand für die Werkbank (nur die feste Liste, siehe `liste`). */
  async stand(): Promise<OrganisationStand> {
    const [organisationen, einstellung] = await Promise.all([this.liste(), this.einstellung()]);
    const alle = [...(await this.kern.typen()).values()];
    const typen = alle.flatMap((x) => { const f = merkmalFeld(x); return f && !x.system ? [{ id: x.id, name: x.name, feld: f.label }] : []; });
    const anzeige = alle.filter((x) => hatEigeneOrganisationBedingung(x)).map((x): Verwendung => ({ art: 'anzeige', typId: x.id, typ: x.name }));
    const sys = await this.kern.system();
    const kontorollen = new Set(sys.kontorollen.values());
    const rollen = (await this.repo.listeMappen(sys.rolle.id)).filter((m) => !kontorollen.has(m.id)).map((m) => ({ id: m.id, name: m.titel || String(m.werte.name ?? '') }))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
    return {
      organisationen, geltend: geltendeOrganisation(organisationen, einstellung)?.mappeId ?? null, einstellung, typen,
      verwendungen: [{ art: 'auskunft' }, { art: 'loeschkonzept' }, { art: 'erkennung' }, ...anzeige],
      bisher: liesDatenschutz(await this.einstellungen?.lies('datenschutz')).verantwortlicher, rollen, neu: neueNotizen(einstellung).length,
    };
  }

  /**
   * „Für Auskünfte und Unterlagen gilt …“ und die freigegebenen Rollen ändern. Die Wahl muss eine eigene Organisation
   * sein, die Rollen Rollen-Mappen (ohne Konten-Rollen). Jede Änderung steht im Systemprotokoll.
   */
  async setze(eingabe: unknown, von: string): Promise<OrganisationStand> {
    if (!this.einstellungen) throw new Fachfehler(404, t('meldungen.dienst.einstellungen-sind-nicht'));
    const o = eingabe && typeof eingabe === 'object' && !Array.isArray(eingabe) ? eingabe as Record<string, unknown> : {};
    const alt = await this.einstellung();
    const neu = { ...alt };
    if ('auskunft' in o) neu.auskunft = await this.pruefeWahl(o.auskunft);
    if ('rollen' in o) neu.rollen = await this.pruefeRollen(o.rollen);
    if (o.gesehen === true) neu.gesehen = new Date().toISOString();
    await this.einstellungen.schreibe(ORGANISATION_EINSTELLUNG, neu);
    if (alt.auskunft !== neu.auskunft) log.warn('Eigene Organisation für Auskünfte und Unterlagen gewählt', { vorher: alt.auskunft ?? '–', nachher: neu.auskunft ?? '–', von });
    if (alt.rollen.join(',') !== neu.rollen.join(',')) log.warn('Rollen für das Merkmal „eigene Organisation“ geändert', { vorher: alt.rollen.join(', ') || '–', nachher: neu.rollen.join(', ') || '–', von });
    return this.stand();
  }

  /** Wahl „für Auskünfte und Unterlagen gilt …“: leer oder eine eigene Organisation. */
  private async pruefeWahl(v: unknown): Promise<string | null> {
    if (v === null || v === '') return null;
    if (typeof v === 'string' && (await this.kern.eigeneOrganisationen()).some((x) => x.id === v)) return v;
    throw new Fachfehler(422, t('meldungen.organisation.keine-eigene'));
  }

  /** Freigegebene Rollen: nur Rollen-Mappen, ohne Konten-Rollen (Systemkonto, Paket). */
  private async pruefeRollen(v: unknown): Promise<string[]> {
    if (!Array.isArray(v)) throw new Fachfehler(422, t('meldungen.organisation.rollen-ungueltig'));
    const sys = await this.kern.system();
    const kontorollen = new Set(sys.kontorollen.values());
    const da = new Set((await this.repo.listeMappen(sys.rolle.id)).filter((m) => !kontorollen.has(m.id)).map((m) => m.id));
    if (v.some((r) => typeof r !== 'string' || !da.has(r))) throw new Fachfehler(422, t('meldungen.organisation.rollen-ungueltig'));
    return liesOrganisationEinstellung({ rollen: v }).rollen;
  }

  /**
   * Nach dem Speichern einer Mappe (MappenAnschluss): Das Merkmal oder ein Verantwortlicher hat sich geändert. Steht im
   * Systemprotokoll, als Notiz in der Werkbank und – mit E-Mail-Versand – per Mail an die Verwaltenden des Bereichs.
   * Fehler nur im Protokoll.
   */
  async geaendert(e: { mappeId: string; was: Array<OrganisationNotiz['was']>; von: string | null }): Promise<void> {
    try {
      const m = await this.repo.holeMappe(e.mappeId);
      const typ = m ? await this.repo.holeTyp(m.typId) : undefined;
      const name = m && typ ? anzeigename(liesAngaben(typ, m.werte)) : '';
      const von = e.von ? await this.kern.name(e.von) : t('meldungen.organisation.system');
      const am = new Date().toISOString();
      for (const was of e.was) log.warn(LOGTEXT[was], { mappe: e.mappeId, name, von });
      if (this.einstellungen) {
        const alt = await this.einstellung();
        const neu: OrganisationNotiz[] = e.was.map((was) => ({ am, von, mappeId: e.mappeId, titel: name, was }));
        await this.einstellungen.schreibe(ORGANISATION_EINSTELLUNG, { ...alt, notizen: [...neu, ...alt.notizen].slice(0, NOTIZEN_MAX) });
      }
      const mail = this.anschluss.anVerwaltende();
      if (mail) {
        const was = () => e.was.map((x) => t.frei(`meldungen.organisation.notiz.${x}`)).join(', ');
        await mail(() => t('meldungen.organisation.mail.betreff'), () => t('meldungen.organisation.mail.text', { name: name || '–', was: was(), von }));
      }
    } catch (f) { log.warn('Notiz zur eigenen Organisation nicht geschrieben', { fehler: (f as Error).message }); }
  }

  /**
   * Bisherige Angabe übernehmen (#995: „die bisherigen Felder in den Einstellungen der Auskunft ziehen um“): legt aus
   * dem mehrzeiligen Text „Verantwortlicher“ eine Organisation mit dem Merkmal an – mit den Rechten der Person (im
   * Verwaltungsmodus) und erst, wenn es noch keine eigene Organisation gibt. Danach ist die alte Angabe leer.
   */
  async uebernehmen(z: Zugriff, benutzerId: string): Promise<OrganisationStand> {
    const ds = liesDatenschutz(await this.einstellungen?.lies('datenschutz'));
    if (!ds.verantwortlicher.trim()) throw new Fachfehler(409, t('meldungen.organisation.nichts-bisher'));
    const typ = await this.typFuerNeue();
    const m = await this.legeAn(typ, werteAusText(typ, ds.verantwortlicher), z, benutzerId);
    await this.einstellungen?.schreibe('datenschutz', { ...ds, verantwortlicher: '' });
    log.warn('Bisherige Angabe „Verantwortlicher“ als eigene Organisation übernommen', { mappe: m.id, von: benutzerId });
    return this.stand();
  }

  /**
   * „Deine Organisation“ aus dem Einrichtungsassistenten (#1045): legt aus wenigen Angaben (Name Pflicht; Anschrift,
   * E-Mail, Telefon freiwillig) die eigene Organisation an – wie `uebernehmen` mit den Rechten der Person und nur, wenn es
   * noch keine gibt. Die Angaben landen in den Feldern der festen Liste (je Bedeutung das erste Feld); mehr nicht.
   */
  async anlegen(eingabe: unknown, z: Zugriff, benutzerId: string): Promise<OrganisationStand> {
    const o = liesPlanOrganisation(eingabe);
    if (!o?.name) throw new Fachfehler(422, t('meldungen.organisation.name-fehlt'));
    const typ = await this.typFuerNeue();
    const felder = angabenFelder(typ);
    const werte: Record<string, unknown> = {};
    for (const k of ORGANISATION_ANGABEN) {
      const f = felder[k];
      if (f && o[k]) werte[f.key] = o[k].slice(0, f.maxLen ?? ANGABE_MAX);
    }
    werte[merkmalFeld(typ)!.key] = true;
    const m = await this.legeAn(typ, werte, z, benutzerId);
    log.warn('Eigene Organisation im Einrichtungsassistenten angelegt', { mappe: m.id, von: benutzerId });
    return this.stand();
  }

  /** Mappentyp für eine neue eigene Organisation – nur, solange es keine gibt (sonst gehört es in die Ablage). */
  private async typFuerNeue(): Promise<Mappentyp> {
    if ((await this.kern.eigeneOrganisationen()).length) throw new Fachfehler(409, t('meldungen.organisation.schon-da'));
    const typ = [...(await this.kern.typen()).values()].find((x) => merkmalFeld(x) && !x.system);
    if (!typ) throw new Fachfehler(409, t('meldungen.organisation.ohne-basis'));
    return typ;
  }

  /** Anlegen mit den Rechten der Person; verantwortlich ist die Organisation selbst (der Verweis geht erst mit ihrer Id). */
  private async legeAn(typ: Mappentyp, werte: Record<string, unknown>, z: Zugriff, benutzerId: string): Promise<Mappe> {
    const m: Mappe = await this.anschluss.mappen().legeMappeAn({ typId: typ.id, werte }, benutzerId, false, z);
    const vf = verweisFelder(typ).verantwortlicher;
    if (vf) await this.anschluss.mappen().aendereMappe(m.id, { werte: { [vf.key]: m.id } }, benutzerId, z);
    return m;
  }
}

const LOGTEXT: Record<OrganisationNotiz['was'], string> = {
  'merkmal-an': 'Merkmal „eigene Organisation“ gesetzt',
  'merkmal-aus': 'Merkmal „eigene Organisation“ entfernt',
  verantwortlicher: 'Verantwortlicher einer eigenen Organisation geändert',
  datenschutzbeauftragter: 'Datenschutzbeauftragter einer eigenen Organisation geändert',
};

/**
 * Aus dem bisherigen Text (Name und Anschrift, mehrzeilig) Werte für die neue Organisation: erste Zeile Name, „Straße
 * Hausnummer“, „PLZ Ort“, E-Mail und Telefon, so weit sie sich erkennen lassen. Was nicht passt, steht in der Beschreibung.
 */
export function werteAusText(typ: Mappentyp, text: string): Record<string, unknown> {
  const felder = angabenFelder(typ);
  const zeilen = text.split('\n').map((z) => z.trim()).filter(Boolean);
  const werte: Record<string, unknown> = {};
  const rest: string[] = [];
  const setze = (art: keyof typeof felder, v: string) => { const f = felder[art]; if (f && !werte[f.key]) { werte[f.key] = v.slice(0, f.maxLen ?? 200); return true; } return false; };
  zeilen.forEach((z, i) => {
    const email = z.match(/[^\s@:]+@[^\s@]+\.[^\s@]+/);
    const plzOrt = z.match(/^(\d{4,5})\s+(.+)$/);
    const strasse = z.match(/^(.+?)\s+(\d+\s*[a-zA-Z]?(?:[-/]\d+\s*[a-zA-Z]?)?)$/);
    const telefon = z.match(/^(?:tel(?:efon)?\.?:?\s*)?(\+?[\d][\d\s/()-]{5,})$/i);
    let ok = false;
    if (i === 0) ok = setze('name', z);
    else if (email) ok = setze('email', email[0]);
    else if (plzOrt) ok = setze('plz', plzOrt[1]) && setze('ort', plzOrt[2]);
    else if (telefon) ok = setze('telefon', telefon[1].trim());
    else if (strasse) ok = setze('strasse', strasse[1]) && setze('hausnummer', strasse[2]);
    if (!ok) rest.push(z);
  });
  const mf = merkmalFeld(typ);
  if (mf) werte[mf.key] = true;
  const beschreibung = typ.felder.find((f) => f.key === 'beschreibung' && (f.typ === 'langtext' || f.typ === 'text'));
  if (rest.length && beschreibung) werte[beschreibung.key] = rest.join('\n');
  return werte;
}

/** Name einer eigenen Organisation für Listen: Name aus der festen Liste, sonst die Anschrift. */
export const organisationName = (o: EigeneOrganisation) => anzeigename(o.angaben) || anschriftZeilen(o.angaben)[0] || '';
