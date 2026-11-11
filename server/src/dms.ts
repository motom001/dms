/**
 * Befehl `dms` im Container (#244): `docker exec -it <container> dms <befehl>`.
 * Spricht mit dem laufenden Server (Schlüssel und Adresse aus /tmp/dms-konsole.json), nie direkt mit
 * der Datenbank. Jede Aktion steht im Protokoll des DMS mit dem Vermerk „Konsole“.
 */
import { readFile } from 'node:fs/promises';
import { ALS_KOPF, KONSOLE_KOPF, konsolenDatei, lokaleUrl, type KonsolenDatei } from './konsole';
import { t } from './sprache';
import { gebietsschema } from '../../shared/src/sprache';
import { MB } from './grenzen';

export class KonsolenFehler extends Error {
  constructor(message: string, readonly code = 1) { super(message); }
}

export interface Optionen { json: boolean; als?: string; ja: boolean; werte: Record<string, string> }
export interface Zerlegt { befehl: string[]; opt: Optionen }

/** Argumente zerlegen: Befehlswörter und --schalter (--json, --als x, --ja, --name=wert). */
export function zerlege(args: string[]): Zerlegt {
  const befehl: string[] = [];
  const opt: Optionen = { json: false, ja: false, werte: {} };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') { befehl.push(...args.slice(i + 1)); break; }
    if (!a.startsWith('--') || a.length === 2) { befehl.push(a); continue; }
    const [k, v] = a.slice(2).split(/=(.*)/s, 2);
    if (k === 'json') opt.json = true;
    else if (k === 'ja' || k === 'yes') opt.ja = true;
    else if (k === 'admin' || k === 'alle') opt.werte[k] = 'ja';
    else {
      const wert = v ?? args[++i];
      if (wert === undefined) throw new KonsolenFehler(t('meldungen.dms.braucht-einen-wert', { k }), 2);
      if (k === 'als') opt.als = wert; else opt.werte[k] = wert;
    }
  }
  return { befehl, opt };
}

export const HILFE = `dms – Befehle für Ablago in diesem Container

Aufruf:  docker exec -it <container> dms <befehl> [--json] [--als <admin-email>]

Notfall
  passwort <email> [--passwort <neu>]   Passwort direkt setzen (ohne Mail), alle Sitzungen enden
  zweifaktor-zuruecksetzen <email>       Zwei-Faktor-Anmeldung eines Benutzers entfernen
  passkeys-zuruecksetzen <email>         alle Passkeys eines Benutzers entfernen
  gesperrt                               gesperrte IP-Adressen anzeigen
  entsperren <ip>                        IP-Adresse freigeben
  wartung                                Stand des Wartungsmodus
  wartung aus                            Wartungsmodus beenden
  abmelden <email>                       alle Sitzungen eines Benutzers beenden
  abmelden --alle                        alle Sitzungen aller Benutzer beenden

Betrieb
  status                                 Version, Datenbank, Laufzeit
  sicherung                              Sicherungen auflisten
  sicherung jetzt                        Sicherung starten
  sicherung pruefen <name>               Sicherung prüfen

Verwaltung
  benutzer                               Benutzer auflisten
  benutzer anlegen <email> <name> [--admin]   mit --admin: „Gesamte Verwaltung“
  benutzer deaktivieren <email>
  benutzer aktivieren <email>

Allgemein
  api <METHODE> <pfad> [json]            jede Funktion der Schnittstelle, z. B.
                                         dms api GET /api/werkbank/anmeldeschutz
  hilfe                                  diese Übersicht

Optionen
  --json        Ausgabe als JSON (für Skripte)
  --als <email> als dieser Administrator handeln (sonst der älteste aktive)
  --ja          Rückfragen mit Ja beantworten

Handbuch: https://help.ablago.app/admin/aktuell/konsole/`;

const BEFEHLE = ['passwort', 'zweifaktor-zuruecksetzen', 'passkeys-zuruecksetzen', 'gesperrt', 'entsperren', 'wartung', 'abmelden', 'status', 'sicherung', 'benutzer', 'api'];

/* ---------- Verbindung ---------- */

/** Das Nötigste von fetch (ohne DOM-Typen). */
export type Holen = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export interface Verbindung { anfrage<T = unknown>(methode: string, pfad: string, body?: unknown): Promise<T> }

export async function verbinde(env: NodeJS.ProcessEnv, als: string | undefined, holen: Holen = fetch as unknown as Holen): Promise<Verbindung> {
  const datei = konsolenDatei(env);
  let z: KonsolenDatei;
  try { z = JSON.parse(await readFile(datei, 'utf8')) as KonsolenDatei; } catch (e) {
    const fehlt = (e as NodeJS.ErrnoException).code === 'ENOENT';
    if (fehlt) {
      // Läuft der Server, aber ohne Konsolenzugang? Dann ist es der Einrichtungsmodus.
      const url = lokaleUrl(Number(env.PORT ?? 3000), env.HOST);
      const g = await holen(`${url}/api/gesundheit`).then(async (r) => ({ ok: r.ok, zustand: (JSON.parse(await r.text()) as { zustand?: string }).zustand })).catch(() => null);
      if (g?.ok) throw new KonsolenFehler(t('meldungen.dms.ablago-laeuft-im-einrichtungsmodus'), 3);
      // Startseite (#802): Ablago ist erreichbar, aber noch nicht bereit.
      if (g?.zustand === 'startet') throw new KonsolenFehler(t('meldungen.dms.ablago-startet-gerade-migrationen'), 3);
      if (g?.zustand === 'fehler') throw new KonsolenFehler(t('meldungen.dms.ablago-konnte-nicht-starten'), 3);
      throw new KonsolenFehler(t('meldungen.dms.ablago-laeuft-nicht-oder'), 3);
    }
    if ((e as NodeJS.ErrnoException).code === 'EACCES') throw new KonsolenFehler(t('meldungen.dms.keine-berechtigung-fuer-rufe', { datei }), 3);
    throw new KonsolenFehler(t('meldungen.dms.ist-nicht-lesbar', { datei, message: (e as Error).message }), 3);
  }
  return {
    async anfrage<T>(methode: string, pfad: string, body?: unknown): Promise<T> {
      let r: Awaited<ReturnType<Holen>>;
      try {
        r = await holen(`${z.url}${pfad}`, {
          method: methode,
          headers: { [KONSOLE_KOPF]: z.schluessel, ...(als ? { [ALS_KOPF]: als } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
      } catch {
        throw new KonsolenFehler(t('meldungen.dms.ablago-antwortet-nicht-laeuft'), 3);
      }
      const text = await r.text();
      let daten: unknown = null;
      try { daten = text ? JSON.parse(text) : null; } catch { daten = text; }
      if (!r.ok) {
        const m = daten && typeof daten === 'object' && 'fehler' in daten ? String((daten as { fehler: unknown }).fehler) : `HTTP ${r.status}`;
        throw new KonsolenFehler(m, r.status === 401 || r.status === 403 ? 4 : 1);
      }
      return daten as T;
    },
  };
}

/* ---------- Ein- und Ausgabe ---------- */

export interface Ein { frage(text: string, verdeckt?: boolean): Promise<string>; interaktiv: boolean }
export interface Aus { zeile(text: string): void; json(daten: unknown): void }

const zeit = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'short', timeStyle: 'short' }) : '–');
const tabelle = (zeilen: string[][]) => {
  const breite = zeilen[0]?.map((_, i) => Math.max(...zeilen.map((z) => (z[i] ?? '').length))) ?? [];
  return zeilen.map((z) => z.map((x, i) => (i === z.length - 1 ? x : x.padEnd(breite[i]))).join('  ').trimEnd());
};

/** Verwaltungsrecht (#818) für die Liste: „Gesamte Verwaltung“, Bereiche oder „–“. */
const verwaltet = (v?: string[]) => (!v?.length ? '–' : v.includes('*') ? t('meldungen.dms.gesamte-verwaltung') : v.join(', '));
interface BenutzerZeile { id: string; email: string; name: string; verwaltung?: string[]; aktiv: boolean; hatPasswort: boolean; letzteAnmeldung: string | null }

async function benutzerZu(v: Verbindung, email: string | undefined): Promise<BenutzerZeile> {
  if (!email) throw new KonsolenFehler(t('meldungen.dms.bitte-die-e-mail'), 2);
  const liste = await v.anfrage<BenutzerZeile[]>('GET', '/api/benutzer');
  const b = liste.find((x) => x.email.toLowerCase() === email.toLowerCase());
  if (!b) throw new KonsolenFehler(t('meldungen.dms.unter-gibt-es-keinen', { email }), 1);
  return b;
}

async function bestaetige(ein: Ein, opt: Optionen, frage: string) {
  if (opt.ja) return;
  if (!ein.interaktiv) throw new KonsolenFehler(t('meldungen.dms.ohne-terminal-bitte-mit', { frage }), 2);
  const a = (await ein.frage(`${frage} [j/N] `)).trim().toLowerCase();
  if (a !== 'j' && a !== 'ja' && a !== 'y' && a !== 'yes') throw new KonsolenFehler(t('meldungen.dms.abgebrochen'), 1);
}

/* ---------- Befehle ---------- */

export async function fuehreAus(z: Zerlegt, v: Verbindung, ein: Ein, aus: Aus): Promise<void> {
  const [b, ...rest] = z.befehl;
  const { opt } = z;
  const zeige = (daten: unknown, lesbar: () => string | string[]) => {
    if (opt.json) aus.json(daten);
    else { const t = lesbar(); for (const l of Array.isArray(t) ? t : [t]) aus.zeile(l); }
  };

  switch (b) {
    case 'passwort': {
      const email = rest[0];
      if (!email) throw new KonsolenFehler(t('meldungen.dms.aufruf-dms-passwort-email'), 2);
      let pw = opt.werte.passwort;
      if (pw === undefined) {
        if (!ein.interaktiv) throw new KonsolenFehler(t('meldungen.dms.ohne-terminal-das-passwort'), 2);
        pw = await ein.frage(t('meldungen.dms.neues-passwort'), true);
        if ((await ein.frage(t('meldungen.dms.wiederholen'), true)) !== pw) throw new KonsolenFehler(t('meldungen.dms.die-beiden-passwoerter-stimmen'), 1);
      }
      const r = await v.anfrage<{ email: string; aktiv: boolean; zweifaktor: boolean }>('POST', '/api/konsole/passwort', { email, passwort: pw });
      return zeige(r, () => [
        t('meldungen.dms.passwort-fuer-gesetzt-alle', { email: r.email }),
        ...(r.aktiv ? [] : [t('meldungen.dms.achtung-der-benutzer-ist')]),
        ...(r.zweifaktor ? [t('meldungen.dms.die-zwei-faktor-anmeldung', { email: r.email })] : []),
      ]);
    }
    case 'zweifaktor-zuruecksetzen': {
      const u = await benutzerZu(v, rest[0]);
      await bestaetige(ein, opt, t('meldungen.dms.zwei-faktor-anmeldung-von', { email: u.email }));
      await v.anfrage('POST', `/api/benutzer/${u.id}/zweifaktor/zuruecksetzen`);
      return zeige({ ok: true, email: u.email }, () => t('meldungen.dms.zwei-faktor-anmeldung-von-2', { email: u.email }));
    }
    case 'passkeys-zuruecksetzen': {
      const u = await benutzerZu(v, rest[0]);
      await bestaetige(ein, opt, t('meldungen.dms.passkeys-von', { email: u.email }));
      await v.anfrage('POST', `/api/benutzer/${u.id}/passkeys/zuruecksetzen`);
      return zeige({ ok: true, email: u.email }, () => t('meldungen.dms.passkeys-von-2', { email: u.email }));
    }
    case 'gesperrt': {
      const s = await v.anfrage<{ gesperrt: Array<{ ip: string; grund: string; seit: string; bis: string | null }> }>('GET', '/api/werkbank/anmeldeschutz');
      return zeige(s.gesperrt, () => (s.gesperrt.length
        ? tabelle([['IP', 'seit', 'bis', 'Grund'], ...s.gesperrt.map((g) => [g.ip, zeit(g.seit), g.bis ? zeit(g.bis) : t('meldungen.dms.bis-entsperrt'), g.grund])])
        : t('meldungen.dms.keine-adresse-gesperrt')));
    }
    case 'entsperren': {
      if (!rest[0]) throw new KonsolenFehler(t('meldungen.dms.aufruf-dms-entsperren-ip'), 2);
      await v.anfrage('POST', '/api/werkbank/anmeldeschutz/entsperren', { ip: rest[0] });
      return zeige({ ok: true, ip: rest[0] }, () => `${rest[0]} entsperrt.`);
    }
    case 'wartung': {
      if (rest[0] === 'aus') {
        await v.anfrage('POST', '/api/werkbank/wartung/aus');
        return zeige({ ok: true }, () => t('meldungen.dms.wartungsmodus-beendet'));
      }
      if (rest[0]) throw new KonsolenFehler(t('meldungen.dms.aufruf-dms-wartung-aus'), 2);
      const w = await v.anfrage<{ stufe?: string; aktiv?: boolean; text?: string; ende?: string | null; beginn?: string | null }>('GET', '/api/werkbank/wartung');
      return zeige(w, () => (w.stufe && w.stufe !== 'aus' ? t('meldungen.dms.wartungsmodus', { stufe: w.stufe, wert: w.text ? ` – ${w.text}` : '', wert2: w.ende ? ` (bis ${zeit(w.ende)})` : '' }) : t('meldungen.dms.kein-wartungsmodus')));
    }
    case 'abmelden': {
      if (opt.werte.alle) {
        await bestaetige(ein, opt, t('meldungen.dms.alle-benutzer-auf-allen'));
        let beendet = 0;
        for (const u of await v.anfrage<BenutzerZeile[]>('GET', '/api/benutzer')) beendet += (await v.anfrage<{ beendet: number }>('DELETE', `/api/benutzer/${u.id}/sitzungen`)).beendet;
        return zeige({ beendet }, () => t('meldungen.dms.sitzungen-beendet', { beendet }));
      }
      const u = await benutzerZu(v, rest[0]);
      const r = await v.anfrage<{ beendet: number }>('DELETE', `/api/benutzer/${u.id}/sitzungen`);
      return zeige(r, () => `${u.email}: ${r.beendet} Sitzungen beendet.`);
    }
    case 'status': {
      const s = await v.anfrage<{ dms: { version: string; variante: string; commit: string | null }; laufzeit: { node: string; laeuftSeit: string; zeitzone: string }; datenbank: Record<string, unknown> }>('GET', '/api/werkbank/system');
      const db = s.datenbank;
      return zeige(s, () => [
        `Ablago ${s.dms.version} (${s.dms.variante})${s.dms.commit ? `, Commit ${s.dms.commit.slice(0, 7)}` : ''}`,
        t('meldungen.dms.laeuft-seit-node', { zeit: zeit(s.laufzeit.laeuftSeit), node: s.laufzeit.node, zeitzone: s.laufzeit.zeitzone }),
        `Datenbank: ${'fehler' in db ? `Fehler – ${String(db.fehler)}` : Object.entries(db).filter(([, x]) => typeof x !== 'object').map(([k, x]) => `${k} ${String(x)}`).join(' · ')}`,
      ]);
    }
    case 'sicherung': {
      if (rest[0] === 'jetzt') {
        const l = await v.anfrage<{ name?: string; zustand?: string }>('POST', '/api/werkbank/sicherung/jetzt');
        return zeige(l, () => t('meldungen.dms.sicherung-gestartet-fortschritt-dms', { wert: l.name ? `: ${l.name}` : '' }));
      }
      if (rest[0] === 'pruefen') {
        if (!rest[1]) throw new KonsolenFehler(t('meldungen.dms.aufruf-dms-sicherung-pruefen'), 2);
        const r = await v.anfrage<unknown>('POST', `/api/werkbank/sicherung/${encodeURIComponent(rest[1])}/pruefen`);
        return zeige(r, () => t('meldungen.dms.pruefung-von-gestartet-ergebnis', { rest: rest[1] }));
      }
      if (rest[0]) throw new KonsolenFehler(t('meldungen.dms.aufruf-dms-sicherung-jetzt'), 2);
      const s = await v.anfrage<{ lauf: { zustand?: string; name?: string } | null; liste: Array<{ name: string; bytes?: number; erstellt?: string; geprueft?: { ok: boolean } | null }> }>('GET', '/api/werkbank/sicherung');
      return zeige(s, () => [
        ...(s.lauf ? [t('meldungen.dms.laeuft-gerade', { wert: s.lauf.name ?? '', wert2: s.lauf.zustand ?? '' }).trim()] : []),
        ...(s.liste.length ? tabelle([['Name', 'Größe'], ...s.liste.map((x) => [x.name, x.bytes !== undefined ? `${(x.bytes / MB).toFixed(1)} MB` : ''])]) : [t('meldungen.dms.noch-keine-sicherung')]),
      ]);
    }
    case 'benutzer': {
      const [unter, email, ...name] = rest;
      if (!unter) {
        const liste = await v.anfrage<BenutzerZeile[]>('GET', '/api/benutzer');
        return zeige(liste, () => tabelle([['E-Mail', 'Name', 'Verwaltung', 'Status', t('meldungen.dms.letzte-anmeldung')],
          ...liste.map((u) => [u.email, u.name, verwaltet(u.verwaltung), !u.aktiv ? 'deaktiviert' : u.hatPasswort ? 'aktiv' : 'eingeladen', zeit(u.letzteAnmeldung)])]));
      }
      if (unter === 'anlegen') {
        if (!email) throw new KonsolenFehler(t('meldungen.dms.aufruf-dms-benutzer-anlegen'), 2);
        const r = await v.anfrage<{ benutzer: BenutzerZeile; mailVerschickt: boolean; link?: string }>('POST', '/api/benutzer', { email, name: name.join(' '), ...(opt.werte.admin ? { verwaltung: ['*'] } : {}) });
        return zeige(r, () => [`${r.benutzer.email} angelegt (${verwaltet(r.benutzer.verwaltung)}).`, r.mailVerschickt ? t('meldungen.dms.die-einladung-ist-per') : r.link ? `Einladungslink: ${r.link}` : t('meldungen.dms.keine-einladung-verschickt')]);
      }
      if (unter === 'deaktivieren' || unter === 'aktivieren') {
        const u = await benutzerZu(v, email);
        if (unter === 'deaktivieren') await bestaetige(ein, opt, t('meldungen.dms.deaktivieren-alle-sitzungen-enden', { email: u.email }));
        await v.anfrage('PUT', `/api/benutzer/${u.id}`, { aktiv: unter === 'aktivieren' });
        return zeige({ ok: true, email: u.email, aktiv: unter === 'aktivieren' }, () => `${u.email} ${unter === 'aktivieren' ? 'aktiviert' : 'deaktiviert'}.`);
      }
      throw new KonsolenFehler(t('meldungen.dms.aufruf-dms-benutzer-anlegen-2'), 2);
    }
    case 'api': {
      const [methode, pfad, json] = rest;
      if (!methode || !pfad || !/^(GET|POST|PUT|DELETE)$/i.test(methode) || !pfad.startsWith('/api/')) throw new KonsolenFehler(t('meldungen.dms.aufruf-dms-api-get'), 2);
      let body: unknown;
      if (json !== undefined) { try { body = JSON.parse(json); } catch { throw new KonsolenFehler(t('meldungen.dms.der-dritte-teil-muss'), 2); } }
      const r = await v.anfrage<unknown>(methode.toUpperCase(), pfad, body);
      return aus.json(r);
    }
    case undefined: case 'hilfe': case 'help': case '-h':
      return aus.zeile(HILFE);
    default:
      throw new KonsolenFehler(t('meldungen.dms.unbekannter-befehl-uebersicht-dms', { b }), 2);
  }
}

/* ---------- Terminal ---------- */

function terminalEin(): Ein {
  const interaktiv = !!process.stdin.isTTY;
  return {
    interaktiv,
    frage: (text, verdeckt = false) => new Promise((fertig, fehler) => {
      process.stdout.write(text);
      const stdin = process.stdin;
      let eingabe = '';
      if (verdeckt && stdin.isTTY) stdin.setRawMode(true);
      stdin.setEncoding('utf8');
      stdin.resume();
      const ende = (wert: string | null) => {
        stdin.off('data', bei);
        if (verdeckt && stdin.isTTY) stdin.setRawMode(false);
        stdin.pause();
        if (verdeckt) process.stdout.write('\n');
        if (wert === null) fehler(new KonsolenFehler(t('meldungen.dms.abgebrochen'), 130)); else fertig(wert);
      };
      const bei = (teil: string) => {
        for (const c of teil) {
          if (c === '\r' || c === '\n') return ende(eingabe);
          if (c === '\u0003' || c === '\u0004') return ende(null);
          if (c === '\u007f' || c === '\b') eingabe = eingabe.slice(0, -1); else eingabe += c;
        }
      };
      stdin.on('data', bei);
    }),
  };
}

export async function haupt(args: string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const aus: Aus = { zeile: (t) => process.stdout.write(`${t}\n`), json: (d) => process.stdout.write(`${JSON.stringify(d, null, 2)}\n`) };
  try {
    const z = zerlege(args);
    if (!z.befehl.length || ['hilfe', 'help', '-h'].includes(z.befehl[0])) { aus.zeile(HILFE); return 0; }
    if (!BEFEHLE.includes(z.befehl[0])) throw new KonsolenFehler(t('meldungen.dms.unbekannter-befehl-uebersicht-dms-2', { befehl: z.befehl[0] }), 2);
    await fuehreAus(z, await verbinde(env, z.opt.als), terminalEin(), aus);
    return 0;
  } catch (e) {
    process.stderr.write(`dms: ${(e as Error).message}\n`);
    return e instanceof KonsolenFehler ? e.code : 1;
  }
}

// Als Programm gestartet (dist/dms.js), nicht beim Import in Tests.
if (process.argv[1] && /dms\.(js|ts)$/.test(process.argv[1])) {
  void haupt(process.argv.slice(2)).then((c) => process.exit(c));
}
