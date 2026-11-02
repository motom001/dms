/**
 * Paket selbst erstellen (#374): gewählte Mappentypen und Ansichten dieses DMS als .zip im Format der
 * Registry (manifest.yaml, inhalt/…, README, CHANGELOG, LICENSE, tests/erwartung.yaml).
 *
 * - Nur, was das Paketformat heute kann; was nicht hineinpasst, steht als Hinweis in der Prüfung.
 * - Typen und Ansichten aus installierten Paketen werden nicht kopiert, sondern Abhängigkeit (>= installierte Version).
 * - Verweise auf Benutzer, Rolle und Ablageort werden dms:…; auf eigene, nicht gewählte Typen: „mit aufnehmen“.
 * - Keine Mappendaten außer ausdrücklich gewählten Beispiel-Mappen; nie Passwörter, nie Benutzer, keine Ids.
 * - Vor dem Download dieselbe Prüfung wie beim Hochladen (liesPaket).
 *
 * `baue` ist eine reine Funktion (testbar ohne DMS); die Klasse holt den Stand aus dem Dienst.
 */
import { stringify } from 'yaml';
import { istLeer, standardliste, trefferlistenVon, type Feld, type Mappe, type Mappentyp, type Register } from '../../shared/src/model';
import { kreisImStandard } from '../../shared/src/nummernkreis';
import { BEREICH, PAKET_ID, VERSION, vergleicheVersion, type InstalliertesPaket } from '../../shared/src/pakete';
import { BESCHREIBUNG_LAENGE, GITHUB, LIZENZEN, NAME_LAENGE, naechsteVersion, type ErstellenStand, type Fehlend, type PaketEntwurf, type PaketErstellenEingabe, type PaketPruefung } from '../../shared/src/paketerstellung';
import type { Bedingung, Sicht, WertAngabe } from '../../shared/src/sichten';
import type { Dienst } from './dienst';
import { Fachfehler } from './fehler';
import { LIZENZTEXTE } from './lizenztexte';
import { ARCHIV_MAX, DMS_TYPEN, DMS_VERWEISE_AB, liesPaket, liesZip, type Handelnder } from './pakete';
import { protokoll } from './protokoll';
import { zipPuffer } from './zip';

const log = protokoll.modul('werkbank');

/** Ab dieser Version verstehen DMS Verweise zwischen Beispielen (#347). */
const BEISPIELVERWEISE_AB = '0.79.0';
const SCHLUESSEL = /^[a-z][a-z0-9_]{0,39}$/;
/** Etwas, das wie eine Id aussieht (Mappe, Benutzer, Rolle) – gehört nie in ein Paket. */
const ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const mitId = (v: unknown) => ID.test(JSON.stringify(v) ?? '');
const ENTWUERFE_MAX = 20;
const BEISPIELMAPPEN_MAX = 200;

/** Alles, was die Erzeugung aus dem DMS braucht. */
export interface ErstellenDaten {
  typen: Mappentyp[];
  sichten: Sicht[];
  pakete: InstalliertesPaket[];
  /** Mappentypen, auf die Pakete mit dms:… verweisen dürfen: Id → Kennung (benutzer, rolle, ablageort). */
  dmsTypen: Map<string, string>;
  /** Gewählte Beispiel-Mappen (nur aus gewählten eigenen Typen). */
  mappen: Mappe[];
  dmsVersion: string;
  /** Zuletzt exportierter Entwurf mit derselben Id. */
  entwurf: PaketEntwurf | null;
  jetzt: Date;
}

export interface Bau {
  probleme: string[];
  fehlend: Array<Fehlend & { noetig: boolean }>;
  hinweise: string[];
  abhaengigkeiten: Record<string, string>;
  inhalt: PaketPruefung['inhalt'];
  /** Kennungen im Paket je Id im DMS (zum Merken). */
  schluessel: Record<string, string>;
  /** Dateien des Pakets (ohne Ordner davor). */
  dateien: Array<{ name: string; daten: Buffer }>;
}

/** Null, undefined, leere Texte und „false“ weglassen – das Schema kennt kein null. */
function ohneLeere<T extends Record<string, unknown>>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== '' && v !== false && !(Array.isArray(v) && !v.length))) as Partial<T>;
}

/** Eine freie Kennung: Basis gekürzt, bei Bedarf mit _2, _3 … */
function frei(basis: string, max: number, belegt: Set<string>): string {
  let b = basis.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9_]+/g, '_').replace(/^[^a-z]+/, '').replace(/_+$/, '');
  if (!b) b = 'typ';
  b = b.slice(0, max).replace(/_+$/, '') || 'typ';
  let k = b;
  for (let n = 2; belegt.has(k); n++) k = `${b.slice(0, max - String(n).length - 1)}_${n}`;
  belegt.add(k);
  return k;
}

/** Untergrenze eines Versionsbereichs, z. B. „>=0.75.0“ → 0.75.0. */
const untergrenze = (bereich: string) => BEREICH.exec(bereich.trim())?.[2] ?? null;
/** Text für eine Markdown-Tabellenzelle: Backslash zuerst, dann „|“ escapen, Zeilenumbrüche weg. */
const zelle = (s: string) => s.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

/**
 * Baut das Paket: prüft die Auswahl und die Angaben, löst Verweise auf und erzeugt die Dateien.
 * Gibt immer ein Ergebnis zurück; `probleme` bzw. nötige `fehlend` verhindern den Export.
 */
export function baue(e: PaketErstellenEingabe, d: ErstellenDaten): Bau {
  const probleme: string[] = [];
  const hinweise: string[] = [];
  const fehlend: Bau['fehlend'] = [];
  const abh: Record<string, string> = {};
  const typById = new Map(d.typen.map((t) => [t.id, t] as const));
  const sichtById = new Map(d.sichten.map((s) => [s.id, s] as const));
  const id = e.id.trim();

  // Herkunft: welche Typen und Ansichten gehören zu einem installierten Paket?
  const typPaket = new Map<string, { p: InstalliertesPaket; s: string }>();
  const sichtPaket = new Map<string, { p: InstalliertesPaket; s: string }>();
  for (const p of d.pakete) {
    for (const [s, tid] of Object.entries(p.typen)) typPaket.set(tid, { p, s });
    for (const [s, sid] of Object.entries(p.sichten)) sichtPaket.set(sid, { p, s });
  }
  const geaendert = (t: Mappentyp) => { const h = typPaket.get(t.id); return !!h && t.geaendert > (h.p.aktualisiert ?? h.p.installiert); };
  const einmal = new Set<string>();
  const hinweis = (h: string) => { if (!einmal.has(h)) { einmal.add(h); hinweise.push(h); } };
  const abhaengig = (p: InstalliertesPaket) => {
    const b = `>=${p.version}`;
    if (!abh[p.id] || vergleicheVersion(p.version, untergrenze(abh[p.id]) ?? '0.0.0') > 0) abh[p.id] = b;
  };
  const ausPaket = (art: string, name: string, p: InstalliertesPaket, t?: Mappentyp) => {
    abhaengig(p);
    hinweis(`${art} „${name}“ kommt aus dem Paket „${p.name}“ – wird als Abhängigkeit eingetragen (${p.id} >=${p.version}), nicht kopiert.`);
    if (t && geaendert(t)) hinweis(`Änderungen an „${t.name}“ (${p.name}) gehören nicht zu deinem Paket – beim Empfänger gilt der Typ, wie das Paket „${p.name}“ ihn bringt. Brauchst du die Änderungen, lege dafür einen eigenen Typ an.`);
  };

  // 1. Angaben
  if (!PAKET_ID.test(id)) probleme.push('Id: nur Kleinbuchstaben, Ziffern und _, beginnt mit einem Buchstaben, 2 bis 20 Zeichen (z. B. vertraege_familie).');
  else if (id === 'dms') probleme.push('Id: „dms“ ist für Verweise auf Mappentypen des DMS reserviert.');
  else if (d.pakete.some((p) => p.id === id)) probleme.push(`Id: Das Paket „${id}“ ist in diesem DMS installiert. Wähle eine andere Id – ein eigenes Paket darf kein installiertes überdecken.`);
  const name = e.name.trim();
  if (name.length < NAME_LAENGE.min || name.length > NAME_LAENGE.max) probleme.push(`Name: ${NAME_LAENGE.min} bis ${NAME_LAENGE.max} Zeichen.`);
  if (!VERSION.test(e.version.trim())) probleme.push('Version: drei Zahlen, z. B. 1.0.0.');
  const beschreibung = e.beschreibung.trim().replace(/\s+/g, ' ');
  if (beschreibung.length < BESCHREIBUNG_LAENGE.min || beschreibung.length > BESCHREIBUNG_LAENGE.max) probleme.push(`Beschreibung: ${BESCHREIBUNG_LAENGE.min} bis ${BESCHREIBUNG_LAENGE.max} Zeichen, ein, zwei Sätze.`);
  const autor = { name: e.autor.name.trim(), github: e.autor.github.trim().replace(/^@/, '') };
  if (!autor.name) probleme.push('Autor: Bitte deinen Namen angeben (steht auch in LICENSE).');
  if (autor.github && !GITHUB.test(autor.github)) probleme.push('GitHub: nur Buchstaben, Ziffern und Bindestrich.');
  if (!autor.github) hinweis('Ohne GitHub-Namen lässt sich das Paket installieren, aber nicht in die Registry einreichen (dort ist er Pflicht).');
  if (!(LIZENZEN as readonly string[]).includes(e.lizenz)) probleme.push(`Lizenz: bitte eine aus der Liste der Registry wählen (${LIZENZEN.join(', ')}).`);
  const dms = e.dms.trim();
  if (!BEREICH.test(dms)) probleme.push('DMS-Version: z. B. >=0.86.0.');
  const version = e.version.trim();
  if (d.entwurf && VERSION.test(version) && vergleicheVersion(version, d.entwurf.version) <= 0) {
    hinweis(`Version ${d.entwurf.version} hast du schon exportiert. Damit der Empfänger aktualisieren kann, braucht es eine höhere Version (Vorschlag ${naechsteVersion(d.entwurf.version)}).`);
  }

  // 2. Auswahl: eigene Typen werden exportiert, Paket- und Systemtypen nicht.
  const eigene: Mappentyp[] = [];
  for (const tid of new Set(e.typen)) {
    const t = typById.get(tid);
    if (!t) { probleme.push('Ein gewählter Mappentyp existiert nicht mehr. Bitte die Auswahl prüfen.'); continue; }
    const h = typPaket.get(t.id);
    if (d.dmsTypen.has(t.id) || t.system) hinweis(`„${t.name}“ bringt jedes DMS selbst mit und kommt nicht ins Paket.`);
    else if (h) ausPaket('Der Mappentyp', t.name, h.p, t);
    else eigene.push(t);
  }
  const schluessel: Record<string, string> = {};
  const max = 40 - (PAKET_ID.test(id) ? id.length : 20) - 1;
  const belegtT = new Set<string>();
  // Gemerkte Kennungen zuerst, damit sie über Versionen gleich bleiben (sonst gäbe es beim Update neue Typen).
  for (const t of eigene) {
    const alt = d.entwurf?.schluessel[t.id];
    if (alt && SCHLUESSEL.test(alt) && alt.length <= max && !belegtT.has(alt)) { belegtT.add(alt); schluessel[t.id] = alt; }
  }
  for (const t of eigene) if (!schluessel[t.id]) schluessel[t.id] = frei(t.schluessel || t.name, max, belegtT);

  /** Verweis auf einen Typ: eigener → Kennung, Paket → paket:kennung, DMS → dms:…; sonst null. */
  let dmsVerweise = false;
  const ziel = (typId: string | undefined, wo: string): string | null => {
    if (!typId) { probleme.push(`${wo}: ohne Ziel.`); return null; }
    if (schluessel[typId]) return schluessel[typId];
    const k = d.dmsTypen.get(typId);
    if (k && DMS_TYPEN[k]) { dmsVerweise = true; return `dms:${k}`; }
    const t = typById.get(typId);
    const h = typPaket.get(typId);
    if (h && t) { ausPaket('Der Mappentyp', t.name, h.p, t); return `${h.p.id}:${h.s}`; }
    if (!t) { probleme.push(`${wo}: Den Ziel-Mappentyp gibt es nicht mehr.`); return null; }
    if (t.system) { probleme.push(`${wo}: verweist auf „${t.name}“. Darauf kann ein Paket nicht verweisen (erlaubt: ${Object.values(DMS_TYPEN).join(', ')}).`); return null; }
    if (!fehlend.some((f) => f.id === t.id)) fehlend.push({ art: 'typ', id: t.id, name: t.name, grund: wo, noetig: true });
    return null;
  };

  // 3. Mappentypen
  const paketTypen = eigene.map((t) => {
    const wo = (was: string) => `„${t.name}“ → ${was}`;
    const felder = t.felder.filter((f) => !f.system).map((f) => {
      // ausText (#534) gehört zu einem Update aus der Registry, nicht in ein selbst erstelltes Paket.
      const { zielTyp, system: _s, auswahlFilter, frist, standard, ausText: _a, ...rest } = f as Feld;
      const x: Record<string, unknown> = ohneLeere(rest as Record<string, unknown>);
      if (f.typ === 'referenz') x.ziel = ziel(zielTyp, wo(`Feld „${f.label}“`)) ?? undefined;
      else delete x.verweisart;
      if (frist) x.frist = ohneLeere(frist as unknown as Record<string, unknown>);
      if (standard !== undefined && standard !== null && standard !== '') {
        if (kreisImStandard(standard)) hinweis(`${wo(`Feld „${f.label}“`)}: Der Nummernkreis gehört nicht zum Paketformat. Das Feld kommt ohne Nummernkreis ins Paket; richte ihn beim Empfänger unter Werkbank → Nummernkreise ein und trage ihn am Feld ein.`);
        else if (mitId(standard)) hinweis(`${wo(`Feld „${f.label}“`)}: Der Standardwert zeigt auf eine Mappe dieses DMS und kommt nicht ins Paket.`);
        else x.standard = standard;
      }
      if (auswahlFilter?.length) {
        if (mitId(auswahlFilter)) hinweis(`${wo(`Feld „${f.label}“`)}: Der Auswahlfilter nennt Mappen dieses DMS und kommt nicht ins Paket.`);
        else x.auswahlFilter = auswahlFilter;
      }
      if (x.ziel === undefined) delete x.ziel;
      return x;
    });
    const register = t.register.map((r: Register) => {
      const quellen = r.quellen?.map((q) => ({ typ: ziel(q.typId, wo(`Register „${r.name}“`)), feld: q.feldKey })).filter((q): q is { typ: string; feld: string } => !!q.typ);
      return ohneLeere({ key: r.key, name: r.name, art: r.art, felder: r.art === 'felder' ? (r.felder ?? []).filter((k) => felder.some((f) => f.key === k)) : undefined, quellen, versionierung: r.versionierung, versionenBehalten: r.versionenBehalten });
    });
    // volltext: false ausdrücklich behalten (Standard ist ja); ohneLeere ließe es weg.
    t.register.forEach((r, i) => { if (r.volltext === false) (register[i] as Record<string, unknown>).volltext = false; });
    const liste = standardliste(t);
    if (trefferlistenVon(t).length > 1) hinweis(`„${t.name}“: Nur die Standard-Trefferliste „${liste.name}“ kommt ins Paket; weitere Trefferlisten kennt das Paketformat nicht.`);
    const weg = [t.berechtigungen ? 'Berechtigungen' : '', t.archiv ? 'Archivmodus' : '', t.erstellenErlaubt === false || t.loeschenErlaubt === false ? 'Anlegen/Löschen gesperrt' : ''].filter(Boolean);
    if (weg.length) hinweis(`„${t.name}“: ${weg.join(', ')} gehören nicht zum Paketformat und kommen nicht mit.`);
    // Das Schema verlangt beschreibung und felder auch leer.
    return {
      schluessel: schluessel[t.id], name: t.name, beschreibung: t.beschreibung ?? '',
      ...ohneLeere({ titelVorlage: t.titelVorlage || undefined }), felder, register, ...ohneLeere({ trefferliste: liste.spalten.length ? liste.spalten : undefined }),
    };
  });

  // 4. Ansichten
  const eigeneSichten: Sicht[] = [];
  for (const sid of new Set(e.sichten)) {
    const s = sichtById.get(sid);
    if (!s) { probleme.push('Eine gewählte Ansicht existiert nicht mehr. Bitte die Auswahl prüfen.'); continue; }
    const h = sichtPaket.get(s.id);
    if (h) ausPaket('Die Ansicht', s.name, h.p);
    else eigeneSichten.push(s);
  }
  const belegtS = new Set<string>();
  for (const s of eigeneSichten) {
    const alt = d.entwurf?.schluessel[s.id];
    if (alt && SCHLUESSEL.test(alt) && !belegtS.has(alt) && !Object.values(schluessel).includes(alt)) { belegtS.add(alt); schluessel[s.id] = alt; }
  }
  for (const s of eigeneSichten) if (!schluessel[s.id]) schluessel[s.id] = frei(s.name, 40, belegtS);
  const fest = (w: WertAngabe | undefined): unknown => (!w ? undefined : w.art === 'fest' ? w.wert : w);
  const paketSichten = eigeneSichten.map((s) => {
    let eltern: string | undefined;
    if (s.elternId) {
      const ep = sichtById.get(s.elternId);
      if (ep && schluessel[ep.id] && eigeneSichten.includes(ep)) eltern = schluessel[ep.id];
      else if (ep && sichtPaket.has(ep.id)) hinweis(`Ansicht „${s.name}“ steht unter „${ep.name}“ aus einem Paket – im Paket steht sie auf der obersten Ebene.`);
      else if (ep) {
        hinweis(`Ansicht „${s.name}“ steht unter „${ep.name}“, die nicht gewählt ist – im Paket steht sie auf der obersten Ebene.`);
        if (!fehlend.some((f) => f.id === ep.id)) fehlend.push({ art: 'sicht', id: ep.id, name: ep.name, grund: `Elternansicht von „${s.name}“`, noetig: false });
      }
    }
    const typen = s.typen.map((t) => ziel(t, `Ansicht „${s.name}“`)).filter((t): t is string => !!t);
    const bedingungen = s.bedingungen.flatMap((b: Bedingung) => {
      if (b.art !== 'feld') { hinweis(`Ansicht „${s.name}“: Bedingungen auf Anzahlen, Favoriten oder Fristen kennt das Paketformat nicht; sie fehlen im Paket.`); return []; }
      const w = (b.op === 'zwischen' || b.op === 'ausserhalb') && b.bis ? [fest(b.wert), fest(b.bis)] : fest(b.wert);
      if (mitId(w)) { hinweis(`Ansicht „${s.name}“: Eine Bedingung nennt Mappen oder Benutzer dieses DMS und kommt nicht ins Paket.`); return []; }
      return [w === undefined ? { feld: b.feld, operator: b.op } : { feld: b.feld, operator: b.op, wert: w }];
    });
    if (s.trefferliste && s.trefferliste !== 'standard') hinweis(`Ansicht „${s.name}“: zeigt im Paket die Standard-Trefferliste.`);
    if (s.berechtigungen) hinweis(`Ansicht „${s.name}“: Berechtigungen an der Ansicht kommen nicht ins Paket.`);
    return ohneLeere({ schluessel: schluessel[s.id], name: s.name, beschreibung: s.beschreibung || undefined, eltern, typen, bedingungen });
  });
  // Elternansichten zuerst (liest sich besser; das DMS sortiert ohnehin).
  const sortiert: typeof paketSichten = [];
  const offen = [...paketSichten];
  while (offen.length) {
    const i = offen.findIndex((s) => !s.eltern || sortiert.some((x) => x.schluessel === s.eltern) || !offen.some((x) => x.schluessel === s.eltern));
    sortiert.push(...offen.splice(i < 0 ? 0 : i, 1));
  }

  // 5. Beispiele: nur ausdrücklich gewählte Mappen der eigenen Typen, ohne Passwörter und ohne Ids.
  const exportiert = new Map(eigene.map((t) => [t.id, t] as const));
  const bsp = d.mappen.filter((m) => exportiert.has(m.typId) && !m.systemKennung);
  if (d.mappen.length > bsp.length) hinweis('Beispiel-Mappen gehen nur aus gewählten eigenen Mappentypen; die übrigen sind weggelassen.');
  const bspKey = new Map(bsp.map((m, i) => [m.id, `beispiel_${i + 1}`] as const));
  let beispielVerweise = false;
  let ohneZiel = 0;
  const beispiele = bsp.map((m) => {
    const t = exportiert.get(m.typId)!;
    const werte: Record<string, unknown> = {};
    for (const f of t.felder) {
      const w = m.werte[f.key];
      if (f.system || f.typ === 'passwort' || istLeer(w)) continue;
      if (f.typ === 'referenz') {
        const l = (Array.isArray(w) ? w : [w]).filter((x): x is string => typeof x === 'string');
        const z = l.filter((x) => bspKey.has(x)).map((x) => ({ beispiel: bspKey.get(x)! }));
        ohneZiel += l.length - z.length;
        if (z.length) { beispielVerweise = true; werte[f.key] = f.mehrfach ? z : z[0]; }
        continue;
      }
      if (f.typ === 'betrag' && w && typeof w === 'object' && 'betrag' in w) {
        const b = w as { betrag: unknown; waehrung?: string };
        werte[f.key] = (b.waehrung ?? 'EUR') === (f.waehrung || 'EUR') && typeof b.betrag === 'number' ? b.betrag : { betrag: b.betrag, waehrung: b.waehrung };
        continue;
      }
      if (mitId(w)) continue;
      werte[f.key] = w;
    }
    return { typ: schluessel[t.id], schluessel: bspKey.get(m.id)!, werte };
  });
  if (ohneZiel) hinweis(`Beispiel-Mappen: ${ohneZiel === 1 ? 'Ein Verweis zeigt' : `${ohneZiel} Verweise zeigen`} auf Mappen, die keine gewählten Beispiele sind, und ${ohneZiel === 1 ? 'bleibt' : 'bleiben'} leer.`);
  if (bsp.length) hinweis(`${bsp.length} Beispiel-Mappen aus deiner Auswahl kommen ins Paket – nimm nur Mappen mit erfundenen Daten. Dokumente, Notizen und Aufgaben kommen nicht mit.`);

  if (!paketTypen.length && !paketSichten.length) probleme.push('Wähle mindestens einen eigenen Mappentyp oder eine eigene Ansicht – Typen und Ansichten aus Paketen kommen nur als Abhängigkeit mit.');
  const noetigAb = [dmsVerweise ? DMS_VERWEISE_AB : null, beispielVerweise ? BEISPIELVERWEISE_AB : null].filter((x): x is string => !!x).sort(vergleicheVersion).pop();
  const unten = untergrenze(dms);
  if (noetigAb && unten && vergleicheVersion(unten, noetigAb) < 0) probleme.push(`DMS-Version: Das Paket nutzt ${dmsVerweise ? 'Verweise auf Mappentypen des DMS' : 'Verweise zwischen Beispielen'} und braucht mindestens >=${noetigAb}.`);
  const fehlt = fehlend.filter((f) => f.noetig);
  if (fehlt.length) probleme.push(`Es wird auf Mappentypen verwiesen, die nicht gewählt sind: ${fehlt.map((f) => `„${f.name}“`).join(', ')}. Nimm sie mit auf oder entferne den Verweis.`);

  const inhalt: Bau['inhalt'] = {
    typen: paketTypen.map((t) => ({ schluessel: String(t.schluessel), name: String(t.name) })),
    sichten: sortiert.map((s) => ({ schluessel: String(s.schluessel), name: String(s.name), eltern: (s.eltern as string | undefined) ?? null })),
    beispiele: beispiele.length,
  };
  if (probleme.length) return { probleme, fehlend, hinweise, abhaengigkeiten: abh, inhalt, schluessel, dateien: [] };

  // 6. Dateien
  const y = (v: unknown) => Buffer.from(stringify(v, { version: '1.1', lineWidth: 0 }));
  const manifest = {
    schema: 1, id, name, version, beschreibung, autor, lizenz: e.lizenz, dms, abhaengigkeiten: abh,
    inhalt: { mappentypen: 'inhalt/mappentypen.yaml', sichten: 'inhalt/sichten.yaml', ...(beispiele.length ? { beispiele: 'inhalt/beispiele.yaml' } : {}) },
  };
  const datum = d.jetzt.toISOString().slice(0, 10);
  const text = aenderungsText(e, d.entwurf);
  const verlauf = (d.entwurf ? [{ version: d.entwurf.version, datum: d.entwurf.exportiert.slice(0, 10), text: d.entwurf.aenderungen || 'Aus dem DMS exportiert.' }, ...d.entwurf.verlauf] : [])
    .filter((v) => vergleicheVersion(v.version, version) < 0);
  const changelog = ['# Änderungen', '', `## ${version}`, '', ...text.split('\n').map((z) => (z.trim().startsWith('-') ? z : `- ${z}`)).filter((z) => z.trim() !== '-'),
    ...verlauf.flatMap((v) => ['', `## ${v.version}`, '', ...v.text.split('\n').map((z) => (z.trim().startsWith('-') ? z : `- ${z}`)).filter((z) => z.trim() !== '-')]), ''].join('\n');
  const typName = new Map(paketTypen.map((t) => [String(t.schluessel), String(t.name)] as const));
  const readme = [
    `# ${name}`, '', beschreibung, '', '## Inhalt', '',
    ...(paketTypen.length ? ['| Mappentyp | Felder |', '| --- | --- |', ...paketTypen.map((t) => `| ${zelle(String(t.name))} | ${zelle((t.felder as Array<{ label: string }>).map((f) => f.label).join(', ') || '–')} |`), ''] : []),
    ...(sortiert.length ? [`**Ansichten:** ${sortiert.map((s) => (s.eltern ? `${sortiert.find((x) => x.schluessel === s.eltern)?.name} → ${s.name}` : s.name)).join(', ')}`, ''] : []),
    ...(beispiele.length ? [`**Beispiele:** ${beispiele.length} Beispiel-Mappen (${[...new Set(beispiele.map((b) => typName.get(b.typ)))].join(', ')}), auf Wunsch bei der Installation.`, ''] : []),
    '## Voraussetzungen', '', `- DMS ${dms}`,
    ...(Object.keys(abh).length ? Object.entries(abh).map(([k, v]) => `- Paket \`${k}\` ${v}`) : ['- keine weiteren Pakete']), '',
    '## Rechte und Netzwerkzugriff', '', 'Dieses Paket enthält keinen Code. Es legt nur Mappentypen und Ansichten an.', '',
    '## Herkunft', '', `Erstellt mit „Paket erstellen“ im DMS (Werkbank → Pakete) am ${datum}${autor.name ? ` von ${autor.name}` : ''}.`, '',
  ].join('\n');
  const lizenz = (LIZENZTEXTE[e.lizenz] ?? '').replace('{jahr}', String(d.jetzt.getFullYear())).replace('{name}', autor.name);
  const erwartung = { mappentypen: inhalt.typen.map((t) => t.schluessel), sichten: inhalt.sichten.map((s) => s.schluessel), beispiele: beispiele.length };
  const dateien = [
    { name: 'manifest.yaml', daten: Buffer.from(`# Erstellt mit „Paket erstellen“ im DMS. Format: https://github.com/motom001/dms-registry\n${stringify(manifest, { version: '1.1', lineWidth: 0 })}`) },
    { name: 'inhalt/mappentypen.yaml', daten: y(paketTypen) },
    { name: 'inhalt/sichten.yaml', daten: y(sortiert) },
    ...(beispiele.length ? [{ name: 'inhalt/beispiele.yaml', daten: y(beispiele) }] : []),
    { name: 'README.md', daten: Buffer.from(readme) },
    { name: 'CHANGELOG.md', daten: Buffer.from(changelog) },
    { name: 'LICENSE', daten: Buffer.from(lizenz) },
    { name: 'tests/erwartung.yaml', daten: y(erwartung) },
  ];
  return { probleme, fehlend, hinweise, abhaengigkeiten: abh, inhalt, schluessel, dateien };
}

/** Eintrag im CHANGELOG für diese Version; ohne Angabe ein Standardtext. */
const aenderungsText = (e: PaketErstellenEingabe, entwurf: PaketEntwurf | null) => e.aenderungen.trim() || (entwurf ? 'Neue Version aus dem DMS exportiert.' : 'Erste Fassung.');

/** Eingabe aus der Anfrage vereinheitlichen. */
export function liesEingabe(x: unknown): PaketErstellenEingabe {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const t = (v: unknown, max = 2000) => (typeof v === 'string' ? v.slice(0, max) : '');
  const ids = (v: unknown, max: number) => (Array.isArray(v) ? [...new Set(v.filter((s): s is string => typeof s === 'string'))].slice(0, max) : []);
  const a = (o.autor && typeof o.autor === 'object' ? o.autor : {}) as Record<string, unknown>;
  return {
    typen: ids(o.typen, 500), sichten: ids(o.sichten, 500), beispiele: ids(o.beispiele, 100),
    id: t(o.id, 40), name: t(o.name, 200), version: t(o.version, 40), beschreibung: t(o.beschreibung, 1000),
    autor: { name: t(a.name, 200), github: t(a.github, 100) }, lizenz: t(o.lizenz, 40), dms: t(o.dms, 60), aenderungen: t(o.aenderungen, 2000),
  };
}

/** Paket erstellen im DMS: Stand, Prüfung, Export; gemerkt werden die Angaben (Einstellung). */
export class Paketerstellung {
  constructor(private d: Dienst, private o: { version: () => string }) {}

  private async dmsTypen(): Promise<Map<string, string>> {
    const s = await this.d.sichereSystem();
    const a = await this.d.ablageortTyp();
    return new Map<string, string>([[s.benutzer.id, 'benutzer'], [s.rolle.id, 'rolle'], ...(a ? [[a.id, 'ablageort'] as [string, string]] : [])]);
  }

  private vorschlagDms(): string {
    const v = this.o.version().replace(/^v/, '').split('-')[0];
    return VERSION.test(v) ? `>=${v}` : '>=0.86.0';
  }

  /** Was es zur Auswahl gibt, gemerkte Entwürfe und Vorschläge für den nächsten Export. */
  async stand(): Promise<ErstellenStand> {
    const [typen, sichten, pakete, dmsTypen, entwuerfe] = [await this.d.listeTypen(), await this.d.listeSichten(), await this.d.listePakete(), await this.dmsTypen(), await this.d.paketEntwuerfe()];
    const herkunft = (map: (p: InstalliertesPaket) => Record<string, string>, id: string) => {
      const p = pakete.find((x) => Object.values(map(x)).includes(id));
      return p ? { id: p.id, name: p.name, version: p.version } : null;
    };
    const letzter = [...entwuerfe].sort((a, b) => b.exportiert.localeCompare(a.exportiert))[0];
    const leer: PaketErstellenEingabe = { typen: [], sichten: [], beispiele: [], id: '', name: '', version: '1.0.0', beschreibung: '', autor: { name: '', github: '' }, lizenz: 'MIT', dms: this.vorschlagDms(), aenderungen: '' };
    return {
      typen: typen.filter((t) => !t.system && !dmsTypen.has(t.id)).map((t) => {
        const p = pakete.find((x) => Object.values(x.typen).includes(t.id));
        return { id: t.id, name: t.name, beschreibung: t.beschreibung ?? '', paket: herkunft((x) => x.typen, t.id), geaendert: !!p && t.geaendert > (p.aktualisiert ?? p.installiert) };
      }).sort((a, b) => a.name.localeCompare(b.name, 'de')),
      sichten: sichten.map((s) => ({ id: s.id, name: s.name, elternId: s.elternId ?? null, paket: herkunft((x) => x.sichten, s.id) })),
      entwuerfe,
      dms: this.o.version(),
      vorschlag: letzter ? this.ausEntwurf(letzter) : leer,
    };
  }

  /** Angaben eines gemerkten Entwurfs mit höherer Version und aktueller DMS-Version. */
  ausEntwurf(e: PaketEntwurf): PaketErstellenEingabe {
    return { typen: e.typen, sichten: e.sichten, beispiele: e.beispiele, id: e.id, name: e.name, version: naechsteVersion(e.version), beschreibung: e.beschreibung, autor: e.autor, lizenz: e.lizenz, dms: this.vorschlagDms(), aenderungen: '' };
  }

  private async daten(e: PaketErstellenEingabe): Promise<ErstellenDaten> {
    const typen = await this.d.listeTypen();
    const gewaehlt = new Set(e.beispiele);
    const mappen = gewaehlt.size ? (await Promise.all(e.typen.filter((t) => typen.some((x) => x.id === t)).map((t) => this.d.listeMappen(t)))).flat().filter((m) => gewaehlt.has(m.id)) : [];
    return {
      typen, sichten: await this.d.listeSichten(), pakete: await this.d.listePakete(), dmsTypen: await this.dmsTypen(), mappen,
      dmsVersion: this.o.version(), entwurf: (await this.d.paketEntwuerfe()).find((x) => x.id === e.id.trim()) ?? null, jetzt: new Date(),
    };
  }

  /** Baut das Paket und prüft das Archiv wie beim Hochladen. */
  private async baueUndPruefe(e: PaketErstellenEingabe): Promise<{ bau: Bau; zip: Buffer | null; daten: ErstellenDaten }> {
    const daten = await this.daten(e);
    const bau = baue(e, daten);
    if (bau.probleme.length) return { bau, zip: null, daten };
    const id = e.id.trim();
    const zip = zipPuffer(bau.dateien.map((f) => ({ name: `${id}/${f.name}`, daten: f.daten })), daten.jetzt);
    if (zip.length > ARCHIV_MAX) { bau.probleme.push('Das Paket ist größer als 10 MB – so lässt es sich nicht hochladen. Weniger Beispiele wählen.'); return { bau, zip: null, daten }; }
    try {
      const p = liesPaket(liesZip(zip));
      if (p.manifest.id !== id || p.typen.length !== bau.inhalt.typen.length || p.sichten.length !== bau.inhalt.sichten.length) throw new Error('Inhalt weicht ab.');
    } catch (x) {
      const g = (x as Fachfehler).details as { gruende?: string[] } | undefined;
      bau.probleme.push(`Die Prüfung wie beim Hochladen schlägt fehl: ${(x as Error).message}${g?.gruende ? ` ${g.gruende.join(' ')}` : ''}`);
      return { bau, zip: null, daten };
    }
    return { bau, zip, daten };
  }

  /** Automatische Prüfung mit Hinweisen und den Mappen, aus denen Beispiele gewählt werden können. */
  async pruefe(eingabe: unknown): Promise<PaketPruefung> {
    const e = liesEingabe(eingabe);
    const { bau, zip, daten } = await this.baueUndPruefe(e);
    const eigene = daten.typen.filter((t) => e.typen.includes(t.id) && !t.system && !daten.dmsTypen.has(t.id) && !daten.pakete.some((p) => Object.values(p.typen).includes(t.id)));
    const beispielMappen = await Promise.all(eigene.map(async (t) => {
      const alle = (await this.d.listeMappen(t.id)).filter((m) => !m.systemKennung).sort((a, b) => (a.titel ?? '').localeCompare(b.titel ?? '', 'de'));
      return { typId: t.id, typ: t.name, mappen: alle.slice(0, BEISPIELMAPPEN_MAX).map((m) => ({ id: m.id, titel: m.titel || '(ohne Titel)', demo: !!m.demo })), mehr: alle.length > BEISPIELMAPPEN_MAX };
    }));
    return {
      probleme: bau.probleme, fehlend: bau.fehlend.map(({ noetig: _n, ...f }) => f), hinweise: bau.hinweise, abhaengigkeiten: bau.abhaengigkeiten,
      inhalt: bau.inhalt, beispielMappen, einspielbar: !!zip, datei: zip ? { name: `${e.id.trim()}-${e.version.trim()}.zip`, bytes: zip.length } : null,
    };
  }

  /** Export als .zip: nur, wenn die Prüfung bestanden ist; merkt die Angaben für den nächsten Export. */
  async exportiere(eingabe: unknown, von: Handelnder): Promise<{ name: string; daten: Buffer }> {
    const e = liesEingabe(eingabe);
    const { bau, zip, daten } = await this.baueUndPruefe(e);
    if (!zip) throw new Fachfehler(422, 'Das Paket lässt sich so nicht exportieren.', { gruende: bau.probleme });
    const id = e.id.trim();
    const entwurf: PaketEntwurf = {
      ...e, id, version: e.version.trim(), aenderungen: aenderungsText(e, daten.entwurf),
      schluessel: { ...(daten.entwurf?.schluessel ?? {}), ...bau.schluessel },
      verlauf: daten.entwurf ? [{ version: daten.entwurf.version, datum: daten.entwurf.exportiert.slice(0, 10), text: daten.entwurf.aenderungen || 'Aus dem DMS exportiert.' }, ...daten.entwurf.verlauf].filter((v) => vergleicheVersion(v.version, e.version.trim()) < 0).slice(0, 50) : [],
      exportiert: daten.jetzt.toISOString(), von: von.email,
    };
    const rest = (await this.d.paketEntwuerfe()).filter((x) => x.id !== id);
    await this.d.setzePaketEntwuerfe([entwurf, ...rest].slice(0, ENTWUERFE_MAX));
    log.info('Paket erstellt und exportiert', { von: von.email, paket: id, version: entwurf.version, typen: bau.inhalt.typen.length, sichten: bau.inhalt.sichten.length, beispiele: bau.inhalt.beispiele, abhaengigkeiten: Object.keys(bau.abhaengigkeiten) });
    return { name: `${id}-${entwurf.version}.zip`, daten: zip };
  }
}
