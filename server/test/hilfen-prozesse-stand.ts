/**
 * Hilfe für prozesse-stand.test.ts (#1341): Hauptprozess mit zwei Prozessen und der echten Aufteilung (`teileArbeit`).
 * Sicherung und Probe-Wiederherstellung sind im Leiter kleine Stellvertreter, deren Lauf nur auf Zuruf (`POST /weiter`)
 * einen Schritt weitergeht. Jeder Prozess hat einen eigenen Port (exclusive) mit Starten und Abfragen wie die Routen
 * (`starte…()`, `laufStand()`). Dazu Eingangsordner und Datenbank-Anbindung echt, mit gemeinsamem Ordner
 * (`DMS_TEST_ORDNER`, Einstellungen als Datei): Speichern in einem Prozess, Zeitgeber und „Neustart nötig“ in beiden.
 * Ausgabe: JSON-Zeilen.
 */
import cluster from 'node:cluster';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { AnbindungVerwaltung, type Anbindung, type Pruefung } from '../src/datenbank/anbindung';
import { teileArbeit, type TeilungsDeps } from '../src/prozesse/aufteilung';
import { Eingangsordner } from '../src/post/eingangsordner';
import type { Einstellungen } from '../src/einstellungen/einstellungen';
import { leite, verbundFuerProzess } from '../src/prozesse/prozesse';
import type { Lauf } from '../src/sicherung/sicherung';
import type { Wiederherstellungslauf } from '../src/sicherung/wiederherstellung';

const zeige = (x: unknown) => process.stdout.write(`${JSON.stringify(x)}\n`);
const SCHRITTE = ['Entschlüsseln', 'Datenbank', 'Dateien', 'Prüfen'];

class ProbeStellvertreter {
  private lauf: Wiederherstellungslauf | null = null;
  aktuellerLauf() {
    return this.lauf ? structuredClone(this.lauf) : null;
  }
  laufStand = async () => this.aktuellerLauf();
  laeuft() {
    return this.lauf?.status === 'laeuft';
  }
  async starteProbe(name: string | null, von: string) {
    this.lauf = {
      art: 'probe',
      sicherung: name ?? 'neueste',
      von,
      status: 'laeuft',
      schritte: SCHRITTE.map((n) => ({ name: n, status: 'offen' })),
      bytes: 0,
      gesamt: SCHRITTE.length,
      gestartet: new Date().toISOString(),
    };
    return { lauf: this.aktuellerLauf()!, fertig: Promise.resolve(true) };
  }
  weiter() {
    const l = this.lauf;
    if (!l || l.status !== 'laeuft') return;
    const i = l.schritte.findIndex((s) => s.status !== 'ok');
    l.schritte[i].status = 'ok';
    l.bytes = i + 1;
    if (i === l.schritte.length - 1) {
      l.status = 'fertig';
      l.beendet = new Date().toISOString();
    }
  }
}

class SicherungStellvertreter {
  private lauf: Lauf | null = null;
  aktuellerLauf() {
    return this.lauf ? { ...this.lauf } : null;
  }
  laufStand = async () => this.aktuellerLauf();
  laeuft() {
    return this.lauf?.status === 'laeuft';
  }
  async starte() {
    this.lauf = {
      art: 'sicherung',
      titel: 'Sicherung',
      status: 'laeuft',
      schritt: SCHRITTE[0],
      bytes: 0,
      gesamt: SCHRITTE.length,
      gestartet: new Date().toISOString(),
    };
    return { lauf: this.aktuellerLauf()!, fertig: Promise.resolve(null) };
  }
  weiter() {
    const l = this.lauf;
    if (!l || l.status !== 'laeuft') return;
    l.bytes++;
    if (l.bytes === l.gesamt) {
      l.status = 'fertig';
      l.beendet = new Date().toISOString();
    } else l.schritt = SCHRITTE[l.bytes];
  }
}

if (cluster.isPrimary) {
  await leite({ anzahl: 2, quelle: 'umgebung', kerne: 4, speicher: null });
} else {
  const v = await verbundFuerProzess();
  const wh = new ProbeStellvertreter();
  const si = new SicherungStellvertreter();
  const nichts = () => {};
  const ordner = process.env.DMS_TEST_ORDNER!;
  // Einstellungen aller Prozesse in einer Datei – wie die gemeinsame Datenbank.
  const datei = join(ordner, 'einstellungen.json');
  const alle = (): Record<string, unknown> => {
    try {
      return JSON.parse(readFileSync(datei, 'utf8')) as Record<string, unknown>;
    } catch {
      return {};
    }
  };
  const einstellungen = {
    lies: async (k: string) => alle()[k] ?? null,
    schreibe: async (k: string, w: unknown) => {
      writeFileSync(datei, JSON.stringify({ ...alle(), [k]: w }));
    },
  } as unknown as Einstellungen;
  const eo = new Eingangsordner(join(ordner, 'eingang'), { dienst: {} as never, einstellungen, benutzer: async () => [] });
  const laufend: Anbindung = { host: 'db', port: 5432, datenbank: 'dms', benutzer: 'dms', passwort: 'geheim-1' };
  const anbindung = new AnbindungVerwaltung(
    ordner,
    laufend,
    null,
    nichts,
    async () => ({ ok: true, eingerichtet: true, benutzer: 2, text: '' }) as unknown as Pruefung,
    false,
  );
  /** Abstand des Zeitgebers in diesem Prozess (ms) oder null. */
  const zeitgeber = () => (eo as unknown as { zeitgeber?: { _idleTimeout: number; _destroyed: boolean } }).zeitgeber;
  const deps = {
    dienst: { auftraege: { teile: nichts }, stand: { teileEigene: nichts }, mappenstand: { teileEigene: nichts }, ereignisse: {} },
    texterkennung: {},
    vorschau: {},
    postfaecher: {},
    eingangsordner: eo,
    paketlaeufer: null,
    fernlaeufer: null,
    sicherung: si,
    wiederherstellung: wh,
    tresor: {},
    betrieb: {},
    oidc: {},
    messung: {},
    zustand: {},
    sql: () => Promise.reject(new Error('ohne Datenbank')),
    haushalt: 'test',
    ueberlast: {},
    verbindungen: {},
  } as unknown as TeilungsDeps;
  const teilung = teileArbeit(v, deps);
  if (!v.leiter) await teilung.start();
  const antworte = (res: import('node:http').ServerResponse, x: unknown) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(x ?? null));
  };
  const s = createServer((req, res) => {
    void (async () => {
      const weg = `${req.method} ${req.url}`;
      if (weg === 'POST /probe') return antworte(res, (await wh.starteProbe('sicherung-1', 'lena@example.org')).lauf);
      if (weg === 'GET /probe') return antworte(res, await wh.laufStand());
      if (weg === 'POST /sicherung') return antworte(res, (await si.starte()).lauf);
      if (weg === 'GET /sicherung') return antworte(res, await si.laufStand());
      if (weg === 'POST /eingang')
        return antworte(res, (await eo.speichere({ abstand: 42, aktiv: false }, 'lena@example.org')).einstellung);
      if (weg === 'GET /eingang/zeitgeber') {
        const z = zeitgeber();
        return antworte(res, z && !z._destroyed ? z._idleTimeout : null);
      }
      if (weg === 'POST /anbindung')
        return antworte(
          res,
          await anbindung.speichere(
            { host: 'db-neu', port: 5432, datenbank: 'dms', benutzer: 'dms', passwort: 'geheim-2' },
            'lena@example.org',
          ),
        );
      if (weg === 'GET /anbindung') return antworte(res, await anbindung.stand());
      if (weg === 'POST /weiter' && v.leiter) {
        wh.weiter();
        si.weiter();
        return antworte(res, true);
      }
      res.statusCode = 404;
      res.end();
    })().catch((e: Error) => {
      res.statusCode = 500;
      res.end(e.message);
    });
  });
  // Eigener Port je Prozess (nicht der gemeinsame unter cluster): Der Test wählt, welcher Prozess antwortet.
  s.listen({ port: 0, host: '127.0.0.1', exclusive: true }, () => {
    const a = s.address();
    v.bereit();
    zeige({ art: 'bereit', nr: v.nr, leiter: v.leiter, port: typeof a === 'object' && a ? a.port : 0 });
  });
  process.on('SIGTERM', () => {
    teilung.stop();
    eo.stop();
    s.close();
    process.exit(0);
  });
}
