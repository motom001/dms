import { feldLabel, typName } from '../../../../shared/src/beschriftung';
import { istLeer } from '../../../../shared/src/model';
import { mappenApi } from '../../api/mappen';
import type { TypVorschlaege } from '../../api/werkbank';
import { hinweis, rueckfrage } from '../../rueckfrage';
import { titelOder } from '../../seiten';
import { t } from '../../sprache';
import { ausRoh, zuRoh, type Roh, type RohWerte } from '../../werte';
import type { AusDokumentErgebnis } from '../AusDokument';
import { neueUid } from './hilfen';
import type { Kern } from './kern';
import { vorbelegtAusVorschlaegen, type FeldVorschlag } from './werte';

/**
 * „Aus Dokument ausfüllen“ (#391): Vorschläge eintragen, zurücknehmen, Alternativen übernehmen und erkannte Mappen neu
 * anlegen. `setze` ist die Eingabe von Hand (mit „folgt aus“ und „beim Auswählen übernehmen“).
 */
export function ausDokumentWege(z: Kern, setze: (k: string, v: Roh) => void) {
  const { typ, mappe } = z.p;
  /** Vorschläge eintragen (#391): leere Felder bekommen den Wert, gefüllte eine Alternative; nichts ist gespeichert. */
  function uebernimmVorschlaege({ r, dateien, ablegen }: AusDokumentErgebnis): RohWerte {
    const { neu, werte } = feldVorschlaege(r);
    // Beim Auswählen übernehmen (#1037): Werte aus einer vorgeschlagenen Mappe.
    const vb = vorbelegtAusVorschlaegen(typ, r, z.roh, werte, (k) => z.geschuetzt[k] === undefined && !z.ausgeblendet.has(k));
    Object.assign(werte, vb.werte);
    const marken = vb.marken;
    for (const [id, b] of Object.entries(r.bezuege)) z.merke(id, b);
    z.setRoh((x) => ({ ...x, ...werte }));
    z.setVorschlaege(neu);
    z.setVorbelegt((x) => ({ ...x, ...marken }));
    // Abschnitte mit Vorschlägen klappen auf (#890).
    z.oeffneAbschnitte([...Object.keys(neu), ...Object.keys(marken)]);
    z.setAdNeu(
      Object.fromEntries(
        Object.entries(r.neu).filter(([k]) =>
          istLeer(
            ausRoh(
              typ.felder.find((x) => x.key === k)!,
              z.roh[k],
            ),
          ),
        ),
      ),
    );
    merkeDanach(r);
    if (ablegen && dateien.length)
      z.setNeueDateien((x) => [...x, ...dateien.map((datei) => ({ uid: neueUid(), datei, register: ablegen }))]);
    z.setAdMeldung(meldungZu(r, neu, Object.keys(marken).length));
    z.setAdOffen(false);
    // Zum ersten Feldregister mit einem Vorschlag.
    const ziel = z.register.find((x) => x.art === 'felder' && z.felderAuf(x).some((f) => neu[f.key]));
    if (ziel) z.setAktiv(ziel.key);
    return werte;
  }
  /** Je Vorschlag: in ein leeres Feld eintragen, sonst als Alternative zeigen; Ausgeblendete (#655) bekommen nichts. */
  function feldVorschlaege(r: TypVorschlaege) {
    const neu: Record<string, FeldVorschlag> = {};
    const werte: RohWerte = {};
    for (const [k, v] of Object.entries(r.vorschlaege)) {
      const f = typ.felder.find((x) => x.key === k);
      // Ausgeblendete Felder (#655) bekommen nichts – den Vorschlag sähe niemand.
      if (!f || z.geschuetzt[k] !== undefined || z.ausgeblendet.has(k) || v.aus) continue;
      const vorschlag = zuRoh(f, v.wert);
      if (istLeer(ausRoh(f, z.roh[k]))) {
        werte[k] = vorschlag;
        neu[k] = { ...v, art: 'eingetragen', vorher: z.roh[k] };
      } else if (JSON.stringify(z.roh[k]) !== JSON.stringify(vorschlag)) neu[k] = { ...v, art: 'alternative' };
    }
    return { neu, werte };
  }
  /** E-Rechnung und „gehört dazu“ (#1043): was beim Speichern noch geschieht – zunächst angehakt. */
  function merkeDanach(r: TypVorschlaege) {
    // Hat die Mappe schon Positionen, ist der Haken aus – sonst lägen sie doppelt da.
    z.setAdPositionen(r.positionen?.zeilen.length && z.d.typ(r.positionen.typId) ? { ...r.positionen, an: !r.positionen.vorhanden } : null);
    z.setAdDazu((r.dazu ?? []).filter((x) => x.mappeId !== mappe?.id).map((x) => ({ ...x, an: true })));
  }
  function vorschlagZuruecknehmen(k: string) {
    const v = z.vorschlaege[k];
    if (v?.art === 'eingetragen')
      z.setRoh((x) => ({
        ...x,
        [k]:
          v.vorher ??
          zuRoh(
            typ.felder.find((f) => f.key === k)!,
            null,
          ),
      }));
    z.setVorschlaege((x) => Object.fromEntries(Object.entries(x).filter(([y]) => y !== k)));
  }
  function alternativeUebernehmen(k: string) {
    const v = z.vorschlaege[k];
    const f = typ.felder.find((x) => x.key === k);
    if (!v || !f) return;
    const vorher = z.roh[k];
    setze(k, zuRoh(f, v.wert));
    z.setVorschlaege((x) => ({ ...x, [k]: { ...v, art: 'eingetragen', vorher } }));
  }
  return { uebernimmVorschlaege, vorschlagZuruecknehmen, alternativeUebernehmen, neuAnlegen: neuAnlegenWeg(z, setze) };
}

/** „Verstanden – bitte prüfen“ mit der Zahl der Vorschläge, dazu womit erkannt wurde. */
function meldungZu(r: TypVorschlaege, neu: Record<string, FeldVorschlag>, vorbelegt: number) {
  const n = Object.values(neu).filter((v) => v.art === 'eingetragen').length + vorbelegt;
  const alt = Object.values(neu).filter((v) => v.art === 'alternative').length;
  const teile = [
    n ? t('ablage.mappeformular.felder-als-vorschlag-eingetragen', { anzahl: n }) : '',
    alt ? t('ablage.mappeformular.alternativen-zu-ausgefuellten', { anzahl: alt }) : '',
  ].filter(Boolean);
  // Erkennung per Paket (#511): womit erkannt wurde bzw. warum die eingebaute übernahm.
  // Gekürzt (#564): Der KI-Dienst hat nur einen Teil des Texts gelesen – das sagen, nie still abschneiden.
  const herkunft = [
    r.engine?.art === 'paket' ? t('erkennung.ergebnis.paket', { name: r.engine.name }) : '',
    r.gekuerzt ? t('erkennung.ergebnis.gekuerzt') : '',
    r.hinweis ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return `${teile.length ? t('ablage.mappeformular.verstanden-bitte-pruefen-und', { teile: teile.join(', ') }) : t('ablage.mappeformular.gelesen-aber-keine-passenden')}${herkunft ? ` ${herkunft}` : ''}`;
}

/** Erkannte Mappe, die es noch nicht gibt (#391): nach Rückfrage anlegen und ins Feld eintragen. */
function neuAnlegenWeg(z: Kern, setze: (k: string, v: Roh) => void) {
  return async function neuAnlegen(k: string) {
    const n = z.adNeu[k];
    const f = z.p.typ.felder.find((x) => x.key === k);
    const ziel = z.d.typ(n?.typId);
    if (!n || !f || !ziel) return;
    const liste = Object.entries(n.werte)
      .map(([key, w]) => `${((f2) => (f2 ? feldLabel(f2) : key))(ziel.felder.find((x) => x.key === key))}: ${w}`)
      .join(' · ');
    if (
      !(await rueckfrage({
        titel: t('ablage.mappeformular.neue-mappe-anlegen', { name: typName(ziel) }),
        text: t('ablage.mappeformular.mit-diesen-angaben-du', { liste }),
        ja: t('ablage.mappeformular.anlegen'),
      }))
    )
      return;
    try {
      const m = await mappenApi.mappeAnlegen({ typId: ziel.id, werte: n.werte });
      z.merke(m.id, { titel: m.titel ?? '', typId: m.typId });
      const vorher = z.roh[k];
      setze(k, f.mehrfach ? [m.id] : m.id);
      z.setVorschlaege((x) => ({
        ...x,
        [k]: {
          wert: m.id,
          sicherheit: 'mittel',
          fundstelle: t('ablage.mappeformular.neu-angelegt', { titelOder: titelOder(m.titel) }),
          art: 'eingetragen',
          vorher,
        },
      }));
      z.setAdNeu((x) => Object.fromEntries(Object.entries(x).filter(([y]) => y !== k)));
      await z.d.neuLaden();
    } catch (e) {
      await hinweis({ titel: t('ablage.mappeformular.nicht-angelegt'), text: (e as Error).message });
    }
  };
}
