#!/usr/bin/env node
/**
 * Prüfstand Erkennung (#1679): misst, wie gut Ablago Post einordnet und ausfüllt – gegen einen Prüfsatz mit richtiger
 * Antwort je Dokument (z. B. den privaten Satz „Lebensläufe“). Bedienung und Kennzahlen: README.md daneben.
 *
 *   node pruefstand.mjs lauf --satz <ordner> --url http://localhost:3000 --email … --passwort … --aus lauf.json
 *        [--name messen] [--lernen] [--auffuellen 200 [--auffuell-typ finanzen:kontoauszug]] [--zusatz ki_aehnlich]
 *        [--pakete-dateien <ordner mit .zip>] [--quelle <katalog-url>] [--ohne-texterkennung] [--code …]
 *        [--hoechstens <n>] [--nur id,id] [--text-sekunden 180] [--image <name>]
 *   node pruefstand.mjs bericht --ordner <berichte> lauf1.json [lauf2.json …] [--vorher <bericht.json>]
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { Ablago } from './ablago.mjs';
import { installiere, bestand, Mappenbau } from './aufbau.mjs';
import { dokRegister, fuelleAuf } from './fuellen.mjs';
import { messeDokument, warteAufVektor } from './messen.mjs';
import { liesSatz, entstehung, noetigePakete, typKennung } from './satz.mjs';
import { markdown, vergleiche } from './bericht.mjs';

/** Argumente: --schalter, --name wert, sonst Dateien. */
export function argumente(liste) {
  const o = { dateien: [] };
  for (let i = 0; i < liste.length; i++) {
    const a = liste[i];
    if (!a.startsWith('--')) o.dateien.push(a);
    else if (i + 1 < liste.length && !liste[i + 1].startsWith('--')) o[a.slice(2)] = liste[++i];
    else o[a.slice(2)] = true;
  }
  return o;
}

const log = (s) => process.stderr.write(`[pruefstand] ${s}\n`);

function einrichtungscode(o) {
  if (typeof o.code === 'string') return o.code;
  if (process.env.DMS_EINRICHTUNGSCODE) return process.env.DMS_EINRICHTUNGSCODE;
  const d = o.geheim ?? process.env.DMS_GEHEIM;
  return d && existsSync(join(d, 'EINRICHTUNGSCODE')) ? readFileSync(join(d, 'EINRICHTUNGSCODE'), 'utf8').trim() : undefined;
}

/** Welche Dokumente gemessen werden: alle, `--nur`, `--hoechstens`; beim Ungleichgewicht ohne die häufigen des aufgefüllten Typs. */
export function auswahl(satz, o, fuellTyp) {
  let doks = satz.dokumente;
  if (typeof o.nur === 'string') doks = doks.filter((d) => o.nur.split(',').includes(d.id));
  if (o.hoechstens) doks = doks.slice(0, Number(o.hoechstens));
  const messen = (d) =>
    !fuellTyp || d.seltenheit === 'selten' || typKennung(satz, satz.mappen.get(d.erwartung.mappe)?.typ ?? '') !== fuellTyp;
  return doks.map((d) => ({ d, messen: messen(d) }));
}

export async function lauf(o) {
  for (const p of ['satz', 'url', 'email', 'passwort', 'aus']) if (typeof o[p] !== 'string') throw new Error(`--${p} fehlt`);
  const start = Date.now();
  const satz = liesSatz(o.satz);
  for (const f of satz.fehler) log(`Satz: ${f}`);
  const ungleich = o.auffuellen !== undefined;
  const fuellTyp = ungleich ? String(o['auffuell-typ'] ?? satz.einstellungen.ungleichgewicht?.typ ?? 'finanzen:kontoauszug') : null;
  const liste = auswahl(satz, o, fuellTyp);
  // Vorlagen fürs Auffüllen aus dem ganzen Satz, auch wenn nur ein Teil gemessen wird (--hoechstens, --nur).
  satz.alleDokumente = satz.dokumente;
  satz.dokumente = liste.map((x) => x.d);
  const api = new Ablago(o.url);
  await api.einrichtenOderAnmelden({ email: o.email, passwort: o.passwort, code: einrichtungscode(o) });
  const zusatz = typeof o.zusatz === 'string' ? o.zusatz.split(',').filter(Boolean) : [];
  const ids = [...new Set([...noetigePakete(satz), ...zusatz, ...(o['ohne-texterkennung'] ? [] : ['texterkennung'])])];
  log(`Pakete: ${o['pakete-dateien'] ? `aus ${o['pakete-dateien']}` : ids.join(', ')}`);
  const inst = await installiere(api, { ids, dateien: o['pakete-dateien'], quelle: o.quelle, log });
  const da = new Set(inst.installiert.map((p) => p.id));
  const { grund, mitDokument } = entstehung(satz);
  const bau = new Mappenbau(api, satz, await bestand(api), grund);
  for (const s of grund) await bau.legeAn(s);
  log(`Grundmappen: ${bau.ids.size} von ${grund.length}`);
  if (ungleich && Number(o.auffuellen) > 0) {
    const doks = await fuelleAuf(api, bau, satz, { typ: fuellTyp, anzahl: Number(o.auffuellen), log });
    // Das Paket für Ähnlichkeit rechnet der Reihe nach: Hat das letzte Dokument seinen Vektor, haben ihn alle.
    if (da.has('ki_aehnlich') && doks.length)
      log(`Vektoren der aufgefüllten Dokumente: ${(await warteAufVektor(api, doks.at(-1), 1800)) ? 'fertig' : 'nicht alle'}`);
  }
  const entstehen = new Map();
  for (const [s, id] of mitDokument) entstehen.set(id, [...(entstehen.get(id) ?? []), s]);
  const opt = {
    zustand: { absender: new Set() },
    entstehen,
    lernen: !!o.lernen,
    ocr: da.has('texterkennung'),
    vektoren: da.has('ki_aehnlich'),
    textSekunden: Number(o['text-sekunden'] ?? 180),
    fuellTyp,
    postRegister: dokRegister(bau.b.alleTypen.find((t) => t.system === 'post') ?? {}),
  };
  const ergebnisse = [];
  for (const [i, { d, messen }] of liste.entries()) {
    if (!messen) {
      opt.zustand.absender.add(d.absender);
      for (const s of entstehen.get(d.id) ?? []) await bau.legeAn(s);
      continue;
    }
    try {
      ergebnisse.push(await messeDokument(api, bau, satz, d, opt));
    } catch (e) {
      log(`${d.id}: ${e.message}`);
      ergebnisse.push({
        id: d.id,
        form: d.form,
        seltenheit: d.seltenheit,
        erwartet: { typ: null, typId: null, mappe: d.erwartung.mappe },
        fehler: [e.message],
      });
      for (const s of entstehen.get(d.id) ?? []) await bau.legeAn(s).catch(() => null);
    }
    if ((i + 1) % 10 === 0) log(`${i + 1} von ${liste.length} Dokumenten`);
  }
  const name = typeof o.name === 'string' ? o.name : ungleich ? `ungleichgewicht-${o.auffuellen}` : o.lernen ? 'lernen' : 'messen';
  const ergebnis = {
    art: 'pruefstand-lauf',
    name,
    erstellt: new Date().toISOString(),
    satz: { name: basename(satz.wurzel), commit: satz.commit, dokumente: satz.dokumente.length },
    ablago: { version: inst.dms, image: typeof o.image === 'string' ? o.image : null, pakete: inst.installiert },
    lauf: {
      lernen: !!o.lernen,
      auffuellen: ungleich ? Number(o.auffuellen) : null,
      fuellTyp,
      zusatz,
      dauerS: Math.round((Date.now() - start) / 1000),
      hinweise: [...new Set([...satz.fehler, ...bau.hinweise, ...inst.fehl.map((p) => `Paket ${p.id} nicht installiert`)])],
      ergebnisse,
    },
  };
  writeFileSync(o.aus, `${JSON.stringify(ergebnis, null, 1)}\n`);
  log(`${ergebnisse.length} Dokumente gemessen → ${o.aus}`);
}

/** Läufe zu einem Bericht zusammenführen, mit dem letzten Bericht im Ordner vergleichen, beides ablegen. */
export function bericht(o, jetzt = new Date()) {
  if (typeof o.ordner !== 'string' || !o.dateien.length) throw new Error('--ordner und mindestens eine Lauf-Datei angeben');
  const laeufe = o.dateien.map((f) => JSON.parse(readFileSync(f, 'utf8')));
  const b = {
    art: 'pruefstand-bericht',
    erstellt: jetzt.toISOString(),
    satz: laeufe[0].satz,
    ablago: laeufe[0].ablago,
    laeufe: Object.fromEntries(laeufe.map((l) => [l.name, l.lauf])),
  };
  mkdirSync(o.ordner, { recursive: true });
  const frueher = readdirSync(o.ordner)
    .filter((n) => /^\d{4}-\d{2}-\d{2}.*\.json$/.test(n))
    .sort();
  const vorherDatei = typeof o.vorher === 'string' ? o.vorher : frueher.length ? join(o.ordner, frueher.at(-1)) : null;
  const vorher = vorherDatei ? JSON.parse(readFileSync(vorherDatei, 'utf8')) : null;
  const v = vergleiche(b, vorher);
  b.vergleich = { mit: vorherDatei ? basename(vorherDatei) : null, ...v };
  const stamm = join(o.ordner, jetzt.toISOString().slice(0, 16).replace(':', ''));
  writeFileSync(`${stamm}.json`, `${JSON.stringify(b, null, 1)}\n`);
  writeFileSync(`${stamm}.md`, markdown(b, v));
  return { stamm, hinweise: v.hinweise };
}

async function main() {
  const [befehl, ...rest] = process.argv.slice(2);
  const o = argumente(rest);
  if (befehl === 'lauf') return lauf(o);
  if (befehl === 'bericht') {
    const r = bericht(o);
    log(`Bericht: ${r.stamm}.md`);
    for (const h of r.hinweise) process.stdout.write(`::warning::${h}\n`);
    return;
  }
  process.stderr.write('Aufruf: node pruefstand.mjs lauf … | bericht … (siehe README.md)\n');
  process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href)
  main().catch((e) => {
    log(e.stack ?? String(e));
    process.exitCode = 1;
  });
