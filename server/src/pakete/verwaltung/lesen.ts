/**
 * Paket lesen (`liesPaket`): Manifest und Inhalte aus den Dateien eines Archivs; wirft mit allen Fehlern auf einmal.
 */
import { ansichtSymbol } from '../../../../shared/src/ansichtsymbole';
import { liesWortgruppe } from '../../../../shared/src/suche';
import { parse as yamlLesen } from 'yaml';
import { FELDTYPEN, type Feld } from '../../../../shared/src/model';
import { FELDMERKMALE, istFeldmerkmal, istSchreibschutz, SCHREIBSCHUTZ } from '../../../../shared/src/organisation';
import { type Beschriftungen, type TypTeile } from '../../../../shared/src/beschriftung';
import { liesMappenaktionen } from '../../paketaktionen';
import {
  BEREICH,
  WORTLISTEN_MAX,
  liesCode,
  PAKET_ID,
  VERSION,
  liesErgaenzt,
  liesErsetzt,
  punktIdFehler,
} from '../../../../shared/src/pakete';
import { paketArchivFehler, type PaketArchiv } from '../../../../shared/src/archiv';
import { undEingabeFehler } from '../../../../shared/src/automatisierung';
import {
  bereinigeVorlage,
  istKernVorlage,
  KERN_VORLAGEN,
  vorlagenEingabeFehler,
  vorlagenProbleme,
} from '../../../../shared/src/ablaufvorlagen';
import type { PaketAblaufvorlage } from '../../aufgaben';
import { istHerausgeber, SCHLUESSEL, TYP_KENNUNG, TYPVERWEIS } from '../../../../shared/src/kennungen';
import { liesReiterAngaben } from '../../../../shared/src/paketreiter';
import { liesBeschreibung } from '../../../../shared/src/paketeinstellungen';
import { Fachfehler } from '../../grundlagen/fehler';
import { t } from '../../sprache/sprache';
import { KB, VORLAGE_MAX } from '../../grundlagen/grenzen';
import { anzeigeVorgaben, liesVorgaben, vorgabeVerweisFehler } from '../index';
import { liesUmbau } from '../index';
import { liesKurzanleitung } from '../../../../shared/src/mitkommt';
import { pruefeRundgaenge, pruefeTipps } from '../../../../shared/src/entdecken';
import { ankerListe, paketTyp } from '../../entdecken/entdecken';
import { vorgabeWerte } from '../../../../shared/src/vorgaben';
import { beispielVerweise, eigeneVerweise, liesBeispielDokumente, ordneBeispiele } from './beispiele';
import {
  DMS_PRAEFIX,
  DMS_TYPEN,
  type FremderTyp,
  istDmsVerweis,
  istObjekt,
  type Paket,
  type PaketAutomatisierung,
  type PaketBeispiel,
  type PaketCodeTeil,
  type PaketFeld,
  type PaketRegister,
  type PaketSicht,
  type PaketTyp,
  paketZiele,
  str,
  typverweise,
} from './format';
import {
  anzeigenFehler,
  eingeschaltetVon,
  liesSprachteil,
  postUndRollenFehler,
  pruefeZeitplanKarten,
  sichtBedingungenFehler,
  tabellenFehler,
  teilFehler,
  vorbelegenFehler,
  werkbankKartenFehler,
  zielFehler,
  zusammengesetztFehler,
} from './inhalt-pruefen';

/** WebAssembly-Magie und Version 1. */
const WASM_KOPF = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);

const CODE_DATEI = /^code\/(modul\.wasm|daten\/[A-Za-z0-9._-]{1,80})$/;

/** Liest Manifest und Inhalte aus den Dateien eines Archivs; wirft mit allen Fehlern auf einmal. */
export function liesPaket(roh: Map<string, Buffer>): Paket {
  // Ein Ordner davor (z. B. beim selbst gepackten ZIP) stört nicht.
  let dateien = roh;
  if (!roh.has('manifest.yaml')) {
    const oben = [...roh.keys()].find((n) => /^[^/]+\/manifest\.yaml$/.test(n));
    if (oben) {
      const vor = oben.slice(0, oben.indexOf('/') + 1);
      dateien = new Map([...roh].filter(([n]) => n.startsWith(vor)).map(([n, d]) => [n.slice(vor.length), d]));
    }
  }
  const fehler: string[] = [];
  const yaml = (name: string): unknown => {
    const d = dateien.get(name);
    if (!d) {
      fehler.push(t('meldungen.pakete.fehlt-im-paket', { name }));
      return undefined;
    }
    try {
      return yamlLesen(d.toString('utf8'), { maxAliasCount: 50 });
    } catch (e) {
      fehler.push(`${name}: kein gültiges YAML (${(e as Error).message.split('\n')[0]}).`);
      return undefined;
    }
  };
  const m = yaml('manifest.yaml');
  if (!istObjekt(m))
    throw new Fachfehler(422, t('meldungen.pakete.das-paket-ist-ungueltig'), {
      gruende: fehler.length ? fehler : [t('meldungen.pakete.manifest-yaml-ist-leer')],
    });
  if (m.schema !== 1) fehler.push(t('meldungen.pakete.manifest-yaml-format-kennt', { wert: str(m.schema) || '–' }));
  if (!PAKET_ID.test(str(m.id))) fehler.push(t('meldungen.pakete.manifest-yaml-ungueltige-id'));
  if (str(m.id) === 'dms') fehler.push(t('meldungen.pakete.manifest-yaml-die-id'));
  if (!VERSION.test(str(m.version))) fehler.push(t('meldungen.pakete.manifest-yaml-ungueltige-version'));
  if (!str(m.name).trim()) fehler.push(t('meldungen.pakete.manifest-yaml-name-fehlt'));
  if (!BEREICH.test(str(m.dms))) fehler.push(t('meldungen.pakete.manifest-yaml-ungueltige-ablago'));
  const abh = istObjekt(m.abhaengigkeiten) ? m.abhaengigkeiten : {};
  for (const [k, v] of Object.entries(abh))
    if (!PAKET_ID.test(k) || !BEREICH.test(str(v))) fehler.push(t('meldungen.pakete.manifest-yaml-abhaengigkeit-ist', { k, str: str(v) }));
  // Ergänzung eines anderen Pakets (#405): steht auch unter abhaengigkeiten.
  const erg = liesErgaenzt(m.ergaenzt, abh);
  fehler.push(...erg.fehler.map((f) => `manifest.yaml: ${f}`));
  // Punkt in der Id (#1084): ergänzt das Hauptpaket – dann muss `ergaenzt` es nennen (die Registry prüft dasselbe).
  const punkt = erg.fehler.length ? null : punktIdFehler(str(m.id), erg.ergaenzt);
  if (punkt) fehler.push(`manifest.yaml: ${punkt}`);
  // Ersetzte Ids (#1084): Umzug statt Neuinstallation.
  const fr = liesErsetzt(m.ersetzt, str(m.id));
  fehler.push(...fr.fehler.map((f) => `manifest.yaml: ${f}`));
  // Herausgeber (#1084): umgedrehte Domain. Fehlt er (ältere Pakete), gilt der Herausgeber des Katalogs (standardHerausgeber).
  if (m.herausgeber !== undefined && !istHerausgeber(m.herausgeber))
    fehler.push(t('meldungen.pakete.manifest-yaml-herausgeber', { wert: str(m.herausgeber) }));
  // Sprachpaket (#731): nur Texte – kein Code, keine Mappentypen, keine anderen Dateien.
  const sprache = m.sprache !== undefined ? liesSprachteil(m, dateien, fehler) : null;
  const inhalt = istObjekt(m.inhalt) ? m.inhalt : {};
  const liste = (art: string): Record<string, unknown>[] => {
    if (!inhalt[art]) return [];
    const v = yaml(str(inhalt[art]).replace(/^\.\//, ''));
    if (v == null) return [];
    if (!Array.isArray(v) || !v.every(istObjekt)) {
      fehler.push(`${str(inhalt[art])}: erwartet eine Liste.`);
      return [];
    }
    return v;
  };
  const typen = liste('mappentypen').map((t, i): PaketTyp => {
    const wo = `mappentypen[${i + 1}]`;
    if (!SCHLUESSEL.test(str(t.schluessel))) fehler.push(`${wo}: ungültige Kennung.`);
    if (!str(t.name).trim()) fehler.push(`${wo}: Name fehlt.`);
    const felder = Array.isArray(t.felder) ? (t.felder.filter(istObjekt) as unknown as PaketFeld[]) : [];
    const register = Array.isArray(t.register) ? (t.register.filter(istObjekt) as unknown as PaketRegister[]) : [];
    for (const f of felder) {
      if (!SCHLUESSEL.test(str(f.key))) fehler.push(`${wo}: Feld mit ungültiger Kennung „${str(f.key)}“.`);
      fehler.push(...zielFehler(f, `${wo}: Feld „${f.key}“`, str(m.id)));
      // Feldart (#1035): Unbekanntes nicht still zu Text machen – meist braucht das Paket eine neuere Ablago-Version.
      if (f.typ !== undefined && !Object.hasOwn(FELDTYPEN, str(f.typ)))
        fehler.push(`${wo}: Feld „${f.key}“ hat die unbekannte Feldart „${str(f.typ)}“ (möglich: ${Object.keys(FELDTYPEN).join(', ')}).`);
      if (f.negativ !== undefined && (f.typ !== 'betrag' || typeof f.negativ !== 'boolean'))
        fehler.push(`${wo}: Feld „${f.key}“: negativ gibt es nur bei Beträgen (typ: betrag), als true oder false.`);
      // Berechnet (#1034): true oder false; nie Pflicht, nie Passwort. Das Schreibrecht prüft der Abschnitt zum Code unten.
      if (f.berechnet !== undefined && typeof f.berechnet !== 'boolean')
        fehler.push(`${wo}: Feld „${f.key}“: berechnet ist true oder false.`);
      else if (f.berechnet === true && f.pflicht)
        fehler.push(
          `${wo}: Feld „${f.key}“: Ein berechnetes Feld ist nie Pflicht – den Wert schreibt das Paket, nicht wer die Mappe anlegt.`,
        );
      else if (f.berechnet === true && f.typ === 'passwort')
        fehler.push(`${wo}: Feld „${f.key}“: Passwortfelder lassen sich nicht berechnen.`);
      // Ältere Pakete hätten berechnetVon selbst setzen können – das vergibt nur Ablago.
      delete (f as Partial<Feld>).berechnetVon;
      // Eigene Organisation (#995): `merkmal: eigeneOrganisation` nur am Ja/Nein-Feld, `schreibschutz: verwaltung`.
      if (f.merkmal !== undefined && (!istFeldmerkmal(f.merkmal) || f.typ !== 'janein'))
        fehler.push(`${wo}: Feld „${f.key}“: merkmal gibt es nur am Ja/Nein-Feld (typ: janein), möglich: ${FELDMERKMALE.join(', ')}.`);
      if (f.schreibschutz !== undefined && (!istSchreibschutz(f.schreibschutz) || f.typ === 'passwort' || f.typ === 'tabelle'))
        fehler.push(`${wo}: Feld „${f.key}“: schreibschutz ist ${SCHREIBSCHUTZ.join(', ')} – nicht an Passwort und Tabelle.`);
      fehler.push(...tabellenFehler(f, `${wo}: Feld „${f.key}“`));
      fehler.push(...zusammengesetztFehler(f, felder, `${wo}: Feld „${f.key}“`));
      // Text → Verweis (#534): aus_text nennt das bisherige Textfeld; das DMS speichert es als ausText.
      const roh = f as unknown as Record<string, unknown>;
      if (roh.aus_text !== undefined) {
        const quelle = felder.find((x) => x.key === roh.aus_text);
        if (f.typ !== 'referenz') fehler.push(`${wo}: Feld „${f.key}“: aus_text gibt es nur bei Verweisfeldern (typ: referenz).`);
        else if (!SCHLUESSEL.test(str(roh.aus_text)) || roh.aus_text === f.key)
          fehler.push(`${wo}: Feld „${f.key}“: aus_text muss die Kennung eines anderen Felds sein.`);
        else if (quelle && quelle.typ !== 'text' && quelle.typ !== 'langtext')
          fehler.push(`${wo}: Feld „${f.key}“: aus_text „${str(roh.aus_text)}“ ist kein Textfeld.`);
        else if (f.pflicht)
          fehler.push(
            `${wo}: Feld „${f.key}“: Ein Verweisfeld mit aus_text darf keine Pflicht sein – sonst passen vorhandene Mappen nach dem Update nicht mehr.`,
          );
        else if (paketZiele(f).length !== 1 || f.zielOptional?.length)
          fehler.push(`${wo}: Feld „${f.key}“: aus_text geht nur mit genau einem Zieltyp (ziel) – neue Mappen entstehen in diesem Typ.`);
        else f.ausText = str(roh.aus_text);
        delete roh.aus_text;
      }
    }
    if (felder.filter((f) => f.merkmal !== undefined).length > 1) fehler.push(`${wo}: höchstens ein Feld mit merkmal je Mappentyp.`);
    // Anzeigen, wenn … (#1033) an Feldern und Abschnitten; was im Einzelnen nicht passt, meldet der Mappentyp beim Anlegen.
    fehler.push(...anzeigenFehler(felder, register, `${wo} „${str(t.schluessel)}“`));
    if (!register.length) fehler.push(`${wo}: mindestens ein Register nötig.`);
    // Archivmodus (#1051): Schreibweise wie in der Registry; was nicht passt, verhindert die Installation.
    const archivFehler = paketArchivFehler(t.archiv, felder, wo);
    fehler.push(...archivFehler);
    const archiv = istObjekt(t.archiv) && !archivFehler.length ? (t.archiv as unknown as PaketArchiv) : undefined;
    // Beschriftungen (#728): ein Objekt Sprache → Texte; was nicht passt, bereinigt das DMS beim Anlegen.
    if (t.beschriftungen !== undefined && !istObjekt(t.beschriftungen))
      fehler.push(`${wo}: beschriftungen muss ein Objekt „Sprache → Texte“ sein.`);
    for (const x of [...felder, ...register] as unknown as Array<Record<string, unknown>>)
      if (x.beschriftungen !== undefined && !istObjekt(x.beschriftungen))
        fehler.push(`${wo}: „${str(x.key)}“: beschriftungen muss ein Objekt „Sprache → Texte“ sein.`);
    // Dokument übernehmen (#937): Angaben mit falschem Typ übergeht Ablago (wie unbekannte Felder), statt abzulehnen.
    return {
      schluessel: str(t.schluessel),
      name: str(t.name).trim(),
      beschreibung: str(t.beschreibung),
      titelVorlage: t.titelVorlage ? str(t.titelVorlage) : undefined,
      felder,
      register,
      trefferliste: Array.isArray(t.trefferliste) ? t.trefferliste.map(str) : undefined,
      ...(istObjekt(t.beschriftungen) ? { beschriftungen: t.beschriftungen as Beschriftungen<TypTeile> } : {}),
      ...(typeof t.ausPost === 'boolean' ? { ausPost: t.ausPost } : {}),
      ...(typeof t.erkennbarAn === 'string' && t.erkennbarAn.trim() ? { erkennbarAn: t.erkennbarAn.trim() } : {}),
      ...(t.gehoertZu !== undefined && t.gehoertZu !== null ? { gehoertZu: str(t.gehoertZu) } : {}),
      ...(typeof t.inSuche === 'boolean' ? { inSuche: t.inSuche } : {}),
      ...(archiv ? { archiv } : {}),
    };
  });
  // Beim Auswählen übernehmen (#1037): braucht alle Typen des Pakets.
  fehler.push(...vorbelegenFehler(typen, str(m.id)));
  // Ist Teil einer anderen Mappe (#1031): gehoertZu nennt ein passendes Verweisfeld; keine Ketten im Paket.
  for (const [i, x] of typen.entries()) fehler.push(...teilFehler(x, typen, `mappentypen[${i + 1}]`, str(m.id)));
  const sichten = liste('sichten').map((s, i): PaketSicht => {
    if (!SCHLUESSEL.test(str(s.schluessel))) fehler.push(t('meldungen.pakete.sichten-ungueltige-kennung', { wert: i + 1 }));
    if (!str(s.name).trim()) fehler.push(t('meldungen.pakete.sichten-name-fehlt', { wert: i + 1 }));
    fehler.push(...sichtBedingungenFehler(s.bedingungen, `sichten[${i + 1}] „${str(s.schluessel)}“`));
    return {
      schluessel: str(s.schluessel),
      name: str(s.name).trim(),
      beschreibung: s.beschreibung ? str(s.beschreibung) : undefined,
      eltern: s.eltern ? str(s.eltern) : undefined,
      ...(istObjekt(s.beschriftungen) ? { beschriftungen: s.beschriftungen as Beschriftungen<TypTeile> } : {}),
      typen: Array.isArray(s.typen) ? s.typen.map(str) : [],
      trefferliste: s.trefferliste ? str(s.trefferliste) : undefined,
      ...(s.fremde_typen !== undefined
        ? {
            fremdeTypen: (Array.isArray(s.fremde_typen) ? s.fremde_typen : []).map((f, j): FremderTyp => {
              const k = istObjekt(f) ? str(f.kennung) : '';
              if (!TYP_KENNUNG.test(k))
                fehler.push(t('meldungen.pakete.sichten-fremde-typen-ungueltige', { wert: i + 1, wert2: j + 1, k }));
              return { kennung: k, name: istObjekt(f) ? str(f.name).trim() || k : k };
            }),
          }
        : {}),
      // Symbol (#428): unbekannte Namen (Paket für eine neuere Version) heißen „ohne Symbol“, kein Fehler.
      symbol: ansichtSymbol(s.symbol) ?? undefined,
      bedingungen: Array.isArray(s.bedingungen)
        ? s.bedingungen.filter(istObjekt).map((b) => ({ feld: str(b.feld), operator: str(b.operator), wert: b.wert }))
        : [],
    };
  });
  const beispielDateien = new Map<string, Buffer>();
  const beispiele = liste('beispiele').map((b, i): PaketBeispiel => {
    if (b.schluessel !== undefined && !SCHLUESSEL.test(str(b.schluessel)))
      fehler.push(t('meldungen.pakete.beispiele-ungueltiger-schluessel', { wert: i + 1, str: str(b.schluessel) }));
    const dokumente = b.dokumente === undefined ? undefined : liesBeispielDokumente(b.dokumente, i + 1, dateien, beispielDateien, fehler);
    return {
      typ: str(b.typ),
      werte: istObjekt(b.werte) ? b.werte : {},
      ...(b.schluessel !== undefined ? { schluessel: str(b.schluessel) } : {}),
      ...(dokumente?.length ? { dokumente } : {}),
    };
  });
  // Beispiel-Dokumente (#878) an eigenen Mappentypen: Das Register gibt es und ist ein Dokumentenregister.
  for (const [i, b] of beispiele.entries()) {
    if (!b.dokumente?.length) continue;
    const eigen = !b.typ.includes(':') || b.typ.startsWith(`${str(m.id)}:`);
    const typ = eigen ? typen.find((x) => x.schluessel === b.typ.split(':').pop()) : undefined;
    if (!typ) continue;
    for (const d of b.dokumente) {
      const ok = d.register
        ? typ.register.some((r) => r.key === d.register && r.art === 'dokumente')
        : typ.register.some((r) => r.art === 'dokumente');
      if (!ok)
        fehler.push(t('meldungen.pakete.beispiel-dokument-ohne-register', { wert: i + 1, datei: d.datei, register: d.register ?? '–' }));
    }
  }
  // Verweise zwischen Beispielen (#347): Schlüssel eindeutig, Ziele vorhanden bzw. aus einer Abhängigkeit, keine Kreise.
  {
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
        const [p, s] = z.includes(':') ? z.split(':') : [str(m.id), z];
        if (p === str(m.id)) {
          if (!eigene.has(s)) fehler.push(t('meldungen.pakete.beispiele-verweis-auf-das', { wert: i + 1, s }));
        } else if (p === 'dms' || !(p in abh)) fehler.push(t('meldungen.pakete.beispiele-verweis-das-paket', { wert: i + 1, z, p }));
      }
    }
    if (!ordneBeispiele(beispiele.map((b) => ({ ...b, werte: eigeneVerweise(b.werte, str(m.id)) })))) {
      fehler.push(t('meldungen.pakete.beispiele-die-verweise-zwischen'));
    }
  }
  // Vorgaben (#1038): feste Kennung, eigene Typen oder Typen von Abhängigkeiten; Ergänzungen nur mit Vorlagen.
  const vt = liesVorgaben(liste('vorgaben'), { id: str(m.id), abh, typen, dateien }, fehler, `${VORLAGE_MAX / KB} KB`);
  // Umbau (#1041): Schritte im Manifest; Ziele sind eigene Typen oder Typen einer Abhängigkeit.
  const umbau = liesUmbau(m.umbau, { id: str(m.id), abh, typen }, fehler);
  const vk = { id: str(m.id), abh };
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
  // Mitgelieferte Automatisierungen (#712): Schlüssel, Name, genau eine Wenn-Karte; Typen als eigener Schlüssel oder paket:typ.
  const zeitplanKarten: string[] = [];
  const automatisierungen = liste('automatisierungen').map((a, i): PaketAutomatisierung => {
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
    if (pruefeZeitplanKarten(a, wo, str(m.id), fehler)) zeitplanKarten.push(wo);
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
  for (const k of new Set(automatisierungen.map((a) => a.schluessel).filter((x, j, l) => l.indexOf(x) !== j)))
    fehler.push(t('meldungen.pakete.automatisierungen-schluessel-doppelt', { k }));
  // Automatisierungsvorlagen (#1044): nur Karten aus der erlaubten Liste (Aufgabe/Benachrichtigung) – sonst ist das
  // Paket ungültig, auch bei einem Update (Sicherheit). Typen als eigener Schlüssel oder paket:typ einer Abhängigkeit.
  const ablaufvorlagen = liste('ablaufvorlagen').map((a, i): PaketAblaufvorlage => {
    const wo = `ablaufvorlagen[${i + 1}]`;
    if (!SCHLUESSEL.test(str(a.schluessel))) fehler.push(t('meldungen.pakete.ablaufvorlage-schluessel', { wo, wert: str(a.schluessel) }));
    if (!str(a.name).trim()) fehler.push(t('meldungen.pakete.ablaufvorlage-name', { wo }));
    if (a.ersetzt !== undefined && a.ersetzt !== null && !istKernVorlage(a.ersetzt))
      fehler.push(t('meldungen.pakete.ablaufvorlage-ersetzt', { wo, wert: str(a.ersetzt), erlaubt: KERN_VORLAGEN.join(', ') }));
    for (const g of vorlagenEingabeFehler(a)) fehler.push(`${wo}: ${g}`);
    const d = bereinigeVorlage(a);
    const vw = Array.isArray(a.typen) ? a.typen.map(str) : [];
    for (const x of vw) {
      const [pk, sl] = x.includes(':') ? x.split(':') : [str(m.id), x];
      if (!TYPVERWEIS.test(x) || (pk === str(m.id) ? !typen.some((y) => y.schluessel === sl) : !(pk in abh)))
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
  for (const k of new Set(ablaufvorlagen.map((a) => a.schluessel).filter((x, j, l) => l.indexOf(x) !== j)))
    fehler.push(t('meldungen.pakete.ablaufvorlage-doppelt', { k }));
  for (const k of new Set(ablaufvorlagen.flatMap((a) => (a.ersetzt ? [a.ersetzt] : [])).filter((x, j, l) => l.indexOf(x) !== j)))
    fehler.push(t('meldungen.pakete.ablaufvorlage-ersetzt-doppelt', { k }));
  // Wortlisten (#356): Gruppen gleichbedeutender Wörter für die Suche, z. B. - woerter: [Kfz, Auto, PKW].
  const wortlisten = liste('wortlisten')
    .map((w, i): string[] => {
      const g = liesWortgruppe(Array.isArray(w.woerter) ? w.woerter : null);
      if (!Array.isArray(w.woerter)) fehler.push(t('meldungen.pakete.wortlisten-erwartet-woerter-wort', { wert: i + 1 }));
      else if (g.fehler) fehler.push(`wortlisten[${i + 1}]: ${g.fehler}`);
      return g.woerter;
    })
    .filter((g) => g.length);
  if (wortlisten.length > WORTLISTEN_MAX) fehler.push(t('meldungen.pakete.wortlisten-hoechstens-gruppen', { WORTLISTEN_MAX }));
  // Tabellen (#1030) auf eigene Typen: Das Feld der Quelle gibt es und es verweist auf den Typ mit der Tabelle – wie bei
  // Verknüpfungsregistern; Typen anderer Pakete prüft Ablago beim Anlegen.
  for (const ty of typen) {
    for (const f of ty.felder.filter((x) => x.typ === 'tabelle' && x.quelle && TYPVERWEIS.test(str(x.quelle.typ)))) {
      const vw = str(f.quelle!.typ);
      if (vw.includes(':') && !vw.startsWith(`${str(m.id)}:`)) continue;
      const quelltyp = typen.find((x) => x.schluessel === vw.split(':').pop());
      const v = quelltyp?.felder.find((x) => x.key === f.quelle!.feld);
      const zeigt =
        !!v &&
        v.typ === 'referenz' &&
        paketZiele(v)
          .concat(v.zielOptional ?? [])
          .some((z) => z === ty.schluessel || z === `${str(m.id)}:${ty.schluessel}`);
      if (!quelltyp) fehler.push(t('meldungen.pakete.tabelle-typ', { typ: ty.name, feld: f.key, quelle: vw }));
      else if (!zeigt)
        fehler.push(t('meldungen.pakete.tabelle-feld', { typ: ty.name, feld: f.key, quelle: vw, quellfeld: f.quelle!.feld }));
    }
  }
  const doppelt = (l: string[]) => l.filter((x, i) => l.indexOf(x) !== i);
  // Rundgänge (#831) und Tipps (#832): Format, Anker, Felder und Register der eigenen Mappentypen, Grenzen – wie die Paketprüfung
  // (dms-registry #132). Mappentypen anderer Pakete nur als Abhängigkeit; ihre Felder prüft Ablago bei der Anzeige.
  const entdecken: NonNullable<Paket['entdecken']> = {};
  const typInfo = (k: string) => {
    const [pk, sl] = k.split(':');
    if (pk === str(m.id)) {
      const ty = typen.find((y) => y.schluessel === sl);
      return ty ? { kennung: k, felder: ty.felder.map((f) => str(f.key)), register: ty.register.map((g) => str(g.key)) } : null;
    }
    return pk in abh ? { kennung: k } : null;
  };
  if (inhalt.rundgaenge) {
    const roh = liste('rundgaenge');
    const r = pruefeRundgaenge(roh, { herkunft: `paket:${str(m.id)}`, anker: ankerListe(), typ: (x) => paketTyp(str(m.id), x, typInfo) });
    fehler.push(...r.fehler.map((f) => `${str(inhalt.rundgaenge)}: ${f}`));
    if (roh.length) entdecken.rundgaenge = roh;
  }
  // Tipps (#832): höchstens 20, 160 Zeichen; Ziele wie bei Rundgängen, `rundgang` nennt einen Rundgang des Pakets.
  if (inhalt.tipps) {
    const roh = liste('tipps');
    const eigeneRundgaenge = (entdecken.rundgaenge ?? []).map((x) => str((x as Record<string, unknown>).schluessel));
    const x = pruefeTipps(roh, {
      herkunft: `paket:${str(m.id)}`,
      anker: ankerListe(),
      rundgaenge: eigeneRundgaenge,
      typ: (y) => paketTyp(str(m.id), y, typInfo),
    });
    fehler.push(...x.fehler.map((f) => `${str(inhalt.tipps)}: ${f}`));
    if (roh.length) entdecken.tipps = roh;
  }
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
  // Einstellungen (#197): code.einstellungen und code.aktionen.
  const einst = liesBeschreibung(m.code);
  fehler.push(...einst.fehler.map((f) => `manifest.yaml: code.${f}`));
  // Code (#338): Manifest-Angaben, gebautes Modul und Daten.
  const cl = liesCode(
    m.code,
    [...dateien].map(([name, inhalt]) => ({ name, groesse: inhalt.length })),
  );
  // Anzeigen, Prüffunktion und Ausprobieren (#996, #1004): beschreibt das Paket, Ablago stellt dar.
  const rg = liesReiterAngaben(m.code, cl.code?.ereignisse ?? []);
  fehler.push(...rg.fehler.map((f) => `manifest.yaml: ${f}`));
  fehler.push(...cl.fehler.map((f) => (f.startsWith('code/:') ? f.slice('code/: '.length) : `manifest.yaml: ${f}`)));
  // „Paket nach Zeitplan ausführen“ (#1082): Das Paket muss das Ereignis abonnieren, sonst liefe die Karte ins Leere.
  if (zeitplanKarten.length && !cl.code?.ereignisse.includes('zeitplan.ausgefuehrt'))
    fehler.push(t('meldungen.pakete.automatisierung-paket-ereignis', { wo: [...new Set(zeitplanKarten)].join(', ') }));
  // Mappen-Ereignisse (#670): Schlüssel ohne Präfix sind eigene Mappentypen; fremde (paket:typ, dms:post) und „*“ seit #686.
  for (const k of cl.code?.mappentypen ?? [])
    if (k !== '*' && !k.includes(':') && !typen.some((t) => t.schluessel === k))
      fehler.push(t('meldungen.pakete.manifest-yaml-code-mappentypen', { k }));
  // Berechnete Felder (#1034): Den Wert schreibt der Code – er muss den eigenen Mappentyp schreiben dürfen.
  for (const ty of typen) {
    const felder = ty.felder.filter((f) => f.berechnet === true);
    if (!felder.length) continue;
    const darf = (cl.code?.rechte.schreiben ?? []).some((v) => v === '*' || v === ty.schluessel || v === `${str(m.id)}:${ty.schluessel}`);
    if (!darf)
      fehler.push(t('meldungen.pakete.berechnet-ohne-schreiben', { typ: ty.name, felder: felder.map((f) => `„${f.label}“`).join(', ') }));
  }
  // Aktionen im Menü „Mappe“ (#1039): Mappentypen des Pakets oder seiner Abhängigkeiten; mit Code nur, wenn er die
  // Mappentypen auch lesen darf (er bekommt die Werte der Mappe).
  const ma = liesMappenaktionen(m.mappenaktionen, { hatCode: !!cl.code });
  fehler.push(...ma.fehler.map((f) => `manifest.yaml: ${f}`));
  for (const a of ma.aktionen) {
    for (const vw of [...a.mappentypen, ...(a.anlegen ?? [])]) {
      const [pk, sl] = vw.includes(':') ? vw.split(':') : [str(m.id), vw];
      if (pk === str(m.id) ? !typen.some((x) => x.schluessel === sl) : !(pk in abh))
        fehler.push(t('meldungen.pakete.aktion-typ-fehlt', { aktion: a.name, typ: vw }));
    }
    if (!a.dialog && cl.code) {
      const lesen = cl.code.rechte.lesen;
      const darf = (vw: string) =>
        lesen.includes('*') ||
        lesen.includes(vw) ||
        (!vw.includes(':') && lesen.includes(`${str(m.id)}:${vw}`)) ||
        (vw.startsWith(`${str(m.id)}:`) && lesen.includes(vw.slice(str(m.id).length + 1)));
      for (const vw of a.mappentypen) if (!darf(vw)) fehler.push(t('meldungen.pakete.aktion-ohne-lesen', { aktion: a.name, typ: vw }));
    }
  }
  let code: PaketCodeTeil | null = null;
  if (cl.code) {
    const modul = dateien.get('code/modul.wasm');
    // Ohne gebautes Modul (z. B. nur Einstellungen) lässt sich das Paket installieren; es läuft dann kein Code.
    if (!modul) {
      /* Hinweis in der Vorschau */
    } else if (modul.length < 8 || !modul.subarray(0, 8).equals(WASM_KOPF)) fehler.push(t('meldungen.pakete.code-modul-wasm-ist'));
    // Andere Dateien unter code/ (Quellcode) stören nicht; geladen werden nur modul.wasm und daten/….
    if (modul)
      code = {
        info: rg.angaben ? { ...cl.code, reiter: rg.angaben } : cl.code,
        dateien: [...dateien].filter(([n]) => CODE_DATEI.test(n)).map(([n, inhalt]) => ({ name: n.slice('code/'.length), inhalt })),
      };
  }
  if (fehler.length) throw new Fachfehler(422, t('meldungen.pakete.das-paket-ist-ungueltig'), { gruende: fehler });
  return {
    manifest: {
      id: str(m.id),
      name: str(m.name).trim(),
      version: str(m.version),
      beschreibung: str(m.beschreibung),
      autor: { name: str((m.autor as Record<string, unknown>)?.name), github: str((m.autor as Record<string, unknown>)?.github) },
      lizenz: str(m.lizenz),
      dms: str(m.dms),
      abhaengigkeiten: Object.fromEntries(Object.entries(abh).map(([k, v]) => [k, str(v)])),
      ...(m.code !== undefined ? { code: m.code } : {}),
      ...(erg.ergaenzt ? { ergaenzt: erg.ergaenzt } : {}),
      ...(istHerausgeber(m.herausgeber) ? { herausgeber: m.herausgeber } : {}),
      ...(fr.ersetzt.length ? { ersetzt: fr.ersetzt } : {}),
    },
    typen,
    sichten,
    beispiele,
    wortlisten,
    automatisierungen,
    readme: dateien.get('README.md')?.toString('utf8') ?? '',
    einstellungen: einst.beschreibung,
    code,
    sprache,
    ...(beispielDateien.size ? { beispielDateien } : {}),
    ...(vt.vorgaben.length ? { vorgaben: vt.vorgaben } : {}),
    ...(vt.ergaenzungen.length ? { ergaenzungen: vt.ergaenzungen } : {}),
    ...(vt.vorlagenDateien.size ? { vorlagenDateien: vt.vorlagenDateien } : {}),
    ...(umbau.length ? { umbau } : {}),
    ...(ma.aktionen.length ? { mappenaktionen: ma.aktionen } : {}),
    ...(ablaufvorlagen.length ? { ablaufvorlagen } : {}),
    // Kurzanleitung (#1047): Ungültiges übergeht Ablago still, wie ältere Versionen das ganze Feld.
    ...(() => {
      const k = liesKurzanleitung(m.kurzanleitung);
      return k ? { kurzanleitung: k } : {};
    })(),
    ...(Object.keys(entdecken).length ? { entdecken } : {}),
  };
}
