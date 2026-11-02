/**
 * Paket-Update: Text in Verweis umwandeln (#534). Ein Paket kann für ein neues Verweisfeld sagen, aus welchem
 * bisherigen Textfeld es sich füllen lässt (`aus_text`, im DMS `ausText`). Das Update legt das Verweisfeld nur
 * dazu; der Text bleibt. Erst hier – nach einer Vorschau – schlägt das DMS je Name eine vorhandene Person vor,
 * legt auf Wunsch eine neue an, setzt den Verweis und leert das Textfeld. Jeder Schritt steht in der Historie
 * der Mappe, der ganze Vorgang lässt sich rückgängig machen. Grundsatz: Updates ändern nichts heimlich.
 */
import { randomUUID } from 'node:crypto';
import { aufbewahrenBis, datumText, inFrist } from '../../shared/src/archiv';
import { altesTextfeldVon, istLeer, trefferlistenVon, type Feld, type Mappe, type Mappentyp, type Register } from '../../shared/src/model';
import { namensSchluessel, namenVon, neueMappeWerte, registerUmstellen, spaltenUmstellen, teileNamen, vorlageUmstellen, vorschlag, type Entscheidung, type TypAenderung, type UmwandlungsFeld, type Umwandlungsvorgang, type UmwandlungsVorschau, type VorschauZeile } from '../../shared/src/umwandlung';
import type { Dienst, Zugriff } from './dienst';
import { Fachfehler } from './fehler';
import type { Handelnder } from './pakete';
import { protokoll } from './protokoll';
import { t } from './sprache';

const log = protokoll.modul('werkbank');
/** So viele Vorgänge bleiben zum Rückgängigmachen gespeichert. */
const VORGAENGE_MAX = 50;

const text = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const alsListe = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? [v] : []);
const gleich = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
/** Felder in der Reihenfolge dieser Kennungen; unbekannte bleiben hinten. */
const sortiere = (felder: Feld[], keys: string[]) => [...felder].sort((x, y) => (keys.indexOf(x.key) + 1 || 1e9) - (keys.indexOf(y.key) + 1 || 1e9));
const feldregister = (r: Register[]): Record<string, string[]> => Object.fromEntries(r.filter((x) => x.art === 'felder').map((x) => [x.key, x.felder ?? []]));

export class Umwandlung {
  constructor(private d: Dienst) {}

  /** Verweisfelder eines Pakets mit `aus_text` und die gespeicherten Vorgänge. */
  async liste(paketId: string): Promise<{ felder: UmwandlungsFeld[]; vorgaenge: Umwandlungsvorgang[] }> {
    const p = await this.paket(paketId);
    const typen = await this.d.listeTypen();
    const felder: UmwandlungsFeld[] = [];
    for (const id of Object.values(p.typen)) {
      const typ = typen.find((x) => x.id === id);
      if (!typ) continue;
      for (const f of typ.felder) {
        const alt = altesTextfeldVon(typ, f);
        if (!alt) continue;
        const mappen = await this.d.listeMappen(typ.id);
        felder.push(this.feld(typ, f, alt, typen, mappen.filter((m) => !istLeer(m.werte[alt.key]) && istLeer(m.werte[f.key])).length));
      }
    }
    return { felder, vorgaenge: (await this.vorgaenge()).filter((v) => v.paket === paketId) };
  }

  /** Vorschau: je Name ein Vorschlag, dazu die Mappen, die ausgelassen werden. */
  async vorschau(paketId: string, e: { typId?: unknown; feldKey?: unknown }, z: Zugriff): Promise<UmwandlungsVorschau> {
    return (await this.plane(paketId, e, z)).vorschau;
  }

  /** Umwandeln nach der Vorschau; `entscheidungen` je Name (Schlüssel wie in der Vorschau), fehlende wie vorgeschlagen. */
  async umwandeln(paketId: string, e: { typId?: unknown; feldKey?: unknown; entscheidungen?: unknown }, von: Handelnder, z: Zugriff) {
    const plan = await this.plane(paketId, e, z);
    const { feld } = plan.vorschau;
    const roh = (e.entscheidungen && typeof e.entscheidungen === 'object' ? e.entscheidungen : {}) as Record<string, unknown>;
    const kandidaten = new Set(plan.vorschau.kandidaten.map((k) => k.id));
    const wahl = new Map<string, Entscheidung>();
    for (const z of plan.vorschau.zeilen) {
      const x = roh[z.schluessel] as { art?: unknown; id?: unknown } | undefined;
      if (!x) { wahl.set(z.schluessel, z.vorschlag); continue; }
      if (x.art === 'person' && typeof x.id === 'string' && kandidaten.has(x.id)) wahl.set(z.schluessel, { art: 'person', id: x.id });
      else if (x.art === 'neu') wahl.set(z.schluessel, { art: 'neu' });
      else if (x.art === 'ueberspringen') wahl.set(z.schluessel, { art: 'ueberspringen' });
      else throw new Fachfehler(422, t('pakete.umwandeln.fehler.wahl', { name: z.name }));
    }
    // Mappen, bei denen jeder Name eine Person bekommt; die anderen bleiben, wie sie sind.
    const ausgelassen = [...plan.vorschau.ausgelassen];
    const umwandeln = plan.mappen.filter((m) => {
      if (m.namen.every((n) => wahl.get(namensSchluessel(n))?.art !== 'ueberspringen')) return true;
      ausgelassen.push({ mappeId: m.mappe.id, titel: m.mappe.titel ?? '', grund: t(m.namen.length > 1 ? 'pakete.umwandeln.grund.teilweise' : 'pakete.umwandeln.grund.uebersprungen') });
      return false;
    });
    if (!umwandeln.length) throw new Fachfehler(409, t('pakete.umwandeln.fehler.nichts'));
    const ich = von.id;
    // 1. Neue Personen (je Name eine); scheitert eine, wird nichts geändert.
    const ziel = (await this.d.listeTypen()).find((x) => x.id === feld.zielTypId)!;
    const neu = new Map<string, string>();
    const gebraucht = new Set(umwandeln.flatMap((m) => m.namen.map(namensSchluessel)));
    try {
      for (const zl of plan.vorschau.zeilen) {
        if (wahl.get(zl.schluessel)?.art !== 'neu' || !gebraucht.has(zl.schluessel)) continue;
        const m = await this.d.legeMappeAn({ typId: ziel.id, werte: neueMappeWerte(ziel, zl.name) }, ich, false, z);
        neu.set(zl.schluessel, m.id);
      }
    } catch (f) {
      await this.d.entferneMappenEndgueltig([...neu.values()]).catch(() => {});
      throw new Fachfehler(422, t('pakete.umwandeln.fehler.neu', { meldung: (f as Error).message }));
    }
    const idVon = (n: string): string => { const w = wahl.get(namensSchluessel(n))!; return w.art === 'person' ? w.id : neu.get(namensSchluessel(n))!; };
    // 2. Mappentyp: altes Feld keine Pflicht mehr; Titel, Trefferlisten und Register zeigen den Verweis.
    const typAenderung = await this.stelleTypUm(plan.typ, plan.feld, plan.alt);
    // 3. Mappen: Verweis setzen, Text leeren – mit Eintrag in der Historie.
    const vorgang: Umwandlungsvorgang = {
      id: randomUUID(), paket: paketId, typId: plan.typ.id, typName: plan.typ.name, feldKey: plan.feld.key, feldLabel: plan.feld.label, ausKey: plan.alt.key, ausLabel: plan.alt.label,
      zeit: new Date().toISOString(), von: von.email, mappen: [], neuePersonen: [...neu.values()], typ: typAenderung,
    };
    const anlass = { umwandlung: vorgang.id, text: t('pakete.umwandeln.historie') };
    for (const m of umwandeln) {
      const ids = [...new Set(m.namen.map(idVon))];
      try {
        await this.d.aendereMappe(m.mappe.id, { werte: { [plan.feld.key]: plan.feld.mehrfach ? ids : ids[0], [plan.alt.key]: null } }, ich, z, anlass);
        vorgang.mappen.push({ id: m.mappe.id, alt: m.text, neu: ids });
      } catch (f) {
        ausgelassen.push({ mappeId: m.mappe.id, titel: m.mappe.titel ?? '', grund: (f as Error).message });
      }
    }
    await this.speichere(vorgang);
    log.info('Paket-Update: Text in Verweis umgewandelt', { von: von.email, paket: paketId, typ: plan.typ.id, feld: plan.feld.key, mappen: vorgang.mappen.length, neuePersonen: neu.size, ausgelassen: ausgelassen.length });
    return { vorgang, umgewandelt: vorgang.mappen.length, neuePersonen: neu.size, ausgelassen };
  }

  /** Einen Vorgang zurücknehmen: Text zurück, Verweis leer, neue Personen in den Papierkorb, Mappentyp wie vorher. */
  async rueckgaengig(vorgangId: string, von: Handelnder, z: Zugriff) {
    const alle = await this.vorgaenge();
    const v = alle.find((x) => x.id === vorgangId);
    if (!v) throw new Fachfehler(404, t('pakete.umwandeln.fehler.vorgang'));
    if (v.rueckgaengig) throw new Fachfehler(409, t('pakete.umwandeln.fehler.schon'));
    const typ = (await this.d.listeTypen()).find((x) => x.id === v.typId);
    if (!typ) throw new Fachfehler(409, t('pakete.umwandeln.fehler.typ'));
    const ausgelassen: Array<{ mappeId: string; titel: string; grund: string }> = [];
    const anlass = { umwandlung: v.id, rueckgaengig: true, text: t('pakete.umwandeln.historie.zurueck') };
    const jetzt = new Map((await this.d.listeMappen(typ.id)).map((m) => [m.id, m] as const));
    let zurueck = 0;
    for (const e of v.mappen) {
      const m = jetzt.get(e.id);
      const grund = !m ? t('pakete.umwandeln.grund.weg') : this.sperre(typ, m) ?? (!gleich(alsListe(m.werte[v.feldKey]), e.neu) || !istLeer(m.werte[v.ausKey]) ? t('pakete.umwandeln.grund.geaendert') : null);
      if (grund) { ausgelassen.push({ mappeId: e.id, titel: m?.titel ?? '', grund }); continue; }
      try {
        await this.d.aendereMappe(e.id, { werte: { [v.feldKey]: null, [v.ausKey]: e.alt } }, von.id, z, anlass);
        zurueck++;
      } catch (f) { ausgelassen.push({ mappeId: e.id, titel: m!.titel ?? '', grund: (f as Error).message }); }
    }
    // Neue Personen: in den Papierkorb, sofern nichts mehr auf sie verweist.
    const behalten: string[] = [];
    for (const id of v.neuePersonen) {
      try { await this.d.loescheMappe(id, von.id, z); } catch (f) { if ((f as Fachfehler).status !== 404) behalten.push(id); }
    }
    // Mappentyp: nur zurück, was seitdem niemand anders geändert hat.
    const t2 = (await this.d.listeTypen()).find((x) => x.id === v.typId)!;
    const a = v.typ;
    let felder = t2.felder;
    let titelVorlage = t2.titelVorlage;
    let trefferlisten = trefferlistenVon(t2);
    let register = t2.register;
    if (a.titelVorlage && t2.titelVorlage === a.titelVorlage.nachher) titelVorlage = a.titelVorlage.vorher;
    if (a.trefferlisten && JSON.stringify(trefferlisten) === JSON.stringify(a.trefferlisten.nachher)) trefferlisten = a.trefferlisten.vorher;
    if (a.register && JSON.stringify(feldregister(register)) === JSON.stringify(a.register.nachher)) register = register.map((r) => (r.art === 'felder' ? { ...r, felder: a.register!.vorher[r.key] ?? r.felder } : r));
    if (a.reihenfolge && gleich(felder.map((f) => f.key), a.reihenfolge.nachher)) felder = sortiere(felder, a.reihenfolge.vorher);
    // Pflicht nur zurück, wenn wieder jede Mappe einen Text hat.
    if (a.pflicht && (await this.d.listeMappen(typ.id)).every((m) => !istLeer(m.werte[v.ausKey]))) felder = felder.map((f) => (f.key === v.ausKey ? { ...f, pflicht: true } : f));
    if (felder !== t2.felder || titelVorlage !== t2.titelVorlage || JSON.stringify(trefferlisten) !== JSON.stringify(trefferlistenVon(t2)) || register !== t2.register) {
      await this.d.aendereTyp(t2.id, { ...t2, felder, titelVorlage, trefferlisten, trefferliste: (trefferlisten.find((l) => l.standard) ?? trefferlisten[0])?.spalten ?? [], register });
    }
    v.rueckgaengig = { zeit: new Date().toISOString(), von: von.email, zurueck, ausgelassen: ausgelassen.length };
    await this.d.setzePaketUmwandlungen(alle);
    log.info('Paket-Update: Umwandlung rückgängig gemacht', { von: von.email, paket: v.paket, vorgang: v.id, mappen: zurueck, ausgelassen: ausgelassen.length, personenBehalten: behalten.length });
    return { zurueck, ausgelassen, personenBehalten: behalten.length };
  }

  /* ---------- intern ---------- */

  private async paket(id: string) {
    const p = (await this.d.listePakete()).find((x) => x.id === id);
    if (!p) throw new Fachfehler(404, t('pakete.umwandeln.fehler.paket', { id }));
    return p;
  }

  private feld(typ: Mappentyp, f: Feld, alt: Feld, typen: Mappentyp[], anzahl: number): UmwandlungsFeld {
    const ziel = typen.find((x) => x.id === f.zielTyp);
    return { typId: typ.id, typName: typ.name, feldKey: f.key, feldLabel: f.label, ausKey: alt.key, ausLabel: alt.label, mehrfach: !!f.mehrfach, zielTypId: ziel?.id ?? '', zielTypName: ziel?.name ?? '', anzahl };
  }

  /** Archivmodus (#212): in der Aufbewahrungsfrist wird nichts umgeschrieben. */
  private sperre(typ: Mappentyp, m: Mappe): string | null {
    const bis = aufbewahrenBis(typ.archiv, m);
    return typ.archiv && inFrist(bis) ? t('pakete.umwandeln.grund.frist', { bis: datumText(bis!) }) : null;
  }

  private async plane(paketId: string, e: { typId?: unknown; feldKey?: unknown }, z: Zugriff) {
    const p = await this.paket(paketId);
    const typen = await this.d.listeTypen();
    const typ = Object.values(p.typen).includes(text(e.typId)) ? typen.find((x) => x.id === text(e.typId)) : undefined;
    const feld = typ?.felder.find((f) => f.key === text(e.feldKey));
    const alt = typ && feld ? altesTextfeldVon(typ, feld) : undefined;
    if (!typ || !feld || !alt) throw new Fachfehler(404, t('pakete.umwandeln.fehler.feld'));
    const ziel = typen.find((x) => x.id === feld.zielTyp);
    if (!ziel) throw new Fachfehler(409, t('pakete.umwandeln.fehler.ziel'));
    const kandidaten = (await this.d.listeMappen(ziel.id)).map((m) => ({ id: m.id, titel: m.titel || t('pakete.umwandeln.ohnetitel'), namen: namenVon(m) }))
      .sort((a, b) => a.titel.localeCompare(b.titel, 'de'));
    const bekannt = (n: string) => kandidaten.some((k) => k.namen.includes(namensSchluessel(n)));
    const mitText = (await this.d.listeMappen(typ.id)).filter((m) => !istLeer(m.werte[alt.key]));
    const rechte = await this.d.rechteAnVielen(z, mitText);
    const ausgelassen: UmwandlungsVorschau['ausgelassen'] = [];
    const mappen: Array<{ mappe: Mappe; text: string; namen: string[] }> = [];
    const zeilen = new Map<string, VorschauZeile>();
    for (const m of mitText) {
      const grund = !istLeer(m.werte[feld.key]) ? t('pakete.umwandeln.grund.gesetzt')
        : this.sperre(typ, m) ?? (!rechte.get(m.id)?.U ? t('pakete.umwandeln.grund.recht') : null);
      if (grund) { ausgelassen.push({ mappeId: m.id, titel: m.titel ?? '', grund }); continue; }
      const roh = text(m.werte[alt.key]);
      const namen = teileNamen(roh, !!feld.mehrfach, bekannt);
      if (!namen.length) continue;
      mappen.push({ mappe: m, text: roh, namen });
      for (const n of namen) {
        const k = namensSchluessel(n);
        const da = zeilen.get(k);
        if (da) { da.mappen++; continue; }
        const v = vorschlag(n, kandidaten);
        zeilen.set(k, { name: n, schluessel: k, mappen: 1, vorschlag: v.entscheidung, passend: v.passend });
      }
    }
    const listen = trefferlistenVon(typ);
    const vorschau: UmwandlungsVorschau = {
      feld: this.feld(typ, feld, alt, typen, mappen.length),
      zeilen: [...zeilen.values()].sort((a, b) => a.name.localeCompare(b.name, 'de')),
      ausgelassen, kandidaten: kandidaten.map(({ id, titel }) => ({ id, titel })),
      pflichtAus: !!alt.pflicht,
      vorlage: vorlageUmstellen(typ.titelVorlage ?? '', alt.key, feld.key) !== (typ.titelVorlage ?? ''),
      spalten: listen.some((l) => l.spalten.includes(alt.key)),
    };
    return { vorschau, typ, feld, alt, mappen };
  }

  /** Mappentyp umstellen (nur was nötig ist) und festhalten, was geändert wurde. */
  private async stelleTypUm(typ: Mappentyp, feld: Feld, alt: Feld): Promise<TypAenderung> {
    const a: TypAenderung = { pflicht: !!alt.pflicht };
    const titelVorlage = vorlageUmstellen(typ.titelVorlage ?? '', alt.key, feld.key);
    if (titelVorlage !== (typ.titelVorlage ?? '')) a.titelVorlage = { vorher: typ.titelVorlage ?? '', nachher: titelVorlage };
    const vorher = trefferlistenVon(typ);
    const trefferlisten = vorher.map((l) => ({ ...l, spalten: spaltenUmstellen(l.spalten, alt.key, feld.key) }));
    if (JSON.stringify(trefferlisten) !== JSON.stringify(vorher)) a.trefferlisten = { vorher, nachher: trefferlisten };
    // Das Verweisfeld rückt auf das Register des alten Felds, direkt davor – und nur dorthin.
    const vorherReg = feldregister(typ.register);
    const nachherReg = Object.fromEntries(Object.entries(vorherReg).map(([k, l]) => [k, l.includes(alt.key) ? registerUmstellen(l, alt.key, feld.key) : l.filter((x) => x !== feld.key)]));
    if (Object.values(vorherReg).some((l) => l.includes(alt.key)) && JSON.stringify(nachherReg) !== JSON.stringify(vorherReg)) a.register = { vorher: vorherReg, nachher: nachherReg };
    // Im Formular zählt die Reihenfolge der Felder: das Verweisfeld direkt vor das alte.
    const keys = typ.felder.map((f) => f.key);
    const reihenfolge = registerUmstellen(keys, alt.key, feld.key);
    if (!gleich(reihenfolge, keys)) a.reihenfolge = { vorher: keys, nachher: reihenfolge };
    if (!a.pflicht && !a.titelVorlage && !a.trefferlisten && !a.register && !a.reihenfolge) return a;
    const register = typ.register.map((r) => (a.register && r.art === 'felder' ? { ...r, felder: a.register.nachher[r.key] ?? r.felder } : r));
    const listen = a.trefferlisten?.nachher ?? vorher;
    await this.d.aendereTyp(typ.id, {
      ...typ, felder: sortiere(typ.felder, reihenfolge).map((f) => (f.key === alt.key ? { ...f, pflicht: false } : f)), titelVorlage, register,
      trefferlisten: listen, trefferliste: (listen.find((l) => l.standard) ?? listen[0])?.spalten ?? [],
    });
    return a;
  }

  private async vorgaenge(): Promise<Umwandlungsvorgang[]> {
    return (await this.d.paketUmwandlungen()).filter((v): v is Umwandlungsvorgang => !!v && typeof v === 'object' && typeof (v as Umwandlungsvorgang).id === 'string');
  }

  private async speichere(v: Umwandlungsvorgang) {
    await this.d.setzePaketUmwandlungen([v, ...(await this.vorgaenge())].slice(0, VORGAENGE_MAX));
  }
}
