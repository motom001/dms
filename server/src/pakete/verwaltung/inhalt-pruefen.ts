/**
 * Prüfungen beim Lesen eines Pakets: Ziele, Tabellen, vorbelegen, Teile, Anzeigen, Bedingungen, Karten, Sprachteil.
 */
import { parse as yamlLesen } from 'yaml';
import { ZIELTYPEN_MAX, type Feld } from '../../../../shared/src/model';
import { anzeigeEingabeFehler } from '../../../../shared/src/anzeige';
import { TABELLE_NEU_MAX } from '../../../../shared/src/tabelle';
import { zusammengesetztProbleme } from '../../../../shared/src/zusammengesetzt';
import { DMS_POST, istAussenKarte } from '../../../../shared/src/automatisierung';
import { bereinigeVorbelegen, passtZusammen, VORBELEGEN_MAX } from '../../../../shared/src/vorbelegen';
import { istBetriebWenn } from '../../../../shared/src/ereignisse';
import { PAKET_ID_TEIL, SCHLUESSEL, TYPVERWEIS } from '../../../../shared/src/kennungen';
import { bedingungEingabeFehler, OPERATOREN, type Bedingung, type Operator } from '../../../../shared/src/sichten';
import { Fachfehler } from '../../fehler';
import { t } from '../../sprache';
import { DEUTSCH } from '../../../../shared/src/deutsch';
import {
  BESCHRIFTUNGEN_ORDNER,
  liesSprachangabe,
  liesSprachBeschriftung,
  pruefeSprachtexte,
  TEXTE_ORDNER,
  type SprachBeschriftung,
} from '../../../../shared/src/sprachpaket';
import { istDmsVerweis, istObjekt, type PaketFeld, type PaketRegister, type PaketSprache, type PaketTyp, paketZiele, str } from './format';

/**
 * Werkbank-Karten (#677) nur in der Werkbank: Pakete bringen weder Betriebs-Auslöser noch „Sicherung anstoßen“ mit –
 * und keinen „Aufruf von außen“ (#679).
 */
export function werkbankKartenFehler(a: Record<string, unknown>, wo: string): string[] {
  const f: string[] = [];
  const wenn = istObjekt(a.wenn) && typeof a.wenn.art === 'string' ? a.wenn.art : '';
  if (istBetriebWenn(wenn)) f.push(t('meldungen.pakete.automatisierung-werkbank-wenn', { wo, art: wenn }));
  // Aufruf von außen (#679): eine Adresse ohne Anmeldung legt nur die Verwaltung selbst an, nie ein Paket.
  if (wenn === 'aufruf') f.push(t('meldungen.pakete.automatisierung-aufruf', { wo }));
  if ((Array.isArray(a.dann) ? a.dann : []).some((k) => istObjekt(k) && k.art === 'sicherung'))
    f.push(t('meldungen.pakete.automatisierung-werkbank-dann', { wo }));
  // Karten nach außen (#671): „URL aufrufen“ und „E-Mail senden“ richtet nur die Verwaltung selbst ein – Ausleiten bleibt
  // eine bewusste Entscheidung, die die Rechte-Vorschau eines Pakets nicht abbilden kann.
  if (
    [...(Array.isArray(a.dann) ? a.dann : []), ...(Array.isArray(a.sonst) ? a.sonst : [])].some(
      (k) => istObjekt(k) && typeof k.art === 'string' && istAussenKarte({ art: k.art }),
    )
  )
    f.push(t('meldungen.pakete.automatisierung-aussen', { wo }));
  return f;
}

/**
 * Ziele eines Paketfelds prüfen (#1036): `ziel` ein Typverweis oder eine Liste; `zielOptional` nur „paket:schluessel“
 * eines anderen Pakets; ein Verweisfeld braucht eins von beiden; `gleicherTyp` nur an Verweisen.
 */
export function zielFehler(f: PaketFeld, wo: string, paketId: string): string[] {
  const ref = f.typ === 'referenz';
  const opt = f.zielOptional;
  const fehler = [...festeZielFehler(f, wo), ...optionaleZielFehler(f, wo, paketId)];
  if (ref && !paketZiele(f).length && !(Array.isArray(opt) && opt.length))
    fehler.push(`${wo}: Verweisfeld ohne ziel und ohne zielOptional.`);
  if (f.gleicherTyp !== undefined && (!ref || typeof f.gleicherTyp !== 'boolean'))
    fehler.push(`${wo}: gleicherTyp gibt es nur bei Verweisfeldern, als true oder false.`);
  return fehler;
}

function festeZielFehler(f: PaketFeld, wo: string): string[] {
  if (f.ziel === undefined) return [];
  const fehler: string[] = [];
  const ziele = Array.isArray(f.ziel) ? f.ziel : [f.ziel];
  for (const z of ziele) if (!TYPVERWEIS.test(str(z))) fehler.push(`${wo} verweist ungültig auf „${str(z)}“.`);
  if (!ziele.length) fehler.push(`${wo}: ziel ist eine leere Liste – ohne Zieltyp weglassen oder zielOptional nutzen.`);
  if (ziele.length > ZIELTYPEN_MAX) fehler.push(`${wo}: höchstens ${ZIELTYPEN_MAX} Zieltypen.`);
  if (f.typ !== 'referenz') fehler.push(`${wo}: ziel gibt es nur bei Verweisfeldern (typ: referenz).`);
  return fehler;
}

function optionaleZielFehler(f: PaketFeld, wo: string, paketId: string): string[] {
  const opt = f.zielOptional;
  if (opt === undefined) return [];
  const fehler: string[] = [];
  const ref = f.typ === 'referenz';
  if (!ref) fehler.push(`${wo}: zielOptional gibt es nur bei Verweisfeldern (typ: referenz).`);
  if (!Array.isArray(opt)) fehler.push(`${wo}: zielOptional muss eine Liste sein.`);
  if (Array.isArray(opt) && opt.length > ZIELTYPEN_MAX) fehler.push(`${wo}: höchstens ${ZIELTYPEN_MAX} optionale Zieltypen.`);
  for (const k of (Array.isArray(opt) ? opt : []).map(str)) {
    if (!k.includes(':') || !TYPVERWEIS.test(k) || istDmsVerweis(k))
      fehler.push(`${wo}: zielOptional „${k}“ muss ein Mappentyp eines anderen Pakets sein (paket:schluessel).`);
    else if (k.startsWith(`${paketId}:`))
      fehler.push(`${wo}: zielOptional „${k}“ ist ein Typ dieses Pakets – eigene Typen gehören unter ziel.`);
  }
  return fehler;
}

/**
 * Dateien, die ein Sprachpaket enthalten darf (#731): nur Texte. Alles andere – Code, Programme, Bilder, Inhalte – lehnt
 * Ablago ab, damit ein Sprachpaket nie mehr kann, als Texte zu liefern.
 */
const SPRACHPAKET_DATEI = new RegExp(
  String.raw`^(manifest\.yaml|README(\.[a-z]{2})?\.md|LICENSE(\.[A-Za-z]{1,10})?|NOTICE|CHANGELOG\.md|tests\/[A-Za-z0-9._-]{1,80}\.(ya?ml|json|md)|texte\/[a-z][a-z0-9-]{0,40}\.json|beschriftungen\/${PAKET_ID_TEIL}\.yaml)$`,
);

/** Liest den Teil „Sprache“ eines Pakets (#731); Fehler landen in `fehler`. */
export function liesSprachteil(m: Record<string, unknown>, dateien: Map<string, Buffer>, fehler: string[]): PaketSprache | null {
  const la = liesSprachangabe(m.sprache);
  fehler.push(...la.fehler.map((f) => `manifest.yaml: ${f}`));
  if (m.code !== undefined) fehler.push(t('meldungen.sprachpakete.kein-code'));
  if (istObjekt(m.inhalt) && Object.keys(m.inhalt).length) fehler.push(t('meldungen.sprachpakete.kein-inhalt'));
  if (m.ergaenzt !== undefined || (istObjekt(m.abhaengigkeiten) && Object.keys(m.abhaengigkeiten).length))
    fehler.push(t('meldungen.sprachpakete.keine-abhaengigkeiten'));
  for (const name of dateien.keys()) if (!SPRACHPAKET_DATEI.test(name)) fehler.push(t('meldungen.sprachpakete.fremde-datei', { name }));
  const roh: Record<string, unknown> = {};
  const beschriftungen: Record<string, SprachBeschriftung> = {};
  for (const [name, d] of dateien) {
    if (!SPRACHPAKET_DATEI.test(name)) continue;
    if (name.startsWith(TEXTE_ORDNER)) {
      try {
        roh[name.slice(TEXTE_ORDNER.length, -'.json'.length)] = JSON.parse(d.toString('utf8'));
      } catch {
        fehler.push(t('meldungen.sprachpakete.kein-json', { name }));
      }
    } else if (name.startsWith(BESCHRIFTUNGEN_ORDNER)) {
      let y: unknown;
      try {
        y = yamlLesen(d.toString('utf8'), { maxAliasCount: 50 });
      } catch (e) {
        fehler.push(`${name}: kein gültiges YAML (${(e as Error).message.split('\n')[0]}).`);
        continue;
      }
      const b = liesSprachBeschriftung(y, name);
      fehler.push(...b.fehler);
      beschriftungen[name.slice(BESCHRIFTUNGEN_ORDNER.length, -'.yaml'.length)] = b.beschriftung;
    }
  }
  const p = pruefeSprachtexte(DEUTSCH, roh);
  fehler.push(...p.fehler);
  if (!Object.keys(p.texte).length && !Object.keys(beschriftungen).length) fehler.push(t('meldungen.sprachpakete.leer'));
  return la.angabe ? { angabe: la.angabe, texte: p.texte, uebergangen: p.uebergangen, beschriftungen } : null;
}

/**
 * Mitgelieferte Automatisierung (#1082): `eingeschaltet` ist true oder false; die Karte „Paket nach Zeitplan ausführen“
 * ruft nur das Paket selbst (Sicherheit), mit gültiger Aufgabe und nur mit der Wenn-Karte „Zeitplan“ (nicht je Benutzer).
 * true, wenn die Automatisierung diese Karte hat (dann braucht das Paket das Ereignis).
 */
export const eingeschaltetVon = (a: Record<string, unknown>) =>
  typeof a.eingeschaltet === 'boolean' ? { eingeschaltet: a.eingeschaltet } : {};

export function pruefeZeitplanKarten(a: Record<string, unknown>, wo: string, paketId: string, fehler: string[]): boolean {
  if (a.eingeschaltet !== undefined && typeof a.eingeschaltet !== 'boolean')
    fehler.push(t('meldungen.pakete.automatisierung-eingeschaltet', { wo }));
  const karten = (Array.isArray(a.dann) ? a.dann : []).filter(istObjekt).filter((x) => x.art === 'paket');
  for (const k of karten) {
    if (k.paket !== undefined && k.paket !== paketId)
      fehler.push(t('meldungen.pakete.automatisierung-paket-fremd', { wo, paket: str(k.paket) }));
    if (k.aufgabe !== undefined && k.aufgabe !== null && !SCHLUESSEL.test(str(k.aufgabe)))
      fehler.push(t('meldungen.pakete.automatisierung-paket-aufgabe', { wo, aufgabe: str(k.aufgabe) }));
  }
  const zeitplan = istObjekt(a.wenn) && a.wenn.art === 'zeitplan' && a.wenn.jeBenutzer !== true;
  if (karten.length && !zeitplan) fehler.push(t('meldungen.pakete.automatisierung-paket-zeitplan', { wo }));
  return karten.length > 0;
}

/**
 * #1001: Von Ablago gibt es in mitgelieferten Automatisierungen nur die Post (`dms:post`, „Post für dich“) – andere Typen
 * von Ablago haben keine Mappen-Ereignisse für Pakete. Feste Rollen an „Favoriten-Änderungen melden“ gibt es nicht.
 */
export function postUndRollenFehler(a: Record<string, unknown>, typ: string, wo: string): string[] {
  const f: string[] = [];
  if (typ.startsWith('dms:') && typ !== DMS_POST) f.push(t('meldungen.pakete.automatisierung-dms-typ', { wo, typ }));
  const karten = (Array.isArray(a.dann) ? a.dann : []).filter(istObjekt);
  if (karten.some((k) => k.art === 'favoriten' && Array.isArray(k.rollen) && k.rollen.length))
    f.push(t('meldungen.pakete.automatisierung-favoriten-rollen', { wo }));
  return f;
}

/**
 * Feldart Zusammengesetzt (#1050) im Paket: `vorlage` nur bei `typ: zusammengesetzt` und dort Pflicht (höchstens
 * VORLAGE_MAX Zeichen, Platzhalter aus geeigneten Feldern desselben Typs); nie berechnet, nie Pflicht. Die Kennung setzt
 * das Paket nicht – Ablago berechnet sie beim Speichern (gesendete Werte zählen nicht), bei Doppelung kommt 422.
 */
export function zusammengesetztFehler(f: PaketFeld, felder: PaketFeld[], wo: string): string[] {
  const v = (f as unknown as Record<string, unknown>).vorlage;
  if (f.typ !== 'zusammengesetzt')
    return v === undefined ? [] : [`${wo}: vorlage gibt es nur bei zusammengesetzten Feldern (typ: zusammengesetzt).`];
  if (typeof v !== 'string' || !v.trim()) return [`${wo}: Ein zusammengesetztes Feld braucht vorlage, z. B. „{bereich} · {zeitraum}“.`];
  const fehler: string[] = [];
  if (f.berechnet === true) fehler.push(`${wo}: Ein zusammengesetztes Feld berechnet Ablago selbst – berechnet: true geht hier nicht.`);
  if (f.pflicht) fehler.push(`${wo}: Ein zusammengesetztes Feld ist nie Pflicht – Ablago setzt es aus seinen Teilen.`);
  // Dieselbe Prüfung wie im Mappentyp-Editor: Länge, Platzhalter, Feldarten, Filter.
  fehler.push(...zusammengesetztProbleme(felder as unknown as Feld[], { ...f, vorlage: v } as unknown as Feld).map((x) => `${wo}: ${x}`));
  return fehler;
}

/**
 * Feldart Tabelle (#1030) im Paket: `quelle` nur bei `typ: tabelle` und dort Pflicht – mit Typverweis, Feldkennung,
 * Trefferliste (nur „standard“, Pakete bringen eine Trefferliste je Typ mit) und „+ Neu“ (höchstens 40 Zeichen). Eine
 * Tabelle hat keinen Wert: nie Pflicht, nie berechnet.
 */
export function tabellenFehler(f: PaketFeld, wo: string): string[] {
  const q = f.quelle as unknown;
  if (f.typ !== 'tabelle') return q === undefined ? [] : [`${wo}: quelle gibt es nur bei Tabellen (typ: tabelle).`];
  if (!istObjekt(q))
    return [
      `${wo}: Eine Tabelle braucht quelle: { typ, feld } – den Mappentyp und das Verweisfeld, über das seine Mappen hierher verweisen.`,
    ];
  const fehler: string[] = [];
  const erlaubt = new Set(['typ', 'feld', 'trefferliste', 'neu']);
  for (const k of Object.keys(q))
    if (!erlaubt.has(k)) fehler.push(`${wo}: quelle kennt „${k}“ nicht (möglich: typ, feld, trefferliste, neu).`);
  if (!TYPVERWEIS.test(str(q.typ))) fehler.push(`${wo}: quelle.typ „${str(q.typ)}“ ist kein gültiger Mappentyp-Verweis.`);
  else if (istDmsVerweis(str(q.typ)))
    fehler.push(`${wo}: quelle.typ – eine Tabelle zeigt Mappen eines Typs aus einem Paket, nicht „${str(q.typ)}“.`);
  if (!SCHLUESSEL.test(str(q.feld))) fehler.push(`${wo}: quelle.feld „${str(q.feld)}“ ist keine gültige Feldkennung.`);
  if (q.trefferliste !== undefined && q.trefferliste !== 'standard')
    fehler.push(`${wo}: quelle.trefferliste – Pakete bringen je Typ eine Trefferliste mit; möglich ist nur „standard“.`);
  if (q.neu !== undefined && (typeof q.neu !== 'string' || !q.neu.trim() || q.neu.length > TABELLE_NEU_MAX))
    fehler.push(`${wo}: quelle.neu ist ein Text mit höchstens ${TABELLE_NEU_MAX} Zeichen, z. B. „+ Position“.`);
  if (f.pflicht) fehler.push(`${wo}: Eine Tabelle hat keinen eigenen Wert und kann keine Pflicht sein.`);
  if (f.berechnet === true) fehler.push(`${wo}: Eine Tabelle hat keinen eigenen Wert und lässt sich nicht berechnen.`);
  return fehler;
}

/** Ein Paar von `vorbelegen` (#1037) im Paket: Zielfeld in `ty`, Quellfeld in jedem Zieltyp `ziele` aus diesem Paket. */
function paarFehler(
  p: { von: string; nach: string },
  { f, ty, ziele, wo, alsFeld }: { f: PaketFeld; ty: PaketTyp; ziele: PaketTyp[]; wo: string; alsFeld: (f: PaketFeld) => Feld },
): string[] {
  const nach = ty.felder.find((x) => x.key === p.nach);
  if (!nach) return [`${wo}: nach „${p.nach}“ – dieses Feld gibt es im Typ nicht.`];
  if (nach.key === f.key) return [`${wo}: nach „${p.nach}“ ist das Verweisfeld selbst.`];
  if (nach.typ === 'passwort' || nach.typ === 'tabelle')
    return [`${wo}: nach „${p.nach}“ – in Passwortfelder und Tabellen wird nie übernommen.`];
  if (nach.berechnet === true) return [`${wo}: nach „${p.nach}“ ist berechnet – den Wert schreibt nur der Code des Pakets.`];
  return ziele.flatMap((z) => {
    const von = z.felder.find((x) => x.key === p.von);
    if (!von) return [`${wo}: von „${p.von}“ – dieses Feld gibt es im Typ „${z.schluessel}“ nicht.`];
    if (von.typ === 'passwort') return [`${wo}: von „${p.von}“ ist ein Passwortfeld – Passwörter werden nie übernommen.`];
    return passtZusammen(alsFeld(von), alsFeld(nach))
      ? []
      : [
          `${wo}: „${z.schluessel}.${p.von}“ passt nicht zu „${p.nach}“ (gleiche Feldart nötig, Text auch in Langtext; Auswahlwerte und Ziele müssen enthalten sein).`,
        ];
  });
}

/**
 * Beim Auswählen übernehmen (#1037) im Paket: `vorbelegen: [{ von, nach }]` nur an Verweisfeldern, als Liste von Paaren
 * mit Feldkennungen. `nach` ist ein Feld desselben Typs (nicht das Verweisfeld, kein Passwort, keine Tabelle, nicht
 * berechnet); `von` gibt es in jedem Zieltyp aus diesem Paket mit passender Feldart (passtZusammen). Zieltypen aus
 * Abhängigkeiten prüft Ablago beim Anlegen des Mappentyps (pruefeMappentyp); optionale Ziele übergehen ein fehlendes Feld.
 * Bereinigt `vorbelegen` an jedem Feld, damit nur von und nach ankommen.
 */
export function vorbelegenFehler(typen: PaketTyp[], paketId: string): string[] {
  const fehler: string[] = [];
  const eigen = (vw: string) => (!vw.includes(':') ? vw : vw.startsWith(`${paketId}:`) ? vw.slice(paketId.length + 1) : null);
  // Verweise in der Schreibweise des Pakets vergleichbar machen: eigene Typen ohne Paket-Id.
  const alsFeld = (f: PaketFeld): Feld => ({ ...f, zielTypen: paketZiele(f).map((z) => eigen(z) ?? z) }) as Feld;
  for (const ty of typen) {
    for (const f of ty.felder) {
      const roh = (f as unknown as Record<string, unknown>).vorbelegen;
      if (roh === undefined) continue;
      const wo = `mappentypen „${ty.schluessel}“: Feld „${f.key}“: vorbelegen`;
      if (f.typ !== 'referenz') {
        fehler.push(`${wo} gibt es nur bei Verweisfeldern (typ: referenz).`);
        delete f.vorbelegen;
        continue;
      }
      if (
        !Array.isArray(roh) ||
        !roh.every(
          (x) =>
            istObjekt(x) &&
            SCHLUESSEL.test(str(x.von)) &&
            SCHLUESSEL.test(str(x.nach)) &&
            Object.keys(x).every((k) => k === 'von' || k === 'nach'),
        )
      ) {
        fehler.push(`${wo} ist eine Liste von Paaren { von: <Feld des Ziels>, nach: <Feld dieses Typs> }.`);
        delete f.vorbelegen;
        continue;
      }
      if (roh.length > VORBELEGEN_MAX) fehler.push(`${wo}: höchstens ${VORBELEGEN_MAX} Paare.`);
      const paare = bereinigeVorbelegen(roh);
      if (paare.length !== roh.length) fehler.push(`${wo}: Jedes Feld dieses Typs darf nur einmal unter nach stehen.`);
      const ziele = paketZiele(f)
        .map(eigen)
        .filter((x): x is string => !!x)
        .map((s) => typen.find((x) => x.schluessel === s))
        .filter((x): x is PaketTyp => !!x);
      for (const p of paare) fehler.push(...paarFehler(p, { f, ty, ziele, wo, alsFeld }));
      f.vorbelegen = paare;
    }
  }
  return fehler;
}

/**
 * „gehoertZu“ eines Paket-Typs (#1031): die Kennung eines eigenen Verweisfelds mit genau einem Zieltyp (ohne zielOptional),
 * nicht mehrfach, Pflicht, ohne anzeigen. Zeigt es auf einen Typ dieses Pakets, darf der nicht selbst gehoertZu haben.
 * Was darüber hinaus nicht passt (Typ einer Abhängigkeit ist selbst Teil, …), meldet die Prüfung des Mappentyps.
 */
export function teilFehler(x: PaketTyp, typen: PaketTyp[], wo: string, paketId: string): string[] {
  if (x.gehoertZu === undefined) return [];
  const f = x.felder.find((g) => g.key === x.gehoertZu);
  if (!SCHLUESSEL.test(x.gehoertZu) || !f)
    return [
      `${wo}: gehoertZu „${x.gehoertZu}“ nennt kein Feld dieses Typs – angegeben wird die Kennung des Verweisfelds, über das die Mappe dazugehört.`,
    ];
  const ziele = paketZiele(f);
  const fehler: string[] = [];
  if (f.typ !== 'referenz' || ziele.length !== 1 || f.zielOptional?.length)
    fehler.push(
      `${wo}: gehoertZu „${x.gehoertZu}“: Das Feld muss ein Verweis auf genau einen Mappentyp sein (typ: referenz, ziel ohne Liste und ohne zielOptional).`,
    );
  if (f.mehrfach) fehler.push(`${wo}: gehoertZu „${x.gehoertZu}“: Das Feld darf nur auf eine Mappe zeigen (ohne mehrfach).`);
  if (!f.pflicht)
    fehler.push(`${wo}: gehoertZu „${x.gehoertZu}“: Das Feld muss Pflicht sein (pflicht: true) – ein Teil gehört immer zu einer Mappe.`);
  if ((f as unknown as Record<string, unknown>).anzeigen)
    fehler.push(`${wo}: gehoertZu „${x.gehoertZu}“: Das Feld ist immer zu sehen (ohne anzeigen).`);
  const z = ziele[0] ?? '';
  const eigen = !z.includes(':') || z.startsWith(`${paketId}:`);
  const zielTyp = eigen ? typen.find((y) => y.schluessel === z.split(':').pop()) : undefined;
  if (zielTyp === x) fehler.push(`${wo}: gehoertZu „${x.gehoertZu}“: Ein Typ kann nicht Teil von Mappen seines eigenen Typs sein.`);
  else if (zielTyp?.gehoertZu !== undefined)
    fehler.push(`${wo}: gehoertZu „${x.gehoertZu}“: „${zielTyp.name}“ ist selbst Teil einer anderen Mappe – Ketten gibt es nicht.`);
  return fehler;
}

/**
 * Anzeigen, wenn … (#1033) an Feldern und Abschnitten eines Mappentyps im Paket: ein Objekt; Typen als Verweis wie bei
 * ziel. Falsch Geschriebenes ist ein Fehler, statt still wegzufallen (#1108) – sonst wäre das Feld immer zu sehen. Ob
 * Feld und Werte zum Typ passen, meldet die Prüfung des Mappentyps beim Anlegen.
 */
export function anzeigenFehler(felder: PaketFeld[], register: PaketRegister[], wo: string): string[] {
  const anzeigen = [
    ...felder.map((f) => ({ key: f.key, a: (f as unknown as Record<string, unknown>).anzeigen })),
    ...register.flatMap((r) =>
      (Array.isArray(r.abschnitte) ? r.abschnitte : []).filter(istObjekt).map((x) => ({ key: `${r.key}.${str(x.vor)}`, a: x.anzeigen })),
    ),
  ];
  return anzeigen.flatMap(({ key, a }) => [
    ...anzeigeEingabeFehler(a, ['vorgabe']).map((grund) => `${wo}: „${key}“: anzeigen, ${grund}`),
    ...(istObjekt(a) && Array.isArray(a.bedingungen) ? a.bedingungen.filter(istObjekt) : [])
      .filter((b) => b.art === 'verweistyp' && str(b.typ) && !TYPVERWEIS.test(str(b.typ)))
      .map((b) => `${wo}: „${key}“: anzeigen nennt den Mappentyp „${str(b.typ)}“ ungültig.`),
  ]);
}

/** Bedingungen einer Ansicht im Paket (#1108): falsch Geschriebenes ist ein Fehler, statt beim Anlegen still wegzufallen. */
export function sichtBedingungenFehler(roh: unknown, wo: string): string[] {
  if (roh === undefined || roh === null) return [];
  if (!Array.isArray(roh)) return [t('meldungen.pakete.sicht-bedingungen-liste', { wo })];
  return roh.flatMap((b, j) => {
    const grund = sichtBedingungFehler(b);
    return grund ? [`${wo}, bedingungen[${j + 1}]: ${grund}`] : [];
  });
}

/** Warum eine Bedingung einer Ansicht im Paket (`{ feld, operator, wert }`) nicht passt; null = in Ordnung (#1108). */
function sichtBedingungFehler(b: unknown): string | null {
  if (!istObjekt(b)) return bedingungEingabeFehler(b);
  if (b.operator === undefined && b.op !== undefined) return t('meldungen.pakete.sicht-bedingung-op');
  // Unbekannter Operator: dieselbe Meldung wie in der Werkbank-Form (bedingungAus lehnte ihn sonst erst beim Anlegen ab).
  if (!Object.hasOwn(OPERATOREN, str(b.operator))) return bedingungEingabeFehler({ art: 'feld', feld: str(b.feld), op: str(b.operator) });
  return bedingungEingabeFehler(bedingungAus({ feld: str(b.feld), operator: str(b.operator), wert: b.wert }));
}

/** Bedingung aus dem Paket in die Form der Werkbank. */
export function bedingungAus(b: { feld: string; operator: string; wert?: unknown }): Bedingung {
  if (!(b.operator in OPERATOREN)) throw new Fachfehler(422, t('meldungen.pakete.unbekannter-operator-in-einer', { operator: b.operator }));
  const op = b.operator as Operator;
  const fest = (w: unknown) => (istObjekt(w) && typeof w.art === 'string' ? (w as never) : { art: 'fest' as const, wert: w as string });
  if ((op === 'zwischen' || op === 'ausserhalb') && Array.isArray(b.wert) && b.wert.length === 2)
    return { art: 'feld', feld: b.feld, op, wert: fest(b.wert[0]), bis: fest(b.wert[1]) };
  return { art: 'feld', feld: b.feld, op, ...(b.wert !== undefined ? { wert: fest(b.wert) } : {}) };
}
