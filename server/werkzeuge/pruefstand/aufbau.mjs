/**
 * Prüfstand (#1679): eine frische Ablago vorbereiten – Pakete installieren (aus dem Katalog oder als Dateien) und die
 * Mappen des Satzes anlegen, mit Verweisen und Vorgaben wie die Beispiel-Mappen der Pakete (`{ beispiel }`,
 * `{ vorgabe }`). Verweise auf Mappen, die erst später entstehen, trägt `legeAn` nach, sobald es sie gibt.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { typKennung } from './satz.mjs';

const istObjekt = (w) => !!w && typeof w === 'object' && !Array.isArray(w);

/**
 * Pakete installieren: `dateien` (Ordner mit .zip) hochladen oder `ids` aus dem Katalog (`quelle`, ohne: der
 * offizielle). Abhängigkeiten aus dem Katalog bringt der Ablauf selbst mit. Liefert die installierten Pakete.
 */
export async function installiere(api, { ids, dateien, quelle, log = () => {} }) {
  const eingabe = {};
  if (dateien) {
    const uploads = [];
    for (const n of readdirSync(dateien)
      .filter((x) => x.endsWith('.zip'))
      .sort()) {
      const r = await api.json('POST', '/api/werkbank/pakete/hochladen', { body: readFileSync(join(dateien, n)), zeit: 300_000 });
      if (!r?.upload) throw new Error(`${n}: kein einzelnes Paket`);
      uploads.push(r.upload);
      log(`hochgeladen: ${n}`);
    }
    eingabe.uploads = uploads;
  } else {
    await api.json('POST', '/api/werkbank/pakete/katalog', { body: {}, zeit: 300_000 });
    eingabe.pakete = ids;
    if (quelle) eingabe.quelle = quelle;
  }
  const plan = await api.json('POST', '/api/werkbank/pakete/ablauf/plan', { body: eingabe, zeit: 300_000 });
  const erg = await api.json('POST', '/api/werkbank/pakete/ablauf/installieren', {
    body: {
      ...eingabe,
      bestaetigt: true,
      herausgeberBestaetigt: true,
      adresseBestaetigt: true,
      ...(plan?.rechte?.stand ? { rechteStand: plan.rechte.stand } : {}),
      spaeter: (plan?.pakete ?? []).map((p) => p.id ?? p.paket?.id).filter(Boolean),
    },
    zeit: 900_000,
  });
  const fehl = [...(erg?.fehlgeschlagen ?? []), ...(erg?.nichtInstalliert ?? [])];
  if (fehl.length) log(`nicht installiert: ${fehl.map((p) => `${p.id}${p.grund ? ` (${p.grund})` : ''}`).join(', ')}`);
  const stand = await api.json('GET', '/api/werkbank/pakete');
  return { installiert: (stand?.installiert ?? []).map((p) => ({ id: p.id, version: p.version })), dms: stand?.dms ?? null, fehl };
}

/** Typen nach Kennung (`basis:organisation`) und die Vorgabe-Mappen (`paket:<id>:<schluessel>` → Mappen-Id). */
export async function bestand(api) {
  const typen = await api.json('GET', '/api/typen');
  const nachKennung = new Map(typen.filter((t) => t.schluessel).map((t) => [t.schluessel, t]));
  const mappen = await api.json('GET', '/api/mappen');
  const vorgaben = new Map(mappen.filter((m) => m.vorgabe).map((m) => [m.vorgabe, m.id]));
  return { typen: nachKennung, alleTypen: typen, vorgaben };
}

/**
 * Mappen des Satzes anlegen und nachtragen. `ids` (Schlüssel → Id) und `namen` (Id → Schlüssel bzw.
 * `vorgabe:<schluessel>`) brauchen Messen und Wertung, um Vorschläge mit der richtigen Antwort zu vergleichen.
 */
export class Mappenbau {
  constructor(api, satz, b, vorab = []) {
    this.api = api;
    /** Mappen, die vor dem ersten Dokument entstehen dürfen (Grundmappen), und die gerade entstehenden. */
    this.vorab = new Set(vorab);
    this.inArbeit = new Set();
    /** Mappen, die auf eine noch fehlende Mappe warten (Pflicht-Verweis): Ziel → Schlüssel. */
    this.wartend = new Map();
    this.satz = satz;
    this.b = b;
    this.ids = new Map();
    this.namen = new Map();
    for (const [k, id] of b.vorgaben) this.namen.set(id, `vorgabe:${k.split(':').pop()}`);
    /** Verweise auf Mappen, die es noch nicht gibt: Ziel-Schlüssel → [{ mappe, feld, mehrfach }]. */
    this.offen = new Map();
    this.hinweise = [];
  }

  typVon(schluessel) {
    const m = this.satz.mappen.get(schluessel);
    return m ? (this.b.typen.get(typKennung(this.satz, m.typ)) ?? null) : null;
  }

  vorgabeId(v, paket) {
    const [p, s] = v.includes(':') ? v.split(':') : [paket, v];
    const alias = this.satz.einstellungen?.paketAlias?.[p] ?? p;
    return this.b.vorgaben.get(`paket:${alias}:${s}`) ?? null;
  }

  /** Werte aus lebenslauf.yaml in Werte für Ablago; Verweise auf noch fehlende Mappen kommen in `offen`. */
  werte(schluessel, typ) {
    const roh = this.satz.mappen.get(schluessel).werte ?? {};
    const werte = {};
    const offen = [];
    for (const [k, w] of Object.entries(roh)) {
      const f = typ.felder.find((x) => x.key === k);
      if (!f) {
        this.hinweise.push(`${schluessel}: Feld ${k} gibt es in ${typ.schluessel} nicht`);
        continue;
      }
      const zuId = (x) => {
        if (istObjekt(x) && 'beispiel' in x) return this.ids.get(x.beispiel) ?? (offen.push({ ziel: x.beispiel, feld: k }), null);
        if (istObjekt(x) && 'vorgabe' in x) return this.vorgabeId(x.vorgabe, typ.paket ?? typ.schluessel.split(':')[0]);
        return undefined;
      };
      const liste = Array.isArray(w) ? w : [w];
      const verweise = liste.map(zuId);
      if (verweise.some((x) => x !== undefined)) {
        const da = verweise.filter(Boolean);
        if (da.length) werte[k] = f.mehrfach ? da : da[0];
      } else if (f.typ === 'betrag' && typeof w === 'number') werte[k] = { betrag: w, waehrung: f.waehrung || 'EUR' };
      else werte[k] = w;
    }
    return { werte, offen };
  }

  /**
   * Eine Mappe anlegen. Lehnt Ablago Werte ab (ungültige IBAN, Wert nicht in der Auswahl, berechnetes Feld), fallen
   * genau diese Felder weg und es geht noch einmal; ist der Name schon vergeben, gilt die vorhandene Mappe.
   */
  async legeAn(schluessel) {
    if (this.ids.has(schluessel)) return this.ids.get(schluessel);
    const typ = this.typVon(schluessel);
    if (!typ) {
      this.hinweise.push(`${schluessel}: Typ ${this.satz.mappen.get(schluessel)?.typ} ist nicht installiert`);
      return null;
    }
    // Verweisziele, die schon jetzt entstehen dürfen (Grundmappen), zuerst – Pflicht-Verweise brauchen sie.
    this.inArbeit.add(schluessel);
    for (const w of Object.values(this.satz.mappen.get(schluessel).werte ?? {}).flat())
      if (istObjekt(w) && this.vorab.has(w.beispiel) && !this.inArbeit.has(w.beispiel)) await this.legeAn(w.beispiel);
    const { werte, offen } = this.werte(schluessel, typ);
    // Ein Pflicht-Verweis auf eine Mappe, die erst mit einem Dokument entsteht: dann entsteht diese Mappe mit ihr.
    const pflicht = offen.find((o) => typ.felder.find((f) => f.key === o.feld)?.pflicht);
    if (pflicht) {
      this.inArbeit.delete(schluessel);
      this.wartend.set(pflicht.ziel, [...(this.wartend.get(pflicht.ziel) ?? []), schluessel]);
      return null;
    }
    const m = await this.versuche(schluessel, typ, werte);
    if (!m) return null;
    this.ids.set(schluessel, m.id);
    this.namen.set(m.id, schluessel);
    for (const o of offen) this.offen.set(o.ziel, [...(this.offen.get(o.ziel) ?? []), { mappe: m.id, feld: o.feld, typ }]);
    await this.trageNach(schluessel, m.id);
    const warten = this.wartend.get(schluessel) ?? [];
    this.wartend.delete(schluessel);
    for (const w of warten) await this.legeAn(w);
    return m.id;
  }

  async versuche(schluessel, typ, werte) {
    for (let versuch = 0; versuch < 5; versuch++) {
      try {
        return await this.api.json('POST', '/api/mappen', { body: { typId: typ.id, werte } });
      } catch (e) {
        const felder = e.details?.felder ?? {};
        const vergeben = Object.entries(felder).find(([, f]) => f.some((x) => /vergeben/i.test(x)));
        if (vergeben) {
          const da = (await this.api.json('GET', `/api/mappen?typ=${typ.id}`)).find((x) => x.werte?.[vergeben[0]] === werte[vergeben[0]]);
          if (da) {
            this.hinweise.push(`${schluessel}: ${vergeben[0]} schon vergeben – nutzt die vorhandene Mappe`);
            return da;
          }
        }
        let weg = Object.keys(felder).filter((k) => k in werte);
        if (!weg.length && /berechnet/i.test(e.message)) weg = typ.felder.filter((f) => f.berechnetVon && f.key in werte).map((f) => f.key);
        this.hinweise.push(
          `${schluessel}: ${weg.length ? `ohne ${weg.join(', ')}` : 'nicht angelegt'} (${e.message.replace(/^.*?: \d+ /, '').slice(0, 160)})`,
        );
        if (!weg.length) return null;
        for (const k of weg) delete werte[k];
      }
    }
    return null;
  }

  /** Verweise früherer Mappen auf die eben angelegte nachtragen. */
  async trageNach(schluessel, id) {
    for (const o of this.offen.get(schluessel) ?? []) {
      const f = o.typ.felder.find((x) => x.key === o.feld);
      await this.api
        .json('PUT', `/api/mappen/${o.mappe}`, { body: { werte: { [o.feld]: f?.mehrfach ? [id] : id } } })
        .catch((e) => this.hinweise.push(`${this.namen.get(o.mappe)}.${o.feld}: Verweis nicht nachgetragen (${e.message.slice(0, 120)})`));
    }
    this.offen.delete(schluessel);
  }
}
