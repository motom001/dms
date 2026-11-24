/**
 * Mappentypen-Datei (#1315) im laufenden Ablago: Vorschau und Einspielen. Lesen (`typen-lesen.ts`) und Planen
 * (`typen-einspielen.ts`) sind ohne Datenbank; hier kommen Lage, Probe und das Speichern dazu.
 *
 * Einspielen in einem Zug (#404): erst die neuen Typen leer anlegen (damit Verweise untereinander Ziele haben), dann jeden
 * Typ mit seiner Definition speichern – über dieselben Wege wie der Editor (Prüfung, Fassungen, Ereignisse). Scheitert
 * einer, bleibt alles, wie es war. Nur Daten, nie Code: Die Datei kann nichts ausführen.
 */
import { createHash, randomUUID } from 'node:crypto';
import { pruefeMappentyp } from '../../../../shared/src/model';
import type { Mappentyp } from '../../../../shared/src/model';
import type { TypenImportErgebnis, TypenImportVorschau } from '../../../../shared/src/typendatei';
import { vorgabeKennung, vorgabePraefix, vorgabeVerweis } from '../../../../shared/src/vorgaben';
import type { Dienst } from '../../dienst/dienst';
import { Fachfehler } from '../../grundlagen/fehler';
import { bereinigeTyp } from '../../mappentypen/index';
import { protokoll } from '../../protokoll/protokoll';
import { t } from '../../sprache/sprache';
import { bedingungsVorgaben, istVorgabeBedingung } from '../index';
import { istObjekt } from '../verwaltung/format';
import { type EinspielLage, type EinspielPlan, planeEinspielen } from './typen-einspielen';
import { liesTypenDatei, type TypenDatei } from './typen-lesen';

const log = protokoll.modul('werkbank');

/** Verweise auf Vorgaben (#1038) in den Anzeige-Bedingungen der Datei. */
function vorgabeVerweise(datei: TypenDatei): string[] {
  const regeln = datei.typen.flatMap((x) => [
    ...x.felder.map((f) => f.anzeigen as unknown),
    ...x.register.flatMap((r) =>
      (Array.isArray(r.abschnitte) ? (r.abschnitte as unknown[]) : []).map((a) => (istObjekt(a) ? a.anzeigen : null)),
    ),
  ]);
  return [
    ...new Set(
      regeln.flatMap((r) =>
        istObjekt(r) && Array.isArray(r.bedingungen) ? r.bedingungen.filter(istVorgabeBedingung).flatMap(bedingungsVorgaben) : [],
      ),
    ),
  ];
}

async function lageVon(d: Dienst, datei: TypenDatei, dmsTypen: Map<string, string>): Promise<EinspielLage> {
  const vorgaben = new Map<string, string>();
  const verweise = vorgabeVerweise(datei);
  for (const paket of new Set(verweise.map((vw) => vorgabeVerweis(vw, '').paket))) {
    const mappen = await d.kern.repo.mappenMitVorgabe(vorgabePraefix(paket));
    for (const vw of verweise) {
      const v = vorgabeVerweis(vw, '');
      const m = v.paket === paket ? mappen.find((x) => x.vorgabe === vorgabeKennung(v.paket, v.schluessel)) : undefined;
      if (m) vorgaben.set(vw, m.id);
    }
  }
  return { typen: await d.mappentypen.listeTypen(), pakete: await d.kern.repo.listePakete(), dmsTypen, vorgaben };
}

/** Probe ohne Speichern: jeder Typ nach dem Einspielen gegen die Regeln des Editors, mit allen geplanten Typen als Zielen. */
function probe(plan: EinspielPlan, lage: EinspielLage): string[] {
  const nachher: Array<Pick<Mappentyp, 'id' | 'name' | 'schluessel' | 'felder' | 'trefferlisten' | 'trefferliste'>> = [
    ...lage.typen.filter((x) => !plan.typen.some((p) => p.id === x.id)),
    ...plan.typen.map((p) => ({ ...bereinigeTyp(p.eingabe), id: p.id })),
  ];
  return plan.typen.flatMap((p) => {
    const e = pruefeMappentyp(bereinigeTyp(p.eingabe), {
      eigeneId: p.id,
      namenAndererTypen: nachher.filter((x) => x.id !== p.id).map((x) => x.name),
      schluesselAndererTypen: nachher.filter((x) => x.id !== p.id && x.schluessel).map((x) => x.schluessel!),
      existiertTyp: (id) => nachher.some((x) => x.id === id),
      felderVon: (id) => nachher.find((x) => x.id === id)?.felder,
      typVon: (id) => nachher.find((x) => x.id === id),
    });
    const meldungen = [...e.allgemein, ...Object.values(e.felder).flat()];
    return meldungen.length ? [t('meldungen.paketerstellung.typen-probe', { name: p.name, meldungen: meldungen.join(' ') })] : [];
  });
}

/** Lesen, Lage holen, planen und probieren – für Vorschau und Einspielen gleich. */
async function plane(d: Dienst, text: string, dmsTypen: Map<string, string>) {
  const datei = liesTypenDatei(text);
  const lage = await lageVon(d, datei, dmsTypen);
  const plan = planeEinspielen(datei, lage, randomUUID);
  const probleme = [...plan.probleme, ...(plan.probleme.length ? [] : probe(plan, lage))];
  const vorschau: TypenImportVorschau = {
    sha256: createHash('sha256').update(text, 'utf8').digest('hex'),
    ablago: datei.ablago,
    erstellt: datei.erstellt,
    typen: plan.typen.map((p) => ({
      kennung: p.kennung,
      name: p.name,
      stand: p.neu ? 'neu' : p.aenderungen.length ? 'vorhanden' : 'gleich',
      aenderungen: p.aenderungen,
    })),
    abhaengigkeiten: plan.abhaengigkeiten,
    hinweise: [],
    probleme,
  };
  return { plan, vorschau };
}

/** Vorschau: was neu ist, was es schon gibt und was sich ändern würde. Ändert nichts. */
export async function typenVorschau(d: Dienst, text: string, dmsTypen: Map<string, string>): Promise<TypenImportVorschau> {
  return (await plane(d, text, dmsTypen)).vorschau;
}

/**
 * Einspielen nach Bestätigung: nur, wenn die Datei dieselbe ist wie in der Vorschau (`sha256`) und es keine Probleme gibt.
 * Abgelehnte Änderungen (Abschwächungen) sind im Plan schon herausgenommen.
 */
export async function spieleTypenEin(
  d: Dienst,
  text: string,
  sha256: string,
  von: string,
  dmsTypen: Map<string, string>,
): Promise<TypenImportErgebnis> {
  const { plan, vorschau } = await plane(d, text, dmsTypen);
  if (vorschau.sha256 !== sha256) throw new Fachfehler(409, t('meldungen.paketerstellung.typen-andere-datei'));
  if (vorschau.probleme.length)
    throw new Fachfehler(422, t('meldungen.paketerstellung.typen-datei-ungueltig'), { gruende: vorschau.probleme });
  const neu = plan.typen.filter((p) => p.neu);
  const geaendert = plan.typen.filter((p) => !p.neu && p.aenderungen.some((a) => !a.abgelehnt));
  await d.kern.inEinemZug(async () => {
    // Erst leer anlegen, damit Verweise zwischen den neuen Typen beim zweiten Schritt ein Ziel haben.
    for (const p of neu)
      await d.mappentypen.legeTypAn({
        id: p.id,
        name: p.eingabe.name,
        schluessel: p.kennung,
        beschreibung: '',
        titelVorlage: '',
        felder: [],
        register: p.eingabe.register.map((r) => ({ key: r.key, name: r.name, art: r.art })),
      });
    for (const p of [...neu, ...geaendert]) await d.mappentypen.aendereTyp(p.id, p.eingabe);
  });
  const abgelehnt = plan.typen.reduce((n, p) => n + p.aenderungen.filter((a) => a.abgelehnt).length, 0);
  // Protokoll (Ergänzung Sicherheit, Punkt 6): wer, welche Datei (Prüfsumme), welche Typen neu bzw. geändert.
  log.info('Mappentypen aus einer Datei eingespielt', {
    von,
    sha256,
    neu: neu.map((p) => p.kennung),
    geaendert: geaendert.map((p) => p.kennung),
    abgelehnt,
  });
  return { neu: neu.map((p) => p.name), geaendert: geaendert.map((p) => p.name), abgelehnt };
}
