/**
 * Charakterisierung von `routenKontext` (#1278, Schritt 6b-1): Vor dem Zerlegen der langen Funktion hält dieser Test
 * fest, was ihre Hilfen liefern – auch die Zweige, die die Routen-Tests nicht erreichen: „nicht eingerichtet“ (404),
 * die Anschlüsse von „Ablago entdecken“, Paketen und Rundgängen, Weitergabe und Abruf, Sprache, Zugang und Notfall.
 *
 * Erwartung: `test/charakter/routen-kontext.json`. Neu schreiben nur, wenn sich das Verhalten bewusst ändert:
 * `CHARAKTER_SCHREIBEN=1 npm run test:datei -w server -- test/routen-kontext-charakter.test.ts` – dann den Unterschied prüfen.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { PassThrough } from 'node:stream';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { Benutzer } from '../../shared/src/model';
import { Dienst } from '../src/dienst/dienst';
import { speicherDateien } from '../src/dateien/dateispeicher';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konten/konto-repo';
import { speicherRepo } from '../src/repo/speicher';
import { routenKontext } from '../src/http/routen-kontext';
import type { RoutenExtras } from '../src/http/routen-extras';
import type { Anfrage } from '../src/http/routen-typen';

const DATEI = fileURLToPath(new URL('./charakter/routen-kontext.json', import.meta.url));

/** Ergebnis oder Fehler (Status und Meldung) einer Hilfe, ohne Zeitpunkte und Ids. */
async function was(f: () => unknown): Promise<unknown> {
  try {
    const r = await f();
    return { ok: JSON.parse(JSON.stringify(r instanceof Set ? [...r] : (r ?? null), (_k, v: unknown) => (v instanceof Set ? [...v] : v))) };
  } catch (e) {
    return { fehler: (e as Error).message, status: (e as { status?: number }).status ?? null };
  }
}
const ohneIds = (v: unknown) =>
  JSON.parse(
    JSON.stringify(v)
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, 'ID')
      .replace(/\d{4}-\d\d-\d\d(T[\d:.]+Z)?/g, 'DATUM'),
  ) as unknown;

async function aufbau(x: RoutenExtras) {
  const dienst = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', dienst.systemtypen.benutzerspiegel());
  dienst.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: anna } = await konten.einrichten({ email: 'anna@example.org', name: 'Anna', passwort: 'ein-langes-passwort' });
  const ben = (await konten.legeBenutzerAn({ email: 'ben@example.org', name: 'Ben' }, anna.id)).benutzer;
  await dienst.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
  const typ = await dienst.mappentypen.legeTypAn({
    name: 'Vertrag',
    schluessel: 'vertrag',
    titelVorlage: '{nr}',
    felder: [{ key: 'nr', label: 'Nr', typ: 'text' }],
    register: [
      { key: 'daten', name: 'Daten', art: 'felder' },
      { key: 'belege', name: 'Belege', art: 'dokumente' },
    ],
  } as never);
  const mappe = await dienst.mappen.legeMappeAn({ typId: typ.id, werte: { nr: 'V-1' } }, anna.id);
  return { dienst, konten, anna, ben, typ, mappe, k: routenKontext(dienst, konten, x) };
}

const anfrage = (o: Partial<Anfrage>): Anfrage => ({ body: undefined, params: {}, query: {}, ip: '127.0.0.1', ...o });

describe('routenKontext: Hilfen (#1278, Schritt 6b-1)', async () => {
  const ist: Record<string, unknown> = {};

  // Ohne Bausteine: jede Hilfe für einen fehlenden Baustein antwortet mit 404.
  {
    const { k, anna } = await aufbau({});
    ist.schluessel = Object.keys(k).sort();
    for (const n of ['designs', 'betrieb', 'region', 'sprachen', 'ocr', 'meldungen', 'tresor', 'schluessel', 'autos', 'sicherung'] as const)
      ist[`fehlt ${n}`] = await was(() => k[n]());
    for (const n of [
      'nf',
      'exportZiel',
      'oidc',
      'zf',
      'pk',
      'postfaecher',
      'pfOAuth',
      'wh',
      'anbindung',
      'speicherplatz',
      'wartung',
    ] as const)
      ist[`fehlt ${n}`] = await was(() => k[n]());
    const a = anfrage({ benutzer: anna });
    ist['einrichtungZugang ohne Assistent'] = await was(() => k.einrichtungZugang(a));
    ist['spracheFuer ohne Sprachen'] = await was(() => k.spracheFuer(anfrage({ kopf: (n) => (n === 'x-sprache' ? 'en' : undefined) })));
    ist['spracheFuer mit Person'] = await was(() => k.spracheFuer(a));
    ist['verwaltungHinweis ohne Verwaltung'] = await was(() => k.verwaltungHinweis(a));
    ist['whStand ohne Wiederherstellung'] = await was(() => k.whStand({ frisch: true }));
    ist['demoPlatz ohne Speicherplatz'] = k.demoPlatz ?? null;
    ist['nurAdminsInWartung ohne Wartung'] = await was(() => k.nurAdminsInWartung({ benutzer: anna, schluessel: 's' }));
    ist['notfallblatt ohne Tresor'] = await was(() => k.notfallblattErzeugen('anna@example.org'));
    ist['adresse ohne Betrieb'] = [k.adresse(), k.pfRueckruf()];
    ist['oauthPostfach ohne Postfächer'] = await was(() => k.oauthPostfach('p1'));
    ist['zusammenfassung ohne Betrieb'] = ohneIds(await was(() => k.zusammenfassung(anna)));
    ist['paketerstellung ohne Automatisierungen'] = 'automatisierungen' in (k.paketerstellung as unknown as { o: object }).o;
  }

  // Hinweis auf technische Aufgaben: Scheitert die Abfrage, gibt es keinen Hinweis.
  {
    const { k, anna } = await aufbau({
      verwaltung: {
        offen: async () => {
          throw new Error('kaputt');
        },
      },
    } as unknown as RoutenExtras);
    ist['verwaltungHinweis scheitert'] = await was(() => k.verwaltungHinweis(anfrage({ benutzer: anna })));
    const r = await k.regionStand({ land: 'DE', bundesland: 'SN', zeitzone: 'Europe/Berlin' } as never);
    ist['regionStand'] = { schluessel: Object.keys(r), region: r.region, feiertage: typeof r.feiertage };
  }

  // Mit Bausteinen (Attrappen).
  {
    const tresor = { alsText: () => null, fingerabdruck: null, nachladen: async () => {} };
    const x = {
      designs: { name: 'designs' },
      betrieb: { adresseFuerLinks: () => 'https://dms.example.org//', mailer: () => null, ansicht: () => ({ adresse: '' }) },
      region: { lies: async () => ({ bundesland: 'SN' }) },
      sprachen: { liesHoechstens: async () => ({ standard: 'de', erlaubt: ['de', 'en', 'fr'] }) },
      texterkennung: { name: 'ocr' },
      fehlermeldungen: { name: 'meldungen' },
      tresor,
      apiSchluessel: { name: 'schluessel' },
      automatisierungen: { uebersicht: async () => ({ automatisierungen: [{ id: 'a1' }] }) },
      sicherung: { plan: async () => ({ mindestFreiGB: 2 }), einstellungen: { lies: async () => ({ ok: true, von: 'anna@example.org' }) } },
      notfallcode: { name: 'nf' },
      exporte: { pfad: '/exporte' },
      oidc: { name: 'oidc' },
      postfaecher: {
        hole: async (id: string) =>
          id === 'o' ? { id, anmeldung: 'oauth', anbieter: 'google', benutzer: 'post@example.org' } : { id, anmeldung: 'passwort' },
      },
      postfachOAuth: { name: 'oauth' },
      wiederherstellung: {
        laufStand: async () => ({ art: 'wiederherstellung', von: 'anna@example.org', schritt: 1 }),
        aktuellerLauf: () => ({ art: 'probe', von: 'anna@example.org' }),
      },
      anbindung: { name: 'anbindung' },
      speicherplatz: { messe: async () => ({ ordner: [{ art: 'dateien', frei: 5000, grenzBytes: 7 }] }) },
      wartung: { sperrtAnmeldung: () => false },
      verwaltung: { offen: async () => true },
      webdav: { einstellung: async () => ({ aktiv: true }) },
      einrichtung: { pruefeZugang: async (_c: unknown, ok: boolean) => ({ ok }) },
      mandantName: async () => 'Haushalt Beispiel',
    } as unknown as RoutenExtras;
    const { k, dienst, anna, ben, typ, mappe } = await aufbau(x);
    for (const n of ['designs', 'betrieb', 'region', 'sprachen', 'ocr', 'meldungen', 'tresor', 'schluessel', 'autos', 'sicherung'] as const)
      ist[`da ${n}`] =
        k[n]() ===
        (x as Record<string, unknown>)[
          { ocr: 'texterkennung', meldungen: 'fehlermeldungen', autos: 'automatisierungen', schluessel: 'apiSchluessel' }[n as string] ?? n
        ];
    for (const n of ['nf', 'oidc', 'postfaecher', 'pfOAuth', 'wh', 'anbindung', 'speicherplatz', 'wartung'] as const)
      ist[`da ${n}`] =
        k[n]() ===
        (x as Record<string, unknown>)[{ nf: 'notfallcode', pfOAuth: 'postfachOAuth', wh: 'wiederherstellung' }[n as string] ?? n];
    ist['exportZiel'] = k.exportZiel();
    ist['auskunftZiel mit Export-Ordner'] = k.auskunftZiel();
    ist['adresse und Rückruf'] = [k.adresse(), k.pfRueckruf()];
    ist['oauthPostfach'] = await was(() => k.oauthPostfach('o'));
    ist['oauthPostfach ohne OAuth'] = await was(() => k.oauthPostfach('p'));
    ist['notfallblatt ohne Schlüssel'] = await was(() => k.notfallblattErzeugen('anna@example.org'));
    ist['demoPlatz'] = [await k.demoPlatz!.frei(), await k.demoPlatz!.mindest()];
    ist['whStand frisch'] = await was(() => k.whStand({ frisch: true }));
    ist['whStand Spiegel'] = await was(() => k.whStand());
    ist['spracheFuer mit Kopf'] = await was(() => k.spracheFuer(anfrage({ kopf: (n) => (n === 'x-sprache' ? 'fr' : undefined) })));
    ist['spracheFuer mit Person'] = await was(() => k.spracheFuer(anfrage({ benutzer: { ...anna, sprache: 'en' } })));
    ist['zusammenfassung'] = ohneIds(await was(() => k.zusammenfassung(anna)));
    ist['loeschkonzeptQuelle'] = ohneIds(await was(async () => Object.keys(await k.loeschkonzeptQuelle()).sort()));
    ist['eigenerExport'] = await was(() => k.eigenerExport(anna.id));
    ist['einrichtungZugang'] = [
      await was(() => k.einrichtungZugang(anfrage({ benutzer: anna }))),
      await was(() => k.einrichtungZugang(anfrage({}))),
    ];
    const admin = { ...anna, rolle: 'admin' as const };
    ist['verwaltungHinweis'] = [
      await was(() => k.verwaltungHinweis(anfrage({ benutzer: anna }))),
      await was(() => k.verwaltungHinweis(anfrage({ benutzer: admin }))),
      await was(() => k.verwaltungHinweis(anfrage({ benutzer: ben }))),
      await was(() => k.verwaltungHinweis(anfrage({}))),
    ];
    ist['darfWiederherstellen'] = [
      k.darfWiederherstellen(anfrage({ benutzer: admin })),
      k.darfWiederherstellen(anfrage({ benutzer: anna })),
    ];
    ist['nurAdminsInWartung'] = await was(() => k.nurAdminsInWartung({ benutzer: anna, schluessel: 's' }));
    ist['sicherungsPaket für Menschen'] = await was(() => k.sicherungsPaket(anfrage({ benutzer: anna })));
    ist['modusSpur ohne Modus'] = await was(() => k.modusSpur(anfrage({ benutzer: anna }), [mappe.id], 'angesehen'));
    ist['modusSpur Konsole'] = await was(() => k.modusSpur(anfrage({ benutzer: admin, konsole: true }), [mappe.id], 'angesehen'));
    ist['modusSpur ohne Mappen'] = await was(() => k.modusSpur(anfrage({ benutzer: admin }), [], 'angesehen'));
    ist['wer'] = [k.wer(anfrage({ benutzer: anna })).email, k.wer(anfrage({}))];
    ist['typName'] = [await k.typName(typ.id), await k.typName('gibt-es-nicht')];
    ist['mitRollen'] = ohneIds(await k.mitRollen(ben));
    ist['zuletztGeoeffnet'] = await was(() => k.zuletztGeoeffnet(anfrage({ benutzer: anna }), 5));
    ist['empfaengerSichtbar'] = [
      await was(() => k.empfaengerSichtbar(anfrage({ benutzer: anna }), 7)),
      await was(() => k.empfaengerSichtbar(anfrage({ benutzer: anna }), '')),
      await was(() => k.empfaengerSichtbar(anfrage({ benutzer: anna }), ben.id)),
      await was(() => k.empfaengerSichtbar(anfrage({ benutzer: anna }), 'gibt-es-nicht')),
    ];
    ist['leseHinweis'] = [
      await k.leseHinweis(null, mappe.id),
      await k.leseHinweis(ben.id, mappe.id),
      await k.leseHinweis(anna.id, mappe.id),
    ];
    ist['darf'] = ohneIds(await was(() => k.darf(anfrage({ benutzer: ben }), mappe.id, 'R')));

    // Weitergabe und Abruf
    const schl = { name: 'Skript', passwoerter: false } as never;
    const dienstkonto = { ...ben, art: 'dienst' as const } as Benutzer;
    const varianten: Record<string, Anfrage> = {
      anzeigen: anfrage({ benutzer: anna }),
      herunterladen: anfrage({ benutzer: anna, query: { herunterladen: '' } }),
      verkleinern: anna && anfrage({ benutzer: anna, query: { verkleinern: '1' } }),
      stempel: anfrage({ benutzer: anna, query: { stempel: 'kopie' } }),
      schluessel: anfrage({ benutzer: anna, apiSchluessel: schl }),
      paket: anfrage({ benutzer: dienstkonto, apiSchluessel: schl }),
    };
    ist['weitergabe'] = Object.fromEntries(
      Object.entries(varianten).map(([n, a]) => [n, [k.weitergabe(a), k.herausgeben(a), k.zumAbspeichern(a)]]),
    );
    ist['seitenquelle Oberfläche'] = await was(() => k.seitenquelle(varianten.anzeigen, mappe.id));
    ist['mitnehmen Paket'] = await was(() => k.mitnehmen(varianten.paket, mappe.id));
    const antwort = { body: 1 };
    ist['abgerufen Paket'] = (await k.abgerufen(varianten.paket, 'd1', {}, antwort)) === antwort;
    const strom = new PassThrough();
    ist['abgerufen mit Anlagen'] = await was(async () =>
      Object.keys(
        await k.abgerufen(
          varianten.schluessel,
          'gibt-es-nicht',
          { gestempelt: true },
          { datei: { inhalt: strom, name: 'a', mime: 'x', anzeigen: false, groesse: 1 } },
          [{ dokumentId: 'auch-nicht' }],
        ),
      ),
    );
    ist['abgerufen mit Anlagen: Strom offen'] = strom.destroyed;
    // Scheitert der Eintrag in die Historie, geht die Datei nicht hinaus: Strom zu, Fehler weiter.
    const notiere = dienst.mappenHistorie.notiereAbruf.bind(dienst.mappenHistorie);
    dienst.mappenHistorie.notiereAbruf = async () => {
      throw new Error('Historie voll');
    };
    const strom2 = new PassThrough();
    ist['abgerufen Fehler'] = await was(() =>
      k.abgerufen(varianten.schluessel, 'd1', {}, { datei: { inhalt: strom2, name: 'a', mime: 'x', anzeigen: false, groesse: 1 } }),
    );
    ist['abgerufen Fehler: Strom zu'] = strom2.destroyed;
    ist['abgerufen Fehler mit Puffer'] = await was(() =>
      k.abgerufen(
        varianten.schluessel,
        'd1',
        {},
        { datei: { inhalt: Buffer.from('x'), name: 'a', mime: 'x', anzeigen: false, groesse: 1 } },
      ),
    );
    dienst.mappenHistorie.notiereAbruf = notiere;
    ist['nurSelbst'] = [
      await was(() => k.nurSelbst(varianten.schluessel)),
      await was(() => k.nurSelbst(anfrage({ benutzer: anna }))),
      await was(() => k.nurSelbst(anfrage({ benutzer: anna, sitzungsDaten: { id: 's', vertretungId: 'v' } as never }))),
      await was(() => typeof k.nurSelbst(anfrage({ benutzer: anna, sitzungsDaten: { id: 's', vertretungId: null } as never }))),
    ];
    ist['passwoerterAnzeigen'] = [
      await was(() => k.passwoerterAnzeigen(anfrage({}))),
      await was(() => k.passwoerterAnzeigen(anfrage({ query: { passwoerter: 'ja' } }))),
      await was(() => k.passwoerterAnzeigen(anfrage({ query: { passwoerter: 'anzeigen' } }))),
      await was(() =>
        k.passwoerterAnzeigen(anfrage({ query: { passwoerter: 'anzeigen' }, apiSchluessel: { name: 'P', passwoerter: true } as never })),
      ),
    ];
    ist['fuerAnzeige ohne PDF'] = await was(
      async () =>
        (await k.fuerAnzeige(anfrage({}), { inhalt: Buffer.from('x'), name: 'a.txt', mime: 'text/plain', anzeigen: true, groesse: 1 }))
          .datei?.name,
    );
    ist['fuerAnzeige kaputtes PDF'] = await was(async () => {
      const r = await k.fuerAnzeige(anfrage({}), {
        inhalt: Buffer.from('%PDF-kaputt'),
        name: 'a.pdf',
        mime: 'application/pdf',
        anzeigen: true,
        groesse: 11,
      });
      return { ...r.datei, inhalt: String(r.datei?.inhalt).slice(0, 30) };
    });
    ist['ausgabeDatei'] = [
      k.ausgabeDatei({
        name: 'a.pdf',
        mime: 'application/pdf',
        anzeigbar: true,
        groesse: 3,
        inhalt: Buffer.from('abc'),
        gestempelt: true,
        verkleinert: { vorher: 9, nachher: 3 },
      }).datei?.koepfe,
      k.ausgabeDatei({ name: 'a.bin', mime: 'x/y', anzeigbar: false, groesse: 3, inhalt: Buffer.from('abc'), gestempelt: false }).datei,
    ].map((d) => JSON.parse(JSON.stringify(d ?? null)) as unknown);
    ist['entschluessele ohne Passwörter'] = await was(
      async () => (await k.entschluessele(anfrage({ benutzer: anna }), [mappe], 'x')).length,
    );
    const leer = new PassThrough();
    let gemeldet = false;
    k.danachLoeschen(leer, '/gibt/es/nicht/export', () => (gemeldet = true));
    leer.resume();
    leer.end();
    await new Promise((r) => setTimeout(r, 50));
    ist['danachLoeschen'] = gemeldet;

    // Anschlüsse von Entdecken, Paketen und Rundgängen
    const e = (k.entdecken as unknown as { o: Record<string, (...a: unknown[]) => Promise<unknown>> }).o;
    ist['entdecken funktionen'] = await was(() => e.funktionen(anna));
    ist['entdecken typen'] = ohneIds(await was(() => e.typen()));
    ist['entdecken lesbareTypen'] = [await was(() => e.lesbareTypen(anna)), await was(() => e.lesbareTypen(ben))];
    ist['entdecken oeffnen'] = ohneIds([
      await was(() => e.oeffnen(anna, 'vertrag', 'neu')),
      await was(() => e.oeffnen(anna, 'vertrag', 'mappe')),
      await was(() => e.oeffnen(ben, 'vertrag', 'mappe')),
      await was(() => e.oeffnen(anna, 'gibt-es-nicht', 'mappe')),
    ]);
    ist['entdecken pakete und werkbank'] = [await was(() => e.pakete()), await was(() => e.werkbank())];
    await e.setzeEinstellung(anna, 'probe', 1);
    ist['entdecken einstellungen'] = ((await e.einstellungen(anna)) as Record<string, unknown>).probe;
    ist['entdecken version und heute'] = [typeof e.version(), /^\d{4}-\d\d-\d\d$/.test(String(e.heute()))];
    const p = (k.pakete as unknown as { o: { benutzer: () => Promise<unknown> } }).o;
    ist['pakete benutzer'] = ohneIds(await p.benutzer());
    const pe = (k.paketerstellung as unknown as { o: { automatisierungen?: () => Promise<unknown>; version: () => string } }).o;
    ist['paketerstellung automatisierungen'] = await pe.automatisierungen?.();
    const w = (
      k.rundgaengeWerkbank as unknown as {
        o: {
          speicher: Record<string, (...a: unknown[]) => Promise<unknown>>;
          pruefung: () => Promise<{ anker: unknown[]; typ: (k: string) => unknown }>;
        };
      }
    ).o;
    await w.speicher.schreibe({ eigene: [] });
    ist['rundgänge speicher'] = [
      await w.speicher.lies(),
      'tausche' in w.speicher,
      await w.speicher.tausche?.({ eigene: [] }, { eigene: [1] }),
      await w.speicher.lies(),
    ];
    const pr = await w.pruefung();
    ist['rundgänge prüfung'] = ohneIds([pr.anker.length > 0, pr.typ('vertrag'), pr.typ('gibt-es-nicht')]);
    ist['ki-sperre'] = typeof dienst.ki;
  }

  if (process.env.CHARAKTER_SCHREIBEN) {
    mkdirSync(dirname(DATEI), { recursive: true });
    writeFileSync(DATEI, `${JSON.stringify(ist, null, 2)}\n`);
  }
  const soll = existsSync(DATEI) ? (JSON.parse(readFileSync(DATEI, 'utf8')) as Record<string, unknown>) : {};
  it('alle Fälle sind festgehalten', () => assert.deepEqual(Object.keys(ist).sort(), Object.keys(soll).sort()));
  for (const name of Object.keys(ist)) it(name, () => assert.deepEqual(ist[name], soll[name]));
});
