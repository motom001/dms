/**
 * Was Ablago darf (#1562): zwei Grenzen für die ganze Installation. Frage 1 setzt der Server durch – Installieren und
 * Aktualisieren über der Grenze werden abgelehnt, mit Grund in Worten (je Antwort × Paketart); eingebaute Helfer laufen
 * auf jeder Antwort. Erhöhen braucht eine frische Anmeldung, steht im Journal und geht per Mail an die Verwaltenden;
 * Senken nennt vorher die Pakete über der neuen Grenze. Bestehende Installationen bekommen beim Update Werte, mit denen
 * nichts angehalten wird.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import {
  erlaubt,
  hoeher,
  liesDarf,
  PAKETE_GRENZEN,
  strenger,
  ueberHoechstwert,
  type PaketeGrenze,
  type PaketStufe,
} from '../../shared/src/darf';
import { eingebauterHelfer, liesKatalog, paketStufe, type Katalog, type PaketCode } from '../../shared/src/pakete';
import { speicherDateien } from '../src/dateien/dateispeicher';
import { Dienst } from '../src/dienst/dienst';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import { Fachfehler } from '../src/grundlagen/fehler';
import { darfStand, setzeDarf, type DarfKontext } from '../src/pakete/index';
import { liesPaket, Paketverwaltung } from '../src/pakete/verwaltung/index';
import { speicherRepo } from '../src/repo/speicher';
import { zipPuffer } from '../src/formate/zip';
import { TEST_PROJEKT, testSigniert } from './katalogschluessel';

const ICH = { id: '00000000-0000-4000-8000-0000000000aa', email: 'admin@example.org' };
const KATALOG = 'https://katalog.test/katalog.json';
const WASM = '\0asm\u0001\0\0\0';

const kopf = (id: string, version: string, rest = '') =>
  `schema: 1\nid: ${id}\nname: ${id[0].toUpperCase()}${id.slice(1)}\nversion: ${version}\nbeschreibung: Test.\nautor: { name: Test, github: test }\nlizenz: MIT\ndms: ">=0.133.0"\n${rest}`;
const code = (netz = '[]', schnittstellen = '') =>
  `inhalt: {}\ncode:\n  sprache: c\n  ereignisse: []\n  rechte: { dokumente: lesen${schnittstellen ? `, schnittstellen: [${schnittstellen}]` : ''} }\n  netz: ${netz}\n`;

/** Je Paketart ein Paket: nur Vorlagen, Code nur hier, Code mit Internet. */
const ARTEN: Record<PaketStufe, Record<string, string>> = {
  vorlagen: {
    'manifest.yaml': kopf('vorlage', '1.0.0', 'inhalt:\n  sichten: inhalt/sichten.yaml\n'),
    'inhalt/sichten.yaml': '- { schluessel: alles, name: Alles aus der Vorlage }\n',
  },
  lokal: { 'manifest.yaml': kopf('helfer', '1.0.0', code()), 'code/modul.wasm': WASM },
  netz: { 'manifest.yaml': kopf('dienst', '1.0.0', code('[https://api.example.org]')), 'code/modul.wasm': WASM },
};
const ID: Record<PaketStufe, string> = { vorlagen: 'vorlage', lokal: 'helfer', netz: 'dienst' };

const archiv = (d: Record<string, string>) =>
  zipPuffer(
    Object.entries(d).map(([name, inhalt]) => ({ name, daten: Buffer.from(inhalt) })),
    new Date('2026-01-01T12:00:00Z'),
  );

function katalog(eintraege: Array<Record<string, string>>, daten: Map<string, Buffer>) {
  const pakete = new Map<string, Katalog['pakete'][number]>();
  for (const d of eintraege) {
    const m = liesPaket(new Map(Object.entries(d).map(([n, x]) => [n, Buffer.from(x)]))).manifest;
    const b = archiv(d);
    daten.set(`https://katalog.test/archive/${m.id}-${m.version}.zip`, b);
    const p = pakete.get(m.id) ?? {
      id: m.id,
      name: m.name,
      beschreibung: m.beschreibung,
      autor: m.autor,
      lizenz: m.lizenz,
      aktuell: m.version,
      versionen: [],
    };
    p.versionen = [
      {
        version: m.version,
        dms: m.dms,
        abhaengigkeiten: m.abhaengigkeiten,
        inhalt: { mappentypen: [], sichten: [], beispiele: 0 },
        code: m.code !== undefined,
        archiv: `archive/${m.id}-${m.version}.zip`,
        sha256: createHash('sha256').update(b).digest('hex'),
        groesse: b.length,
        veroeffentlicht: '2026-11-01T00:00:00Z',
        quelle: '',
        readme: '',
        changelog: '',
      },
      ...p.versionen.filter((v) => v.version !== m.version),
    ];
    p.aktuell = p.versionen
      .map((v) => v.version)
      .sort()
      .at(-1)!;
    pakete.set(m.id, p);
  }
  const k = { format: 1, erstellt: '2026-11-01T00:00:00Z', quelle: '', pakete: [...pakete.values()] };
  liesKatalog(k);
  daten.set(KATALOG, Buffer.from(JSON.stringify(k)));
}

async function aufbau(eintraege: Array<Record<string, string>>, grenze?: PaketeGrenze) {
  const daten = new Map<string, Buffer>();
  katalog(eintraege, daten);
  const einst = speicherEinstellungen();
  if (grenze) await einst.schreibe('darf', { pakete: grenze, selbst: 'vorschlag', hoechstens: {}, herkunft: 'neu' });
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: einst });
  const p = new Paketverwaltung(d, {
    version: () => '0.151.0',
    abruf: testSigniert(KATALOG, async (url) => {
      const b = daten.get(url);
      if (!b) throw new Error(`404 ${url}`);
      return b;
    }),
    katalogUrl: KATALOG,
    projektSchluessel: TEST_PROJEKT,
    benutzer: async () => [],
  });
  return { d, p, einst, daten };
}
const installiere = (p: Paketverwaltung, id: string) => p.installiere({ id, rechteBestaetigt: true }, ICH);
const nichtErlaubt = (re: RegExp) => (e: unknown) =>
  e instanceof Fachfehler && e.status === 409 && re.test(e.message) && /Was Ablago darf/.test(e.message);

const netz = (n: string[] = ['https://api.example.org']): PaketCode =>
  ({ sprache: 'c', ereignisse: [], rechte: { lesen: [], schreiben: [], dokumente: 'lesen' }, netz: n }) as PaketCode;

describe('Was Ablago darf (#1562): Stufen und Regeln', () => {
  it('Stufe aus dem Manifest: ohne Code Vorlagen, mit Netz Internet, sonst nur hier', () => {
    assert.equal(paketStufe(null), 'vorlagen');
    assert.equal(paketStufe(netz([])), 'lokal');
    assert.equal(paketStufe(netz()), 'netz');
    assert.equal(
      paketStufe({ ...netz([]), adressen: [{ schluessel: 'adresse', name: 'Adresse' }] }),
      'netz',
      'Dienst-Adresse zählt als Netz',
    );
    for (const g of PAKETE_GRENZEN) assert.equal(erlaubt(g, 'netz'), g === 'netz');
    assert.equal(erlaubt('keine', 'vorlagen'), false);
    assert.equal(erlaubt('vorlagen', 'vorlagen'), true);
  });

  it('Erhöhen, Senken, Höchstwerte, gespeicherte Werte', () => {
    assert.equal(hoeher({ pakete: 'lokal', selbst: 'vorschlag' }, { pakete: 'netz', selbst: 'vorschlag' }), true);
    assert.equal(hoeher({ pakete: 'lokal', selbst: 'vorschlag' }, { pakete: 'lokal', selbst: 'alles' }), true);
    assert.equal(hoeher({ pakete: 'lokal', selbst: 'vorschlag' }, { pakete: 'keine', selbst: 'nichts' }), false);
    assert.equal(strenger({ pakete: 'lokal', selbst: 'vorschlag' }, { pakete: 'vorlagen', selbst: 'alles' }), true);
    assert.equal(ueberHoechstwert({ pakete: 'lokal' }, { pakete: 'netz' }), true);
    assert.equal(ueberHoechstwert({ pakete: 'lokal' }, { selbst: 'alles' }), false);
    assert.equal(liesDarf({ pakete: 'stufe3', selbst: 'vorschlag' }), null, 'Unbekanntes fällt weg');
    assert.deepEqual(liesDarf({ pakete: 'keine', selbst: 'nichts', hoechstens: { pakete: 'x', selbst: 'nichts' } }), {
      pakete: 'keine',
      selbst: 'nichts',
      hoechstens: { selbst: 'nichts' },
      herkunft: 'neu',
    });
  });

  it('Eingebaute Helfer: offizieller, belegter Herausgeber, ohne Netz, mit eingebauter Aufgabe – oder deren Zusatz', () => {
    const ocr = {
      ...netz([]),
      rechte: { lesen: ['*'], schreiben: [], dokumente: 'schreiben', schnittstellen: ['dms:texterkennung'] },
    } as PaketCode;
    const offiziell = { id: 'texterkennung', herausgeber: 'app.ablago', geprueft: true, code: ocr };
    assert.equal(eingebauterHelfer(offiziell), true);
    assert.equal(eingebauterHelfer({ ...offiziell, herausgeber: 'org.example' }), false, 'ein fremdes Paket ersetzt ihn – folgt Frage 1');
    assert.equal(eingebauterHelfer({ ...offiziell, geprueft: false }), false, 'Herausgeber nicht belegt');
    assert.equal(eingebauterHelfer({ ...offiziell, code: { ...ocr, netz: ['https://ocr.example.org'] } }), false, 'mit Netz');
    assert.equal(eingebauterHelfer({ ...offiziell, code: netz([]) }), false, 'ohne eingebaute Aufgabe');
    const zusatz = { id: 'texterkennung.fra', herausgeber: 'app.ablago', geprueft: true, code: undefined };
    assert.equal(
      eingebauterHelfer(zusatz, (id) => id === 'texterkennung'),
      true,
      'Sprache der Texterkennung',
    );
    assert.equal(
      eingebauterHelfer(zusatz, () => false),
      false,
    );
  });
});

describe('Was Ablago darf (#1562): Installieren und Aktualisieren im Server', () => {
  for (const grenze of PAKETE_GRENZEN)
    for (const art of ['vorlagen', 'lokal', 'netz'] as const)
      it(`Antwort „${grenze}“ × Paket „${art}“: ${erlaubt(grenze, art) ? 'installiert' : 'abgelehnt mit Grund'}`, async () => {
        const { p, d } = await aufbau([ARTEN[art]], grenze);
        if (erlaubt(grenze, art)) {
          await installiere(p, ID[art]);
          assert.ok((await d.kern.repo.listePakete()).some((x) => x.id === ID[art]));
          return;
        }
        const grund = { vorlagen: /keine Pakete nutzt/, lokal: /eigenen Code mit/, netz: /nutzt das Internet/ }[art];
        const v = await p.vorschau({ id: ID[art] });
        assert.ok(v.fehlercodes.includes('darf'), 'die Vorschau sagt es vorher');
        assert.ok(v.probleme.some((x) => grund.test(x)));
        await assert.rejects(installiere(p, ID[art]), nichtErlaubt(grund));
        assert.deepEqual(await d.kern.repo.listePakete(), [], 'nichts angelegt');
      });

  it('Ein Update, das neu das Internet nutzt, wird nicht installiert – die Werkbank sagt, was fehlt', async () => {
    const neu = { 'manifest.yaml': kopf('helfer', '1.1.0', code('[https://api.example.org]')), 'code/modul.wasm': WASM };
    const { p, d, daten } = await aufbau([ARTEN.lokal], 'lokal');
    await installiere(p, 'helfer');
    katalog([ARTEN.lokal, neu], daten);
    await p.katalog();
    await assert.rejects(
      p.aktualisiere('helfer', { version: '1.1.0', rechteBestaetigt: true }, ICH),
      nichtErlaubt(/Das Update für „Helfer“ nutzt neu das Internet – das habt ihr nicht erlaubt/),
    );
    assert.equal((await d.kern.repo.listePakete())[0].version, '1.0.0', 'die alte Fassung bleibt');
  });

  it('Eingebaute Helfer laufen auf jeder Antwort; ein fremder Ersatz folgt Frage 1', async () => {
    const ocr = { 'manifest.yaml': kopf('texterkennung', '1.0.0', code('[]', 'dms:texterkennung')), 'code/modul.wasm': WASM };
    const fremd = {
      'manifest.yaml': kopf('ocrfremd', '1.0.0', `herausgeber: org.example.ocr\n${code('[]', 'dms:texterkennung')}`),
      'code/modul.wasm': WASM,
    };
    const { p, d } = await aufbau([ocr, fremd], 'keine');
    await installiere(p, 'texterkennung');
    assert.ok((await d.kern.repo.listePakete()).some((x) => x.id === 'texterkennung'));
    await assert.rejects(installiere(p, 'ocrfremd'), nichtErlaubt(/eigenen Code mit/));
  });
});

describe('Was Ablago darf (#1562): Stand und Ändern', () => {
  const kontext = (o: Partial<DarfKontext> = {}) => {
    const mails: string[] = [];
    let frisch = 0;
    const k: DarfKontext = {
      pakete: async () => [],
      einrichtungOffen: async () => false,
      frisch: () => {
        frisch++;
      },
      mail: async (alt, neu) => {
        mails.push(`${alt.pakete}→${neu.pakete}`);
      },
      von: ICH.email,
      ...o,
    };
    return { k, mails, frisch: () => frisch };
  };

  it('Bestehende Installation beim Update: nichts wird angehalten, nichts strenger; einmal gespeichert', async () => {
    const einst = speicherEinstellungen();
    const s = await darfStand(einst);
    assert.deepEqual(s, { pakete: 'netz', selbst: 'vorschlag', hoechstens: {}, herkunft: 'update' });
    assert.deepEqual(liesDarf(await einst.lies('darf')), s, 'gespeichert');
    assert.equal((await darfStand(undefined)).herkunft, 'neu', 'ohne Speicher: Vorgabe');
  });

  it('Erhöhen: frische Anmeldung, Mail; Senken ohne; Höchstwerte nur bei der Einrichtung', async () => {
    const einst = speicherEinstellungen();
    await einst.schreibe('darf', { pakete: 'lokal', selbst: 'vorschlag', hoechstens: {}, herkunft: 'neu' });
    const a = kontext();
    await setzeDarf(einst, { pakete: 'netz' }, a.k);
    assert.equal(a.frisch(), 1);
    assert.deepEqual(a.mails, ['lokal→netz']);
    const b = kontext();
    assert.equal((await setzeDarf(einst, { pakete: 'vorlagen', selbst: 'nichts' }, b.k)).pakete, 'vorlagen');
    assert.equal(b.frisch(), 0, 'Senken braucht keine frische Anmeldung');
    assert.deepEqual(b.mails, []);
    await assert.rejects(setzeDarf(einst, { pakete: 'zwei' }, kontext().k), (e: unknown) => e instanceof Fachfehler && e.status === 422);
    await assert.rejects(setzeDarf(einst, { hoechstens: { pakete: 'lokal' } }, kontext().k), /Höchstwerte legt nur der Anbieter/);
    await setzeDarf(einst, { hoechstens: { pakete: 'lokal' } }, kontext({ einrichtungOffen: async () => true }).k);
    await assert.rejects(setzeDarf(einst, { pakete: 'netz' }, kontext().k), /Anbieter nicht freigegeben/);
    await assert.rejects(
      setzeDarf(einst, { hoechstens: { pakete: 'netz' } }, kontext({ einrichtungOffen: async () => true }).k),
      /Höchstwerte legt nur der Anbieter/,
      'nur einmal',
    );
  });

  it('Frische Anmeldung fehlt: nichts gespeichert', async () => {
    const einst = speicherEinstellungen();
    await einst.schreibe('darf', { pakete: 'lokal', selbst: 'vorschlag', hoechstens: {}, herkunft: 'neu' });
    const k = kontext({
      frisch: () => {
        throw new Fachfehler(403, 'frisch');
      },
    }).k;
    await assert.rejects(setzeDarf(einst, { selbst: 'alles' }, k), /frisch/);
    assert.equal(liesDarf(await einst.lies('darf'))!.selbst, 'vorschlag');
  });

  it('Senken nennt vorher die Pakete über der neuen Grenze, mit Grund in Worten', async () => {
    const { p, d, einst } = await aufbau([ARTEN.netz, ARTEN.vorlagen], 'netz');
    await installiere(p, 'dienst');
    await installiere(p, 'vorlage');
    const k = kontext({ pakete: () => d.kern.repo.listePakete() }).k;
    await assert.rejects(setzeDarf(einst, { pakete: 'lokal' }, k), (e: unknown) => {
      const b = (e as Fachfehler).details as { betroffen: Array<{ id: string; grund: string }> };
      return (e as Fachfehler).status === 409 && b.betroffen.length === 1 && /„Dienst“ nutzt das Internet/.test(b.betroffen[0].grund);
    });
    assert.equal(liesDarf(await einst.lies('darf'))!.pakete, 'netz', 'nichts geändert');
  });
});

describe('Was Ablago darf senken hält Pakete an (#1563)', () => {
  it('nach der Liste und der Bestätigung angehalten, mit Grund; Fortsetzen erst, wenn es wieder erlaubt ist', async () => {
    const { p, d, einst } = await aufbau([ARTEN.netz, ARTEN.vorlagen], 'netz');
    await installiere(p, 'dienst');
    await installiere(p, 'vorlage');
    const k: DarfKontext = {
      pakete: () => d.kern.repo.listePakete(),
      einrichtungOffen: async () => false,
      frisch: () => {},
      mail: async () => {},
      von: ICH.email,
      anhalten: async (b) => {
        for (const x of b) await p.halteAn(x.id, ICH, 'darf', x.stufe);
        return b.map((x) => x.id);
      },
    };
    await assert.rejects(setzeDarf(einst, { pakete: 'lokal' }, k), /werden angehalten/);
    assert.ok(!(await d.kern.repo.listePakete()).some((x) => x.angehalten), 'ohne Bestätigung nichts angehalten');
    await setzeDarf(einst, { pakete: 'lokal', bestaetigt: true }, k);
    const jetzt = await d.kern.repo.listePakete();
    assert.deepEqual(jetzt.find((x) => x.id === 'dienst')?.angehalten?.stufe, 'netz');
    assert.equal(jetzt.find((x) => x.id === 'vorlage')?.angehalten, undefined, 'Vorlagen passen weiter');
    await assert.rejects(p.setzeFort('dienst', ICH), /nutzt das Internet – das habt ihr nicht erlaubt/);
    await setzeDarf(einst, { pakete: 'netz' }, k);
    assert.equal(
      (await d.kern.repo.listePakete()).find((x) => x.id === 'dienst')?.angehalten?.grund,
      'darf',
      'Erhöhen setzt nichts von selbst fort',
    );
    await p.setzeFort('dienst', ICH);
    assert.equal((await d.kern.repo.listePakete()).find((x) => x.id === 'dienst')?.angehalten, undefined);
  });
});

/* ---------- Beschädigtes Paket (#1551): erkennen und reparieren, ganz oder gar nicht ---------- */

const MIT_TYP = {
  'manifest.yaml': kopf('kontakte', '1.0.0', 'inhalt:\n  mappentypen: inhalt/mappentypen.yaml\n  sichten: inhalt/sichten.yaml\n'),
  'inhalt/mappentypen.yaml':
    '- schluessel: kontakt\n  name: Kontakt\n  titelVorlage: "{name}"\n  felder:\n    - { key: name, label: Name, typ: text, pflicht: true }\n  register:\n    - { key: daten, name: Daten, art: felder, felder: [name] }\n',
  'inhalt/sichten.yaml': '- { schluessel: kontakte, name: Kontakte, typen: [kontakt] }\n',
};

describe('Beschädigtes Paket (#1551)', () => {
  it('fehlende Ansicht und fehlender Mappentyp werden erkannt; Reparieren legt sie neu an, scheitert es, bleibt alles', async () => {
    const { p, d } = await aufbau([MIT_TYP], 'lokal');
    await installiere(p, 'kontakte');
    const inst = (await d.kern.repo.listePakete())[0];
    // Halb entfernt wie vor #1521: Ansicht und Mappentyp sind weg, der Eintrag steht noch.
    await d.sichtenVerwaltung.loescheSicht(inst.sichten.kontakte);
    await d.mappentypen.loescheTyp(inst.typen.kontakt);
    const fehlt = (await p.installierte()).find((x) => x.id === 'kontakte')?.fehlt;
    assert.deepEqual(fehlt, { typen: ['kontakt'], sichten: ['kontakte'] });
    // Scheitert das Reparieren mittendrin, ist nichts verändert.
    const vorher = d.sichtenVerwaltung.legeSichtAn;
    d.sichtenVerwaltung.legeSichtAn = () => Promise.reject(new Error('Probefehler'));
    await assert.rejects(p.repariere('kontakte', ICH), /Probefehler/);
    d.sichtenVerwaltung.legeSichtAn = vorher;
    assert.deepEqual((await p.installierte()).find((x) => x.id === 'kontakte')?.fehlt, fehlt, 'wie vorher');
    assert.ok(!(await d.mappentypen.listeTypen()).some((t) => t.name === 'Kontakt'));
    const neu = await p.repariere('kontakte', ICH);
    assert.equal(neu.version, '1.0.0');
    assert.equal((await p.installierte()).find((x) => x.id === 'kontakte')?.fehlt, undefined, 'vollständig');
    assert.ok((await d.mappentypen.listeTypen()).some((t) => t.name === 'Kontakt'));
    assert.ok((await d.sichtenVerwaltung.listeSichten()).some((s) => s.name === 'Kontakte'));
  });
});

describe('Was Ablago darf im Einrichtungsassistenten (#1566, #1591)', () => {
  const ocr = { 'manifest.yaml': kopf('texterkennung', '1.0.0', code('[]', 'dms:texterkennung')), 'code/modul.wasm': WASM };

  for (const grenze of PAKETE_GRENZEN)
    it(`Einordnung des Katalogs unter „${grenze}“: nie ein Paket über der Grenze, Gründe in Worten, Ziele im Internet`, async () => {
      // Nichts gespeichert – wie im Assistenten vor „Jetzt einrichten“.
      const { p, einst } = await aufbau([ARTEN.vorlagen, ARTEN.lokal, ARTEN.netz, ocr]);
      const e = await p.katalogStufen(grenze);
      assert.equal(e.signiert, true, 'offizieller, signierter Katalog');
      for (const art of ['vorlagen', 'lokal', 'netz'] as const) {
        const x = e.pakete.find((y) => y.id === ID[art])!;
        assert.equal(x.stufe, art);
        assert.equal(x.erlaubt, erlaubt(grenze, art), `${art} unter ${grenze}`);
        assert.equal(!!x.grund, !x.erlaubt, 'Grund genau bei nicht erlaubten');
      }
      assert.deepEqual(e.pakete.find((y) => y.id === 'dienst')!.netz, ['https://api.example.org']);
      const t = e.pakete.find((y) => y.id === 'texterkennung')!;
      assert.equal(t.stufe, null, 'eingebauter Helfer');
      assert.equal(t.erlaubt, true, 'läuft auf jeder Antwort');
      assert.equal(await einst.lies('darf'), null, 'nichts gespeichert');
    });

  it('Plan mit der Antwort aus dem Assistenten: über der Grenze ein Problem mit Grund – gespeichert wird nichts', async () => {
    const { p, einst } = await aufbau([ARTEN.lokal, ARTEN.netz]);
    const plan = await p.ablaufPlan({ pakete: ['helfer', 'dienst'] }, 'lokal');
    const dienst = plan.pakete.find((x) => x.id === 'dienst')!;
    assert.ok(dienst.vorschau.fehlercodes.includes('darf'));
    assert.ok(dienst.vorschau.probleme.some((x) => /„Dienst“ nutzt das Internet – das habt ihr nicht erlaubt/.test(x)));
    assert.ok(!plan.pakete.find((x) => x.id === 'helfer')!.vorschau.fehlercodes.includes('darf'));
    assert.ok(!(await p.ablaufPlan({ pakete: ['dienst'] }, 'netz')).pakete[0].vorschau.fehlercodes.includes('darf'));
    assert.equal(await einst.lies('darf'), null, 'Planen leitet keine Werte für eine bestehende Installation ab');
  });

  it('Installieren richtet sich weiter nach dem Gespeicherten, nicht nach einer Antwort im Plan', async () => {
    const { p, d } = await aufbau([ARTEN.netz], 'lokal');
    assert.ok((await p.ablaufPlan({ pakete: ['dienst'] }, 'netz')).pakete[0].vorschau.fehlercodes.length === 0);
    await assert.rejects(
      p.ablaufInstallieren({ pakete: ['dienst'], rechteStand: (await p.ablaufPlan({ pakete: ['dienst'] })).rechte.stand }, ICH),
      /nutzt das Internet/,
    );
    assert.deepEqual(await d.kern.repo.listePakete(), []);
  });
});
