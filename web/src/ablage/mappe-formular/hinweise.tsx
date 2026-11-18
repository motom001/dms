import type { ReactNode } from 'react';
import { feldLabel } from '../../../../shared/src/beschriftung';
import { enthaeltId } from '../../../../shared/src/folgtaus';
import { formatiere, istLeer, verweisAusText, type Feld as FeldDef } from '../../../../shared/src/model';
import { Knopf } from '../../bausteine';
import { titelOder } from '../../seiten';
import { t } from '../../sprache';
import { ausRoh, zuRoh } from '../../werte';
import type { Kern } from './kern';

/** Was die Hinweise am Feld auslösen können: Vorschlag zurücknehmen, Alternative übernehmen, Vorbelegung zurücknehmen. */
interface HinweisWege {
  vorschlagZuruecknehmen(k: string): void;
  alternativeUebernehmen(k: string): void;
  vorbelegungZuruecknehmen(k: string): void;
}

/** Hinweise unter einem Feld: Vorschlag aus dem Dokument (#391), „aus …“ (#886), „vorgeschlagen aus …“ (#1037), Alttext (#534). */
export function feldHinweise(z: Kern, w: HinweisWege) {
  const { typ, mappe } = z.p;
  /** Hinweis am Feld: Vorschlag (solange der Wert noch so ist) bzw. Alternative aus dem Dokument. */
  function vorschlagAm(f: FeldDef): ReactNode {
    const v = z.vorschlaege[f.key];
    if (!v) return null;
    const sicher = v.sicherheit === 'hoch' ? 'sicher' : v.sicherheit === 'mittel' ? 'wahrscheinlich' : 'unsicher';
    if (v.art === 'eingetragen') {
      if (JSON.stringify(z.roh[f.key]) !== JSON.stringify(zuRoh(f, v.wert))) return null;
      return (
        <p className="ad-hinweis">
          <span className="chip">{t('ablage.mappeformular.vorschlag')}</span>{' '}
          {v.hinweis && (
            <>
              <strong>{v.hinweis}</strong>{' '}
            </>
          )}
          <span className="leise">
            {sicher}
            {v.fundstelle ? <> – „{v.fundstelle}“</> : null}
          </span>{' '}
          <Knopf groesse="klein" onClick={() => w.vorschlagZuruecknehmen(f.key)}>
            {t('ablage.mappeformular.zuruecknehmen')}
          </Knopf>
        </p>
      );
    }
    const text =
      f.typ === 'referenz' ? titelOder(z.bekannt[String(Array.isArray(v.wert) ? v.wert[0] : v.wert)]?.titel) : formatiere(f, v.wert);
    return (
      <p className="ad-hinweis">
        <span className="chip">{t('ablage.mappeformular.im-dokument')}</span> <strong>{text}</strong>{' '}
        <span className="leise">
          ({sicher}){v.hinweis ? ` – ${v.hinweis}` : ''}
        </span>{' '}
        <Knopf groesse="klein" onClick={() => w.alternativeUebernehmen(f.key)}>
          {t('ablage.mappeformular.uebernehmen')}
        </Knopf>{' '}
        <Knopf groesse="klein" onClick={() => w.vorschlagZuruecknehmen(f.key)}>
          {t('ablage.mappeformular.verwerfen')}
        </Knopf>
      </p>
    );
  }
  function hinweisAm(f: FeldDef): ReactNode {
    /** Altes Textfeld nach einem Paket-Update (#534): leer ausgeblendet, sonst mit Hinweis auf die Umwandlung. */
    const v = verweisAusText(typ, f);
    const g = z.gefolgt[f.key];
    const q = g && enthaeltId(ausRoh(f, z.roh[f.key]), g.wert) ? typ.felder.find((x) => x.key === g.quelle) : undefined;
    // Beim Auswählen übernehmen (#1037): gleiche Kennzeichnung wie im Einrichtungsassistenten, solange der Wert so bleibt.
    const vb = z.vorbelegt[f.key];
    const vorbelegtHier = vb && JSON.stringify(z.roh[f.key] ?? null) === JSON.stringify(vb.wert ?? null);
    const zusatz = (
      <>
        {vorschlagAm(f)}
        {q && (
          <p className="ad-hinweis folgt">
            <span className="chip">{t('ablage.folgen.aus', { feld: feldLabel(q) })}</span>
          </p>
        )}
        {vorbelegtHier && !z.nurLesen && (
          <p className="ad-hinweis vorbelegt">
            <span className="chip">{vb.text}</span>{' '}
            <Knopf groesse="klein" onClick={() => w.vorbelegungZuruecknehmen(f.key)}>
              {t('ablage.mappeformular.zuruecknehmen')}
            </Knopf>
          </p>
        )}
      </>
    );
    if (!v || istLeer(mappe?.werte[f.key])) return zusatz;
    return (
      <>
        {zusatz}
        <small className="hilfe">{t('pakete.formular.alttext', { feld: v.label })}</small>
      </>
    );
  }
  return hinweisAm;
}
