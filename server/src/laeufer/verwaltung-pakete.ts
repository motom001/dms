/** Paket-Läufer, Seite des DMS (#1278 aus verwaltung.ts): Pakete und Dienstkonten abgleichen, Läufer-Prozess starten und seine Meldungen verarbeiten. */
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { fork } from 'node:child_process';
import { PaketlaeuferZustellen } from './verwaltung-zustellen';
import { schluesselRecht, log, abbruch, type AktionsZugang } from './verwaltung-hilfen';
import type { AnLaeufer, VomLaeufer } from './prozess';
import type { InstalliertesPaket } from '../../../shared/src/pakete';
import { adressfelder, pruefeAdresse } from '../../../shared/src/paketeinstellungen';
import { ladeArgumente } from './modul';
import { senkePrioritaet, senkeProzess } from '../prozesse/hintergrund';
import { t, t as tx } from '../sprache/sprache';
import type { Hostantwort } from './arbeiter';
import { PAKET_SPEICHER_MAX as SPEICHER_MAX, KB } from '../grundlagen/grenzen';
import { beantworteZugang } from '../paketaktionen';

export abstract class PaketlaeuferPakete extends PaketlaeuferZustellen {
  /* ---------- Pakete und Dienstkonten ---------- */

  protected synchronisiere(): Promise<void> {
    const weiter = this.abgleich.then(() => this.synchronisiereJetzt());
    this.abgleich = weiter.catch(() => {});
    return weiter;
  }

  private async synchronisiereJetzt() {
    const alle = await this.o.dienst.kern.repo.listePakete();
    this.pakete = alle.filter((p) => p.laeufer?.modul);
    // Dienstkonten: je Paket mit Code eins; für entfernte ausschalten.
    for (const p of this.pakete) {
      const b = await this.o.konten.dienstkonto(p.id, p.name);
      this.konto.set(p.id, b);
      const recht = schluesselRecht(p.laeufer!);
      // Neuen Schlüssel nur für neue Pakete oder geänderte Rechte – laufende Aufrufe der anderen behalten ihren.
      if (!this.schluessel.has(p.id) || this.schluesselRecht.get(p.id) !== `${b.id}:${recht}`) {
        this.schluessel.set(p.id, await this.o.schluessel.fuerDienstkonto(b, recht));
        this.schluesselRecht.set(p.id, `${b.id}:${recht}`);
      }
    }
    for (const b of await this.o.konten.listeDienstkonten()) {
      if (b.aktiv && b.paketId && !this.pakete.some((p) => p.id === b.paketId)) {
        await this.o.konten.dienstkontoAus(b.paketId);
        this.schluessel.delete(b.paketId);
        this.schluesselRecht.delete(b.paketId);
        this.konto.delete(b.paketId);
      }
    }
    // Auch entfernte Pakete: ihre Konten bleiben als Paket-Konten bekannt (Historie), lösen aber nichts mehr aus.
    this.o.dienst.kern.paketKonten = new Map(
      (await this.o.konten.listeDienstkonten()).filter((b) => b.paketId).map((b) => [b.id, b.paketId!]),
    );
    if (!this.pakete.length) {
      if (this.kind) await this.beendeKind();
      return;
    }
    if (!this.kind) this.starteKind();
    else if (this.bereit) await this.sendePakete();
  }

  /** Schickt dem Läufer die Pakete – Code aus der Datenbank nur für neue und geänderte; unveränderte behält er (#403). */
  private async sendePakete() {
    const liste: Extract<AnLaeufer, { art: 'pakete' }>['pakete'] = [];
    const behalten: string[] = [];
    const gesendet = new Map<string, string>();
    for (const p of this.pakete) {
      const adressen = await this.adressen(p);
      // Zusatzdaten (#458, z. B. Sprachen der Texterkennung): Daten von Paketen, die von diesem abhängen, unter „<paket>/<datei>“.
      const zusaetze = this.pakete.filter((q) => q.id !== p.id && p.id in (q.abhaengigkeiten ?? {}) && q.laeufer?.daten?.length);
      const stand = JSON.stringify([
        p.version,
        p.laeufer!.modul,
        p.laeufer!.daten ?? [],
        p.laeufer!.netz,
        adressen,
        p.aktualisiert ?? p.installiert,
        zusaetze.map((q) => [q.id, q.version, q.laeufer!.daten, q.aktualisiert ?? q.installiert]),
      ]);
      if (this.gesendet.get(p.id) === stand) {
        behalten.push(p.id);
        gesendet.set(p.id, stand);
        continue;
      }
      const code = await this.o.dienst.kern.repo.paketCode(p.id);
      const modul = code.find((d) => d.name === 'modul.wasm');
      if (!modul) {
        this.ladefehler.set(p.id, 'Der Code des Pakets fehlt in der Datenbank – bitte das Paket neu installieren.');
        continue;
      }
      const daten = code
        .filter((d) => d.name.startsWith('daten/'))
        .map((d) => ({ name: d.name.slice('daten/'.length), inhalt: new Uint8Array(d.inhalt) }));
      for (const q of zusaetze) {
        for (const d of await this.o.dienst.kern.repo.paketCode(q.id))
          if (d.name.startsWith('daten/'))
            daten.push({ name: `${q.id}/${d.name.slice('daten/'.length)}`, inhalt: new Uint8Array(d.inhalt) });
      }
      liste.push({ id: p.id, version: p.version, modul: new Uint8Array(modul.inhalt), daten, netz: p.laeufer!.netz, adressen });
      gesendet.set(p.id, stand);
    }
    this.gesendet = gesendet;
    this.sende({ art: 'pakete', pakete: liste, behalten, grenzen: this.grenzen });
  }

  /**
   * Bestätigte Dienst-Adressen eines Pakets (#444): Werte der Einstellungen vom Typ adresse. Gespeichert wird eine
   * Adresse nur nach Bestätigung (Paketverwaltung); hier wird sie zur Sicherheit noch einmal geprüft.
   */
  private async adressen(p: InstalliertesPaket): Promise<string[]> {
    if (!p.einstellungen || !p.laeufer?.adressen?.length) return [];
    const werte = await this.o.einstellungen(p.id).catch(() => ({}) as Record<string, unknown>);
    return adressfelder(p.einstellungen)
      .map((f) => werte[f.schluessel])
      .filter((v): v is string => typeof v === 'string' && !!v && !pruefeAdresse(v));
  }

  /** Prozess-Id des Läufers, solange er läuft – für den Systemzustand (#409). */
  get pid(): number | null {
    return this.kind?.pid ?? null;
  }

  private starteKind() {
    if (this.aus) return;
    const hier = fileURLToPath(import.meta.url);
    const ts = hier.endsWith('.ts');
    // .mjs: Node liest dann keine package.json außerhalb von dist/ (die das Berechtigungsmodell sperrt).
    const pfad = join(dirname(hier), ts ? 'prozess.ts' : 'prozess.mjs');
    // Im Betrieb mit dem Berechtigungsmodell von Node: nur Lesen im Programmordner, Worker erlaubt, sonst nichts
    // (kein Schreiben, keine Kindprozesse, kein Zugriff auf Schlüssel und Daten des DMS).
    // Gebaut liegen prozess.mjs und arbeiter.mjs neben index.js in dist/ (siehe „build“ in package.json); nur diesen Ordner lesen.
    const rechte =
      ts || process.env.DMS_LAEUFER_OHNE_BERECHTIGUNGEN === '1'
        ? []
        : ['--permission', '--allow-worker', `--allow-fs-read=${dirname(hier)}`, '--disable-warning=SecurityWarning'];
    const kind = fork(pfad, [], {
      serialization: 'advanced',
      execArgv: [...ladeArgumente(process.execArgv), ...rechte],
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      env: { NODE_ENV: process.env.NODE_ENV ?? 'production', PATH: process.env.PATH ?? '' },
    });
    this.kind = kind;
    // Niedrigere Priorität (#893): gleich der Hauptfaden (spätere Fäden erben sie), bei „bereit“ alle Fäden.
    if (kind.pid) senkePrioritaet(kind.pid);
    this.bereit = false;
    this.gesendet = new Map(); // neuer Prozess: alles laden
    let zuletzt = '';
    kind.stdout?.on('data', (d: Buffer) => log.info('Paket-Läufer', { ausgabe: d.toString('utf8').slice(0, 500) }));
    kind.stderr?.on('data', (d: Buffer) => {
      const t = d.toString('utf8');
      zuletzt = (zuletzt + t).slice(-600);
      log.warn('Paket-Läufer', { ausgabe: t.slice(0, 500) });
    });
    kind.on('message', (m: VomLaeufer) => void this.verarbeite(m));
    kind.on('exit', (code, sig) => {
      if (this.kind !== kind) return;
      this.kind = null;
      this.bereit = false;
      if (!this.aus) this.absturz = new Date().toISOString();
      this.beendeAufrufe(
        abbruch(
          t('meldungen.verwaltung.der-paket-laeufer-ist', {
            wert: String(sig ?? code),
            wert2: zuletzt.trim() ? `: ${zuletzt.trim().split('\n').slice(-3).join(' ')}` : '',
          }),
        ),
      );
      if (this.aus) return;
      log.error('Paket-Läufer beendet – Neustart', { code, signal: sig, neustarts: this.neustarts, ausgabe: zuletzt.slice(-300) });
      const warte = Math.min(60_000, 1000 * 2 ** Math.min(this.neustarts++, 6));
      setTimeout(() => {
        if (!this.aus && !this.kind && this.pakete.length) this.starteKind();
      }, warte).unref?.();
    });
  }

  private async beendeKind() {
    const k = this.kind;
    this.kind = null;
    this.bereit = false;
    this.beendeAufrufe(abbruch(t('meldungen.verwaltung.der-paket-laeufer-wurde-2'), true));
    if (k) k.kill();
  }

  private async verarbeite(m: VomLaeufer) {
    switch (m.art) {
      case 'bereit':
        if (this.kind?.pid) senkeProzess(this.kind.pid);
        this.bereit = true;
        this.neustarts = 0;
        await this.sendePakete();
        void this.stelleZu();
        return;
      case 'geladen':
        for (const p of m.pakete) {
          this.ladefehler.set(p.id, p.fehler);
          if (p.fehler) log.warn('Paket-Läufer: Modul abgelehnt', { paket: p.id, fehler: p.fehler });
        }
        // Vektoren (#442): gleich das Modell erfragen und den Zwischenspeicher laden, nicht erst nach 30 s.
        if (this.vektorPaket() && !this.nachlauf.has(this.vektorPaket()!))
          setTimeout(() => void this.nachberechnen(), this.o.nachlaufErstMs ?? 1000).unref?.();
        return;
      case 'log':
        this.notiere(m.paket, { stufe: m.stufe, text: m.text });
        return;
      case 'ergebnis': {
        const a = this.aufrufe.get(m.nr);
        this.aufrufe.delete(m.nr);
        a?.ok(m);
        return;
      }
      case 'teil': {
        try {
          this.aufrufe.get(m.nr)?.teil?.(m.text);
        } catch {
          /* Empfänger weg */
        }
        return;
      }
      case 'frage':
        this.sende({
          art: 'antwort',
          nr: m.nr,
          antwort: await this.beantworte(m.paket, m.anfrage, m.aufruf).catch((e) => ({
            status: 500,
            body: new TextEncoder().encode((e as Error).message),
          })),
        });
        return;
    }
  }

  /**
   * API-Anfragen eines Pakets – immer mit seinem eigenen Schlüssel, nur unter /api/v1. Ausnahme Paket-Aktionen (#1039):
   * Kommt die Frage aus einem Aufruf einer Aktion, gilt nur deren eingeschränkter Zugriff (diese Mappe) – nie das
   * Dienstkonto; den eigenen Speicher darf das Paket dann nur lesen.
   */
  private async beantworte(paket: string, q: Extract<VomLaeufer, { art: 'frage' }>['anfrage'], aufruf?: number): Promise<Hostantwort> {
    const zugang = aufruf === undefined ? undefined : this.zugaenge.get(aufruf);
    return (zugang ? await this.aktionsFrage(paket, zugang, q) : null) ?? this.mitDienstkonto(paket, q, aufruf);
  }

  /** Speicher und API mit dem Schlüssel des Dienstkontos (alles außer Paket-Aktionen). */
  private async mitDienstkonto(paket: string, q: Extract<VomLaeufer, { art: 'frage' }>['anfrage'], aufruf?: number): Promise<Hostantwort> {
    const t = (status: number, s: string): Hostantwort => ({ status, body: new TextEncoder().encode(s) });
    if (q.art === 'speicher_lesen' || q.art === 'speicher_schreiben') {
      const werte = await this.o.speicher.lies(paket);
      if (q.art === 'speicher_lesen')
        return q.schluessel in werte ? { status: 200, body: new TextEncoder().encode(werte[q.schluessel]) } : t(404, '');
      const neu = { ...werte, [q.schluessel.slice(0, 200)]: new TextDecoder().decode(q.wert) };
      if (JSON.stringify(neu).length > SPEICHER_MAX) return t(413, `Der Speicher eines Pakets ist auf ${SPEICHER_MAX / KB} KB begrenzt.`);
      await this.o.speicher.schreibe(paket, neu);
      return t(200, '');
    }
    if (q.art !== 'api') return t(400, 'Unbekannte Anfrage.');
    const s = this.schluessel.get(paket);
    if (!s) return t(401, 'Kein Dienstkonto.');
    let a: { methode?: string; pfad?: string; typ?: string; body?: unknown };
    try {
      a = JSON.parse(q.json);
    } catch {
      return t(400, 'Ungültige Anfrage (JSON).');
    }
    const methode = String(a.methode ?? 'GET').toUpperCase();
    const pfad = String(a.pfad ?? '');
    if (!/^\/[^\s]*$/.test(pfad) || pfad.includes('..') || !['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(methode))
      return t(400, 'Ungültiger Pfad oder ungültige Methode.');
    const body = q.body ? Buffer.from(q.body) : a.body !== undefined ? Buffer.from(JSON.stringify(a.body)) : undefined;
    const kopf: Record<string, string> = {
      authorization: `Bearer ${s}`,
      ...(body ? { 'content-type': q.body ? String(a.typ ?? 'application/octet-stream') : 'application/json' } : {}),
    };
    const r = await this.o.api({ methode, pfad: `/api/v1${pfad}`, kopf, body });
    this.merkeSchreibfehler(aufruf, methode, pfad, r);
    return { status: r.status, body: new Uint8Array(r.body) };
  }

  /** Schreibversuch abgelehnt (#1491): für den Verlauf merken – nur Methode, Pfad (Ids), Status und Meldung, nie Inhalte. */
  private merkeSchreibfehler(aufruf: number | undefined, methode: string, pfad: string, r: { status: number; body: Buffer }) {
    if (aufruf === undefined || !this.aufrufe.has(aufruf) || methode === 'GET' || r.status < 400 || r.status >= 500) return;
    const liste = this.schreibfehler.get(aufruf) ?? [];
    if (liste.length < 10) liste.push(`${methode} ${pfad.split('?')[0]} → ${r.status}${meldungAus(r.body)}`);
    this.schreibfehler.set(aufruf, liste);
  }

  /**
   * Frage aus dem Aufruf einer Paket-Aktion (#1039): API nur über den eingeschränkten Zugriff, eigener Speicher nur
   * lesen (null = wie sonst), fremdes Paket mit derselben Nummer abgelehnt.
   */
  private async aktionsFrage(
    paket: string,
    zugang: AktionsZugang,
    q: Extract<VomLaeufer, { art: 'frage' }>['anfrage'],
  ): Promise<Hostantwort | null> {
    const t = (status: number, s: string): Hostantwort => ({ status, body: new TextEncoder().encode(s) });
    if (zugang.paket !== paket) return t(403, '');
    if (q.art === 'speicher_schreiben') return t(403, tx('meldungen.paketaktionen.zugang-verboten'));
    if (q.art !== 'api') return null;
    let a: { methode?: string; pfad?: string; typ?: string };
    try {
      a = JSON.parse(q.json);
    } catch {
      return t(400, 'Ungültige Anfrage (JSON).');
    }
    const pfad = String(a.pfad ?? '');
    if (!/^\/[^\s]*$/.test(pfad) || pfad.includes('..')) return t(400, 'Ungültiger Pfad.');
    const r = await beantworteZugang(
      zugang.zugang,
      zugang.dateien,
      {
        methode: String(a.methode ?? 'GET').toUpperCase(),
        pfad,
        ...(q.body ? { body: Buffer.from(q.body) } : {}),
        ...(a.typ ? { typ: String(a.typ) } : {}),
      },
      (sha) => this.o.dienst.kern.liesGanz(sha),
    );
    return { status: r.status, body: new Uint8Array(r.body) };
  }
}

/** Meldung einer abgelehnten Anfrage (`{ fehler: … }`), kurz; sonst nichts. */
function meldungAus(body: Buffer): string {
  try {
    const f = (JSON.parse(body.toString('utf8')) as { fehler?: unknown }).fehler;
    return typeof f === 'string' && f ? ` (${f.slice(0, 120)})` : '';
  } catch {
    return '';
  }
}
