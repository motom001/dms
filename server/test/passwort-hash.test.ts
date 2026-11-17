/** Passwort-Hashes (#1358): Parameter an einer Stelle, alte Hashes prüfbar und beim Anmelden umgestellt, Warteschlange. */
import assert from 'node:assert/strict';
import { randomBytes, scryptSync } from 'node:crypto';
import { describe, it } from 'node:test';
import {
  aktuelleParameter,
  GLEICHZEITIG,
  hashePasswort,
  hashVeraltet,
  istWarteschlangeVoll,
  pruefePasswort,
  SCRYPT,
  scryptStand,
  setzeTestParameter,
  WARTEND_HOECHSTENS,
} from '../src/anmeldung/passwort';
import { Fachfehler } from '../src/grundlagen/fehler';
import { SCHNELL } from './schnell';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konten/konto-repo';

const PW = 'ein-langes-passwort';

/** Hash im gespeicherten Format mit beliebigen Parametern (wie ihn eine ältere Version geschrieben hat). */
function alterHash(passwort: string, N: number, r: number, p: number, laenge = 64) {
  const salz = randomBytes(16);
  const hash = scryptSync(passwort.normalize('NFKC'), salz, laenge, { N, r, p, maxmem: 256 * 2 ** 20 });
  return ['scrypt', N, r, p, salz.toString('base64'), hash.toString('base64')].join('$');
}

describe('Passwort-Hashes (#1358)', () => {
  it('Standard: OWASP-gleichwertig N = 2^14, r = 8, p = 5; schnellere setzen nur die Tests selbst', () => {
    assert.deepEqual({ ...SCRYPT }, { N: 16384, r: 8, p: 5 });
    assert.deepEqual({ ...aktuelleParameter() }, { ...SCHNELL }, 'test/schnell.ts');
    // Keine Umgebungsvariable wählt schwächere Parameter (Durchsicht Sicherheit): ohne Testhilfe gilt der Standard.
    setzeTestParameter(null);
    try {
      process.env.NODE_ENV = 'test';
      assert.deepEqual({ ...aktuelleParameter() }, { ...SCRYPT });
    } finally {
      delete process.env.NODE_ENV;
      setzeTestParameter(SCHNELL);
    }
  });

  it('neu gespeichert werden nur schwächere Hashes (N·r·p kleiner oder kürzer), stärkere bleiben', () => {
    assert.equal(hashVeraltet(alterHash(PW, 512, 8, 1)), true, 'weniger Arbeit');
    assert.equal(hashVeraltet(alterHash(PW, 1024, 8, 1)), false, 'gleich');
    assert.equal(hashVeraltet(alterHash(PW, 1024, 8, 1, 32)), true, 'kürzerer Hash');
    assert.equal(hashVeraltet(alterHash(PW, 16384, 8, 1)), false, 'stärker: bleibt');
    setzeTestParameter(null);
    try {
      assert.equal(hashVeraltet(alterHash(PW, 16384, 8, 1)), true, 'bisheriger Standard ist schwächer als 2^14/8/5');
      assert.equal(hashVeraltet(alterHash(PW, 2 ** 17, 8, 1)), false, '2^17/8/1 ist stärker: bleibt');
    } finally {
      setzeTestParameter(SCHNELL);
    }
  });

  it('der Hash trägt seine Parameter; alte und aktuelle bleiben prüfbar', async () => {
    const neu = await hashePasswort(PW);
    const x = aktuelleParameter();
    assert.ok(neu.startsWith(`scrypt$${x.N}$${x.r}$${x.p}$`));
    assert.equal(await pruefePasswort(PW, neu), true);
    assert.equal(await pruefePasswort('falsch-falsch-falsch', neu), false);
    assert.equal(hashVeraltet(neu), false);
    const alt = alterHash(PW, 16384, 8, 1);
    assert.equal(await pruefePasswort(PW, alt), true, 'Hash der bisherigen Version');
    const standard = alterHash(PW, SCRYPT.N, SCRYPT.r, SCRYPT.p);
    assert.equal(await pruefePasswort(PW, standard), true, 'Hash mit den Standardwerten');
  });

  it('unzulässige Parameter im gespeicherten Hash gelten als falsch, ohne Fehler', async () => {
    const gut = alterHash(PW, 1024, 8, 1).split('$');
    const mit = (i: number, w: string) => gut.map((v, j) => (j === i ? w : v)).join('$');
    for (const h of [mit(1, '1000'), mit(1, String(2 ** 22)), mit(2, '0'), mit(3, '999'), mit(5, 'kurz'), `${gut.join('$')}$mehr`, 'md5$x'])
      assert.equal(await pruefePasswort(PW, h), false, h.slice(0, 30));
  });

  it('höchstens GLEICHZEITIG Durchläufe, die übrigen warten – unter der Grenze wird keiner abgewiesen, die Ereignisschleife läuft weiter', async () => {
    const h = await hashePasswort(PW);
    let hoechstens = 0;
    let wartendGesehen = 0;
    let takte = 0;
    let weiter = true;
    const takt = () => {
      takte++;
      const s = scryptStand();
      hoechstens = Math.max(hoechstens, s.laufend);
      wartendGesehen = Math.max(wartendGesehen, s.wartend);
      if (weiter) setImmediate(takt);
    };
    setImmediate(takt);
    const ergebnisse = await Promise.all(Array.from({ length: 8 }, (_, i) => pruefePasswort(i % 2 ? PW : 'falsch-falsch-falsch', h)));
    weiter = false;
    assert.deepEqual(
      ergebnisse,
      Array.from({ length: 8 }, (_, i) => i % 2 === 1),
    );
    assert.equal(hoechstens, GLEICHZEITIG);
    assert.ok(wartendGesehen > 0, 'weitere warten in der Schlange');
    assert.ok(takte > 1, 'Ereignisschleife nicht blockiert');
    assert.deepEqual(scryptStand(), { laufend: 0, wartend: 0 });
  });

  it('beim Anmelden: alter Hash wird mit den aktuellen Parametern neu gespeichert, falsches Passwort ändert nichts', async () => {
    const repo = speicherKontoRepo();
    const konten = new Konten(repo, null, 'http://nas');
    const { benutzer } = await konten.einrichten({ email: 'lena@example.org', name: 'Lena', passwort: PW });
    // Schwächer als die (schnellen) Parameter der Tests.
    const alt = alterHash(PW, 512, 8, 1);
    await repo.setzeHash(benutzer.id, alt);
    await assert.rejects(konten.anmelden({ email: 'lena@example.org', passwort: 'falsch-falsch-falsch' }, '1'));
    assert.equal((await repo.holeHash('lena@example.org'))!.hash, alt, 'falsch: unverändert');
    await konten.anmelden({ email: 'lena@example.org', passwort: PW }, '1');
    const neu = (await repo.holeHash('lena@example.org'))!.hash!;
    assert.notEqual(neu, alt);
    assert.equal(hashVeraltet(neu), false);
    assert.equal(await pruefePasswort(PW, neu), true);
    // Ein gleichzeitiger Passwortwechsel gewinnt: ersetzt wird nur, wenn noch der alte Hash gespeichert ist.
    assert.equal(await repo.ersetzeHash(benutzer.id, alt, 'scrypt$x'), false);
    assert.equal((await repo.holeHash('lena@example.org'))!.hash, neu);
  });

  it('Warteschlange voll: weitere Prüfungen sofort 503 mit Retry-After, Anmeldeschutz zählt sie nicht', async () => {
    const konten = new Konten(speicherKontoRepo(), null, 'http://nas');
    await konten.einrichten({ email: 'lena@example.org', name: 'Lena', passwort: PW });
    // Langsame Füller (Standardparameter), damit die Schlange während des Tests sicher voll bleibt.
    const langsam = alterHash(PW, SCRYPT.N, SCRYPT.r, SCRYPT.p);
    const fueller = Array.from({ length: GLEICHZEITIG + WARTEND_HOECHSTENS }, () => pruefePasswort(PW, langsam));
    assert.deepEqual(scryptStand(), { laufend: GLEICHZEITIG, wartend: WARTEND_HOECHSTENS });
    const zuViel = await Promise.allSettled([pruefePasswort(PW, langsam), pruefePasswort('egal', null)]);
    for (const r of zuViel) {
      assert.equal(r.status, 'rejected');
      const e = (r as PromiseRejectedResult).reason;
      assert.ok(e instanceof Fachfehler && istWarteschlangeVoll(e));
      assert.equal(e.status, 503);
      assert.equal((e.details as { retryAfter?: number }).retryAfter, 5);
    }
    // Anmelden mit bekannter und unbekannter Adresse: beide gleich abgewiesen, ohne Fehlversuch.
    for (const email of ['lena@example.org', 'niemand@example.org']) {
      await assert.rejects(konten.anmelden({ email, passwort: PW }, '10.0.0.7'), (e) => istWarteschlangeVoll(e));
      const v = await konten.sperre.versuch(email, '10.0.0.7');
      assert.equal(v.konto, 1, `${email}: der abgewiesene Versuch zählt nicht`);
      await konten.sperre.erfolg(email, '10.0.0.7', v);
    }
    assert.ok((await Promise.all(fueller)).every(Boolean));
    assert.deepEqual(scryptStand(), { laufend: 0, wartend: 0 });
  });
});
