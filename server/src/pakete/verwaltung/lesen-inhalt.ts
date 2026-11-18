/**
 * Übriger Inhalt eines Pakets lesen (#1278, Schritt 6a-2; vorher Teil von `liesPaket`): Beispiele, Vorgaben und Umbau,
 * Automatisierungen und ihre Vorlagen, Wortlisten, Tabellen, Rundgänge und Tipps sowie doppelte Kennungen. Jeder Schritt
 * sammelt seine Fehler im Lauf, in der Reihenfolge wie vorher.
 */
import { liesWortgruppe } from '../../../../shared/src/suche';
import { WORTLISTEN_MAX } from '../../../../shared/src/pakete';
import { undEingabeFehler } from '../../../../shared/src/automatisierung';
import {
  bereinigeVorlage,
  istKernVorlage,
  KERN_VORLAGEN,
  vorlagenEingabeFehler,
  vorlagenProbleme,
} from '../../../../shared/src/ablaufvorlagen';
import type { PaketAblaufvorlage } from '../../aufgaben';
import { SCHLUESSEL, TYPVERWEIS } from '../../../../shared/src/kennungen';
import { t } from '../../sprache/sprache';
import { KB, VORLAGE_MAX } from '../../grundlagen/grenzen';
import { anzeigeVorgaben, liesVorgaben, vorgabeVerweisFehler } from '../index';
import { liesUmbau } from '../index';
import { pruefeRundgaenge, pruefeTipps, type Texte } from '../../../../shared/src/entdecken';
import {
  PAKET_GRUNDSPRACHE,
  PAKET_SPRACHEN_MAX,
  PAKET_TEXTE_DATEI,
  paketGrundtexte,
  paketUebersetzung,
  pruefePaketTexte,
  type PaketTexte,
} from '../../../../shared/src/entdecken-paket';
import { ankerListe, paketTyp } from '../../entdecken/entdecken';
import { vorgabeWerte } from '../../../../shared/src/vorgaben';
import { beispielVerweise, eigeneVerweise, liesBeispielDokumente, ordneBeispiele } from './beispiele';
import {
  DMS_PRAEFIX,
  DMS_TYPEN,
  istDmsVerweis,
  istObjekt,
  type Paket,
  type PaketAutomatisierung,
  type PaketBeispiel,
  type PaketSicht,
  type PaketTyp,
  paketZiele,
  str,
  typverweise,
} from './format';
import { eingeschaltetVon, postUndRollenFehler, pruefeZeitplanKarten, werkbankKartenFehler } from './inhalt-pruefen';
import { liste, type LeseLauf } from './lesen-lauf';

/** So groß höchstens ist die Sprachdatei der Rundgänge und Tipps eines Pakets (#1307). */
const PAKET_TEXTE_GROESSE = 64 * KB;

/** Beispiele mit ihren Dokumenten; danach Dokumentenregister und Verweise zwischen den Beispielen. */
export function liesBeispiele(l: LeseLauf, typen: PaketTyp[]) {
  const { fehler } = l;
  const beispielDateien = new Map<string, Buffer>();
  const beispiele = liste(l, 'beispiele').map((b, i): PaketBeispiel => {
    if (b.schluessel !== undefined && !SCHLUESSEL.test(str(b.schluessel)))
      fehler.push(t('meldungen.pakete.beispiele-ungueltiger-schluessel', { wert: i + 1, str: str(b.schluessel) }));
    const dokumente = b.dokumente === undefined ? undefined : liesBeispielDokumente(b.dokumente, i + 1, l.dateien, beispielDateien, fehler);
    return {
      typ: str(b.typ),
      werte: istObjekt(b.werte) ? b.werte : {},
      ...(b.schluessel !== undefined ? { schluessel: str(b.schluessel) } : {}),
      ...(dokumente?.length ? { dokumente } : {}),
    };
  });
  pruefeBeispielDokumente(l, typen, beispiele);
  pruefeBeispielVerweise(l, beispiele);
  return { beispiele, beispielDateien };
}

/** Beispiel-Dokumente (#878) an eigenen Mappentypen: Das Register gibt es und ist ein Dokumentenregister. */
function pruefeBeispielDokumente(l: LeseLauf, typen: PaketTyp[], beispiele: PaketBeispiel[]) {
  for (const [i, b] of beispiele.entries()) {
    if (!b.dokumente?.length) continue;
    const eigen = !b.typ.includes(':') || b.typ.startsWith(`${l.id}:`);
    const typ = eigen ? typen.find((x) => x.schluessel === b.typ.split(':').pop()) : undefined;
    if (!typ) continue;
    for (const d of b.dokumente) {
      const ok = d.register
        ? typ.register.some((r) => r.key === d.register && r.art === 'dokumente')
        : typ.register.some((r) => r.art === 'dokumente');
      if (!ok)
        l.fehler.push(t('meldungen.pakete.beispiel-dokument-ohne-register', { wert: i + 1, datei: d.datei, register: d.register ?? '–' }));
    }
  }
}

/** Verweise zwischen Beispielen (#347): Schlüssel eindeutig, Ziele vorhanden bzw. aus einer Abhängigkeit, keine Kreise. */
function pruefeBeispielVerweise(l: LeseLauf, beispiele: PaketBeispiel[]) {
  const { fehler, abh } = l;
  const eigene = new Set(beispiele.map((b) => b.schluessel).filter((s): s is string => !!s));
  const schl = beispiele.map((b) => b.schluessel).filter((s): s is string => !!s);
  for (const s of new Set(schl.filter((x, j) => schl.indexOf(x) !== j)))
    fehler.push(t('meldungen.pakete.beispiele-schluessel-doppelt', { s }));
  for (const [i, b] of beispiele.entries()) {
    for (const z of beispielVerweise(b.werte)) {
      if (!TYPVERWEIS.test(z)) {
        fehler.push(t('meldungen.pakete.beispiele-verweis-ist-kein', { wert: i + 1, z }));
        continue;
      }
      const [p, s] = z.includes(':') ? z.split(':') : [l.id, z];
      if (p === l.id) {
        if (!eigene.has(s)) fehler.push(t('meldungen.pakete.beispiele-verweis-auf-das', { wert: i + 1, s }));
      } else if (p === 'dms' || !(p in abh)) fehler.push(t('meldungen.pakete.beispiele-verweis-das-paket', { wert: i + 1, z, p }));
    }
  }
  if (!ordneBeispiele(beispiele.map((b) => ({ ...b, werte: eigeneVerweise(b.werte, l.id) })))) {
    fehler.push(t('meldungen.pakete.beispiele-die-verweise-zwischen'));
  }
}

/**
 * Vorgaben (#1038) und Umbau (#1041), danach die Verweise auf Vorgaben aus Beispielen und aus „Anzeigen, wenn …“.
 * Vorgaben: feste Kennung, eigene Typen oder Typen von Abhängigkeiten; Ergänzungen nur mit Vorlagen. Umbau: Schritte im
 * Manifest; Ziele sind eigene Typen oder Typen einer Abhängigkeit.
 */
export function liesVorgabenUndUmbau(l: LeseLauf, typen: PaketTyp[], beispiele: PaketBeispiel[]) {
  const { fehler, abh, m } = l;
  const vt = liesVorgaben(liste(l, 'vorgaben'), { id: l.id, abh, typen, dateien: l.dateien }, fehler, `${VORLAGE_MAX / KB} KB`);
  const umbau = liesUmbau(m.umbau, { id: l.id, abh, typen }, fehler);
  const vk = { id: l.id, abh };
  for (const [i, b] of beispiele.entries())
    fehler.push(...vorgabeVerweisFehler(vorgabeWerte(b.werte), `beispiele[${i + 1}]`, vt.vorgaben, vk));
  // Anzeigen, wenn … (#1033) „Verweis zeigt auf eine bestimmte Mappe“ über die Kennung einer Vorgabe: an einem Verweisfeld.
  for (const ty of typen) {
    for (const b of anzeigeVorgaben(ty)) {
      const wo = `mappentypen „${ty.schluessel}“, anzeigen`;
      if (ty.felder.find((f) => f.key === b.feld)?.typ !== 'referenz')
        fehler.push(t('meldungen.pakete.vorgaben.bedingung-feld', { wo, feld: b.feld }));
      if (!b.verweise.length) fehler.push(t('meldungen.pakete.vorgaben.bedingung-leer', { wo, feld: b.feld }));
      fehler.push(...vorgabeVerweisFehler(b.verweise, wo, vt.vorgaben, vk));
    }
  }
  return { vt, umbau };
}

/**
 * Mitgelieferte Automatisierungen (#712): Schlüssel, Name, genau eine Wenn-Karte; Typen als eigener Schlüssel oder
 * paket:typ. `zeitplanKarten`: wo die Karte „Paket nach Zeitplan ausführen“ steht (braucht das Ereignis im Code).
 */
export function liesAutomatisierungen(l: LeseLauf) {
  const { fehler } = l;
  const zeitplanKarten: string[] = [];
  const automatisierungen = liste(l, 'automatisierungen').map((a, i): PaketAutomatisierung => {
    const wo = `automatisierungen[${i + 1}]`;
    if (!SCHLUESSEL.test(str(a.schluessel))) fehler.push(`${wo}: ungültiger Schlüssel „${str(a.schluessel)}“.`);
    if (!str(a.name).trim()) fehler.push(`${wo}: Name fehlt.`);
    if (!istObjekt(a.wenn)) fehler.push(`${wo}: wenn fehlt (genau eine Karte).`);
    if (!Array.isArray(a.dann) || !a.dann.length) fehler.push(`${wo}: dann braucht mindestens eine Karte.`);
    const typ = istObjekt(a.wenn) && a.wenn.typ != null ? str(a.wenn.typ) : '';
    if (typ && !TYPVERWEIS.test(typ)) fehler.push(`${wo}: wenn.typ „${typ}“ ist kein gültiger Mappentyp-Verweis.`);
    fehler.push(...postUndRollenFehler(a, typ, wo));
    const empf = (Array.isArray(a.dann) ? a.dann : [])
      .filter(istObjekt)
      .flatMap((k) => (Array.isArray(k.empfaenger) ? k.empfaenger : []))
      .filter(istObjekt);
    if (istObjekt(a.wenn) && a.wenn.rolle)
      fehler.push(`${wo}: wenn.rolle – feste Rollen gibt es in Paketen nicht; „für jeden Benutzer“ gilt für alle aktiven Benutzer.`);
    if (empf.some((e) => e.art === 'person' || e.art === 'rolle'))
      fehler.push(`${wo}: feste Personen und Rollen gibt es in Paketen nicht – Empfänger aus einem Feld oder der Ersteller der Mappe.`);
    fehler.push(...werkbankKartenFehler(a, wo));
    if (pruefeZeitplanKarten(a, wo, l.id, fehler)) zeitplanKarten.push(wo);
    // Und-Teil (#1108): falsch geschriebene Bedingungen sind ein Fehler – sonst liefe die Automatisierung öfter als gedacht.
    for (const grund of undEingabeFehler(a.und)) fehler.push(`${wo} „${str(a.schluessel)}“: ${grund}`);
    return {
      schluessel: str(a.schluessel),
      name: str(a.name).trim(),
      beschreibung: str(a.beschreibung ?? ''),
      wenn: istObjekt(a.wenn) ? a.wenn : {},
      und: istObjekt(a.und) ? a.und : undefined,
      dann: Array.isArray(a.dann) ? a.dann : [],
      ...eingeschaltetVon(a),
    };
  });
  for (const k of new Set(automatisierungen.map((a) => a.schluessel).filter((x, j, alle) => alle.indexOf(x) !== j)))
    fehler.push(t('meldungen.pakete.automatisierungen-schluessel-doppelt', { k }));
  return { automatisierungen, zeitplanKarten };
}

/**
 * Automatisierungsvorlagen (#1044): nur Karten aus der erlaubten Liste (Aufgabe/Benachrichtigung) – sonst ist das Paket
 * ungültig, auch bei einem Update (Sicherheit). Typen als eigener Schlüssel oder paket:typ einer Abhängigkeit.
 */
export function liesAblaufvorlagen(l: LeseLauf, typen: PaketTyp[]): PaketAblaufvorlage[] {
  const { fehler, abh } = l;
  const ablaufvorlagen = liste(l, 'ablaufvorlagen').map((a, i): PaketAblaufvorlage => {
    const wo = `ablaufvorlagen[${i + 1}]`;
    if (!SCHLUESSEL.test(str(a.schluessel))) fehler.push(t('meldungen.pakete.ablaufvorlage-schluessel', { wo, wert: str(a.schluessel) }));
    if (!str(a.name).trim()) fehler.push(t('meldungen.pakete.ablaufvorlage-name', { wo }));
    if (a.ersetzt !== undefined && a.ersetzt !== null && !istKernVorlage(a.ersetzt))
      fehler.push(t('meldungen.pakete.ablaufvorlage-ersetzt', { wo, wert: str(a.ersetzt), erlaubt: KERN_VORLAGEN.join(', ') }));
    for (const g of vorlagenEingabeFehler(a)) fehler.push(`${wo}: ${g}`);
    const d = bereinigeVorlage(a);
    const vw = Array.isArray(a.typen) ? a.typen.map(str) : [];
    for (const x of vw) {
      const [pk, sl] = x.includes(':') ? x.split(':') : [l.id, x];
      if (!TYPVERWEIS.test(x) || (pk === l.id ? !typen.some((y) => y.schluessel === sl) : !(pk in abh)))
        fehler.push(t('meldungen.pakete.ablaufvorlage-typ', { wo, typ: x }));
    }
    // Aufbau prüfen wie im Editor; Felder als Empfänger nur mit Mappentypen des Pakets (geprüft beim Anlegen).
    const ohneFeld = {
      ...d,
      typen: [],
      karten: d.karten.map((k) => ({ ...k, empfaenger: k.empfaenger.map((e) => (e.art === 'feld' ? { art: 'selbst' as const } : e)) })),
    };
    for (const g of vorlagenProbleme(ohneFeld, [])) fehler.push(`${wo}: ${g}`);
    if (!vw.length && d.karten.some((k) => k.empfaenger.some((e) => e.art === 'feld')))
      fehler.push(t('meldungen.pakete.ablaufvorlage-feld', { wo }));
    return { schluessel: str(a.schluessel), ersetzt: istKernVorlage(a.ersetzt) ? a.ersetzt : null, daten: a };
  });
  for (const k of new Set(ablaufvorlagen.map((a) => a.schluessel).filter((x, j, alle) => alle.indexOf(x) !== j)))
    fehler.push(t('meldungen.pakete.ablaufvorlage-doppelt', { k }));
  for (const k of new Set(ablaufvorlagen.flatMap((a) => (a.ersetzt ? [a.ersetzt] : [])).filter((x, j, alle) => alle.indexOf(x) !== j)))
    fehler.push(t('meldungen.pakete.ablaufvorlage-ersetzt-doppelt', { k }));
  return ablaufvorlagen;
}

/** Wortlisten (#356): Gruppen gleichbedeutender Wörter für die Suche, z. B. - woerter: [Kfz, Auto, PKW]. */
export function liesWortlisten(l: LeseLauf): string[][] {
  const { fehler } = l;
  const wortlisten = liste(l, 'wortlisten')
    .map((w, i): string[] => {
      const g = liesWortgruppe(Array.isArray(w.woerter) ? w.woerter : null);
      if (!Array.isArray(w.woerter)) fehler.push(t('meldungen.pakete.wortlisten-erwartet-woerter-wort', { wert: i + 1 }));
      else if (g.fehler) fehler.push(`wortlisten[${i + 1}]: ${g.fehler}`);
      return g.woerter;
    })
    .filter((g) => g.length);
  if (wortlisten.length > WORTLISTEN_MAX) fehler.push(t('meldungen.pakete.wortlisten-hoechstens-gruppen', { WORTLISTEN_MAX }));
  return wortlisten;
}

/**
 * Tabellen (#1030) auf eigene Typen: Das Feld der Quelle gibt es und es verweist auf den Typ mit der Tabelle – wie bei
 * Verknüpfungsregistern; Typen anderer Pakete prüft Ablago beim Anlegen.
 */
export function pruefeTabellen(l: LeseLauf, typen: PaketTyp[]) {
  for (const ty of typen) {
    for (const f of ty.felder.filter((x) => x.typ === 'tabelle' && x.quelle && TYPVERWEIS.test(str(x.quelle.typ)))) {
      const vw = str(f.quelle!.typ);
      if (vw.includes(':') && !vw.startsWith(`${l.id}:`)) continue;
      const quelltyp = typen.find((x) => x.schluessel === vw.split(':').pop());
      const v = quelltyp?.felder.find((x) => x.key === f.quelle!.feld);
      const zeigt =
        !!v &&
        v.typ === 'referenz' &&
        paketZiele(v)
          .concat(v.zielOptional ?? [])
          .some((z) => z === ty.schluessel || z === `${l.id}:${ty.schluessel}`);
      if (!quelltyp) l.fehler.push(t('meldungen.pakete.tabelle-typ', { typ: ty.name, feld: f.key, quelle: vw }));
      else if (!zeigt)
        l.fehler.push(t('meldungen.pakete.tabelle-feld', { typ: ty.name, feld: f.key, quelle: vw, quellfeld: f.quelle!.feld }));
    }
  }
}

/**
 * Rundgänge (#831) und Tipps (#832): Format, Anker, Felder und Register der eigenen Mappentypen, Grenzen – wie die
 * Paketprüfung (dms-registry #132). Mappentypen anderer Pakete nur als Abhängigkeit; ihre Felder prüft Ablago bei der Anzeige.
 */
export function liesEntdecken(l: LeseLauf, typen: PaketTyp[]): NonNullable<Paket['entdecken']> {
  const { fehler, inhalt, abh } = l;
  const entdecken: NonNullable<Paket['entdecken']> = {};
  const typInfo = (k: string) => {
    const [pk, sl] = k.split(':');
    if (pk === l.id) {
      const ty = typen.find((y) => y.schluessel === sl);
      return ty ? { kennung: k, felder: ty.felder.map((f) => str(f.key)), register: ty.register.map((g) => str(g.key)) } : null;
    }
    return pk in abh ? { kennung: k } : null;
  };
  // Texte je Sprache (#1307): texte/<sprache>/entdecken.json; geprüft wird jede Sprache wie die Grundsprache.
  const texte = inhalt.rundgaenge || inhalt.tipps ? liesPaketTexte(l) : {};
  const sprachen = [null, ...Object.keys(texte).filter((x) => x !== PAKET_GRUNDSPRACHE)];
  const pruefe = (art: 'rundgaenge' | 'tipps', f: (uebersetzung: Texte | undefined) => string[]) => {
    const gesehen = new Set<string>();
    for (const spr of sprachen)
      for (const x of f(spr ? paketUebersetzung(texte, spr) : undefined)) {
        if (gesehen.has(x)) continue;
        gesehen.add(x);
        fehler.push(`${spr ? `texte/${spr}/entdecken.json` : str(inhalt[art])}: ${x}`);
      }
  };
  const grund = paketGrundtexte(texte);
  if (inhalt.rundgaenge) {
    const roh = liste(l, 'rundgaenge');
    pruefe(
      'rundgaenge',
      (uebersetzung) =>
        pruefeRundgaenge(roh, {
          herkunft: `paket:${l.id}`,
          anker: ankerListe(),
          texte: grund,
          uebersetzung,
          typ: (x) => paketTyp(l.id, x, typInfo),
        }).fehler,
    );
    if (roh.length) entdecken.rundgaenge = roh;
  }
  // Tipps (#832): höchstens 20, 160 Zeichen; Ziele wie bei Rundgängen, `rundgang` nennt einen Rundgang des Pakets.
  if (inhalt.tipps) {
    const roh = liste(l, 'tipps');
    const eigeneRundgaenge = (entdecken.rundgaenge ?? []).map((x) => str((x as Record<string, unknown>).schluessel));
    pruefe(
      'tipps',
      (uebersetzung) =>
        pruefeTipps(roh, {
          herkunft: `paket:${l.id}`,
          anker: ankerListe(),
          rundgaenge: eigeneRundgaenge,
          texte: grund,
          uebersetzung,
          typ: (y) => paketTyp(l.id, y, typInfo),
        }).fehler,
    );
    if (roh.length) entdecken.tipps = roh;
  }
  for (const u of pruefePaketTexte(texte, entdecken.rundgaenge, entdecken.tipps).ueberzaehlig)
    fehler.push(
      t('meldungen.pakete.entdecken.texte-ueberzaehlig', {
        datei: `texte/${u.sprache}/entdecken.json`,
        schluessel: u.schluessel.join(', '),
      }),
    );
  if (Object.keys(texte).length) entdecken.texte = texte;
  return entdecken;
}

/** Sprachdateien der Rundgänge und Tipps (#1307): flache JSON-Objekte mit Texten, höchstens 64 KB und 30 Sprachen. */
function liesPaketTexte(l: LeseLauf): PaketTexte {
  const texte: PaketTexte = {};
  const dateien = [...l.dateien.keys()].filter((n) => PAKET_TEXTE_DATEI.test(n)).sort();
  if (dateien.length > PAKET_SPRACHEN_MAX) l.fehler.push(t('meldungen.pakete.entdecken.texte-sprachen', { max: PAKET_SPRACHEN_MAX }));
  for (const datei of dateien.slice(0, PAKET_SPRACHEN_MAX)) {
    const d = l.dateien.get(datei)!;
    if (d.length > PAKET_TEXTE_GROESSE) {
      l.fehler.push(t('meldungen.pakete.entdecken.texte-gross', { datei, kb: PAKET_TEXTE_GROESSE / KB }));
      continue;
    }
    let j: unknown;
    try {
      j = JSON.parse(d.toString('utf8'));
    } catch {
      j = null;
    }
    if (!istObjekt(j) || Object.values(j).some((v) => typeof v !== 'string')) {
      l.fehler.push(t('meldungen.pakete.entdecken.texte-format', { datei }));
      continue;
    }
    texte[PAKET_TEXTE_DATEI.exec(datei)![1]] = j as Record<string, string>;
  }
  return texte;
}

/** Doppelte Kennungen von Typen und Ansichten; Verweise auf Mappentypen des DMS (dms:…), die es nicht gibt. */
export function pruefeKennungen(l: LeseLauf, typen: PaketTyp[], sichten: PaketSicht[]) {
  const { fehler } = l;
  const doppelt = (x: string[]) => x.filter((y, i) => x.indexOf(y) !== i);
  for (const s of doppelt(typen.map((t) => t.schluessel))) fehler.push(t('meldungen.pakete.mappentypen-kennung-doppelt', { s }));
  for (const s of doppelt(sichten.map((t) => t.schluessel))) fehler.push(t('meldungen.pakete.sichten-kennung-doppelt', { s }));
  for (const vw of new Set(typverweise(typen, sichten).filter(istDmsVerweis))) {
    if (!DMS_TYPEN[vw.slice(DMS_PRAEFIX.length)])
      fehler.push(
        t('meldungen.pakete.verweis-diesen-mappentyp-bringt', {
          vw,
          map: Object.keys(DMS_TYPEN)
            .map((k) => DMS_PRAEFIX + k)
            .join(', '),
        }),
      );
  }
}
