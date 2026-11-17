import { feldLabel } from '../../../../shared/src/beschriftung';
import { enthaeltId, ersteId } from '../../../../shared/src/folgtaus';
import { istLeer, type Feld as FeldDef } from '../../../../shared/src/model';
import { mappenApi, type Bezuege } from '../../api/mappen';
import { rueckfrage } from '../../rueckfrage';
import { titelOder } from '../../seiten';
import { t } from '../../sprache';
import { ausRoh, type Roh } from '../../werte';
import { anzeigeImFormular } from '../anzeige';
import type { Kern } from './kern';
import { gleichRoh, leereVorschlaege, leerRoh } from './werte';

/**
 * Beim Auswählen übernehmen (#1037) nach einer Eingabe im Verweisfeld `k` (von Hand, über „folgt aus“ oder die Brücke).
 * Erst fallen die Vorschläge der vorher gewählten Mappe weg, die noch unverändert dastehen – so bleibt kein
 * „Mobilfunk: 3 Monate“ an einem Stromvertrag hängen; selbst getippte Werte bleiben. Dann schlägt die neue Mappe ihre
 * Werte vor: nur in leere, sichtbare, beschreibbare Felder, markiert und änderbar. Die Werte liefert der Server mit den
 * Rechten der Person (nur lesbare Mappen, nie Passwörter, nie berechnete Felder).
 */
function vorbelegenWege(z: Kern) {
  const { typ } = z.p;
  async function vorbelege(k: string, v: Roh) {
    const f = typ.felder.find((x) => x.key === k);
    if (!f || f.typ !== 'referenz' || !f.vorbelegen?.length || z.nurLesen) return;
    const id = ersteId(ausRoh(f, v));
    vorbelegungAufheben(k, id);
    if (!id || Object.values(z.vorbelegtRef.current).some((e) => e.feld === k && e.mappe === id)) return;
    const r = await mappenApi.vorbelegen(typ.id, k, id).catch(() => null);
    if (r && ersteId(ausRoh(f, z.rohRef.current[k])) === id) vorbelegungEintragen(f, id, r);
  }
  /** Unveränderte Vorschläge aus dem Verweisfeld `k`, die nicht von der Mappe `id` stammen, wieder leeren (#1037). */
  function vorbelegungAufheben(k: string, id: string) {
    const alt = Object.entries(z.vorbelegtRef.current).filter(([, e]) => e.feld === k && e.mappe !== id);
    if (!alt.length) return;
    const zurueck = Object.fromEntries(
      alt.filter(([n, e]) => gleichRoh(z.rohRef.current[n], e.wert)).map(([n, e]) => [n, e.vorher] as const),
    );
    const vorher = z.vorbelegtRef.current;
    z.rohRef.current = { ...z.rohRef.current, ...zurueck };
    z.setRoh((x) => ({ ...x, ...Object.fromEntries(Object.entries(zurueck).filter(([n]) => gleichRoh(x[n], vorher[n]?.wert))) }));
    const ohne = Object.fromEntries(Object.entries(vorher).filter(([n]) => !alt.some(([a]) => a === n)));
    z.vorbelegtRef.current = ohne;
    z.setVorbelegt(ohne);
  }
  /** Vorschläge der Mappe `id` in leere, sichtbare, beschreibbare Felder eintragen und markieren (#1037). */
  function vorbelegungEintragen(f: FeldDef, id: string, r: Awaited<ReturnType<typeof mappenApi.vorbelegen>>) {
    for (const [b, x] of Object.entries(r.bezuege)) z.merke(b, x);
    const neu = leereVorschlaege(typ, r.felder, z.rohRef.current, (n) => z.geschuetzt[n] === undefined && !z.ausgeblendet.has(n));
    // Anzeigen, wenn … (#1033): mit den neuen Werten zusammen – „Verlängert sich um“ zeigt sich erst mit „Danach“.
    const mitNeuen: Bezuege = { ...z.bekanntRef.current, ...r.bezuege, [id]: { titel: r.titel, typId: r.typId } };
    const sicht = anzeigeImFormular(typ, { ...z.rohRef.current, ...neu }, { merkmale: z.merkmale, eigene: z.eigene, bekannt: mitNeuen });
    for (const n of Object.keys(neu)) if (sicht.verborgen.has(n)) delete neu[n];
    if (!Object.keys(neu).length) return;
    const text = t('ablage.vorbelegen.aus', { feld: feldLabel(f), titel: titelOder(r.titel) });
    const marken = Object.fromEntries(
      Object.entries(neu).map(
        ([n, w]) => [n, { feld: f.key, mappe: id, wert: w, vorher: z.rohRef.current[n] ?? leerRoh(typ, n), text }] as const,
      ),
    );
    z.rohRef.current = { ...z.rohRef.current, ...neu };
    z.setRoh((x) => ({ ...x, ...leereVorschlaege(typ, neu, x, () => true, false) }));
    z.vorbelegtRef.current = { ...z.vorbelegtRef.current, ...marken };
    z.setVorbelegt((x) => ({ ...x, ...marken }));
    z.oeffneAbschnitte(Object.keys(neu));
  }
  function vorbelegungZuruecknehmen(k: string) {
    const e = z.vorbelegt[k];
    if (e) z.setRoh((x) => ({ ...x, [k]: e.vorher }));
    z.setVorbelegt((x) => Object.fromEntries(Object.entries(x).filter(([y]) => y !== k)));
  }
  return { vorbelege, vorbelegungZuruecknehmen };
}

/**
 * Folgt aus (#886) nach einer Eingabe von Hand (Auswahl, Ziehen, Anklicken) – nie beim Öffnen und nie durch
 * Vorschläge. Quelle gewählt: ein leeres Feld, das aus ihr folgt, füllt sich und ist markiert; steht dort etwas
 * anderes, erst nach Rückfrage. Ein solches Feld von Hand geändert und die Quelle passt nicht mehr: Rückfrage, ob die
 * Quelle geleert werden soll – nie still löschen. Hat das Ziel keinen Wert oder darf man es nicht lesen: nichts.
 */
function folgenWeg(z: Kern, vorbelege: (k: string, v: Roh) => Promise<void>) {
  const { typ } = z.p;
  const titel = (x: string) => titelOder(z.bekanntRef.current[x]?.titel);
  async function folge(k: string, v: Roh, vonHand = true) {
    const f = typ.felder.find((x) => x.key === k);
    if (!f || f.typ !== 'referenz' || z.nurLesen) return;
    if (vonHand) z.setGefolgt((g) => (g[k] ? Object.fromEntries(Object.entries(g).filter(([x]) => x !== k)) : g));
    const id = ersteId(ausRoh(f, v));
    if (!id) return;
    const ziele = typ.felder.filter(
      (x) => x.typ === 'referenz' && x.folgtAus?.feld === k && z.geschuetzt[x.key] === undefined && !z.ausgeblendet.has(x.key),
    );
    // Antwort zu spät (die Quelle hat sich inzwischen geändert): nichts weiter.
    if (ziele.length && !(await zieleFuellen(f, k, id, ziele))) return;
    if (vonHand) await quellePruefen(f, k, id);
  }
  /** Die Felder, die aus `k` folgen, aus der gewählten Mappe `id` füllen – eine Kette füllt sich weiter. false: veraltet. */
  async function zieleFuellen(f: FeldDef, k: string, id: string, ziele: FeldDef[]): Promise<boolean> {
    const r = await mappenApi.folgen(typ.id, { [k]: id }).catch(() => null);
    if (!r || ersteId(ausRoh(f, z.rohRef.current[k])) !== id) return false;
    for (const zf of ziele) {
      const e = r.felder[zf.key];
      if (!e?.wert) continue;
      const soll = e.wert;
      z.merke(soll, { titel: e.titel ?? '', typId: e.typId ?? '' });
      const jetzt = ausRoh(zf, z.rohRef.current[zf.key]);
      if (enthaeltId(jetzt, soll)) continue;
      if (!istLeer(jetzt)) {
        const ok = await rueckfrage({
          titel: t('ablage.folgen.aendern-titel', { feld: feldLabel(zf) }),
          text: t('ablage.folgen.aendern-text', {
            quelle: feldLabel(f),
            quelleTitel: titel(id),
            titel: titelOder(e.titel),
            jetzt: titel(ersteId(jetzt)),
          }),
          ja: t('ablage.folgen.aendern-ja', { feld: feldLabel(zf) }),
          nein: t('ablage.folgen.lassen'),
        });
        if (!ok || ersteId(ausRoh(f, z.rohRef.current[k])) !== id) continue;
      }
      const neu: Roh = zf.mehrfach
        ? [...new Set([...(Array.isArray(z.rohRef.current[zf.key]) ? (z.rohRef.current[zf.key] as string[]) : []), soll])]
        : soll;
      z.setRoh((x) => ({ ...x, [zf.key]: neu }));
      z.setGefolgt((g) => ({ ...g, [zf.key]: { quelle: k, wert: soll } }));
      z.oeffneAbschnitte([zf.key]);
      // Eine Kette (a aus b, b aus c) füllt sich weiter – und schlägt vor, was die gefolgte Mappe mitbringt (#1037).
      void folge(zf.key, neu, false);
      void vorbelege(zf.key, neu);
    }
    return true;
  }
  /** Von Hand geändert, und die Quelle passt nicht mehr dazu: fragen, ob sie geleert werden soll. */
  async function quellePruefen(f: FeldDef, k: string, id: string) {
    const qf = f.folgtAus ? typ.felder.find((x) => x.key === f.folgtAus!.feld && x.typ === 'referenz') : undefined;
    if (!qf || z.geschuetzt[qf.key] !== undefined) return;
    const qid = ersteId(ausRoh(qf, z.rohRef.current[qf.key]));
    if (!qid) return;
    const r = await mappenApi.folgen(typ.id, { [qf.key]: qid }).catch(() => null);
    const soll = r?.felder[k]?.wert;
    if (!soll || enthaeltId(ausRoh(f, z.rohRef.current[k]), soll) || ersteId(ausRoh(qf, z.rohRef.current[qf.key])) !== qid) return;
    const ok = await rueckfrage({
      titel: t('ablage.folgen.leeren-titel', { quelle: feldLabel(qf) }),
      text: t('ablage.folgen.leeren-text', {
        quelle: feldLabel(qf),
        quelleTitel: titel(qid),
        soll: titelOder(r!.felder[k].titel),
        neu: titel(id),
      }),
      ja: t('ablage.folgen.leeren-ja', { quelle: feldLabel(qf) }),
      nein: t('ablage.folgen.behalten'),
    });
    if (ok && ersteId(ausRoh(qf, z.rohRef.current[qf.key])) === qid) z.setRoh((x) => ({ ...x, [qf.key]: '' }));
  }
  return folge;
}

/** Eingabe in ein Feld: Wert setzen, Fehler am Feld weg, dann „folgt aus“ (#886) und „beim Auswählen übernehmen“ (#1037). */
export function eingabeWege(z: Kern) {
  const { vorbelege, vorbelegungZuruecknehmen } = vorbelegenWege(z);
  const folge = folgenWeg(z, vorbelege);
  const setze = (k: string, v: Roh) => {
    z.setRoh((r) => ({ ...r, [k]: v }));
    if (z.fehler?.felder[k])
      z.setFehler((f) => f && { ...f, felder: Object.fromEntries(Object.entries(f.felder).filter(([x]) => x !== k)) });
    void folge(k, v);
    void vorbelege(k, v);
  };
  return { vorbelege, vorbelegungZuruecknehmen, folge, setze };
}
