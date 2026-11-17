import type { ReactNode } from 'react';
import { anzeigestand } from '../../../../shared/src/anzeige';
import { pruefeFormate } from '../../../../shared/src/feldformate';
import { istOk, type Mappe, type Mappenkonflikt, type Pruefergebnis, type Werte } from '../../../../shared/src/model';
import type { LoeschAnlass } from '../../../../shared/src/loeschprotokoll';
import type { ApiFehler } from '../../api/anfrage';
import { dokumenteApi } from '../../api/dokumente';
import { mappenApi } from '../../api/mappen';
import { geheZu, Link, loeseWache } from '../../ort';
import { hinweis, rueckfrage } from '../../rueckfrage';
import { titelOder } from '../../seiten';
import { t, tn } from '../../sprache';
import { werteAusRoh, zuRoh, type Roh, type RohWerte } from '../../werte';
import type { NeueDatei } from '../Dokumente';
import { merkeAufloesung } from '../Post';
import { naechstePost } from './hilfen';
import type { Kern } from './kern';

type Hinweis = { art: 'warn' | 'schlecht'; text: ReactNode };
type Gespeichert = (Mappe & { hinweis?: string }) | undefined;

/**
 * Speichern. Gleichzeitig bearbeiten (#609): An den Server gehen nur die Felder, die hier geändert wurden,
 * dazu der Stand, auf dem sie beruhen. Hat jemand anderes dasselbe Feld inzwischen geändert, antwortet er
 * mit 409 – dann fragt das Formular je Feld (`konflikt`). `nochmal`: nach der Antwort, mit dem neuen Stand;
 * Felder in `seins` bleiben, wie sie auf dem Server stehen.
 */
export function speichernWege(z: Kern) {
  const { typ, mappe } = z.p;
  function zeigeFehler(p: Pruefergebnis) {
    z.setFehler(p);
    z.oeffneAbschnitte(Object.keys(p.felder));
    // Zum ersten Register mit Fehler springen, falls das aktuelle keinen hat.
    if (z.reg?.art === 'felder' && z.felderAuf(z.reg).some((f) => p.felder[f.key])) return;
    const ziel = z.register.find((r) => r.art === 'felder' && z.felderAuf(r).some((f) => p.felder[f.key]));
    if (ziel) z.setAktiv(ziel.key);
  }
  async function speichern(nochmal?: { stand: string; seins: Record<string, Roh> }) {
    z.setMeldung(undefined);
    z.setKonflikt(undefined);
    const rohJetzt: RohWerte = nochmal ? { ...z.roh, ...nochmal.seins } : z.roh;
    if (nochmal) z.setRoh(rohJetzt);
    const werte = werteAusRoh(typ, rohJetzt);
    const geaenderteFelder = typ.felder
      .map((f) => f.key)
      .filter((k) => JSON.stringify(rohJetzt[k] ?? null) !== JSON.stringify(z.basisRoh[k] ?? null) && !(nochmal && k in nochmal.seins));
    if (!pruefen(z, werte, geaenderteFelder, zeigeFehler) || !(await rechteFragen(z, werte))) return;
    z.setSendet(true);
    z.setHinweise([]);
    const gespeichert = await senden(werte, geaenderteFelder, rohJetzt, nochmal?.stand);
    if (gespeichert === false) return;
    // Dokumente erst jetzt: hochladen, was neu ist, und entfernen, was markiert ist.
    const neu: Hinweis[] = [];
    const offen = await hochladen(gespeichert!, neu);
    await danachAnlegen(gespeichert!, neu);
    // Zuordnen (#192): Die Post gehört jetzt zu dieser neuen Mappe – bzw. wird zu ihr (#936, aufgelöst).
    const post = await zuordnen(gespeichert);
    const nichtEntfernt = await entfernen(neu);
    z.setNeueDateien(offen);
    z.setEntfernt(nichtEntfernt);
    z.setHinweise(neu);
    z.setVorschlaege({});
    z.setAdNeu({});
    z.setAdMeldung(undefined);
    z.setGefolgt({});
    z.setVorbelegt({});
    await abschluss(z, gespeichert, offen.length + nichtEntfernt.length > 0, post);
  }
  /** Mappe anlegen bzw. die geänderten Felder schicken; false: nicht gespeichert (Konflikt oder Fehler). */
  async function senden(werte: Werte, geaenderteFelder: string[], rohJetzt: RohWerte, neuerStand?: string): Promise<Gespeichert | false> {
    let gespeichert: Gespeichert = mappe;
    try {
      // Berechnete (#1034) und zusammengesetzte Felder (#1050) schickt die Oberfläche nie – auch nicht leer oder mit einem Standardwert.
      if (!mappe)
        gespeichert = await mappenApi.mappeAnlegen({
          typId: typ.id,
          werte: Object.fromEntries(
            Object.entries(werte).filter(([k]) => {
              const f = typ.felder.find((x) => x.key === k);
              return !f?.berechnetVon && f?.typ !== 'zusammengesetzt';
            }),
          ),
        });
      else if (geaenderteFelder.length) {
        const zuSenden = Object.fromEntries(geaenderteFelder.map((k) => [k, werte[k] ?? null]));
        gespeichert = await mappenApi.mappeAendern(mappe.id, { werte: zuSenden, stand: neuerStand ?? z.stand });
      }
      z.setFehler(null);
      z.setBasis(JSON.stringify(rohJetzt));
      if (gespeichert) z.setStand(gespeichert.geaendert);
      return gespeichert;
    } catch (e) {
      nichtGespeichert(e as ApiFehler);
      return false;
    }
  }
  function nichtGespeichert(f: ApiFehler) {
    const k = f.status === 409 ? (f.details as Mappenkonflikt | undefined) : undefined;
    if (k && Array.isArray(k.konflikte) && k.konflikte.length) {
      z.setKonflikt({ ...k, wahl: {} });
      z.setMeldung(t('mappen.konflikt.status'));
      window.setTimeout(() => document.querySelector('.mappenkonflikt')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50);
    } else {
      if (f.pruefung) zeigeFehler(f.pruefung);
      z.setMeldung(f.message);
    }
    z.setSendet(false);
  }
  const { hochladen, danachAnlegen, zuordnen, entfernen } = nachDemSpeichern(z);
  /** Rückfrage beantwortet (#609): „meins“ geht mit dem neuen Stand noch einmal mit, „seins“ wird übernommen. */
  function konfliktEntscheiden() {
    if (!z.konflikt) return;
    const seins: Record<string, Roh> = {};
    for (const k of z.konflikt.konflikte) {
      if (z.konflikt.wahl[k.feld] !== 'seins') continue;
      const f = typ.felder.find((x) => x.key === k.feld);
      if (f) seins[k.feld] = k.geheim ? (z.basisRoh[k.feld] ?? zuRoh(f, null)) : zuRoh(f, k.wert ?? null);
    }
    void speichern({ stand: z.konflikt.stand, seins });
  }
  return { speichern, konfliktEntscheiden, zeigeFehler };
}

/** Pflicht, Formate und Datumsgrenzen (#535); false: Fehler an den Feldern. */
function pruefen(z: Kern, werte: Werte, geaenderteFelder: string[], zeigeFehler: (p: Pruefergebnis) => void) {
  const { typ, mappe } = z.p;
  const p = z.d.pruefe(typ, werte, (id) => z.bekannt[id]?.typId);
  // Formate und Datumsgrenzen (#535): neue Mappe ganz, sonst nur, was sich ändert.
  for (const [k, m] of Object.entries(pruefeFormate(typ, werte, mappe?.werte))) p.felder[k] ??= m;
  // Ausgeblendete Felder (#655): Was dort unverändert steht, hält das Speichern nicht auf (wie auf dem Server).
  // Genauso, was eine Anzeige-Bedingung gerade ausblendet (#1033).
  const verborgen = anzeigestand(typ, werte, {
    merkmale: z.merkmale,
    typVon: (id) => z.bekannt[id]?.typId,
    eigeneOrganisation: (id) => !!z.eigene?.includes(id),
  }).verborgen;
  for (const k of Object.keys(p.felder))
    if ((z.ausgeblendet.has(k) || verborgen.has(k)) && !geaenderteFelder.includes(k)) delete p.felder[k];
  if (istOk(p)) return true;
  zeigeFehler(p);
  z.setMeldung(t('ablage.mappeformular.bitte-die-markierten-felder'));
  return false;
}
/** Würde man sich mit diesen Werten selbst das Lesen oder Bearbeiten entziehen? Dann erst fragen (#126). */
async function rechteFragen(z: Kern, werte: Werte) {
  const { mappe } = z.p;
  if (!mappe || !z.werteGeaendert || z.ich.rolle === 'admin') return true;
  const r = await mappenApi.rechteVorschau(mappe.id, werte).catch(() => null);
  const frage = (text: string) =>
    rueckfrage({
      titel: t('ablage.mappeformular.trotzdem-speichern'),
      text,
      ja: t('ablage.mappeformular.trotzdem-speichern-2'),
      gefahr: true,
    });
  if (r && !r.R && !(await frage(t('ablage.mappeformular.nach-dem-speichern-kannst')))) return false;
  if (r && r.R && !r.U && !(await frage(t('ablage.mappeformular.nach-dem-speichern-kannst-2')))) return false;
  return true;
}
/** Nach dem Speichern: Fenster schließen, zurück zur Liste, zur nächsten Post oder Meldung „Gespeichert“. */
async function abschluss(z: Kern, gespeichert: Gespeichert, teilweise: boolean, post: { aufgeloest: boolean; leerseiten?: number }) {
  const { typ, mappe } = z.p;
  // Fenster „+ … anlegen“ (#935): die neue Mappe geht ans Verweisfeld; die Mappe dahinter bleibt, wie sie ist.
  if (z.p.imFenster && gespeichert) {
    await z.d.neuLaden();
    z.setSendet(false);
    z.p.imFenster.gespeichert(gespeichert);
    return;
  }
  if (!teilweise) loeseWache();
  // Lesen verloren (#126): zurück zur Liste, mit Hinweis.
  const verloren = gespeichert?.hinweis?.includes('nicht mehr sehen');
  if (verloren) {
    loeseWache();
    await hinweis({ titel: t('ablage.mappeformular.gespeichert'), text: gespeichert!.hinweis });
    await z.d.neuLaden();
    geheZu(`/ablage/${z.p.sicht}${z.p.anhang ?? ''}`);
    return;
  }
  await z.d.neuLaden();
  await z.p.neuLaden?.();
  z.setSendet(false);
  // Aufgelöst (#936): weiter mit der nächsten Post aus „Neue Post“; oben steht, was angelegt wurde.
  const naechste = post.aufgeloest ? await naechstePost(z.d.zaehler.neuePost) : undefined;
  if (naechste && z.d.zaehler.neuePost) {
    merkeAufloesung({
      fuer: naechste.id,
      id: gespeichert!.id,
      typId: typ.id,
      titel: gespeichert!.titel ?? '',
      leerseiten: post.leerseiten,
    });
    geheZu(`/ablage/${z.d.zaehler.neuePost}/${naechste.id}/uebernehmen`);
  } else if (!mappe) geheZu(`/ablage/${z.p.sicht}/${gespeichert!.id}`);
  else
    z.setMeldung(
      gespeichert?.hinweis ?? (teilweise ? t('ablage.mappeformular.teilweise-gespeichert') : t('ablage.mappeformular.gespeichert-2')),
    );
}
/** Was nach dem Speichern der Werte geschieht: Dateien, E-Rechnung, Zuordnen der Post, entfernte Dokumente. */
function nachDemSpeichern(z: Kern) {
  const { typ, mappe, details, zuordnen: zu } = z.p;
  async function hochladen(gespeichert: Mappe, neu: Hinweis[]): Promise<NeueDatei[]> {
    const offen: NeueDatei[] = [];
    for (const n of z.neueDateien) {
      try {
        // Gleicher Name (#194): Standard mit Versionierung „neue Version“, sonst „mit Zähler“.
        const gleich = (details?.dokumente ?? []).some(
          (x) => x.registerKey === n.register && !z.entfernt.includes(x.id) && x.name.toLowerCase() === n.datei.name.toLowerCase(),
        );
        const versioniert = !!typ.register.find((r) => r.key === n.register)?.versionierung;
        const r = await mappenApi.ladeHoch(
          gespeichert.id,
          n.register,
          n.datei,
          gleich ? (n.gleicherName ?? (versioniert ? 'version' : 'zaehler')) : undefined,
        );
        const anderswo = r.gleicherInhalt.filter((g) => g.mappeId !== gespeichert.id);
        if (anderswo.length) neu.push({ art: 'warn', text: <GleicherInhalt name={n.datei.name} anderswo={anderswo} /> });
      } catch (e) {
        offen.push(n);
        neu.push({
          art: 'schlecht',
          text: t('ablage.mappeformular.wurde-nicht-hochgeladen', { name: n.datei.name, message: (e as Error).message }),
        });
      }
    }
    return offen;
  }
  /** E-Rechnung (#1043): Positionen als Teile dieser Mappe anlegen; Mappen, die dazugehören, verknüpfen. */
  async function danachAnlegen(gespeichert: Mappe, neu: Hinweis[]) {
    if (z.adPositionen?.an) {
      let fehlt = 0;
      let letzter = '';
      for (const w of z.adPositionen.zeilen) {
        try {
          await mappenApi.mappeAnlegen({ typId: z.adPositionen.typId, werte: { ...w, [z.adPositionen.feldKey]: gespeichert.id } });
        } catch (e) {
          fehlt++;
          letzter = (e as Error).message;
        }
      }
      if (fehlt)
        neu.push({ art: 'schlecht', text: t('ablage.mappeformular.positionen-nicht-angelegt', { anzahl: fehlt, message: letzter }) });
    }
    for (const x of z.adDazu.filter((y) => y.an)) {
      const zf = z.d.typ(x.typId)?.felder.find((f) => f.key === x.feldKey);
      try {
        await mappenApi.mappeAendern(x.mappeId, { werte: { [x.feldKey]: zf?.mehrfach ? [gespeichert.id] : gespeichert.id } });
      } catch (e) {
        neu.push({
          art: 'schlecht',
          text: t('ablage.mappeformular.dazu-nicht-verknuepft', { titel: titelOder(x.titel), message: (e as Error).message }),
        });
      }
    }
    z.setAdPositionen(null);
    z.setAdDazu([]);
  }
  async function zuordnen(gespeichert: Gespeichert): Promise<{ aufgeloest: boolean; leerseiten?: number }> {
    if (mappe || !zu) return { aufgeloest: false };
    try {
      const r = await mappenApi.zuordnen(zu.post, {
        ziel: gespeichert!.id,
        register: zu.register,
        dokumente: zu.dokumente,
        kopieren: zu.kopieren,
        aufloesen: zu.aufloesen === true,
        ...(zu.originalEmail === false ? { originalEmail: false } : {}),
      });
      if (r.hinweis) await hinweis({ titel: t('ablage.mappeformular.post-bleibt-zugeordnet'), text: r.hinweis });
      return { aufgeloest: r.aufgeloest, leerseiten: r.leerseiten };
    } catch (e) {
      await hinweis({
        titel: t('ablage.mappeformular.post-nicht-zugeordnet'),
        text: t('ablage.mappeformular.die-mappe-ist-angelegt', { message: (e as Error).message }),
      });
      return { aufgeloest: false };
    }
  }
  async function entfernen(neu: Hinweis[]): Promise<string[]> {
    const nichtEntfernt: string[] = [];
    // Anlagen (#998) gehen mit ihrem Hauptdokument – nur einzeln löschen, wessen Hauptdokument bleibt.
    const mitHaupt = new Set((details?.dokumente ?? []).filter((x) => x.anlageZu && z.entfernt.includes(x.anlageZu)).map((x) => x.id));
    for (const id of z.entfernt) {
      if (mitHaupt.has(id)) continue;
      try {
        await dokumenteApi.dokumentLoeschen(id);
      } catch (e) {
        nichtEntfernt.push(id);
        neu.push({ art: 'schlecht', text: (e as Error).message });
      }
    }
    return nichtEntfernt;
  }
  return { hochladen, danachAnlegen, zuordnen, entfernen };
}

/** „… hat denselben Inhalt wie … in …“ nach dem Hochladen (#194, #195). */
function GleicherInhalt({
  name,
  anderswo,
}: {
  name: string;
  anderswo: Array<{ name: string; typId?: string; mappeId: string; titel?: string }>;
}) {
  return (
    <>
      {t('ablage.mappeformular.hat-denselben-inhalt-wie', { name })}{' '}
      {anderswo.map((g, j) => {
        return (
          <span key={j}>
            {tn('ablage.mappeformular.in', {
              wert: j > 0 && ', ',
              name: g.name,
              wert2: g.typId ? (
                <Link to={`/ablage/${g.typId}/${g.mappeId}`} className="verweis">
                  {titelOder(g.titel)}
                </Link>
              ) : (
                t('ablage.mappeformular.einer-anderen-mappe')
              ),
            })}
          </span>
        );
      })}
      {t('ablage.mappeformular.gespeichert-ist-die-datei')}
    </>
  );
}

/**
 * „Mappe löschen“ in der Speicherleiste (#1211): Gefahr-Knopf mit Rückfrage und Grund fürs Löschprotokoll (#470) –
 * der Baustein fragt beides, hier wird nur noch gelöscht. Die Rückfrage nennt Papierkorb, Dokumente und Teile (#1031).
 */
export function loeschWege(z: Kern) {
  const { mappe, details } = z.p;
  const n = details?.dokumente.length ?? 0;
  const korb = z.d.zaehler.papierkorbTage ?? 0;
  const teile = details?.loeschbar?.teile ?? 0;
  const mit = (x: string) =>
    teile ? `${t(korb ? 'ablage.teile.kommen-mit' : 'ablage.teile.werden-mitgeloescht', { anzahl: teile })}${x}` : x;
  const loeschFrage = korb
    ? {
        titel: t('ablage.mappeformular.mappe-in-den-papierkorb', { titelOder: titelOder(mappe?.titel) }),
        text: t('ablage.mappeformular.dort-laesst-sie-sich', {
          anzahl: korb,
          wert: mit(n ? t('ablage.mappeformular.ihre-dokumente-kommen-mit', { anzahl: n }) : ''),
        }),
        ja: t('ablage.mappeformular.in-den-papierkorb'),
        mitGrund: true as const,
      }
    : {
        titel: t('ablage.mappeformular.mappe-endgueltig-loeschen', { titelOder: titelOder(mappe?.titel) }),
        text: t('ablage.mappeformular.das-laesst-sich-nicht', {
          wert: mit(n ? t('ablage.mappeformular.ihre-dokumente-werden-mitgeloescht', { anzahl: n }) : ''),
        }),
        ja: t('ablage.mappeformular.endgueltig-loeschen'),
        mitGrund: true as const,
      };
  async function loeschen(anlass?: LoeschAnlass) {
    if (!mappe || !anlass) return;
    await mappenApi.mappeLoeschen(mappe.id, anlass);
    loeseWache();
    await z.d.neuLaden();
    geheZu(`/ablage/${z.p.sicht}${z.p.anhang ?? ''}`);
  }
  return { loeschFrage, loeschen };
}
