/**
 * Hilfe für prozesse-stand.test.ts (#1341): Hauptprozess mit zwei Prozessen und der echten Aufteilung (`teileArbeit`).
 * Sicherung und Probe-Wiederherstellung sind im Leiter kleine Stellvertreter, deren Lauf nur auf Zuruf (`POST /weiter`)
 * einen Schritt weitergeht. Jeder Prozess hat einen eigenen Port (exclusive) mit Starten und Abfragen wie die Routen
 * (`starte…()`, `laufStand()`). Ausgabe: JSON-Zeilen.
 */
import cluster from 'node:cluster';
import { createServer } from 'node:http';
import { teileArbeit, type TeilungsDeps } from '../src/aufteilung';
import { leite, verbundFuerProzess } from '../src/prozesse';
import type { Lauf } from '../src/sicherung';
import type { Wiederherstellungslauf } from '../src/wiederherstellung';

const zeige = (x: unknown) => process.stdout.write(`${JSON.stringify(x)}\n`);
const SCHRITTE = ['Entschlüsseln', 'Datenbank', 'Dateien', 'Prüfen'];

class ProbeStellvertreter {
  private lauf: Wiederherstellungslauf | null = null;
  aktuellerLauf() { return this.lauf ? structuredClone(this.lauf) : null; }
  laufStand = async () => this.aktuellerLauf();
  laeuft() { return this.lauf?.status === 'laeuft'; }
  async starteProbe(name: string | null, von: string) {
    this.lauf = { art: 'probe', sicherung: name ?? 'neueste', von, status: 'laeuft', schritte: SCHRITTE.map((n) => ({ name: n, status: 'offen' })), bytes: 0, gesamt: SCHRITTE.length, gestartet: new Date().toISOString() };
    return { lauf: this.aktuellerLauf()!, fertig: Promise.resolve(true) };
  }
  weiter() {
    const l = this.lauf;
    if (!l || l.status !== 'laeuft') return;
    const i = l.schritte.findIndex((s) => s.status !== 'ok');
    l.schritte[i].status = 'ok';
    l.bytes = i + 1;
    if (i === l.schritte.length - 1) { l.status = 'fertig'; l.beendet = new Date().toISOString(); }
  }
}

class SicherungStellvertreter {
  private lauf: Lauf | null = null;
  aktuellerLauf() { return this.lauf ? { ...this.lauf } : null; }
  laufStand = async () => this.aktuellerLauf();
  laeuft() { return this.lauf?.status === 'laeuft'; }
  async starte() {
    this.lauf = { art: 'sicherung', titel: 'Sicherung', status: 'laeuft', schritt: SCHRITTE[0], bytes: 0, gesamt: SCHRITTE.length, gestartet: new Date().toISOString() };
    return { lauf: this.aktuellerLauf()!, fertig: Promise.resolve(null) };
  }
  weiter() {
    const l = this.lauf;
    if (!l || l.status !== 'laeuft') return;
    l.bytes++;
    if (l.bytes === l.gesamt) { l.status = 'fertig'; l.beendet = new Date().toISOString(); } else l.schritt = SCHRITTE[l.bytes];
  }
}

if (cluster.isPrimary) {
  await leite({ anzahl: 2, quelle: 'umgebung', kerne: 4, speicher: null });
} else {
  const v = await verbundFuerProzess();
  const wh = new ProbeStellvertreter();
  const si = new SicherungStellvertreter();
  const nichts = () => {};
  const deps = {
    dienst: { auftraege: { teile: nichts }, stand: { teileEigene: nichts }, mappenstand: { teileEigene: nichts }, ereignisse: {} },
    texterkennung: {}, vorschau: {}, postfaecher: {}, eingangsordner: {}, paketlaeufer: null, fernlaeufer: null,
    sicherung: si, wiederherstellung: wh, tresor: {}, betrieb: {}, oidc: {}, messung: {}, zustand: {},
    sql: () => Promise.reject(new Error('ohne Datenbank')), haushalt: 'test', ueberlast: {}, verbindungen: {},
  } as unknown as TeilungsDeps;
  const teilung = teileArbeit(v, deps);
  if (!v.leiter) await teilung.start();
  const antworte = (res: import('node:http').ServerResponse, x: unknown) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(x ?? null)); };
  const s = createServer((req, res) => {
    void (async () => {
      const weg = `${req.method} ${req.url}`;
      if (weg === 'POST /probe') return antworte(res, (await wh.starteProbe('sicherung-1', 'lena@example.org')).lauf);
      if (weg === 'GET /probe') return antworte(res, await wh.laufStand());
      if (weg === 'POST /sicherung') return antworte(res, (await si.starte()).lauf);
      if (weg === 'GET /sicherung') return antworte(res, await si.laufStand());
      if (weg === 'POST /weiter' && v.leiter) { wh.weiter(); si.weiter(); return antworte(res, true); }
      res.statusCode = 404; res.end();
    })().catch((e: Error) => { res.statusCode = 500; res.end(e.message); });
  });
  // Eigener Port je Prozess (nicht der gemeinsame unter cluster): Der Test wählt, welcher Prozess antwortet.
  s.listen({ port: 0, host: '127.0.0.1', exclusive: true }, () => {
    const a = s.address();
    v.bereit();
    zeige({ art: 'bereit', nr: v.nr, leiter: v.leiter, port: typeof a === 'object' && a ? a.port : 0 });
  });
  process.on('SIGTERM', () => { teilung.stop(); s.close(); process.exit(0); });
}
