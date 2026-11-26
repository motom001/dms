/**
 * Prüfstand (#1679): ein Dokument als Neue Post eingeben und messen – „Wohin gehört das?“ (/api/klassifizieren),
 * Erkennung beim Zuordnen (Absender, Zielmappen) und „Aus Dokument ausfüllen“ (/api/typen/:id/vorschlaege). Im
 * Lernlauf danach die richtige Antwort übernehmen, wie es ein Mensch täte: die Post der richtigen Mappe zuordnen.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { warte } from './ablago.mjs';
import { absenderMappe, typKennung } from './satz.mjs';
import { feldart, gleich } from './wertung.mjs';

const MIME = { pdf: 'application/pdf', xml: 'application/xml', eml: 'message/rfc822', png: 'image/png', jpg: 'image/jpeg' };
const FERTIG = new Set(['fertig', 'fehler', 'ausgelassen', 'keiner']);

/** Bis alle Dokumente der Post Text haben (oder keiner mehr kommt); liefert die Dokumente. */
async function warteAufText(api, postId, { ocr, sekunden }) {
  let doks = [];
  for (let t = 0; t <= sekunden * 2; t++) {
    doks = (await api.json('GET', `/api/mappen/${postId}`)).dokumente ?? [];
    const offen = doks.filter((d) => {
      const s = d.ocr?.stand ?? 'keiner';
      return !FERTIG.has(s) && !(s === 'paket' && !ocr);
    });
    if (doks.length && !offen.length) return doks;
    await warte(500);
  }
  return doks;
}

/**
 * Vektor eines Dokuments (Paket für Ähnlichkeit) – damit das nächste Dokument es schon findet. Ob es ihn gibt, zeigt
 * „Ähnliche Dokumente“: ohne Vektor 404.
 */
export async function warteAufVektor(api, dokId, sekunden = 30) {
  for (let t = 0; t < sekunden * 2; t++) {
    const r = await api.roh('GET', `/api/dokumente/${dokId}/aehnliche?anzahl=1`);
    await r.arrayBuffer();
    if (r.ok) return true;
    await warte(500);
  }
  return false;
}

/**
 * Vorschläge je erwartetem Feld vergleichen: richtig, falsch oder fehlt. In `info` je Feld die Feldart und die
 * Sicherheit des Vorschlags (#1693: Felder je Feldart, „sicher“, aber falsch).
 */
async function felderMessen(api, bau, d, dokId, mitText, info = {}) {
  const erg = {};
  for (const [schluessel, felder] of Object.entries(d.erwartung.felder ?? {})) {
    const typ = bau.typVon(schluessel);
    if (!typ) continue;
    if (!mitText) {
      for (const feld of Object.keys(felder ?? {})) {
        erg[`${schluessel}.${feld}`] = 'fehlt';
        info[`${schluessel}.${feld}`] = { art: feldart(typ.felder?.find((f) => f.key === feld)), sicherheit: null };
      }
      continue;
    }
    const mappe = bau.ids.get(schluessel);
    const r = await api.json('POST', `/api/typen/${typ.id}/vorschlaege`, { body: { dokumente: [dokId], ...(mappe ? { mappe } : {}) } });
    for (const [feld, wert] of Object.entries(felder ?? {})) {
      const v = r?.vorschlaege?.[feld];
      info[`${schluessel}.${feld}`] = { art: feldart(typ.felder?.find((f) => f.key === feld)), sicherheit: v?.sicherheit ?? null };
      const ueber = (w) => (typeof w === 'string' ? (bau.namen.get(w) ?? w) : Array.isArray(w) ? w.map(ueber) : w);
      erg[`${schluessel}.${feld}`] = !v ? 'fehlt' : gleich(wert, ueber(v.wert)) ? 'richtig' : 'falsch';
    }
  }
  return erg;
}

/**
 * Ein Dokument messen. `zustand` merkt sich, welche Absender schon vorkamen. Liefert das Ergebnis je Dokument (siehe
 * wertung.mjs); Fehler einer Abfrage stehen in `fehler`, die übrigen Messungen laufen weiter.
 */
export async function messeDokument(api, bau, satz, d, o) {
  const start = Date.now();
  const fehler = [];
  const typ = typKennung(satz, satz.mappen.get(d.erwartung.mappe)?.typ ?? '');
  const absMappe = absenderMappe(satz, d.absender);
  const e = {
    id: d.id,
    datum: d.datum,
    form: d.form,
    seltenheit: d.seltenheit,
    lebenslauf: d.lebenslauf,
    absenderErstes: !o.zustand.absender.has(d.absender),
    ...(o.fuellTyp ? { fuellTyp: o.fuellTyp } : {}),
    erwartet: {
      typ,
      typId: bau.b.typen.get(typ)?.id ?? null,
      mappe: d.erwartung.mappe,
      mappeDa: bau.ids.has(d.erwartung.mappe),
      absenderMappe: absMappe && bau.ids.has(absMappe) ? absMappe : null,
    },
    fehler,
  };
  o.zustand.absender.add(d.absender);
  const post = await api.json('POST', '/api/post', { body: {} });
  const endung = d.datei.split('.').pop().toLowerCase();
  const q = new URLSearchParams({ name: basename(d.datei), typ: MIME[endung] ?? 'application/octet-stream', register: o.postRegister });
  await api.json('POST', `/api/mappen/${post.id}/dokumente?${q}`, { body: readFileSync(d.datei), zeit: 300_000 });
  const doks = await warteAufText(api, post.id, { ocr: o.ocr, sekunden: o.textSekunden });
  const dokId = doks[0]?.id;
  e.text = { stand: doks[0]?.ocr?.stand ?? null, zeichen: 0 };
  await api
    .json('GET', `/api/dokumente/${dokId}/volltext`)
    .then((v) => (e.text.zeichen = (v?.text ?? '').length))
    .catch((x) => fehler.push(`volltext: ${x.message}`));
  await api
    .json('POST', `/api/mappen/${post.id}/erkennung`)
    .then((r) => {
      const n = (id) => bau.namen.get(id) ?? `?${id.slice(0, 8)}`;
      e.absender = (r.absender ?? []).map((x) => n(x.mappeId));
      e.neuerAbsender = !!r.neuerAbsender;
      e.ziele = (r.ziele ?? []).map((x) => n(x.mappeId));
      e.auto = r.auto ? n(r.auto.ziel) : null;
      e.ausgehend = !!r.ausgehend;
    })
    .catch((x) => fehler.push(`erkennung: ${x.message}`));
  await api
    .json('POST', '/api/klassifizieren', { body: { dokumente: [dokId] } })
    .then((r) => {
      const k = (id) => bau.b.alleTypen.find((t) => t.id === id)?.schluessel ?? id;
      e.typen = (r.typen ?? []).map((t) => ({
        typ: k(t.typId),
        sicherheit: t.sicherheit,
        belege: (t.belege ?? []).map((b) => ({ weg: b.weg, sicherheit: b.sicherheit })),
      }));
      e.vorschlag = r.vorschlag ? k(r.vorschlag.typId) : null;
      e.schwelle = r.schwelle ?? null;
      e.wegeStand = (r.wege ?? []).map((w) => ({ weg: w.weg, stand: w.stand, paket: w.paket?.id }));
    })
    .catch((x) => fehler.push(`klassifizieren: ${x.message}`));
  e.feldInfo = {};
  e.felder = await felderMessen(api, bau, d, dokId, e.text.zeichen > 0, e.feldInfo).catch((x) => (fehler.push(`felder: ${x.message}`), {}));
  e.ms = Date.now() - start;
  await nachDemMessen(api, bau, d, { post: post.id, dokId, e, o });
  return e;
}

/** Mappen, die mit diesem Dokument entstehen, anlegen; im Lernlauf die Post der richtigen Mappe zuordnen. */
async function nachDemMessen(api, bau, d, { post, dokId, e, o }) {
  for (const s of o.entstehen.get(d.id) ?? []) await bau.legeAn(s);
  if (!o.lernen || e.auto) return;
  const ziel = bau.ids.get(d.erwartung.mappe);
  if (!ziel) return;
  await api.json('POST', `/api/mappen/${post}/zuordnen`, { body: { ziel } }).catch((x) => e.fehler.push(`zuordnen: ${x.message}`));
  if (o.vektoren && dokId) await warteAufVektor(api, dokId);
}
