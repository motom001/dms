/** Passwort-Hashes (#1358): Parameter an einer Stelle, alte Hashes prüfbar und beim Anmelden umgestellt, Warteschlange. */
import assert from 'node:assert/strict';
import { randomBytes, scryptSync } from 'node:crypto';
import { describe, it } from 'node:test';
import {
  aktuelleParameter,
  GLEICHZEITIG,
  hashePasswort,
  hashVeraltet,
  pruefePasswort,
  SCRYPT,
  scryptStand,
} from '../src/anmeldung/passwort';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konten/konto-repo';

const PW = 'ein-langes-passwort';

/** Hash im gespeicherten Format mit beliebigen Parametern (wie ihn eine ältere Version geschrieben hat). */
function alterHash(passwort: string, N: number, r: number, p: number) {
  const salz = randomBytes(16);
  const hash = scryptSync(passwort.normalize('NFKC'), salz, 64, { N, r, p, maxmem: 256 * 2 ** 20 });
  return ['scrypt', N, r, p, salz.toString('base64'), hash.toString('base64')].join('$');
}

describe('Passwort-Hashes (#1358)', () => {
  it('Standard: OWASP-gleichwertig N = 2^14, r = 8, p = 5; Tests mit schnellen Werten', () => {
    assert.deepEqual({ ...SCRYPT }, { N: 16384, r: 8, p: 5 });
    assert.ok(aktuelleParameter().N < SCRYPT.N, 'unter dem Test-Runner schnelle Parameter');
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
    assert.equal(hashVeraltet(alt), true);
    const standard = alterHash(PW, SCRYPT.N, SCRYPT.r, SCRYPT.p);
    assert.equal(await pruefePasswort(PW, standard), true, 'Hash mit den Standardwerten');
  });

  it('unzulässige Parameter im gespeicherten Hash gelten als falsch, ohne Fehler', async () => {
    const gut = alterHash(PW, 1024, 8, 1).split('$');
    const mit = (i: number, w: string) => gut.map((v, j) => (j === i ? w : v)).join('$');
    for (const h of [mit(1, '1000'), mit(1, String(2 ** 22)), mit(2, '0'), mit(3, '999'), mit(5, 'kurz'), `${gut.join('$')}$mehr`, 'md5$x'])
      assert.equal(await pruefePasswort(PW, h), false, h.slice(0, 30));
  });

  it('höchstens GLEICHZEITIG Durchläufe, die übrigen warten – keiner wird abgewiesen, die Ereignisschleife läuft weiter', async () => {
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
    const alt = alterHash(PW, 16384, 8, 1);
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
});
