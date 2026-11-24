/** Erkennung (#1278 aus erkennung.ts): Grundklasse – Erkennung per Paket (#511), Text der Post, eigene Organisation und Haushalt. */
import type { Kern } from '../kern';
import type { ZugriffDienst } from '../zugriff';
import type { MappentypenDienst, KiTypen } from '../mappentypen';
import type { MappenEingaben } from '../mappen';
import type { PostDienst } from '../post';
import type { DokumenteDienst, DokumentArchivfassung } from '../dokumente';
import type { SucheDienst } from '../suche';
import type { Repo } from '../repo';
import type { Einstellungen } from '../einstellungen/einstellungen';
import {
  type ErkennAnbieter,
  type EngineWahl,
  log,
  PAKET_TEXT_MAX,
  ERKENNEN_MS,
  type EigeneLage,
  MAX_EIGENE,
  MAX_MAPPEN,
} from './erkennung-hilfen';
import { hatSchnittstelle, hatNetz } from '../../../shared/src/pakete';
import { Fachfehler } from '../grundlagen/fehler';
import { t } from '../sprache/sprache';
import {
  ENGINE_EINGEBAUT,
  type AusDokument,
  schemaFuer,
  ERKENNEN_HINWEIS,
  type EigeneAngaben,
  artVon,
  eigeneAngaben,
  type Vergleichsmappe,
  merkmalsfelder,
} from '../../../shared/src/erkennung';
import { type Mappentyp, type Feld, auswahlText, type Werte, type Mappe, geschuetzteFelder } from '../../../shared/src/model';
import { liesMerkmale, MERKMALE_EINSTELLUNG } from '../../../shared/src/merkmale';
import { merkmalFeld, istEigeneOrganisation } from '../../../shared/src/organisation';
import { ohneErkennung } from '../../../shared/src/anlagen';

/**
 * Was Erkennung und Klassifizierung vom Dienst brauchen (#1278, Schritt 5b: schmaler Anschluss statt der ganzen Klasse `Dienst`): der Dienst bindet die Erkennung ein, sie
 * bekommt ihn herein.
 */
export interface ErkennungDienst {
  readonly kern: Pick<Kern, 'liesGanz' | 'ereignis' | 'leistung'>;
  readonly rechtepruefung: Pick<ZugriffDienst, 'pruefeRecht' | 'rechteAn' | 'lesbare'>;
  readonly mappentypen: Pick<MappentypenDienst, 'ausDokumentVon' | 'ausPostZiele'>;
  readonly mappenEingaben: Pick<MappenEingaben, 'vorbelegenVorschlaege' | 'folgeVorschlaege'>;
  readonly post: Pick<PostDienst, 'automatischZuordnen'>;
  readonly ki: Pick<KiTypen, 'kiSperreFuer'>;
  readonly dokumente: Pick<DokumenteDienst, 'textAusDatei'>;
  readonly dokumentArchiv: Pick<DokumentArchivfassung, 'wortpositionen'>;
  readonly suche: Pick<SucheDienst, 'aehnlicheTypen'>;
}

export abstract class ErkennungBasis {
  /** Was die Klasse Erkennung setzt (Konstruktor und Felder, erkennung.ts). */
  protected abstract d: ErkennungDienst;
  protected abstract repo: () => Repo;
  protected abstract einst: () => Einstellungen | undefined;
  abstract anbieter?: ErkennAnbieter;

  /* ---------- Erkennung per Paket (#511) ---------- */

  /** Installierte Pakete mit dms:erkennen (auch, wenn der Läufer sie gerade nicht geladen hat). */
  private async erkennPakete(): Promise<Array<{ id: string; name: string; netz: boolean; laeuft: boolean }>> {
    const geladen = new Set((this.anbieter?.pakete() ?? []).map((p) => p.id));
    return (await this.repo().listePakete())
      .filter((p) => hatSchnittstelle(p.laeufer, 'dms:erkennen'))
      .map((p) => ({ id: p.id, name: p.name, netz: hatNetz(p.laeufer), laeuft: geladen.has(p.id) }));
  }

  async standard(): Promise<EngineWahl> {
    const v = (await this.einst()?.lies('erkennung_engine')) as EngineWahl | null;
    return v && typeof v.paket === 'string' ? { paket: v.paket, ...(v.abfluss ? { abfluss: true } : {}) } : { paket: null };
  }

  /** Für die Werkbank: Standard und die Pakete, die es gibt. */
  async engineStand() {
    return { standard: await this.standard(), pakete: await this.erkennPakete() };
  }

  /**
   * Wahl prüfen: Das Paket muss dms:erkennen haben; darf es ins Netz, braucht es die ausdrückliche Bestätigung
   * des Datenabflusses (409 mit details.abfluss, damit die Oberfläche nachfragt).
   */
  private async pruefeWahl(paket: string, abfluss: boolean | undefined) {
    const p = (await this.erkennPakete()).find((x) => x.id === paket);
    if (!p) throw new Fachfehler(422, t('meldungen.erkennung.ist-kein-installiertes-paket', { paket }));
    if (p.netz && abfluss !== true) {
      throw new Fachfehler(409, t('meldungen.erkennung.schickt-den-text-der', { name: p.name }), { abfluss: true, paket: p.name });
    }
  }

  async setzeStandard(e: unknown): Promise<ReturnType<ErkennungBasis['engineStand']>> {
    const s = this.einst();
    if (!s) throw new Fachfehler(404, t('meldungen.erkennung.einstellungen-sind-nicht'));
    const x = (e ?? {}) as { paket?: unknown; abfluss?: unknown };
    const paket = typeof x.paket === 'string' && x.paket && x.paket !== ENGINE_EINGEBAUT ? x.paket : null;
    if (paket) await this.pruefeWahl(paket, x.abfluss === true);
    await s.schreibe('erkennung_engine', paket ? { paket, ...(x.abfluss === true ? { abfluss: true } : {}) } : null);
    log.info('Erkennung für „Aus Dokument ausfüllen“ gewählt', { paket: paket ?? ENGINE_EINGEBAUT, abfluss: x.abfluss === true });
    return this.engineStand();
  }

  /** Wahl am Mappentyp prüfen (beim Speichern des Typs). */
  async pruefeTypWahl(ad: AusDokument | null) {
    if (ad?.engine && ad.engine !== ENGINE_EINGEBAUT) await this.pruefeWahl(ad.engine, ad.abfluss);
  }

  /** Welche Erkennung für diesen Typ gilt: am Typ eingestellt, sonst der Standard aus der Werkbank. */
  protected async wahlFuer(typId: string): Promise<{ engine: string; abfluss: boolean }> {
    const ad = await this.d.mappentypen.ausDokumentVon(typId);
    if (ad?.engine) return { engine: ad.engine, abfluss: !!ad.abfluss };
    const s = await this.standard();
    return { engine: s.paket ?? ENGINE_EINGEBAUT, abfluss: !!s.abfluss };
  }

  /**
   * Das Paket fragen: Typname, JSON Schema der erlaubten Felder (ohne Verweise – die gleicht der Kern selbst ab),
   * Text und Dokument-Ids; Antwort ein Objekt { feld: { wert, sicherheit, fundstelle } } (auch unter „vorschlaege“,
   * dann daneben optional `gekuerzt: true`, wenn das Paket den Text für den Dienst gekürzt hat, #564).
   */
  protected async perPaket(
    p: { id: string; name: string },
    typ: Mappentyp,
    text: string,
    dokumente: string[],
    erlaubt: (f: Feld) => boolean,
  ): Promise<{ vorschlaege: Record<string, unknown>; gekuerzt: boolean; ohneFelder?: true }> {
    const schema = schemaFuer(typ, (f) => erlaubt(f) && f.typ !== 'referenz');
    if (!Object.keys(schema.properties as object).length) return { vorschlaege: {}, gekuerzt: false, ohneFelder: true };
    const r = await this.anbieter!.erkenne(
      p.id,
      { typ: typ.name, schema, text: text.slice(0, PAKET_TEXT_MAX), dokumente, hinweis: ERKENNEN_HINWEIS, sprache: 'de' },
      ERKENNEN_MS,
    );
    const roh = r.text.trim();
    const a = roh.indexOf('{'),
      b = roh.lastIndexOf('}');
    let j: unknown;
    try {
      j = a >= 0 && b > a ? JSON.parse(roh.slice(a, b + 1)) : null;
    } catch {
      j = null;
    }
    if (!j || typeof j !== 'object' || Array.isArray(j)) throw new Error('Die Antwort ist kein JSON-Objekt.');
    const o = j as Record<string, unknown>;
    const huelle = !!o.vorschlaege && typeof o.vorschlaege === 'object' && !Array.isArray(o.vorschlaege);
    const v = huelle ? (o.vorschlaege as Record<string, unknown>) : o;
    // Verweise nie vom Paket: Es kennt keine Mappen; eine Id daraus wäre ungeprüft.
    const vorschlaege = Object.fromEntries(Object.entries(v).filter(([k]) => typ.felder.find((f) => f.key === k)?.typ !== 'referenz'));
    return { vorschlaege, gekuerzt: text.length > PAKET_TEXT_MAX || (huelle && o.gekuerzt === true) };
  }

  /**
   * Eigene Mappen (#995, #1043) mit Systemrechten: Mappen mit dem Merkmal „eigene Organisation“ und Personen des Haushalts.
   * Zum Haushalt gehört, wer ein Konto in dieser Ablage hat; eine Person (Mappe mit Vor- und Nachname bzw. E-Mail) zählt
   * dazu, wenn ihr Name oder ihre E-Mail-Adresse die eines Kontos ist. Liefert nur Ids und Merkmale zum Vergleich – was
   * die Person sieht, entscheidet der Aufrufer über ihre Leserechte.
   */
  async eigeneLage(): Promise<EigeneLage> {
    const typen = await this.repo().listeTypen();
    const ids = new Set<string>();
    const angaben: EigeneAngaben[] = [];
    const btyp = typen.find((x) => x.system === 'benutzer');
    const konten = btyp ? (await this.repo().listeMappen(btyp.id)).slice(0, MAX_EIGENE) : [];
    const kontoNamen = new Set(konten.map((k) => auswahlText(k.werte.name).trim().toLowerCase()).filter((n) => n.includes(' ')));
    const kontoMails = new Set(konten.map((k) => auswahlText(k.werte.email).trim().toLowerCase()).filter(Boolean));
    // Eigene Organisationen nur bei beruflicher Nutzung (#1170); sonst bleibt die Mappe, zählt aber nicht als eigene.
    const beruflich = liesMerkmale(await this.einst()?.lies(MERKMALE_EINSTELLUNG)).beruflich;
    for (const typ of typen) {
      if (typ.system) continue;
      const org = !!merkmalFeld(typ);
      const person = typ.felder.some((f) => artVon(f) === 'nachname') || typ.felder.some((f) => artVon(f) === 'email' && f.typ === 'text');
      if (!org && !person) continue;
      for (const m of (await this.repo().listeMappen(typ.id)).slice(0, MAX_EIGENE)) {
        const e = eigeneAngaben(typ, m);
        const mails = typ.felder
          .filter((f) => artVon(f) === 'email')
          .map((f) => auswahlText(m.werte[f.key]).trim().toLowerCase())
          .filter(Boolean);
        const istPerson = typ.felder.some((f) => artVon(f) === 'nachname') && e.namen.some((n) => kontoNamen.has(n.toLowerCase()));
        if (
          (org && beruflich && istEigeneOrganisation(typ, m.werte as Werte)) ||
          istPerson ||
          (!org && mails.some((x) => kontoMails.has(x)))
        ) {
          ids.add(m.id);
          angaben.push(e);
        }
      }
    }
    // Konten selbst zuletzt (eine Person-Mappe geht vor): Name mit Vor- und Nachname als Aussteller, z. B.
    // „Lena Muster · Lindenweg 4 · 01234 Beispielort“ – auch, wenn es keine Mappe zu ihr gibt.
    for (const k of konten) {
      const n = auswahlText(k.werte.name).trim();
      if (btyp && n.includes(' ')) angaben.push({ mappeId: k.id, typId: btyp.id, namen: [n], ustids: [], ibans: [] });
    }
    return { ids, angaben };
  }

  /** Text, an dem die Erkennung einer Post arbeitet: „von“, Betreff und Nachricht, dann die Volltexte. */
  protected async postText(post: Mappe): Promise<{ text: string; dokumente: number }> {
    const teile = [auswahlText(post.werte.von), auswahlText(post.werte.betreff), auswahlText(post.werte.nachricht)].filter(Boolean);
    let dokumente = 0;
    for (const d of await this.repo().listeDokumente(post.id)) {
      // Anlagen (#998): AGB, Preislisten und Protokolle stören das Auslesen – nur Hauptdokumente; die Original-E-Mail
      // (#999) nie, ihr Text steht schon als Nachricht an der Post.
      if (ohneErkennung(d)) continue;
      const t = d.ocr?.stand === 'fertig' ? await this.repo().volltext(d.id) : null;
      if (t?.trim()) {
        teile.push(t);
        dokumente++;
      }
    }
    return { text: teile.join('\n\n'), dokumente };
  }

  /** Mappentypen mit Merkmalen und ihre Mappen (für den Abgleich). */
  protected async vergleich(): Promise<{ typen: Mappentyp[]; mappen: Vergleichsmappe[] }> {
    const typen = (await this.repo().listeTypen()).filter(
      (t) => t.system !== 'post' && t.system !== 'benutzer' && merkmalsfelder(t).length,
    );
    const mappen: Vergleichsmappe[] = [];
    for (const t of typen) {
      for (const m of await this.repo().listeMappen(t.id)) {
        mappen.push({ id: m.id, typId: m.typId, werte: m.werte, geaendert: m.geaendert });
        if (mappen.length >= MAX_MAPPEN) return { typen, mappen };
      }
    }
    return { typen, mappen };
  }

  /** Felder, die „Aus Dokument ausfüllen“ für diesen Benutzer füllen darf (#391): keine Passwörter, keine festen Felder. */
  protected erlaubteFelder(typ: Mappentyp, mappe?: Mappe): (f: Feld) => boolean {
    const fest = geschuetzteFelder(typ, mappe);
    // Berechnete Felder (#1034, „nie überschreiben“): kein Vorschlag, egal woher.
    return (f) => f.typ !== 'passwort' && !fest[f.key] && !f.berechnetVon;
  }
}
