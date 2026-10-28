import { createHash, randomUUID } from 'node:crypto';
import {
  darfErstellen, darfLoeschen, ersterGrund, FELDTYPEN, formatiere, geschuetzteFelder, istLeer, istPasswortWert, istSystemspalte, sortierbar, istOk, leseZahl, MAX_DATEIGROESSE, pruefeMappe, pruefeMappentyp,
  REGISTERARTEN, ROLLEN, schluesselAus, standardRegister, systemfelder, systemrolleKennung, titelAus, verweiseVon,
  AUFGABE_MAX, istEmail, NOTIZ_MAX, type Aufgabe, type Benutzer, type Feld, type Feldaenderung, type Notiz, type Historienart, type Historieneintrag, type Mappe, type Mappentyp, type MappentypDaten, type Register, type Rolle, type Systemtyp, type Werte,
} from '../../shared/src/model';
import type { Dateispeicher } from './dateispeicher';
import type { Mailer } from './mail';
import { Auftraege } from './auftrag';
import { protokoll } from './protokoll';
import { Fachfehler } from './fehler';
import { alsText, erwaehnungen } from '../../shared/src/markdown';
import { istVerschluesselt, type Betroffen, type Tresor } from './tresor';
import type { Einstellungen } from './einstellungen';
import { istUuid, type NeueMappe, type PapierkorbEintrag, type Repo, type Rueckverweis, type SortierungIntern } from './repo';
import {
  bereinigeBedingungen, heuteIn, kinderVon, klauselnFuer, waereKreis, wirksameTypen,
  type Aufloesung, type Sicht, type SichtDaten,
} from '../../shared/src/sichten';

/* ---------- Eingaben bereinigen: nur bekannte Eigenschaften übernehmen ---------- */

const text = (v: unknown) => (v == null ? '' : String(v)).trim();
function zahlOderNull(v: unknown): number | null {
  const n = leseZahl(v);
  return n == null || Number.isNaN(n) ? null : n;
}

export function bereinigeFeld(e: unknown): Feld {
  const f = (e ?? {}) as Record<string, unknown>;
  const typ = (text(f.typ) in FELDTYPEN ? text(f.typ) : 'text') as Feld['typ'];
  const std = f.standard;
  return {
    key: text(f.key),
    label: text(f.label),
    typ,
    pflicht: !!f.pflicht,
    eindeutig: !!f.eindeutig && (typ === 'text' || typ === 'zahl'),
    hilfe: text(f.hilfe),
    standard: std == null || std === '' || typ === 'passwort' ? null : typeof std === 'boolean' ? std : String(std),
    minLen: zahlOderNull(f.minLen),
    maxLen: zahlOderNull(f.maxLen),
    muster: text(f.muster),
    min: zahlOderNull(f.min),
    max: zahlOderNull(f.max),
    nachkomma: zahlOderNull(f.nachkomma),
    waehrung: typ === 'betrag' ? (text(f.waehrung) || 'EUR').toUpperCase().slice(0, 3) : undefined,
    optionen: Array.isArray(f.optionen) ? f.optionen.map(text).filter(Boolean) : [],
    mehrfach: !!f.mehrfach && (typ === 'auswahl' || typ === 'referenz'),
    zielTyp: typ === 'referenz' ? text(f.zielTyp) : '',
    verweisart: f.verweisart === 'zugehoerigkeit' ? 'zugehoerigkeit' : 'bezug',
  };
}

export function bereinigeRegister(e: unknown, felder: Feld[]): Register[] {
  if (!Array.isArray(e) || !e.length) return standardRegister(felder);
  const bekannt = new Set(felder.map((f) => f.key));
  const reg = e.map((x: Record<string, unknown>): Register => {
    const art = (String(x?.art) in REGISTERARTEN ? x.art : 'felder') as Register['art'];
    const r: Register = { key: text(x?.key) || schluesselAus(text(x?.name)), name: text(x?.name), art };
    if (art === 'felder') r.felder = (Array.isArray(x?.felder) ? x.felder.map(text) : []).filter((k) => bekannt.has(k));
    if (art === 'verknuepfungen') {
      r.quellen = (Array.isArray(x?.quellen) ? x.quellen : [])
        .map((q: Record<string, unknown>) => ({ typId: text(q?.typId), feldKey: text(q?.feldKey) }))
        .filter((q) => q.typId && q.feldKey);
    }
    // Volltext (#45): nur das Abschalten wird gespeichert; Standard ist an.
    if (art === 'dokumente' && x?.volltext === false) r.volltext = false;
    return r;
  });
  // Felder ohne Register landen auf dem ersten Feldregister.
  const erstes = reg.find((r) => r.art === 'felder');
  if (erstes) {
    const vergeben = new Set(reg.flatMap((r) => r.felder ?? []));
    for (const f of felder) if (!vergeben.has(f.key)) erstes.felder!.push(f.key);
  }
  return reg;
}

export function bereinigeTyp(e: unknown): MappentypDaten {
  const t = (e ?? {}) as Record<string, unknown>;
  const felder = Array.isArray(t.felder) ? t.felder.map(bereinigeFeld) : [];
  return {
    name: text(t.name),
    beschreibung: text(t.beschreibung),
    // Altes Format: titelFeld → Vorlage {feld}
    titelVorlage: text(t.titelVorlage) || (text(t.titelFeld) ? `{${text(t.titelFeld)}}` : ''),
    felder,
    register: bereinigeRegister(t.register, felder),
    // Nur bekannte Spalten, jede einmal; Spalten entfernter Felder fallen still weg.
    trefferliste: [...new Set((Array.isArray(t.trefferliste) ? t.trefferliste : []).map(text))]
      .filter((k) => (istSystemspalte(k) && k !== '_typ') || felder.some((f) => f.key === k && f.typ !== 'passwort')),
    erstellenErlaubt: t.erstellenErlaubt !== false,
    loeschenErlaubt: t.loeschenErlaubt !== false,
  };
}

/** Wert eines Mehrfachverweises als Liste. */
const alsListe = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? [v] : []);

/** Für die Benutzerverwaltung: Benutzer-Mappen anlegen, nachziehen und entfernen. */
export interface Benutzerspiegel {
  /** Legt die Mappe des Benutzers an oder zieht sie nach (Name, E-Mail, Systemrolle, aktiv). */
  aktualisiere(b: Benutzer, von?: string | null): Promise<void>;
  /** Entfernt die Mappe; wirft, wenn noch etwas auf sie verweist. */
  entferne(id: string): Promise<void>;
  /** Ist der Papierkorb an (#43)? Dann wird ein Benutzer deaktiviert und seine Mappe kommt in den Papierkorb. */
  papierkorbAn?(): Promise<boolean>;
  /** Legt die Mappe in den Papierkorb; wirft, wenn noch etwas auf sie verweist. */
  inPapierkorb?(id: string, von: string | null): Promise<void>;
}

/** Was mit dem Konto geschieht, wenn eine Benutzer-Mappe den Papierkorb verlässt (#43). */
export interface KontenHaken {
  /** Endgültig gelöscht: Konto löschen. */
  endgueltig(id: string): Promise<void>;
  /** Wiederhergestellt: Konto wieder aktivieren. */
  wiederda(id: string, von: string | null): Promise<void>;
}

export const PAPIERKORB_STANDARD_TAGE = 30;
/** Anhänge einer E-Mail zusammen höchstens (#58); die Oberfläche warnt schon ab 20 MB. */
export const EMAIL_MAX_ANHAENGE = 50_000_000;
export const EMAIL_MAX_EMPFAENGER = 20;
export const HISTORIE_STANDARD_TAGE = 365;
export interface DienstOptionen {
  /** Schlüssel für Passwortfelder (#39, #46). */
  tresor?: Tresor;
  /** Einstellungen des Haushalts (Papierkorb). Ohne: kein Papierkorb (Löschen sofort endgültig). */
  einstellungen?: Einstellungen;
}

const SYSTEMSORTIERUNG: Record<string, SortierungIntern['art']> = {
  _titel: 'titel', _typ: 'typ', _erstellt: 'erstellt', _geaendert: 'geaendert', _erstelltVon: 'erstelltVon', _geaendertVon: 'geaendertVon',
};
/** Sortierung aus Spalte und Richtung; unbekannte oder nicht sortierbare Spalten → nach Titel. */
export function sortierungAus(spalte: string, absteigend: boolean, typ?: Mappentyp): SortierungIntern | undefined {
  if (!spalte) return undefined;
  if (SYSTEMSORTIERUNG[spalte]) return { art: SYSTEMSORTIERUNG[spalte], absteigend };
  const f = typ?.felder.find((x) => x.key === spalte);
  if (!f || !sortierbar(spalte, typ)) return undefined;
  const art = f.typ === 'zahl' || f.typ === 'betrag' || f.typ === 'datum' || f.typ === 'janein' ? f.typ : 'text';
  return { art, key: f.key, absteigend };
}

/** Dateiname ohne Pfadanteile und Steuerzeichen. */
function dateiname(v: unknown): string {
  // eslint-disable-next-line no-control-regex
  const s = text(v).split(/[\\/]/).pop()!.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (s || 'Dokument').slice(0, 200);
}

/** Nur PDF und gängige Bilder werden im Browser angezeigt – erkannt am Inhalt, nicht am Namen. */
export function erkenneAnzeigbar(b: Buffer): string | null {
  const kopf = b.subarray(0, 12).toString('latin1');
  if (kopf.startsWith('%PDF-')) return 'application/pdf';
  if (b[0] === 0x89 && kopf.slice(1, 4) === 'PNG') return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (kopf.startsWith('GIF87a') || kopf.startsWith('GIF89a')) return 'image/gif';
  if (kopf.startsWith('RIFF') && kopf.slice(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** Nur Werte zu bekannten Feldern; leere Eingaben werden zu null. */
/**
 * Passwortfeld (#46): neues Passwort verschlüsseln, entfernen oder das bisherige behalten.
 * - { neu: '…' } oder ein Text: neues Passwort
 * - null, '' oder { entfernen: true }: entfernen
 * - fehlt oder { gesetzt: true } (so, wie die Oberfläche es bekam): unverändert
 */
function passwortWert(eingabe: unknown, hatEingabe: boolean, bisher: unknown, verschluessele: (k: string) => string): Werte[string] {
  // Ohne Eingabe oder unverändert durchgereicht (System, z. B. beim Nachziehen einer Benutzer-Mappe): behalten.
  if (!hatEingabe || (eingabe === bisher && eingabe !== undefined)) return (bisher ?? null) as Werte[string];
  if (eingabe === null || eingabe === '') return null;
  if (typeof eingabe === 'string') {
    if (eingabe.startsWith('dms1$')) throw new Fachfehler(422, 'Verschlüsselte Werte lassen sich nicht direkt setzen.');
    return verschluessele(eingabe.slice(0, 1000));
  }
  if (istPasswortWert(eingabe)) {
    if (eingabe.entfernen) return null;
    if (typeof eingabe.neu === 'string' && eingabe.neu !== '') return verschluessele(eingabe.neu.slice(0, 1000));
    return (eingabe.gesetzt ? bisher ?? null : null) as Werte[string];
  }
  throw new Fachfehler(422, 'Ungültiger Wert für ein Passwortfeld.');
}

function bereinigeWerte(typ: Mappentyp, eingabe: unknown, bisher: Werte = {}, verschluessele: (k: string) => string = keinSchluessel): Werte {
  const roh = (eingabe && typeof eingabe === 'object' ? eingabe : {}) as Record<string, unknown>;
  const bekannt = new Set(typ.felder.map((f) => f.key));
  const werte: Werte = {};
  // Werte aus entfernten Feldern bleiben erhalten.
  for (const [k, v] of Object.entries(bisher)) if (!bekannt.has(k)) werte[k] = v;
  for (const f of typ.felder) {
    if (f.typ === 'passwort') { werte[f.key] = passwortWert(roh[f.key], f.key in roh, bisher[f.key], verschluessele); continue; }
    const v = f.key in roh ? roh[f.key] : bisher[f.key];
    werte[f.key] = istLeer(v) ? (f.typ === 'janein' ? false : null) : (v as Werte[string]);
  }
  return werte;
}

const keinSchluessel = (): never => {
  throw new Fachfehler(409, 'Passwörter lassen sich erst speichern, wenn es einen Schlüssel gibt. Ein Administrator erzeugt ihn in der Werkbank unter „Verschlüsselung“.');
};

/* ---------- Fachlogik ---------- */

export class Dienst {
  /** Hintergrundaufträge, z. B. Demo-Daten erzeugen. */
  readonly auftraege = new Auftraege((m) => protokoll.modul('werkbank').info(m));

  private tresor?: Tresor;
  private einstellungen?: Einstellungen;
  private konten?: KontenHaken;

  constructor(private repo: Repo, private dateien: Dateispeicher, opt: DienstOptionen = {}) {
    this.tresor = opt.tresor;
    this.einstellungen = opt.einstellungen;
    this.tresor?.registriere(() => this.unlesbarePasswoerter());
  }

  /** Konten anbinden: Benutzer-Mappen im Papierkorb (#43). */
  verbindeKonten(h: KontenHaken) { this.konten = h; }

  /** Texterkennung anbinden (#45): neue Dokumente stoßen sie an. */
  private ocr?: { anstossen(): void };
  verbindeTexterkennung(t: { anstossen(): void }) { this.ocr = t; }

  /* ---------- Volltext (#45) ---------- */

  /** Erzeugt dieses Dokumentenregister einen Volltext? (Standard: ja) */
  private static volltextAn(typ: Mappentyp | undefined, registerKey: string) {
    const r = typ?.register.find((x) => x.key === registerKey);
    return !r || r.art !== 'dokumente' || r.volltext !== false;
  }

  /** Volltext für vorhandene Dokumente nachholen (Werkbank → Wartungsoperationen). */
  async volltextNachholen(): Promise<number> {
    const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t]));
    const ids = (await this.repo.ocrOhneVolltext()).filter((d) => Dienst.volltextAn(typen.get(d.typId), d.registerKey)).map((d) => d.id);
    await this.repo.ocrEinreihen(ids);
    if (ids.length) protokoll.modul('werkbank').info('Volltext für vorhandene Dokumente nachholen', { dokumente: ids.length });
    this.ocr?.anstossen();
    return ids.length;
  }

  /** Texterkennung für ein Dokument erneut versuchen. */
  async texterkennungErneut(id: string) {
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, 'Dieses Dokument gibt es nicht.');
    await this.repo.ocrEinreihen([id]);
    this.ocr?.anstossen();
    return (await this.repo.holeDokument(id))!;
  }

  async volltext(id: string) {
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, 'Dieses Dokument gibt es nicht.');
    return { dokument: d, text: await this.repo.volltext(id) };
  }

  private verschluessele = (klartext: string) => (this.tresor ? this.tresor.verschluessele(klartext) : keinSchluessel());

  /* ---------- Passwortfelder (#46) ---------- */

  /** Lassen sich gerade Passwörter speichern? */
  get passwoerterMoeglich() { return !!this.tresor?.bereit; }

  /** Passwortfelder, die mit dem vorhandenen Schlüssel nicht lesbar sind (für die Werkbank). */
  async unlesbarePasswoerter(): Promise<Betroffen[]> {
    const out: Betroffen[] = [];
    for (const t of await this.repo.listeTypen()) {
      const felder = t.felder.filter((f) => f.typ === 'passwort');
      if (!felder.length) continue;
      for (const m of await this.repo.listeMappen(t.id)) {
        for (const f of felder) {
          const v = m.werte[f.key];
          if (istVerschluesselt(v) && !this.tresor?.lesbar(v)) out.push({ bereich: t.name, was: `${m.titel || 'Mappe ohne Titel'}: ${f.label}`, wo: 'in der Ablage neu eingeben' });
        }
      }
    }
    return out;
  }

  /** Klartext eines Passworts zum Anzeigen; jeder Aufruf steht im Protokoll (ohne den Wert). */
  async zeigePasswort(mappeId: string, feldKey: string, benutzerId: string | null = null): Promise<{ wert: string }> {
    const m = await this.repo.holeMappe(mappeId);
    if (!m) throw new Fachfehler(404, 'Diese Mappe gibt es nicht.');
    const typ = await this.repo.holeTyp(m.typId);
    const f = typ?.felder.find((x) => x.key === feldKey && x.typ === 'passwort');
    if (!f) throw new Fachfehler(404, 'Dieses Passwortfeld gibt es nicht.');
    const v = m.werte[f.key];
    if (!istVerschluesselt(v)) throw new Fachfehler(404, 'In diesem Feld ist kein Passwort gespeichert.');
    const klar = this.tresor?.entschluessele(v) ?? null;
    if (klar === null) throw new Fachfehler(409, 'Dieses Passwort ist nicht lesbar: Der Schlüssel, mit dem es gespeichert wurde, fehlt. Bitte neu eingeben.');
    protokoll.modul('ablage').info('Passwort angezeigt', { mappe: m.titel || m.id, mappeId: m.id, feld: f.label });
    await this.notiere(m.id, benutzerId, 'passwort_angezeigt', { feld: f.label });
    return { wert: klar };
  }

  /**
   * Für die API mit dem Recht „Passwörter lesen“: Passwörter einer oder mehrerer Mappen
   * im Klartext; je Mappe ein Protokolleintrag (ohne die Werte).
   */
  async entschluesselePasswoerter<T extends Mappe>(mappen: T[], wer: string, benutzerId: string | null = null): Promise<T[]> {
    const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t]));
    const historie: Parameters<Repo['historieSchreibe']>[0] = [];
    const ergebnis = mappen.map((m) => {
      const felder = typen.get(m.typId)?.felder.filter((f) => f.typ === 'passwort' && istVerschluesselt(m.werte[f.key])) ?? [];
      if (!felder.length) return m;
      const werte = { ...m.werte };
      for (const f of felder) werte[f.key] = this.tresor?.entschluessele(werte[f.key] as string) ?? null;
      protokoll.modul('ablage').info('Passwörter über die API abgerufen', { mappe: m.titel || m.id, mappeId: m.id, felder: felder.map((f) => f.label).join(', '), schluessel: wer });
      historie.push({ mappeId: m.id, benutzerId, art: 'passwort_angezeigt', daten: { feld: felder.map((f) => f.label).join(', '), api: wer } });
      return { ...m, werte };
    });
    await this.repo.historieSchreibe(historie);
    return ergebnis;
  }

  /* ---------- Aufgaben (#54) und Erwähnungen (#56) ---------- */

  private async name(benutzerId: string | null): Promise<string> {
    if (!benutzerId) return 'Administratoren';
    return (await this.repo.titelVon([benutzerId])).get(benutzerId)?.replace(/ \(ehemalig\)$/, '') || 'unbekannt';
  }

  /** Ein aktiver Benutzer (seine Benutzer-Mappe), sonst 422. */
  private async pruefeEmpfaenger(id: unknown): Promise<string> {
    const { benutzer } = await this.sichereSystem();
    const m = istUuid(id) ? await this.repo.holeMappe(id) : undefined;
    if (!m || m.typId !== benutzer.id) throw new Fachfehler(422, 'Bitte einen Benutzer als Empfänger wählen.');
    if (m.werte.aktiv === false) throw new Fachfehler(422, 'Dieser Benutzer ist deaktiviert.');
    return m.id;
  }

  /**
   * Neue @-Erwähnungen in formatiertem Text werden Aufgaben (#56). Gibt es für Benutzer und Feld
   * schon eine offene, entsteht keine zweite; entfernte Erwähnungen stehen nur in der Historie.
   */
  private async pruefeErwaehnungen(typ: Mappentyp, mappeId: string, alt: Werte, neu: Werte, von: string | null) {
    for (const f of typ.felder.filter((x) => x.typ === 'formatiert')) {
      await this.erwaehnungenAbgleichen(mappeId, { key: f.key, ort: `in „${f.label}“` }, String(alt[f.key] ?? ''), String(neu[f.key] ?? ''), von);
    }
  }

  /**
   * Gemeinsamer Abgleich für Felder und Notizen (#81): `quelle.key` unterscheidet die Stelle
   * (Feldschlüssel oder `notiz:<id>`), `quelle.ort` steht im Text („in „Beschreibung““, „in einer Notiz“).
   */
  private async erwaehnungenAbgleichen(mappeId: string, quelle: { key: string; ort: string; auszug?: string }, altText: string, neuText: string, von: string | null) {
    const vorher = new Set(erwaehnungen(altText));
    const jetzt = new Set(erwaehnungen(neuText));
    if (!vorher.size && !jetzt.size) return;
    const { benutzer } = await this.sichereSystem();
    const offen = (await this.repo.offeneAufgaben({ mappeIds: [mappeId] })).filter((a) => a.art === 'erwaehnung' && a.feldKey === quelle.key);
    for (const id of jetzt) {
      if (vorher.has(id) || id === von || offen.some((a) => a.empfaengerId === id)) continue;
      const m = await this.repo.holeMappe(id);
      if (!m || m.typId !== benutzer.id || m.werte.aktiv === false) continue;
      const a = await this.repo.legeAufgabeAn({
        id: randomUUID(), mappeId, empfaengerId: id, art: 'erwaehnung', feldKey: quelle.key,
        text: `Erwähnt von ${await this.name(von)} ${quelle.ort}${quelle.auszug ? `: ${quelle.auszug}` : ''}`.slice(0, AUFGABE_MAX),
        erstellt: '', erstelltVon: von, erledigt: null, erledigtVon: null,
      });
      await this.notiere(mappeId, von, 'aufgabe', { text: `${await this.name(id)} erwähnt ${quelle.ort}`, aufgabe: a.id, aufgabenart: 'erwaehnung', fuer: id, aufgabentext: a.text });
    }
    for (const id of vorher) {
      if (!jetzt.has(id)) await this.notiere(mappeId, von, 'aufgabe', { text: `Erwähnung von ${await this.name(id)} ${quelle.ort} entfernt` });
    }
  }


  /** Aufgabe von Hand vergeben, z. B. „Bitte Rechnung prüfen“. */
  async legeAufgabeAn(mappeId: string, e: unknown, von: string | null): Promise<Aufgabe> {
    if (!(await this.repo.holeMappe(mappeId))) throw new Fachfehler(404, 'Diese Mappe gibt es nicht.');
    const x = (e ?? {}) as Record<string, unknown>;
    const text = typeof x.text === 'string' ? x.text.trim() : '';
    if (!text) throw new Fachfehler(422, 'Bitte beschreiben, was zu tun ist.');
    if (text.length > AUFGABE_MAX) throw new Fachfehler(422, `Höchstens ${AUFGABE_MAX} Zeichen.`);
    const an = await this.pruefeEmpfaenger(x.empfaengerId);
    const a = await this.repo.legeAufgabeAn({ id: randomUUID(), mappeId, empfaengerId: an, art: 'manuell', text, erstellt: '', erstelltVon: von, erledigt: null, erledigtVon: null });
    await this.notiere(mappeId, von, 'aufgabe', { text: `für ${await this.name(an)}: ${text}`, aufgabe: a.id, aufgabenart: 'manuell', fuer: an, aufgabentext: text });
    protokoll.modul('ablage').info('Aufgabe vergeben', { mappeId, an: await this.name(an) });
    return a;
  }

  private async eigeneAufgabe(id: string, ich: { id: string; rolle: string }) {
    const a = await this.repo.holeAufgabe(id);
    if (!a) throw new Fachfehler(404, 'Diese Aufgabe gibt es nicht.');
    const meine = a.empfaengerId === ich.id || (!a.empfaengerId && ich.rolle === 'admin');
    if (!meine && ich.rolle !== 'admin') throw new Fachfehler(403, 'Das ist nicht deine Aufgabe. Weitergeben oder erledigen kann sie nur ihr Empfänger oder ein Administrator.');
    if (a.erledigt) throw new Fachfehler(409, 'Diese Aufgabe ist schon erledigt.');
    return a;
  }

  /** Bestätigen (Erwähnungen, manuelle Aufgaben). „Passt nicht“ erledigt sich, sobald die Mappe passt. */
  async erledigeAufgabe(id: string, ich: { id: string; rolle: string }) {
    const a = await this.eigeneAufgabe(id, ich);
    if (a.art === 'passung') throw new Fachfehler(409, 'Diese Aufgabe erledigt sich selbst, sobald die Mappe wieder zur Definition passt.');
    await this.repo.erledigeAufgabe(id, ich.id);
    await this.notiere(a.mappeId, ich.id, 'aufgabe', { text: `erledigt: ${a.text}`, aufgabe: id, aufgabenart: a.art, fuer: a.empfaengerId, aufgabentext: a.text });
    protokoll.modul('ablage').info('Aufgabe erledigt', { mappeId: a.mappeId, aufgabe: a.text });
    return (await this.repo.holeAufgabe(id))!;
  }

  /** Weitergeben: durch den Empfänger selbst oder einen Administrator; steht im Protokoll. */
  async delegiereAufgabe(id: string, an: unknown, ich: { id: string; rolle: string }) {
    const a = await this.eigeneAufgabe(id, ich);
    const ziel = await this.pruefeEmpfaenger(an);
    if (ziel === a.empfaengerId) return a;
    await this.repo.delegiereAufgabe(id, ziel);
    const von = await this.name(a.empfaengerId), nach = await this.name(ziel);
    await this.notiere(a.mappeId, ich.id, 'aufgabe', { text: `weitergegeben von ${von} an ${nach}: ${a.text}`, aufgabe: id, aufgabenart: a.art, vonId: a.empfaengerId, anId: ziel, aufgabentext: a.text });
    protokoll.modul('ablage').info('Aufgabe weitergegeben', { mappeId: a.mappeId, von, an: nach, aufgabe: a.text });
    return (await this.repo.holeAufgabe(id))!;
  }

  /** Meine offenen Aufgaben (mit denen der Administratoren, wenn ich einer bin). */
  meineAufgaben(ich: { id: string; rolle: string }) { return this.repo.offeneAufgaben({ benutzerId: ich.id, admin: ich.rolle === 'admin' }); }
  /** Werkbank: alle offenen oder die zuletzt erledigten. */
  async alleAufgaben(erledigt = false) { return erledigt ? this.repo.erledigteAufgaben(500) : this.repo.offeneAufgaben(); }
  aufgabenVon(mappeId: string) { return this.repo.aufgabenVon(mappeId); }

  /* ---------- Notizen (#55) ---------- */

  private static notiztext(e: unknown): string {
    const t = typeof e === 'string' ? e.replace(/\r\n?/g, '\n').trim() : '';
    if (!t) throw new Fachfehler(422, 'Die Notiz ist leer.');
    if (t.length > NOTIZ_MAX) throw new Fachfehler(422, `Eine Notiz darf höchstens ${NOTIZ_MAX.toLocaleString('de-DE')} Zeichen haben.`);
    return t;
  }
  private static vorschau(t: string) { const x = alsText(t); return x.length > 80 ? `${x.slice(0, 77)} …` : x; }

  async notizen(mappeId: string): Promise<Notiz[]> {
    if (!(await this.repo.holeMappe(mappeId))) throw new Fachfehler(404, 'Diese Mappe gibt es nicht.');
    return this.repo.notizen(mappeId);
  }

  /* ---------- E-Mail aus der Mappe (#58) ---------- */

  /**
   * Verschickt eine E-Mail mit ausgewählten Dokumenten der Mappe. Absender ist das DMS,
   * „Antworten an“ der Benutzer. Danach gibt es eine Mappe vom Systemtyp „E-Mail“ mit den
   * Anhängen (dieselbe Datei, kein zweiter Speicherplatz) und einen Eintrag im Protokoll.
   */
  async versendeMappe(mappeId: string, eingabe: unknown, ich: { id: string; name: string; email: string }, mailer: Mailer | null) {
    if (!mailer) throw new Fachfehler(409, 'Der E-Mail-Versand ist nicht eingerichtet (Werkbank → E-Mail und Adresse).');
    const m = await this.repo.holeMappe(mappeId);
    if (!m) throw new Fachfehler(404, 'Diese Mappe gibt es nicht.');
    const e = (eingabe ?? {}) as Record<string, unknown>;
    const an = [...new Set(String(e.an ?? '').split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean))];
    const betreff = String(e.betreff ?? '').replace(/[\r\n]+/g, ' ').trim();
    const nachricht = String(e.nachricht ?? '');
    const fehler: Record<string, string> = {};
    if (!an.length) fehler.an = 'Mindestens einen Empfänger angeben.';
    else if (an.length > EMAIL_MAX_EMPFAENGER) fehler.an = `Höchstens ${EMAIL_MAX_EMPFAENGER} Empfänger.`;
    else if (an.some((x) => !istEmail(x))) fehler.an = `Keine gültige Adresse: ${an.filter((x) => !istEmail(x)).join(', ')}`;
    if (!betreff) fehler.betreff = 'Der Betreff fehlt.';
    else if (betreff.length > 250) fehler.betreff = 'Der Betreff ist zu lang.';
    if (nachricht.length > NOTIZ_MAX) fehler.nachricht = 'Die Nachricht ist zu lang.';
    if (Object.keys(fehler).length) throw new Fachfehler(422, Object.values(fehler).join(' '), { felder: fehler });
    const ids = Array.isArray(e.dokumente) ? [...new Set(e.dokumente.map(String))] : [];
    const alle = await this.repo.listeDokumente(mappeId);
    const dokumente = ids.map((id) => alle.find((d) => d.id === id));
    if (dokumente.some((d) => !d)) throw new Fachfehler(422, 'Ein ausgewähltes Dokument gehört nicht (mehr) zu dieser Mappe.');
    const groesse = dokumente.reduce((a, d) => a + d!.groesse, 0);
    if (groesse > EMAIL_MAX_ANHAENGE) throw new Fachfehler(413, `Die Anhänge sind zusammen größer als ${Math.round(EMAIL_MAX_ANHAENGE / 1e6)} MB.`);
    const anhaenge = await Promise.all(dokumente.map(async (d) => ({ name: d!.name, mime: d!.mime, inhalt: await this.dateien.lies(d!.sha256) })));
    const antwortAn = ich.name ? `"${ich.name.replace(/["\\]/g, '')}" <${ich.email}>` : ich.email;
    try {
      await mailer.sende(an.join(', '), betreff, nachricht, { antwortAn, anhaenge });
    } catch (x) {
      throw new Fachfehler(502, `Die E-Mail wurde nicht verschickt: ${(x as Error).message}`);
    }
    const { email: typ } = await this.sichereSystem();
    const id = randomUUID();
    const datum = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date());
    await this.schreibeSystemMappe(typ, id, {
      betreff, an: an.join(', '), absender: antwortAn.replace(/"/g, ''), datum, bezug: mappeId, ...(nachricht.trim() ? { nachricht } : {}),
    }, ich.id);
    const reg = typ.register.find((r) => r.art === 'dokumente');
    if (reg) for (const d of dokumente) {
      await this.repo.legeDokumentAn({ ...d!, id: randomUUID(), mappeId: id, registerKey: reg.key, erstellt: new Date().toISOString(), erstelltVon: ich.id });
    }
    await this.notiere(mappeId, ich.id, 'email', { text: `„${betreff}“ an ${an.join(', ')}${dokumente.length ? ` mit ${dokumente.length} ${dokumente.length === 1 ? 'Anhang' : 'Anhängen'}` : ''}`, email: id,
      an, betreff, nachricht: nachricht.slice(0, NOTIZ_MAX), anhaenge: dokumente.map((d) => ({ name: d!.name, groesse: d!.groesse })) });
    protokoll.modul('ablage').info('E-Mail aus Mappe verschickt', { mappe: mappeId, empfaenger: an.length, anhaenge: dokumente.length, bytes: groesse });
    return { id, typId: typ.id };
  }

  async legeNotizAn(mappeId: string, text: unknown, von: string | null): Promise<Notiz> {
    if (!(await this.repo.holeMappe(mappeId))) throw new Fachfehler(404, 'Diese Mappe gibt es nicht.');
    const t = Dienst.notiztext(text);
    const n = await this.repo.legeNotizAn({ id: randomUUID(), mappeId, text: t, erstellt: '', erstelltVon: von, geaendert: '', geaendertVon: von });
    await this.notiere(mappeId, von, 'notiz', { text: `angelegt: ${Dienst.vorschau(t)}`, voll: t });
    await this.erwaehnungenAbgleichen(mappeId, { key: `notiz:${n.id}`, ort: 'in einer Notiz', auszug: Dienst.vorschau(t) }, '', t, von);
    return n;
  }

  /** Bearbeiten und Löschen darf jeder (Abstimmung zu #55); die Historie hält fest, wer es war. */
  async aendereNotiz(id: string, text: unknown, von: string | null): Promise<Notiz> {
    const alt = await this.repo.holeNotiz(id);
    if (!alt) throw new Fachfehler(404, 'Diese Notiz gibt es nicht.');
    const t = Dienst.notiztext(text);
    if (t === alt.text) return alt;
    const n = await this.repo.aendereNotiz(id, t, von);
    await this.notiere(alt.mappeId, von, 'notiz', { text: `geändert: ${Dienst.vorschau(t)}`, vorher: Dienst.vorschau(alt.text), alt: alt.text, neu: t });
    await this.erwaehnungenAbgleichen(alt.mappeId, { key: `notiz:${id}`, ort: 'in einer Notiz', auszug: Dienst.vorschau(t) }, alt.text, t, von);
    return n;
  }

  async loescheNotiz(id: string, von: string | null) {
    const alt = await this.repo.holeNotiz(id);
    if (!alt) throw new Fachfehler(404, 'Diese Notiz gibt es nicht.');
    await this.repo.loescheNotiz(id);
    await this.notiere(alt.mappeId, von, 'notiz', { text: `gelöscht: ${Dienst.vorschau(alt.text)}`, voll: alt.text });
  }

  /* ---------- Änderungshistorie (#57) ---------- */

  /** Ein Eintrag in die Historie einer Mappe. */
  private notiere(mappeId: string, benutzerId: string | null, art: Historienart, daten?: Historieneintrag['daten']) {
    return this.repo.historieSchreibe([{ mappeId, benutzerId, art, daten }]);
  }

  /** Was sich zwischen zwei Ständen geändert hat – lesbar, wie es zu diesem Zeitpunkt aussah. */
  private async aenderungen(typ: Mappentyp, alt: Werte, neu: Werte): Promise<Feldaenderung[]> {
    const gleich = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    const felder = typ.felder.filter((f) => !gleich(alt[f.key], neu[f.key]) && !(istLeer(alt[f.key]) && istLeer(neu[f.key])));
    if (!felder.length) return [];
    const ids = felder.filter((f) => f.typ === 'referenz').flatMap((f) => [alt[f.key], neu[f.key]].flatMap((v) => (Array.isArray(v) ? v : v ? [v] : []))).map(String).filter(istUuid);
    const titel = await this.repo.titelVon(ids);
    const lesbar = (f: Feld, v: Werte[string] | undefined) => {
      const t = formatiere(f, v, (id) => titel.get(id) || 'Ohne Titel');
      return t.length > 500 ? `${t.slice(0, 497)} …` : t;
    };
    return felder.map((f) => (f.typ === 'passwort'
      ? { feld: f.key, label: f.label, geheim: true }
      : { feld: f.key, label: f.label, alt: lesbar(f, alt[f.key]), neu: lesbar(f, neu[f.key]) }));
  }

  /** Historie einer Mappe (auch im Papierkorb). */
  async historie(mappeId: string): Promise<Historieneintrag[]> {
    if (!(await this.repo.holeMappe(mappeId)) && !(await this.repo.holeAusPapierkorb(mappeId))) throw new Fachfehler(404, 'Diese Mappe gibt es nicht.');
    return this.repo.historie(mappeId);
  }

  /** Wie lange die Historie endgültig gelöschter Mappen bleibt (Tage). */
  async historieTage(): Promise<number> {
    const e = this.einstellungen ? ((await this.einstellungen.lies('historie')) as { tage?: number } | null) : null;
    return typeof e?.tage === 'number' ? e.tage : HISTORIE_STANDARD_TAGE;
  }

  async setzeHistorieTage(eingabe: unknown): Promise<number> {
    if (!this.einstellungen) throw new Fachfehler(404, 'Einstellungen sind nicht eingerichtet.');
    const tage = Number(eingabe);
    if (!Number.isInteger(tage) || tage < 0 || tage > 36500) throw new Fachfehler(422, 'Bitte eine ganze Zahl von 0 bis 36500 Tagen angeben.');
    await this.einstellungen.schreibe('historie', { tage });
    protokoll.modul('werkbank').info('Aufbewahrung der Historie gelöschter Mappen geändert', { tage });
    return tage;
  }

  listeTypen() { return this.repo.listeTypen(); }

  private async pruefeTyp(d: MappentypDaten, eigeneId: string) {
    const alle = await this.repo.listeTypen();
    // Quellen von Verknüpfungsregistern, deren Feld es nicht mehr gibt, still entfernen.
    for (const r of d.register) {
      if (r.art !== 'verknuepfungen') continue;
      r.quellen = (r.quellen ?? []).filter((q) => {
        const felder = q.typId === eigeneId ? d.felder : alle.find((t) => t.id === q.typId)?.felder;
        const f = felder?.find((x) => x.key === q.feldKey);
        return f?.typ === 'referenz' && (f.zielTyp === eigeneId || f.zielTyp === '*');
      });
    }
    const p = pruefeMappentyp(d, {
      eigeneId,
      namenAndererTypen: alle.filter((t) => t.id !== eigeneId).map((t) => t.name),
      existiertTyp: (id) => alle.some((t) => t.id === id),
      felderVon: (id) => alle.find((t) => t.id === id)?.felder,
    });
    if (!istOk(p)) throw new Fachfehler(422, 'Der Mappentyp ist so nicht gültig.', p);
  }

  async legeTypAn(eingabe: unknown): Promise<Mappentyp> {
    const roh = (eingabe ?? {}) as { id?: unknown };
    // Die Oberfläche darf die Id vorgeben, damit ein neuer Typ auf sich selbst verweisen kann.
    const id = istUuid(roh.id) && !(await this.repo.holeTyp(roh.id)) ? roh.id : randomUUID();
    const d = bereinigeTyp(eingabe);
    await this.pruefeTyp(d, id);
    const typ = await this.repo.legeTypAn(id, d);
    // Neue Mappentypen bekommen eine eigene Sicht (#38), außer der Administrator wählt das ab.
    if ((roh as { sichtAnlegen?: unknown }).sichtAnlegen !== false) await this.sichtFuerTyp(typ);
    return typ;
  }

  async aendereTyp(id: string, eingabe: unknown): Promise<Mappentyp> {
    const alt = await this.repo.holeTyp(id);
    if (!alt) throw new Fachfehler(404, 'Diesen Mappentyp gibt es nicht.');
    let d = bereinigeTyp(eingabe);
    if (alt.system) d = await this.mitSystemfeldern(d, alt.system);
    await this.pruefeTyp(d, id);
    const bleiben = new Set(d.register.filter((r) => r.art === 'dokumente').map((r) => r.key));
    for (const [key, n] of await this.repo.dokumenteJeRegister(id)) {
      if (bleiben.has(key)) continue;
      const name = alt.register.find((r) => r.key === key)?.name ?? key;
      throw new Fachfehler(409, `Im Register „${name}“ liegen noch ${n} Dokument${n === 1 ? '' : 'e'}. Entferne oder verschiebe sie zuerst.`);
    }
    const typ = await this.repo.aendereTyp(id, d);
    // Die Sicht, die für diesen Typ entstanden ist, heißt weiter wie er – solange sie niemand umbenannt hat.
    const eigene = (await this.repo.listeSichten()).find((x) => x.id === id);
    if (eigene && eigene.name === alt.name && alt.name !== typ.name) await this.repo.aendereSicht(id, { ...eigene, name: typ.name });
    // Vorlage oder Felder können sich geändert haben: Titel aller Mappen dieses Typs neu berechnen.
    await this.aktualisiereTitel((await this.repo.listeMappen(id)).map((m) => m.id));
    await this.pruefePassung(id);
    return typ;
  }

  /**
   * Systemtypen: Systemfelder müssen bleiben und behalten ihre feste Definition;
   * Bezeichnung und Hilfetext darf der Administrator ändern. Benutzer-Mappen entstehen
   * und verschwinden nur über die Benutzerverwaltung.
   */
  private async mitSystemfeldern(d: MappentypDaten, system: Systemtyp): Promise<MappentypDaten> {
    const rolleTyp = (await this.repo.listeTypen()).find((t) => t.system === 'rolle');
    const soll = systemfelder(system, rolleTyp?.id ?? '');
    const fehlen = soll.filter((s) => !d.felder.some((f) => f.key === s.key));
    if (fehlen.length) throw new Fachfehler(422, `Systemfelder lassen sich nicht entfernen: ${fehlen.map((f) => f.label).join(', ')}.`);
    const felder = d.felder.map((f) => {
      const s = soll.find((x) => x.key === f.key);
      return s ? { ...s, label: f.label || s.label, hilfe: f.hilfe || s.hilfe } : f;
    });
    return { ...d, felder, ...(system === 'benutzer' ? { erstellenErlaubt: false, loeschenErlaubt: false } : system === 'email' ? { erstellenErlaubt: false } : {}) };
  }

  async loescheTyp(id: string): Promise<void> {
    const t = await this.repo.holeTyp(id);
    if (!t) throw new Fachfehler(404, 'Diesen Mappentyp gibt es nicht.');
    if (t.system) throw new Fachfehler(409, `„${t.name}“ ist ein Systemmappentyp. Er lässt sich erweitern, aber nicht löschen.`);
    const gruende: string[] = [];
    const n = await this.repo.zaehleMappen(id);
    if (n) gruende.push(`${n} ${n === 1 ? 'Mappe gehört' : 'Mappen gehören'} zu diesem Typ.`);
    const imKorb = (await this.repo.papierkorb({ typId: id })).length;
    if (imKorb) gruende.push(`${imKorb} ${imKorb === 1 ? 'Mappe' : 'Mappen'} dieses Typs ${imKorb === 1 ? 'liegt' : 'liegen'} im Papierkorb. Leere ihn oder stelle sie wieder her.`);
    for (const t of await this.repo.listeTypen()) {
      if (t.id === id) continue;
      for (const f of t.felder) if (f.typ === 'referenz' && f.zielTyp === id) gruende.push(`Das Feld ${t.name} › ${f.label} verweist auf diesen Typ.`);
    }
    if (gruende.length) throw new Fachfehler(409, 'Dieser Mappentyp kann noch nicht gelöscht werden.', { gruende });
    await this.repo.loescheTyp(id);
    // Aus den Sichten entfernen; Sichten, die nur diesen Typ hatten und keine Kinder, verschwinden mit.
    const alle = await this.repo.listeSichten();
    for (const x of alle.filter((v) => v.typen.includes(id))) {
      const typen = x.typen.filter((t) => t !== id);
      if (!typen.length && !kinderVon(alle, x.id).length) await this.repo.loescheSicht(x.id);
      else await this.repo.aendereSicht(x.id, { ...x, typen });
    }
  }

  listeMappen(typId?: string) { return this.repo.listeMappen(typId); }

  async holeMappe(id: string) {
    const mappe = await this.repo.holeMappe(id);
    if (!mappe) throw new Fachfehler(404, 'Diese Mappe gibt es nicht.');
    const typ = await this.repo.holeTyp(mappe.typId);
    const ziele = typ ? verweiseVon(typ, mappe.werte).map((v) => v.zielId) : [];
    const rueckverweise = await this.repo.rueckverweise(id);
    const p = await this.loeschPruefung(mappe, typ, rueckverweise);
    return {
      mappe,
      rueckverweise,
      /** Ob „Mappe löschen“ geht, sonst warum nicht (#79). */
      loeschbar: p.ok ? { ok: true } : { ok: false, grund: p.grund, rueckverweise: p.fremd },
      dokumente: await this.repo.listeDokumente(id),
      /** Notizen an der Mappe (#55). */
      notizen: await this.repo.notizen(id),
      /** Aufgaben an der Mappe, offene zuerst (#54). */
      aufgaben: await this.repo.aufgabenVon(id),
      /** Titel und Typ der Mappen, auf die diese verweist. */
      bezuege: Object.fromEntries(await this.repo.bezuege(ziele)),
    };
  }

  /* ---------- Sichten: seitenweise und gezählt ---------- */

  /**
   * Eine Seite einer Sicht: „eingang“, eine verwaltete Sicht (#38) oder – für Links auf Mappen,
   * deren Typ keine eigene Sicht hat – eine Typ-Id. Mit den Bezügen für die Anzeige.
   */
  async seite(ich: { id: string; rolle: string }, q: { sicht?: string; von?: unknown; anzahl?: unknown; suche?: unknown; sortierung?: unknown; absteigend?: unknown; volltext?: unknown; notizen?: unknown }) {
    const von = Math.max(0, Math.floor(Number(q.von) || 0));
    const anzahl = Math.min(500, Math.max(1, Math.floor(Number(q.anzahl) || 100)));
    const suche = text(q.suche).slice(0, 200) || undefined;
    // Auch im Volltext der Dokumente (#45) und in Notizen (#55) suchen.
    const volltext = q.volltext === true || q.volltext === 'true' || undefined;
    const notizen = q.notizen === true || q.notizen === 'true' || undefined;
    const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t] as const));
    const sichten = await this.repo.listeSichten();
    // „typ:<id>“: alle Mappen eines Typs, ohne Bedingungen einer Sicht (z. B. Auswahl eines Verweises).
    const nurTyp = String(q.sicht ?? '').startsWith('typ:') ? String(q.sicht).slice(4) : null;
    const sicht = nurTyp ? undefined : sichten.find((x) => x.id === q.sicht);
    // Sortieren nach Feldern geht, wenn die Sicht genau einen Mappentyp zeigt.
    const fest = q.sicht === 'eingang' || q.sicht === 'favoriten';
    const einTyp = fest ? undefined : sicht ? (() => { const w = wirksameTypen(sichten, sicht.id); return w.length === 1 ? typen.get(w[0]) : undefined; })() : typen.get(nurTyp ?? String(q.sicht));
    const sortierung = sortierungAus(text(q.sortierung), q.absteigend === 'true' || q.absteigend === true, einTyp);
    const r = q.sicht === 'eingang'
      ? await this.repo.seite({ eingang: { benutzerId: ich.id, admin: ich.rolle === 'admin' }, suche, volltext, notizen, von, anzahl, sortierung })
      : q.sicht === 'favoriten'
        ? await this.repo.seite({ favoriten: { benutzerId: ich.id }, suche, volltext, notizen, von, anzahl, sortierung })
      : sicht
        ? await this.repo.seite({ klauseln: klauselnFuer(sichten, sicht.id, typen, await this.aufloesung(ich.id)), suche, volltext, notizen, von, anzahl, sortierung })
        : await this.repo.seite({ typId: nurTyp ?? q.sicht, suche, volltext, notizen, von, anzahl, sortierung });
    const ziele = r.mappen.flatMap((m) => { const t = typen.get(m.typId); return t ? verweiseVon(t, m.werte).map((v) => v.zielId) : []; });
    // Eingang (#54): je Mappe, was für mich zu tun ist.
    const aufgaben: Record<string, string> = {};
    if (q.sicht === 'eingang' && r.mappen.length) {
      for (const a of await this.repo.offeneAufgaben({ benutzerId: ich.id, admin: ich.rolle === 'admin', mappeIds: r.mappen.map((m) => m.id) })) {
        aufgaben[a.mappeId] = aufgaben[a.mappeId] ? `${aufgaben[a.mappeId]} · ${a.text}` : a.text;
      }
    }
    return {
      gesamt: r.gesamt, von, mappen: r.mappen, bezuege: Object.fromEntries(await this.repo.bezuege(ziele)),
      ...(r.ausschnitte ? { ausschnitte: r.ausschnitte } : {}), ...(q.sicht === 'eingang' ? { aufgaben } : {}),
      /** Welche Mappen dieser Seite Favoriten des Benutzers sind (#62). */
      favoriten: [...await this.repo.favoritenVon(ich.id, r.mappen.map((m) => m.id))],
    };
  }

  /** Anzahl Mappen je Typ (davon unpassend, Demo), je Sicht und im Eingang des Benutzers. */
  async zaehler(ich: { id: string; rolle: string }) {
    const z = await this.repo.zaehler(ich.id, ich.rolle === 'admin');
    const sichten = await this.repo.listeSichten();
    const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t] as const));
    const a = await this.aufloesung(ich.id);
    const n = await this.repo.zaehleKlauseln(sichten.map((x) => klauselnFuer(sichten, x.id, typen, a)));
    return {
      typen: Object.fromEntries(z.typen), eingang: z.eingang, favoriten: z.favoriten, sichten: Object.fromEntries(sichten.map((x, i) => [x.id, n[i]])),
      // Papierkorb (#43): eigene gelöschte Mappen; Tage 0 = aus.
      papierkorb: await this.repo.zaehlePapierkorb(ich.id), papierkorbTage: await this.papierkorbTage(),
    };
  }

  /* ---------- Favoriten (#62) ---------- */

  /** Persönlich: ändert weder „zuletzt geändert“ noch das Protokoll der Mappe. */
  async setzeFavorit(ich: { id: string }, mappeId: string, an: boolean) {
    if (!(await this.repo.holeMappe(mappeId))) throw new Fachfehler(404, 'Diese Mappe gibt es nicht.');
    await this.repo.setzeFavorit(ich.id, mappeId, an);
    return { favorit: an };
  }

  async istFavorit(ich: { id: string }, mappeId: string) { return (await this.repo.favoritenVon(ich.id, [mappeId])).has(mappeId); }

  /** Dynamische Werte für den angemeldeten Benutzer: heute, er selbst, seine Rollen. */
  private async aufloesung(benutzerId: string): Promise<Aufloesung> {
    const m = istUuid(benutzerId) ? await this.repo.holeMappe(benutzerId) : undefined;
    return { heute: heuteIn(), ich: benutzerId, meineRollen: m ? alsListe(m.werte.rollen) : [] };
  }

  /* ---------- Sichten verwalten (#38) ---------- */

  listeSichten() { return this.repo.listeSichten(); }

  private async bereinigeSicht(e: unknown, id: string, alle: Sicht[]): Promise<SichtDaten> {
    const x = (e ?? {}) as Record<string, unknown>;
    const name = text(x.name).slice(0, 80);
    if (!name) throw new Fachfehler(422, 'Bitte einen Namen für die Sicht angeben.');
    const elternId = istUuid(x.elternId) ? x.elternId : null;
    if (elternId && !alle.some((s) => s.id === elternId)) throw new Fachfehler(422, 'Die gewählte Elternsicht gibt es nicht.');
    if (waereKreis(alle, id, elternId)) throw new Fachfehler(422, 'Eine Sicht kann nicht unter sich selbst oder einer ihrer Untersichten liegen.');
    const vorhanden = new Set((await this.repo.listeTypen()).map((t) => t.id));
    const typen = [...new Set((Array.isArray(x.typen) ? x.typen : []).map(String))].filter((t) => vorhanden.has(t));
    const geschwister = kinderVon(alle.filter((s) => s.id !== id), elternId);
    const position = Number.isFinite(Number(x.position)) && x.position !== null && x.position !== undefined
      ? Math.trunc(Number(x.position))
      : (geschwister.at(-1)?.position ?? 0) + 10;
    return { name, beschreibung: text(x.beschreibung).slice(0, 500), elternId, position, typen, bedingungen: bereinigeBedingungen(x.bedingungen) };
  }

  async legeSichtAn(e: unknown): Promise<Sicht> {
    const alle = await this.repo.listeSichten();
    const id = randomUUID();
    return this.repo.legeSichtAn(id, await this.bereinigeSicht(e, id, alle));
  }

  async aendereSicht(id: string, e: unknown): Promise<Sicht> {
    const alle = await this.repo.listeSichten();
    if (!alle.some((s) => s.id === id)) throw new Fachfehler(404, 'Diese Sicht gibt es nicht.');
    return this.repo.aendereSicht(id, await this.bereinigeSicht(e, id, alle));
  }

  /** Untersichten rücken eine Ebene nach oben, an die Stelle der gelöschten. */
  async loescheSicht(id: string): Promise<void> {
    const alle = await this.repo.listeSichten();
    const s = alle.find((x) => x.id === id);
    if (!s) throw new Fachfehler(404, 'Diese Sicht gibt es nicht.');
    // Neue Reihenfolge der Ebene: Geschwister davor, die Kinder, Geschwister danach.
    const ebene = kinderVon(alle, s.elternId).flatMap((g) => (g.id === id ? kinderVon(alle, id) : [g]));
    for (const [i, g] of ebene.entries()) {
      if (g.elternId !== s.elternId || g.position !== (i + 1) * 10) await this.repo.aendereSicht(g.id, { ...g, elternId: s.elternId, position: (i + 1) * 10 });
    }
    await this.repo.loescheSicht(id);
  }

  /** Reihenfolge unter Geschwistern setzen: Ids in der gewünschten Reihenfolge. */
  async ordneSichten(elternId: unknown, ids: unknown): Promise<Sicht[]> {
    const alle = await this.repo.listeSichten();
    const eltern = istUuid(elternId) ? elternId : null;
    const geschwister = kinderVon(alle, eltern);
    const liste = Array.isArray(ids) ? ids.map(String) : [];
    if (liste.length !== geschwister.length || !geschwister.every((g) => liste.includes(g.id))) throw new Fachfehler(422, 'Die Reihenfolge muss genau die Sichten dieser Ebene enthalten.');
    for (const [i, sid] of liste.entries()) {
      const g = geschwister.find((x) => x.id === sid)!;
      if (g.position !== (i + 1) * 10) await this.repo.aendereSicht(sid, { ...g, position: (i + 1) * 10 });
    }
    return this.repo.listeSichten();
  }

  /** Anzahl Treffer einer (noch nicht gespeicherten) Sicht – für die Vorschau in der Werkbank. */
  async sichtVorschau(ich: { id: string }, id: unknown, e: unknown): Promise<{ anzahl: number }> {
    const alle = await this.repo.listeSichten();
    const sid = istUuid(id) && alle.some((s) => s.id === id) ? id : randomUUID();
    const d = await this.bereinigeSicht(e, sid, alle);
    const probe: Sicht[] = [...alle.filter((s) => s.id !== sid), { ...d, id: sid, erstellt: '', geaendert: '' }];
    const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t] as const));
    const [anzahl] = await this.repo.zaehleKlauseln([klauselnFuer(probe, sid, typen, await this.aufloesung(ich.id))]);
    return { anzahl };
  }

  /**
   * Eigene Sicht für einen Mappentyp, mit der Id des Typs (Lesezeichen bleiben gültig), auf der
   * obersten Ebene angehängt. Benutzer und Rolle stehen dabei immer am Ende.
   */
  private async sichtFuerTyp(t: Mappentyp) {
    const alle = await this.repo.listeSichten();
    if (alle.some((s) => s.id === t.id)) return;
    const SYSTEM_AB = 100_000;
    const oben = kinderVon(alle, null).map((s) => s.position);
    const position = t.system
      ? Math.max(SYSTEM_AB, ...oben) + 10
      : Math.max(0, ...oben.filter((p) => p < SYSTEM_AB)) + 10;
    await this.repo.legeSichtAn(t.id, { name: t.name, beschreibung: t.beschreibung, elternId: null, position, typen: [t.id], bedingungen: [] });
  }

  async belegung(typId: string) {
    if (!(await this.repo.holeTyp(typId))) throw new Fachfehler(404, 'Diesen Mappentyp gibt es nicht.');
    return this.repo.belegung(typId);
  }

  /* ---------- Passung: passt eine Mappe zur aktuellen Definition? ---------- */

  /** Prüft alle Mappen eines Typs (nach einer Änderung des Typs) und speichert das Ergebnis. */
  async pruefePassung(typId: string): Promise<number> {
    const typ = await this.repo.holeTyp(typId);
    if (!typ) return 0;
    const mappen = await this.repo.listeMappen(typId);
    const typVon = await this.repo.typenVon(mappen.flatMap((m) => verweiseVon(typ, m.werte).map((v) => v.zielId)).filter(istUuid));
    // Eindeutige Felder: gleiche Werte im Arbeitsspeicher suchen statt je Mappe in der Datenbank.
    const gleiche = new Map<string, Map<string, Mappe[]>>();
    for (const f of typ.felder) {
      if (!f.eindeutig || (f.typ !== 'text' && f.typ !== 'zahl')) continue;
      const nachWert = new Map<string, Mappe[]>();
      for (const m of mappen) {
        if (istLeer(m.werte[f.key])) continue;
        const w = String(m.werte[f.key]).trim().toLowerCase();
        nachWert.set(w, [...(nachWert.get(w) ?? []), m]);
      }
      gleiche.set(f.key, nachWert);
    }
    const ergebnis = mappen.map((m) => {
      const p = pruefeMappe(typ, m.werte, {
        typVon: (id) => typVon.get(id),
        doppelt: (k, v) => {
          const andere = gleiche.get(k)?.get(String(v).trim().toLowerCase())?.find((x) => x.id !== m.id);
          return andere ? andere.titel || 'Ohne Titel' : undefined;
        },
      });
      return { id: m.id, problem: ersterGrund(typ, p), alt: m.problem ?? null, passtAlt: m.passt };
    });
    const geaendert = ergebnis.filter((e) => e.problem !== e.alt || e.passtAlt === undefined).map(({ id, problem }) => ({ id, problem }));
    await this.repo.setzePassung(geaendert);
    // Passt eine Mappe nicht, hat ihr Ersteller eine Aufgabe (#54); passt sie wieder, ist sie erledigt.
    await this.repo.aufgabenZurPassung(geaendert);
    return ergebnis.filter((e) => e.problem).length;
  }

  /**
   * Nach dem Speichern einer Mappe: Andere Mappen desselben Typs, die bisher nicht passten,
   * können jetzt passen (z. B. weil ein doppelter Wert geändert wurde). Das sind meist wenige.
   */
  private async pruefeUnpassende(typ: Mappentyp) {
    const ids = await this.repo.unpassende(typ.id);
    if (ids.length) await this.passungFuer(typ, ids);
  }

  /** Prüft einzelne Mappen eines Typs gegen seine Definition und speichert das Ergebnis. */
  private async passungFuer(typ: Mappentyp, ids: string[]) {
    const liste: Array<{ id: string; problem: string | null }> = [];
    for (const m of await this.repo.holeMappen(ids)) {
      const typen = await this.repo.typenVon(verweiseVon(typ, m.werte).map((v) => v.zielId).filter(istUuid));
      const doppelt = new Map<string, string>();
      for (const f of typ.felder) {
        if (!f.eindeutig || istLeer(m.werte[f.key]) || (f.typ !== 'text' && f.typ !== 'zahl')) continue;
        const d = await this.repo.findeDoppelt(typ.id, f.key, String(m.werte[f.key]), m.id);
        if (d) doppelt.set(f.key, d.titel || 'Ohne Titel');
      }
      const problem = ersterGrund(typ, pruefeMappe(typ, m.werte, { typVon: (id) => typen.get(id), doppelt: (k) => doppelt.get(k) }));
      if (problem !== m.problem) liste.push({ id: m.id, problem });
    }
    await this.repo.setzePassung(liste);
    await this.repo.aufgabenZurPassung(liste);
  }

  /** Beim Start: Passung für Typen nachholen, deren Mappen noch nie geprüft wurden. */
  async passungNachziehen(): Promise<number> {
    const typen = await this.repo.typenOhnePassung();
    for (const t of typen) await this.pruefePassung(t);
    return typen.length;
  }

  private async titel(m: Mappe): Promise<string> {
    return m.titel || titelAus(await this.repo.holeTyp(m.typId), m.werte, undefined, m) || 'Ohne Titel';
  }

  /* ---------- Titel ---------- */

  /**
   * Berechnet die gespeicherten Titel der angegebenen Mappen neu. Ändert sich ein Titel,
   * werden die Mappen nachgezogen, die auf sie verweisen (deren Titel kann ihn enthalten).
   * Bei Verweisen im Kreis endet das nach einigen Runden.
   */
  async aktualisiereTitel(ids: string[]): Promise<Map<string, string>> {
    const neu = new Map<string, string>();
    if (!ids.length) return neu;
    const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t] as const));
    let offen = [...new Set(ids)];
    for (let runde = 0; offen.length && runde < 6; runde++) {
      const geaendert: Array<{ id: string; titel: string }> = [];
      for (let i = 0; i < offen.length; i += 2000) {
        const mappen = await this.repo.holeMappen(offen.slice(i, i + 2000));
        const ziele = mappen.flatMap((m) => { const t = typen.get(m.typId); return t ? verweiseVon(t, m.werte).map((v) => v.zielId) : []; });
        const gespeichert = await this.repo.titelVon(ziele.filter((z) => !neu.has(z)));
        const titelVon = (z: string) => neu.get(z) || gespeichert.get(z) || 'Ohne Titel';
        for (const m of mappen) {
          const t = titelAus(typen.get(m.typId), m.werte, titelVon, m);
          neu.set(m.id, t);
          if (t !== m.titel) geaendert.push({ id: m.id, titel: t });
        }
      }
      await this.repo.setzeTitel(geaendert);
      offen = geaendert.length ? await this.repo.quellenVon(geaendert.map((g) => g.id)) : [];
    }
    return neu;
  }

  /** Beim Start: Titel berechnen, die noch fehlen (z. B. nach dem Update auf eine Version mit gespeicherten Titeln). */
  async titelNachziehen(): Promise<number> {
    const ids = await this.repo.ohneTitel();
    await this.aktualisiereTitel(ids);
    return ids.length;
  }

  private async pruefeWerte(typ: Mappentyp, werte: Werte, eigeneId?: string) {
    const ids = [...new Set(verweiseVon(typ, werte).map((v) => v.zielId))].filter(istUuid);
    const typen = await this.repo.typenVon(ids);
    const doppelt = new Map<string, string>();
    for (const f of typ.felder) {
      if (!f.eindeutig || istLeer(werte[f.key]) || (f.typ !== 'text' && f.typ !== 'zahl')) continue;
      const d = await this.repo.findeDoppelt(typ.id, f.key, String(werte[f.key]), eigeneId);
      if (d) doppelt.set(f.key, await this.titel(d));
    }
    const p = pruefeMappe(typ, werte, { typVon: (id) => typen.get(id), doppelt: (k) => doppelt.get(k) });
    if (!istOk(p)) throw new Fachfehler(422, 'Bitte die markierten Felder prüfen.', p);
  }

  async legeMappeAn(eingabe: unknown, benutzerId: string | null = null, demo = false): Promise<Mappe> {
    const e = (eingabe ?? {}) as { id?: unknown; typId?: unknown; werte?: unknown };
    const typ = istUuid(e.typId) ? await this.repo.holeTyp(e.typId) : undefined;
    if (!typ) throw new Fachfehler(422, 'Unbekannter Mappentyp.');
    if (!darfErstellen(typ)) throw new Fachfehler(403, `Mappen vom Typ „${typ.name}“ lassen sich in der Ablage nicht anlegen.${typ.system === 'benutzer' ? ' Benutzer legt ein Administrator in der Benutzerverwaltung an.' : ''}`);
    const werte = bereinigeWerte(typ, e.werte, {}, this.verschluessele);
    await this.pruefeWerte(typ, werte);
    const id = istUuid(e.id) && !(await this.repo.holeMappe(e.id)) ? e.id : randomUUID();
    const m = await this.repo.legeMappeAn(id, typ.id, werte, verweiseVon(typ, werte), benutzerId, demo);
    if (!demo) {
      await this.notiere(m.id, benutzerId, 'angelegt', { aenderungen: await this.aenderungen(typ, {}, werte) });
      await this.pruefeErwaehnungen(typ, m.id, {}, werte, benutzerId);
    }
    const titel = (await this.aktualisiereTitel([m.id])).get(m.id);
    if (typ.felder.some((f) => f.eindeutig)) await this.pruefeUnpassende(typ);
    return { ...m, titel };
  }

  async aendereMappe(id: string, eingabe: unknown, benutzerId: string | null = null): Promise<Mappe> {
    const m = await this.repo.holeMappe(id);
    if (!m) throw new Fachfehler(404, 'Diese Mappe gibt es nicht.');
    const typ = await this.repo.holeTyp(m.typId);
    if (!typ) throw new Fachfehler(500, 'Der Mappentyp dieser Mappe fehlt.');
    const werte = bereinigeWerte(typ, (eingabe as { werte?: unknown })?.werte, m.werte, this.verschluessele);
    // Geschützte Felder (Benutzer, Name einer Systemrolle) ändert nur das System.
    for (const [k, grund] of Object.entries(geschuetzteFelder(typ, m))) {
      if (JSON.stringify(werte[k] ?? null) !== JSON.stringify(m.werte[k] ?? null)) {
        throw new Fachfehler(403, `„${typ.felder.find((f) => f.key === k)?.label ?? k}“ lässt sich hier nicht ändern. ${grund}`);
      }
    }
    await this.pruefeWerte(typ, werte, id);
    const aenderungen = await this.aenderungen(typ, m.werte, werte);
    const neu = await this.repo.aendereMappe(id, werte, verweiseVon(typ, werte), benutzerId);
    if (aenderungen.length) await this.notiere(id, benutzerId, 'geaendert', { aenderungen });
    // Gespeichert heißt: passt wieder – eine „passt nicht“-Aufgabe ist damit erledigt.
    await this.repo.aufgabenZurPassung([{ id, problem: null }]);
    await this.pruefeErwaehnungen(typ, id, m.werte, werte, benutzerId);
    const titel = (await this.aktualisiereTitel([id])).get(id);
    if (typ.felder.some((f) => f.eindeutig)) await this.pruefeUnpassende(typ);
    return { ...neu, titel };
  }

  /** Viele neue Mappen auf einmal (Demo-Daten); Werte sind bereits geprüft. */
  legeMappenAn(liste: NeueMappe[]) { return this.repo.legeMappenAn(liste); }

  /**
   * Ob und warum nicht eine Mappe gelöscht werden kann (#79). Dieselbe Prüfung nutzt das Löschen,
   * damit Anzeige und Löschen nie auseinanderlaufen.
   */
  private async loeschPruefung(m: Mappe, typ: Mappentyp | undefined, rueck: Rueckverweis[]) {
    if (m.systemKennung) return { ok: false as const, status: 409, grund: 'Systemrollen lassen sich nicht löschen.', fremd: [], zuordnungen: [], emails: [] };
    if (typ && !darfLoeschen(typ)) return { ok: false as const, status: 403, grund: `Mappen vom Typ „${typ.name}“ lassen sich in der Ablage nicht löschen.${typ.system === 'benutzer' ? ' Benutzer werden in der Benutzerverwaltung deaktiviert.' : ''}`, fremd: [], zuordnungen: [], emails: [] };
    const typen = rueck.length ? await this.repo.listeTypen() : [];
    // Eine Rolle darf weg, auch wenn Benutzer sie haben: deren Zuordnung fällt weg.
    const benutzerTyp = typ?.system === 'rolle' ? typen.find((t) => t.system === 'benutzer') : undefined;
    const zuordnungen = benutzerTyp ? rueck.filter((r) => r.quelleTypId === benutzerTyp.id && r.feldKey === 'rollen') : [];
    // Versendete E-Mails (#58) verweisen auf jede Mappe; sie halten das Löschen nicht auf, ihr Bezug wird leer.
    const emailTyp = typen.find((t) => t.system === 'email');
    const emails = emailTyp ? rueck.filter((r) => r.quelleTypId === emailTyp.id && r.feldKey === 'bezug') : [];
    const fremd = rueck.filter((r) => r.quelleId !== m.id && !zuordnungen.includes(r) && !emails.includes(r));
    if (fremd.length) {
      const ids = new Set(fremd.map((r) => r.quelleId));
      return { ok: false as const, status: 409, grund: `Auf diese Mappe ${ids.size === 1 ? 'verweist noch eine andere Mappe' : `verweisen noch ${ids.size} andere Mappen`}. Entferne erst diese Verweise.`, fremd, zuordnungen, emails, benutzerTyp, emailTyp };
    }
    return { ok: true as const, status: 200, grund: undefined, fremd, zuordnungen, emails, benutzerTyp, emailTyp };
  }

  async loescheMappe(id: string, benutzerId: string | null = null): Promise<void> {
    const m = await this.repo.holeMappe(id);
    if (!m) throw new Fachfehler(404, 'Diese Mappe gibt es nicht.');
    const typ = await this.repo.holeTyp(m.typId);
    const p = await this.loeschPruefung(m, typ, await this.repo.rueckverweise(id));
    if (!p.ok) throw new Fachfehler(p.status, p.grund, p.fremd.length ? { rueckverweise: p.fremd } : undefined);
    const { zuordnungen, emails, benutzerTyp, emailTyp } = p;
    for (const z of zuordnungen) {
      const b = await this.repo.holeMappe(z.quelleId);
      if (b) await this.schreibeSystemMappe(benutzerTyp!, b.id, { ...b.werte, rollen: alsListe(b.werte.rollen).filter((r) => r !== id) }, benutzerId);
    }
    for (const e of emails) {
      const x = await this.repo.holeMappe(e.quelleId);
      if (x) await this.schreibeSystemMappe(emailTyp!, x.id, { ...x.werte, bezug: null }, benutzerId);
    }
    if (await this.papierkorbTage() > 0) await this.legeInPapierkorb(id, typ, benutzerId);
    else await this.loescheMappeIntern(id, typ, benutzerId);
  }

  /** In den Papierkorb (#43): eindeutige Werte werden frei, Dateien bleiben bis zum Leeren. */
  private async legeInPapierkorb(id: string, typ: Mappentyp | undefined, von: string | null) {
    await this.repo.legeInPapierkorb(id, von);
    await this.notiere(id, von, 'papierkorb');
    if (typ?.felder.some((f) => f.eindeutig)) await this.pruefeUnpassende(typ);
  }

  private async loescheMappeIntern(id: string, typ: Mappentyp | undefined, von: string | null = null) {
    const dokumente = await this.repo.listeDokumente(id);
    await this.repo.loescheMappe(id);
    await this.notiere(id, von, 'endgueltig');
    if (typ?.felder.some((f) => f.eindeutig)) await this.pruefeUnpassende(typ);
    for (const sha of new Set(dokumente.map((d) => d.sha256))) await this.raeumeAuf(sha);
  }

  /* ---------- Systemtypen: Benutzer und Rollen (#26, #27) ---------- */

  private sichern?: Promise<{ benutzer: Mappentyp; rolle: Mappentyp; email: Mappentyp; systemrollen: Map<Rolle, string> }>;

  /**
   * Legt die Systemtypen „Benutzer“ und „Rolle“ und die Systemrollen an, falls sie fehlen.
   * Läuft beim Start und vor jedem Spiegeln; gleichzeitige Aufrufe teilen sich einen Lauf.
   */
  sichereSystem() {
    this.sichern ??= this.sichereSystemJetzt().catch((e) => { this.sichern = undefined; throw e; });
    return this.sichern.then(async (s) => ({
      // Definitionen können sich seitdem geändert haben (Felder ergänzt, umbenannt).
      benutzer: (await this.repo.holeTyp(s.benutzer.id)) ?? s.benutzer,
      rolle: (await this.repo.holeTyp(s.rolle.id)) ?? s.rolle,
      email: (await this.repo.holeTyp(s.email.id)) ?? s.email,
      systemrollen: s.systemrollen,
    }));
  }

  private async sichereSystemJetzt() {
    const typen = await this.repo.listeTypen();
    let rolle = typen.find((t) => t.system === 'rolle');
    let benutzer = typen.find((t) => t.system === 'benutzer');
    let email = typen.find((t) => t.system === 'email');
    const frei = (name: string) => (typen.some((t) => t.name.trim().toLowerCase() === name.toLowerCase()) ? `${name} (System)` : name);
    const ids = { rolle: rolle?.id ?? randomUUID(), benutzer: benutzer?.id ?? randomUUID() };
    if (!rolle) {
      rolle = await this.repo.legeTypAn(ids.rolle, {
        name: frei('Rolle'), beschreibung: 'Rollen, die Benutzer haben, z. B. als Verantwortliche', titelVorlage: '{name}',
        felder: systemfelder('rolle', ids.rolle),
        register: [
          { key: 'allgemein', name: 'Allgemein', art: 'felder', felder: ['name'] },
          { key: 'benutzer', name: 'Benutzer', art: 'verknuepfungen', quellen: [{ typId: ids.benutzer, feldKey: 'rollen' }] },
        ],
        trefferliste: [], erstellenErlaubt: true, loeschenErlaubt: true,
      }, 'rolle');
      await this.sichtFuerTyp(rolle);
      protokoll.modul('werkbank').info('Systemmappentyp angelegt', { typ: rolle.name });
    }
    if (!benutzer) {
      benutzer = await this.repo.legeTypAn(ids.benutzer, {
        name: frei('Benutzer'), beschreibung: 'Die Benutzer dieses DMS; gepflegt in der Benutzerverwaltung', titelVorlage: '{name}',
        felder: systemfelder('benutzer', rolle.id),
        register: [
          { key: 'allgemein', name: 'Allgemein', art: 'felder', felder: ['name', 'email', 'rollen', 'aktiv'] },
          { key: 'dokumente', name: 'Dokumente', art: 'dokumente' },
          { key: 'verknuepfungen', name: 'Verknüpfungen', art: 'verknuepfungen', quellen: [] },
        ],
        trefferliste: ['name', 'email', 'rollen', 'aktiv'], erstellenErlaubt: false, loeschenErlaubt: false,
      }, 'benutzer');
      await this.sichtFuerTyp(benutzer);
      protokoll.modul('werkbank').info('Systemmappentyp angelegt', { typ: benutzer.name });
    }
    if (!email) {
      // Versendete E-Mails (#58); später auch per IMAP abgeholte.
      email = await this.repo.legeTypAn(randomUUID(), {
        name: frei('E-Mail'), beschreibung: 'Aus dem DMS verschickte E-Mails mit Anhängen', titelVorlage: '{betreff}',
        felder: systemfelder('email', rolle.id),
        register: [
          { key: 'allgemein', name: 'Allgemein', art: 'felder', felder: ['betreff', 'an', 'absender', 'datum', 'bezug', 'nachricht'] },
          { key: 'anhaenge', name: 'Anhänge', art: 'dokumente' },
          { key: 'protokoll', name: 'Protokoll', art: 'protokoll' },
        ],
        trefferliste: ['datum', 'an', 'bezug'], erstellenErlaubt: false, loeschenErlaubt: true,
      }, 'email');
      await this.sichtFuerTyp(email);
      protokoll.modul('werkbank').info('Systemmappentyp angelegt', { typ: email.name });
    }
    const systemrollen = new Map<Rolle, string>();
    for (const r of Object.keys(ROLLEN) as Rolle[]) {
      const kennung = systemrolleKennung(r);
      let m = await this.repo.holeSystemMappe(kennung);
      if (!m) {
        const name = (await this.repo.findeDoppelt(rolle.id, 'name', ROLLEN[r])) ? `${ROLLEN[r]} (System)` : ROLLEN[r];
        m = await this.schreibeSystemMappe(rolle, randomUUID(), { name }, null, kennung);
      }
      systemrollen.set(r, m.id);
    }
    return { benutzer, rolle, email, systemrollen };
  }

  /** Schreibt eine Mappe, die das System pflegt – ohne die Sperren der Ablage; Titel und Passung wie sonst. */
  private async schreibeSystemMappe(typ: Mappentyp, id: string, eingabe: Werte, von: string | null, kennung: string | null = null): Promise<Mappe> {
    const alt = await this.repo.holeMappe(id);
    const werte = bereinigeWerte(typ, eingabe, alt?.werte);
    if (alt && JSON.stringify(alt.werte) === JSON.stringify(werte)) return alt;
    const aenderungen = await this.aenderungen(typ, alt?.werte ?? {}, werte);
    if (alt) await this.repo.aendereMappe(id, werte, verweiseVon(typ, werte), von);
    else await this.repo.legeMappeAn(id, typ.id, werte, verweiseVon(typ, werte), von, false, kennung);
    if (aenderungen.length) await this.notiere(id, von, alt ? 'geaendert' : 'angelegt', { aenderungen });
    if (alt) await this.repo.aufgabenZurPassung([{ id, problem: null }]);
    await this.aktualisiereTitel([id]);
    // Hat der Administrator den Typ um Pflichtfelder erweitert, landet die Mappe im Eingang.
    await this.passungFuer(typ, [id]);
    return (await this.repo.holeMappe(id))!;
  }

  /** Mappe eines Benutzers anlegen oder nachziehen. Weitere Rollen bleiben, die Systemrolle folgt dem Konto. */
  async spiegleBenutzer(b: Benutzer, von: string | null = null) {
    // Liegt die Mappe im Papierkorb, bleibt sie dort (der Benutzer ist bis zum Leeren deaktiviert).
    if (await this.repo.holeAusPapierkorb(b.id)) return;
    const { benutzer: typ, systemrollen } = await this.sichereSystem();
    const alt = await this.repo.holeMappe(b.id);
    const system = new Set(systemrollen.values());
    const weitere = alt ? alsListe(alt.werte.rollen).filter((r) => !system.has(r)) : [];
    await this.schreibeSystemMappe(typ, b.id, { name: b.name || b.email, email: b.email, rollen: [systemrollen.get(b.rolle)!, ...weitere], aktiv: b.aktiv }, von);
  }

  /** Beim Start: alle Benutzer haben ihre Mappe, und sie stimmt mit dem Konto überein. */
  async gleicheBenutzerAb(liste: Benutzer[]) {
    await this.sichereSystem();
    for (const b of liste) await this.spiegleBenutzer(b);
  }

  /** Prüft eine Auswahl weiterer Rollen, bevor etwas geändert wird; liefert die bereinigten Ids. */
  async pruefeRollen(eingabe: unknown): Promise<string[]> {
    if (!Array.isArray(eingabe)) throw new Fachfehler(422, 'Rollen als Liste angeben.');
    const ids = [...new Set(eingabe.map(String))];
    const { rolle, systemrollen } = await this.sichereSystem();
    const typVon = await this.repo.typenVon(ids.filter(istUuid));
    if (ids.some((id) => typVon.get(id) !== rolle.id)) throw new Fachfehler(422, 'Mindestens eine dieser Rollen gibt es nicht.');
    const system = new Set(systemrollen.values());
    if (ids.some((id) => system.has(id))) throw new Fachfehler(422, 'Administrator und Mitglied werden über die Rolle des Benutzers vergeben.');
    return ids;
  }

  /** Weitere (fachliche) Rollen eines Benutzers setzen – nur aus der Benutzerverwaltung. */
  async setzeRollen(benutzerId: string, eingabe: unknown, von: string | null = null) {
    const ids = await this.pruefeRollen(eingabe);
    const { benutzer: typ, systemrollen } = await this.sichereSystem();
    const m = await this.repo.holeMappe(benutzerId);
    if (!m || m.typId !== typ.id) throw new Fachfehler(404, 'Diesen Benutzer gibt es nicht.');
    const system = new Set(systemrollen.values());
    const behalten = alsListe(m.werte.rollen).filter((r) => system.has(r));
    await this.schreibeSystemMappe(typ, benutzerId, { ...m.werte, rollen: [...behalten, ...ids] }, von);
  }

  /** Alle Rollen für die Auswahl in der Benutzerverwaltung; Systemrollen zuerst. */
  async listeRollen() {
    const { rolle } = await this.sichereSystem();
    return (await this.repo.listeMappen(rolle.id))
      .map((m) => ({ id: m.id, name: m.titel || String(m.werte.name ?? ''), system: !!m.systemKennung }))
      .sort((a, b) => Number(b.system) - Number(a.system) || a.name.localeCompare(b.name, 'de'));
  }

  /** Weitere (nicht System-)Rollen je Benutzer. */
  async weitereRollen(): Promise<Map<string, string[]>> {
    const { benutzer, systemrollen } = await this.sichereSystem();
    const system = new Set(systemrollen.values());
    return new Map((await this.repo.listeMappen(benutzer.id)).map((m) => [m.id, alsListe(m.werte.rollen).filter((r) => !system.has(r))]));
  }

  /** Benutzer werden deaktiviert statt gelöscht; gelöscht wird nur, worauf nichts verweist. */
  async entferneBenutzerMappe(id: string) {
    const m = await this.repo.holeMappe(id);
    if (!m) return;
    const fremd: Rueckverweis[] = (await this.repo.rueckverweise(id)).filter((r) => r.quelleId !== id);
    if (fremd.length) {
      throw new Fachfehler(409, `Auf diesen Benutzer ${fremd.length === 1 ? 'verweist noch eine Mappe' : `verweisen noch ${fremd.length} Mappen`}. Deaktiviere ihn statt ihn zu löschen.`, { rueckverweise: fremd });
    }
    await this.loescheMappeIntern(id, await this.repo.holeTyp(m.typId));
  }

  benutzerspiegel(): Benutzerspiegel {
    return {
      aktualisiere: (b, von) => this.spiegleBenutzer(b, von ?? null),
      entferne: (id) => this.entferneBenutzerMappe(id),
      papierkorbAn: async () => (await this.papierkorbTage()) > 0,
      inPapierkorb: async (id, von) => {
        const m = await this.repo.holeMappe(id);
        if (!m) return;
        const fremd = (await this.repo.rueckverweise(id)).filter((r) => r.quelleId !== id);
        if (fremd.length) throw new Fachfehler(409, `Auf diesen Benutzer ${fremd.length === 1 ? 'verweist noch eine Mappe' : `verweisen noch ${fremd.length} Mappen`}. Deaktiviere ihn statt ihn zu löschen.`, { rueckverweise: fremd });
        await this.repo.legeInPapierkorb(id, von);
        await this.notiere(id, von, 'papierkorb');
      },
    };
  }

  /* ---------- Papierkorb (#43) ---------- */

  /** Aufbewahrung in Tagen; 0 = kein Papierkorb (Löschen ist sofort endgültig). */
  async papierkorbTage(): Promise<number> {
    if (!this.einstellungen) return 0;
    const e = (await this.einstellungen.lies('papierkorb')) as { tage?: number } | null;
    return typeof e?.tage === 'number' ? e.tage : PAPIERKORB_STANDARD_TAGE;
  }

  /** Aufbewahrung ändern. 0 schaltet den Papierkorb aus und leert ihn sofort. */
  async setzePapierkorbTage(eingabe: unknown): Promise<{ tage: number; geleert: number }> {
    if (!this.einstellungen) throw new Fachfehler(404, 'Der Papierkorb ist nicht eingerichtet.');
    const tage = Number(eingabe);
    if (!Number.isInteger(tage) || tage < 0 || tage > 3650) throw new Fachfehler(422, 'Bitte eine ganze Zahl von 0 bis 3650 Tagen angeben (0 = kein Papierkorb).');
    await this.einstellungen.schreibe('papierkorb', { tage });
    protokoll.modul('werkbank').info(tage ? 'Aufbewahrung im Papierkorb geändert' : 'Papierkorb ausgeschaltet', { tage });
    const geleert = tage ? await this.raeumePapierkorbAuf() : await this.leere((await this.repo.papierkorb()).map((e) => e.id));
    return { tage, geleert };
  }

  /** Ablage: was ich gelöscht habe. Werkbank (alle): was alle gelöscht haben. */
  async papierkorb(ich: { id: string; rolle: string }, alle = false): Promise<PapierkorbEintrag[]> {
    return this.repo.papierkorb(alle && ich.rolle === 'admin' ? {} : { von: ich.id });
  }

  /** Eintrag, den dieser Benutzer sehen darf (eigener oder als Administrator in der Werkbank); sonst 404. */
  private async eintrag(id: string, ich: { id: string; rolle: string }, alle: boolean) {
    const e = await this.repo.holeAusPapierkorb(id);
    if (!e || !(e.geloeschtVon === ich.id || (alle && ich.rolle === 'admin'))) throw new Fachfehler(404, 'Diese Mappe liegt nicht (mehr) im Papierkorb.');
    return e;
  }

  async papierkorbEintrag(id: string, ich: { id: string; rolle: string }, alle = false) { return this.eintrag(id, ich, alle); }

  /**
   * Wiederherstellen. Verweise auf Mappen, die es nicht mehr gibt, und eindeutige Werte, die
   * inzwischen eine andere Mappe hat, lassen die Mappe „nicht passen“: Sie erscheint im Eingang.
   */
  async stelleWiederHer(id: string, ich: { id: string; rolle: string }, alle = false) {
    const e = await this.eintrag(id, ich, alle);
    const typ = await this.repo.holeTyp(e.typId);
    if (!typ) throw new Fachfehler(409, 'Den Mappentyp dieser Mappe gibt es nicht mehr.');
    const { verweiseEntfallen } = await this.repo.stelleWiederHer(id);
    await this.notiere(id, ich.id, 'wiederhergestellt', verweiseEntfallen ? { verweiseEntfallen } : undefined);
    await this.aktualisiereTitel([id]);
    await this.passungFuer(typ, [id]);
    if (typ.system === 'benutzer') await this.konten?.wiederda(id, ich.id);
    const m = (await this.repo.holeMappe(id))!;
    protokoll.modul('ablage').info('Mappe wiederhergestellt', { typ: typ.name, titel: m.titel, id, passt: m.passt !== false || undefined, verweiseEntfallen: verweiseEntfallen || undefined });
    return { mappe: m, verweiseEntfallen };
  }

  /** Endgültig löschen (ohne Rechteprüfung): Dateien, an denen nichts mehr hängt, und Konten von Benutzer-Mappen. */
  private async leere(ids: string[], von: string | null = null): Promise<number> {
    if (!ids.length) return 0;
    await this.repo.historieSchreibe(ids.map((mappeId) => ({ mappeId, benutzerId: von, art: 'endgueltig' as const })));
    const benutzerTyp = (await this.repo.listeTypen()).find((t) => t.system === 'benutzer');
    const benutzer = benutzerTyp ? (await this.repo.papierkorb({ typId: benutzerTyp.id })).filter((e) => ids.includes(e.id)).map((e) => e.id) : [];
    const dateien = await this.repo.leerePapierkorb(ids);
    for (const sha of dateien) await this.raeumeAuf(sha);
    for (const id of benutzer) await this.konten?.endgueltig(id);
    return ids.length;
  }

  /** Einzelne Mappen endgültig löschen: eigene oder (in der Werkbank) alle. */
  async loescheEndgueltig(ids: string[], ich: { id: string; rolle: string }, alle = false): Promise<number> {
    for (const id of ids) await this.eintrag(id, ich, alle);
    const n = await this.leere(ids, ich.id);
    if (n) protokoll.modul('ablage').info('Aus dem Papierkorb endgültig gelöscht', { anzahl: n });
    return n;
  }

  /** Papierkorb leeren: eigener (Ablage) oder ganz (Werkbank). */
  async leerePapierkorb(ich: { id: string; rolle: string }, alle = false): Promise<number> {
    const n = await this.leere((await this.papierkorb(ich, alle)).map((e) => e.id), ich.id);
    if (n) protokoll.modul('ablage').info(alle ? 'Papierkorb aller Benutzer geleert' : 'Papierkorb geleert', { anzahl: n });
    return n;
  }

  /** Abgelaufenes endgültig löschen; läuft stündlich. */
  async raeumePapierkorbAuf(jetzt = Date.now()): Promise<number> {
    const tage = await this.papierkorbTage();
    const vor = new Date(jetzt - tage * 24 * 60 * 60 * 1000).toISOString();
    const n = await this.leere((await this.repo.papierkorb(tage ? { vor } : {})).map((e) => e.id));
    if (n) protokoll.modul('system').info('Abgelaufene Mappen aus dem Papierkorb gelöscht', { anzahl: n, tage });
    // Historie endgültig gelöschter Mappen nach ihrer Frist (#57).
    const ht = await this.historieTage();
    const weg = await this.repo.historieAufraeumen(new Date(jetzt - ht * 24 * 60 * 60 * 1000).toISOString());
    if (weg) protokoll.modul('system').info('Historie endgültig gelöschter Mappen entfernt', { eintraege: weg, tage: ht });
    return n;
  }

  /* ---------- Demo-Daten ---------- */

  async demoUebersicht() {
    const demo = await this.repo.zaehleDemo();
    const z = (await this.repo.zaehler('', false)).typen;
    return (await this.repo.listeTypen()).filter((t) => !t.system).map((t) => ({
      typId: t.id, name: t.name, demo: demo.get(t.id) ?? 0, gesamt: z.get(t.id)?.anzahl ?? 0,
    }));
  }

  async entferneDemo() {
    const echte = await this.repo.echteVerweiseAufDemo();
    if (echte) throw new Fachfehler(409, `${echte} echte ${echte === 1 ? 'Mappe verweist' : 'Mappen verweisen'} auf Demo-Mappen. Entferne zuerst diese Verweise.`);
    const { anzahl, dateien } = await this.repo.loescheDemo();
    for (const sha of dateien) await this.raeumeAuf(sha);
    return { entfernt: anzahl };
  }

  /* ---------- Dokumente ---------- */

  /** Löscht die Datei, wenn kein Dokument mehr auf sie zeigt. */
  private async raeumeAuf(sha256: string) {
    if (!(await this.repo.dateiBenutzt(sha256))) await this.dateien.loesche(sha256);
  }

  async ladeHoch(mappeId: string, e: { register?: string; name?: string; typ?: string }, inhalt: unknown, benutzerId: string | null) {
    const m = await this.repo.holeMappe(mappeId);
    if (!m) throw new Fachfehler(404, 'Diese Mappe gibt es nicht.');
    const typ = await this.repo.holeTyp(m.typId);
    const reg = typ?.register.find((r) => r.key === e.register && r.art === 'dokumente');
    if (!reg) throw new Fachfehler(422, 'Dieses Dokumentenregister gibt es an der Mappe nicht.');
    if (!Buffer.isBuffer(inhalt) || inhalt.length === 0) throw new Fachfehler(422, 'Die Datei ist leer.');
    if (inhalt.length > MAX_DATEIGROESSE) throw new Fachfehler(413, 'Die Datei ist zu groß.');

    const sha256 = createHash('sha256').update(inhalt).digest('hex');
    const erkannt = erkenneAnzeigbar(inhalt);
    const angegeben = /^[\w.+-]+\/[\w.+-]+$/.test(e.typ ?? '') ? e.typ! : 'application/octet-stream';
    const gleicherInhalt = await this.repo.dokumenteMitSha(sha256);
    await this.dateien.schreibe(sha256, inhalt);
    await this.notiere(mappeId, benutzerId, 'dokument_hochgeladen', { dokument: dateiname(e.name), groesse: inhalt.length, mime: erkannt ?? angegeben, register: reg.name });
    await this.beruehre(mappeId, typ, benutzerId);
    const dokument = await this.repo.legeDokumentAn({
      id: randomUUID(), mappeId, registerKey: reg.key, name: dateiname(e.name), mime: erkannt ?? angegeben,
      groesse: inhalt.length, sha256, anzeigbar: !!erkannt, erstellt: new Date().toISOString(), erstelltVon: benutzerId,
    });
    // Volltext (#45): neues Dokument in die Warteschlange, wenn das Register das will.
    let neu = dokument;
    if (Dienst.volltextAn(typ, reg.key)) {
      await this.repo.ocrEinreihen([dokument.id]);
      neu = (await this.repo.holeDokument(dokument.id)) ?? dokument;
      this.ocr?.anstossen();
    }
    const bezuege = await this.repo.bezuege(gleicherInhalt.map((d) => d.mappeId));
    return { dokument: neu, gleicherInhalt: gleicherInhalt.map((d) => ({ mappeId: d.mappeId, name: d.name, ...bezuege.get(d.mappeId) })) };
  }

  async dokumentInhalt(id: string) {
    const dokument = await this.repo.holeDokument(id);
    if (!dokument) throw new Fachfehler(404, 'Dieses Dokument gibt es nicht.');
    return { dokument, inhalt: await this.dateien.lies(dokument.sha256) };
  }

  async loescheDokument(id: string, benutzerId: string | null = null) {
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, 'Dieses Dokument gibt es nicht.');
    await this.repo.loescheDokument(id);
    await this.notiere(d.mappeId, benutzerId, 'dokument_geloescht', { dokument: d.name, groesse: d.groesse, mime: d.mime });
    const m = await this.repo.holeMappe(d.mappeId);
    if (m) await this.beruehre(m.id, await this.repo.holeTyp(m.typId), benutzerId);
    await this.raeumeAuf(d.sha256);
  }

  /** Dokumente hinzugefügt oder entfernt (#76): „zuletzt geändert“ nachziehen, Titel mit {geaendert} ebenso. */
  private async beruehre(mappeId: string, typ: Mappentyp | undefined, benutzerId: string | null) {
    await this.repo.beruehreMappe(mappeId, benutzerId);
    if (typ && /\{geaendert\}/.test(typ.titelVorlage ?? '')) await this.aktualisiereTitel([mappeId]);
  }
}
