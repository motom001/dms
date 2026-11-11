/**
 * dms-komplett: Datenbank-Ordner /data/postgres (#943).
 * Teil 1: start.sh richtet auch den eingebundenen Ordner und schreibt als postgres probe (die echte Probe mit
 * Docker steht in deploy/komplett-probe.sh, Schritt 5b). Teil 2: ohne eigenes Volume rot in Übersicht und Protokoll.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { akzeptierbar } from '../../shared/src/meldungen';
import { AnbindungVerwaltung, DATENBANK_ORDNER, DATENBANK_RETTEN, datenbankOhneVolume, type Anbindung } from '../src/anbindung';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { speicherRepo } from '../src/repo-speicher';
import { routen, type Anfrage } from '../src/routen';
import { tDe } from '../src/sprache';

const WURZEL = join(import.meta.dirname, '../..');
const lies = (p: string) => readFileSync(join(WURZEL, p), 'utf8');
const MELDUNG = 'FEHLER: PostgreSQL (Benutzer $(id -u postgres)) kann nicht in $PGDATA schreiben. Bitte die Rechte des Ordners auf dem NAS prüfen (ls -la, ACLs mit getfacl) oder ein benanntes Docker-Volume nutzen.';

describe('start.sh: Rechte am Datenbank-Ordner (#943)', () => {
  const skript = lies('deploy/komplett/start.sh');
  const zeile = (muster: string) => skript.split('\n').findIndex((z) => z.includes(muster));

  it('setzt 700 auch auf den eingebundenen Ordner selbst, nicht nur auf daten', () => {
    assert.match(skript, /^chmod 700 "\$WURZEL" "\$PGDATA"/m);
    assert.match(skript, /^chown postgres:postgres "\$WURZEL"/m);
  });

  it('chown/chmod brechen nicht ab (Netzwerkfreigaben) – die Schreibprobe meldet den Grund', () => {
    for (const z of skript.split('\n').filter((x) => /^(\[.*\] \|\| )?ch(own|mod) /.test(x))) assert.match(z, /\|\| true$/, z);
  });

  it('schreibt vor initdb und vor dem Start von PostgreSQL als postgres probe', () => {
    const probe = zeile('su-exec postgres sh -c');
    assert.ok(probe > 0, 'Schreibprobe als postgres');
    assert.ok(probe < zeile('initdb -D'), 'vor initdb');
    assert.ok(probe < zeile('su-exec postgres postgres -D'), 'vor dem Start von PostgreSQL');
    assert.ok(probe < zeile('PG_VERSION" ]'), 'vor dem Blick auf die bestehende Datenbank');
  });

  it('bricht mit klarer Meldung und Link ins Handbuch ab', () => {
    assert.ok(skript.includes(`log "${MELDUNG}"`), 'Meldung wie im Issue');
    assert.match(skript, /HILFE_START="Hilfe: https:\/\/help\.ablago\.app\/installieren\/aktuell\/komplett\/#container-startet-nicht"/);
    const ab = skript.slice(skript.indexOf(MELDUNG));
    assert.match(ab.slice(0, 300), /log "\$HILFE_START"[\s\S]*exit 1/);
  });

  it('der Anker im Handbuch existiert (de und en)', () => {
    for (const p of ['docs/handbuch/installieren/docs/komplett.md', 'docs/handbuch/installieren/docs-en/komplett.md']) {
      const t = lies(p);
      for (const a of ['container-startet-nicht', 'datenbank-auf-der-ssd', 'datenbank-retten']) assert.match(t, new RegExp(`\\{ ?#${a} ?\\}`), `${p}: #${a}`);
      assert.match(t, /stop_grace_period: 60s/, `${p}: stop_grace_period`);
    }
  });

  it('die Probe mit Docker prüft beide Fälle (Rechte 000 → startet; nicht beschreibbar → Meldung)', () => {
    const probe = lies('deploy/komplett-probe.sh');
    assert.match(probe, /chmod 000 "\$rechte"/);
    assert.match(probe, /:\/data\/postgres:ro"/);
    assert.ok(probe.includes('FEHLER: PostgreSQL (Benutzer 70) kann nicht in /data/postgres/daten schreiben. Bitte die Rechte des Ordners auf dem NAS prüfen'));
  });

  it('die Vorlage enthält stop_grace_period und /data/postgres', () => {
    const vorlage = lies('deploy/komplett/docker-compose.yml');
    assert.match(vorlage, /^ {4}stop_grace_period: 60s$/m);
    assert.match(vorlage, /^ {6}- \.\/postgres:\/data\/postgres$/m);
  });

  it('bewusst kein VOLUME /data/postgres im Image', () => {
    assert.doesNotMatch(lies('Dockerfile'), /^VOLUME/m);
  });
});

describe('Datenbank ohne Volume (#943)', () => {
  const nie = () => { throw new Error('nicht fragen'); };

  it('nur bei dms-komplett, und nur wenn /data/postgres sicher nicht eingebunden ist', () => {
    const gefragt: string[] = [];
    const volume = (ergebnis: boolean | null) => (p: string) => { gefragt.push(p); return ergebnis; };
    assert.equal(datenbankOhneVolume({ DMS_VARIANTE: 'komplett' }, volume(false)), true);
    assert.equal(datenbankOhneVolume({ DMS_VARIANTE: 'komplett' }, volume(true)), false);
    // Nicht feststellbar (kein Container, mountinfo unlesbar): keine Warnung.
    assert.equal(datenbankOhneVolume({ DMS_VARIANTE: 'komplett' }, volume(null)), false);
    assert.deepEqual([...new Set(gefragt)], [DATENBANK_ORDNER]);
    assert.equal(DATENBANK_ORDNER, '/data/postgres');
    // Zwei Container: Die Datenbank liegt woanders, nichts zu prüfen.
    assert.equal(datenbankOhneVolume({}, nie), false);
    assert.equal(datenbankOhneVolume({ DMS_VARIANTE: 'dms' }, nie), false);
  });

  it('Meldung im Protokoll: wie in der Übersicht, mit Anleitung zum Retten', () => {
    const text = tDe('meldungen.index.datenbank-ohne-volume', { link: DATENBANK_RETTEN });
    assert.ok(text.startsWith('Die Datenbank liegt nur im Container und geht beim nächsten Update verloren. Trage /data/postgres in der Compose-Datei ein.'), text);
    assert.match(text, /docker compose stop, nicht down, dann docker cp/);
    assert.ok(text.endsWith('https://help.ablago.app/installieren/aktuell/komplett/#datenbank-retten'));
    assert.equal(tDe('werkbank.uebersicht.datenbank-ohne-volume'), 'Die Datenbank liegt nur im Container und geht beim nächsten Update verloren.');
  });

  it('wird beim Start geprüft und protokolliert (ablago.ts)', () => {
    const quelle = lies('server/src/ablago.ts');
    assert.match(quelle, /const ohneDatenbankVolume = datenbankOhneVolume\(env\);/);
    assert.match(quelle, /if \(ohneDatenbankVolume && leiter\) log\.error\(tDe\('meldungen\.index\.datenbank-ohne-volume'/);
    assert.match(quelle, /new AnbindungVerwaltung\([^\n]*, ohneDatenbankVolume\)/);
  });

  const A: Anbindung = { host: '127.0.0.1', port: 5432, datenbank: 'dms', benutzer: 'dms', passwort: '' };

  it('Datenbank-Anbindung und Übersicht melden es; rot, also nicht akzeptierbar', async () => {
    for (const ohne of [true, false]) {
      const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
      const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
      const { benutzer: markus } = await konten.einrichten({ email: 'markus@example.org', name: 'Markus', passwort: 'ein-langes-passwort' });
      await d.gleicheBenutzerAb(await konten.listeBenutzer());
      const anbindung = new AnbindungVerwaltung('/gibt-es-nicht', A, null, () => {}, undefined, ohne);
      assert.equal(anbindung.stand().ohneVolume, ohne);
      const tabelle = routen(d, konten, { anbindung });
      const rufe = async (methode: string, pfad: string, body: Record<string, unknown> = {}) => {
        const r = tabelle.find((x) => x.methode === methode && x.pfad === pfad);
        assert.ok(r, `${methode} ${pfad}`);
        return (await r.handler({ body, params: {}, query: {}, ip: '1', benutzer: markus } as Anfrage) as { body: unknown }).body;
      };
      const u = await rufe('GET', '/api/werkbank/uebersicht') as { anbindung: { ohneVolume: boolean } };
      assert.equal(u.anbindung.ohneVolume, ohne);
      const s = await rufe('GET', '/api/werkbank/anbindung') as { ohneVolume: boolean };
      assert.equal(s.ohneVolume, ohne);
    }
    assert.equal(akzeptierbar('schlecht'), false);
  });

  it('die Übersicht zeigt die Meldung rot und verlinkt zur Datenbank-Anbindung, die Seite dort zum Handbuch', () => {
    const uebersicht = lies('web/src/werkbank/Uebersicht.tsx');
    assert.match(uebersicht, /if \(u\.anbindung\?\.ohneVolume\) h\.push\(\{ schluessel: 'datenbank\.ohne-volume', art: 'schlecht'[^\n]*ziel: '\/werkbank\/anbindung'/);
    const seite = lies('web/src/werkbank/Anbindung.tsx');
    assert.match(seite, /s\.ohneVolume && <div className="hinweis schlecht">/);
    assert.match(seite, /komplett\/#datenbank-retten/);
  });
});
