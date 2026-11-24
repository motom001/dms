import { useContext, type ReactNode } from 'react';
import { feldHilfe, feldLabel } from '../../../../shared/src/beschriftung';
import { formatiere, mehrereZiele, type Feld as FeldDef } from '../../../../shared/src/model';
import { Etikett, type FeldProps, NurLesenFeld } from '../../bausteine';
import { useDaten } from '../../daten';
import { Link } from '../../ort';
import { Ehemalig } from '../../Person';
import { titelOder } from '../../seiten';
import { t } from '../../sprache';
import { ausRoh } from '../../werte';
import { Formatiert } from '../Formatiert';
import { TypMarke } from '../TypMarke';
import { Uebersetzbar } from '../Uebersetzung';
import { FeldIdPraefix } from '../ebenen';
import { eingabe, type FeldEingabeProps } from './eingaben';
import { FormatWert, useUebernahmeFeld } from './feld-teile';
import { feldUebersetzbar, unpassendText } from './hilfen';

export function FeldEingabe(p: FeldEingabeProps) {
  const { feld: f, fehler, eigeneId, gesperrt, gespeichert, zusatz } = p;
  const d = useDaten();
  // Ebenen der Neuen Post (#1596): Die Mappe darunter steht unsichtbar weiter im DOM – eigene ids je Ebene.
  const id = `feld-${useContext(FeldIdPraefix)}${f.key}`;
  const ue = useUebernahmeFeld(f, gesperrt !== undefined);
  // Übersetzung anzeigen (#732): unter dem Feld, nur lesbar – bearbeitet wird weiter das Original im Feld.
  const uebersetzung =
    eigeneId && typeof gespeichert === 'string' && feldUebersetzbar(f, gespeichert) ? (
      <Uebersetzbar
        quelle={{ art: 'feld', mappe: eigeneId, feld: f.key }}
        original={gespeichert}
        ersetzen={false}
        darstellen={(x) => (f.typ === 'formatiert' ? <Formatiert text={x} /> : <span className="mehrzeilig">{x}</span>)}>
        {null}
      </Uebersetzbar>
    ) : null;

  if (gesperrt !== undefined)
    // Nur lesen (#1034): ein Aussehen für geschützte, berechnete und zusammengesetzte Felder (#1050) – nur die Herkunft
    // darunter unterscheidet sich.
    return (
      <NurLesenFeld
        beschriftung={feldLabel(f)}
        herkunft={gesperrt || undefined}
        symbol={f.berechnetVon || f.typ === 'zusammengesetzt' ? 'rechnen' : 'schloss'}
        breit={f.typ === 'langtext' || f.typ === 'formatiert'}
        className="feld"
        anker={`mappe.feld:${f.key}`}
        unter={
          uebersetzung || fehler ? (
            <>
              {uebersetzung}
              {fehler && <p className="fehlertext">{fehler}</p>}
            </>
          ) : undefined
        }>
        {nurLesenWert(p)}
      </NurLesenFeld>
    );

  const rahmen = rahmenVon(f, fehler, id, ue.nummern);
  // Unter der Eingabe: Übersetzung (#732), Vorschläge und Markierungen (#391, #886, #1037), Hinweise der Seite „Dokument übernehmen“.
  const unter = (
    <>
      {uebersetzung}
      {zusatz}
      {ue.unter}
    </>
  );
  const { ctl, breit } = eingabe(p, { rahmen, unter, id, typ: d.typ });

  // Zelle im Raster der Mappe: Breite, Sprungziel und die Brücke zum Dokument (#934) – der Rahmen selbst ist der Baustein.
  return (
    <div className={`feld ${breit ? 'breit' : ''}${ue.klasse}`} data-anker={`mappe.feld:${f.key}`} {...ue.props}>
      {ctl}
    </div>
  );
}

/**
 * Feldrahmen (#967, #1211): Beschriftung ohne „*“, freiwillige Felder mit „(optional)“ (C4), Hilfe und „nur negativ“
 * als Hinweis, der Fehler direkt unter der Eingabe; rechts im Kopf die Rahmen-Nummern (#934). Die Art eines Verweises
 * („Bezug“, „Zugehörigkeit“) steht nur in der Werkbank (#1288): In der Ablage setzt sie Werkbank-Wissen voraus.
 */
function rahmenVon(f: FeldDef, fehler: string | undefined, id: string, nummern: ReactNode): Omit<FeldProps, 'children'> {
  return {
    id,
    beschriftung: feldLabel(f),
    fehler,
    optional: !f.pflicht && f.typ !== 'janein' && f.typ !== 'formatiert' && f.typ !== 'passwort',
    hinweis: [f.hilfe ? feldHilfe(f) : null, f.typ === 'betrag' && f.negativ ? t('felder.eingabe.betrag-negativ') : null],
    kopfZusatz: nummern || undefined,
  };
}

/** Der Wert eines Felds, das hier nur angezeigt wird (geschützt, berechnet, zusammengesetzt, ohne Recht zum Bearbeiten). */
function nurLesenWert({ feld: f, roh, bekannt, unpassend, gruende, typFelder = [] }: FeldEingabeProps): ReactNode {
  if (f.typ === 'referenz') {
    const ids = Array.isArray(roh) ? (roh as string[]) : roh ? [String(roh)] : [];
    return (
      <ul>
        {ids.map((x) => (
          <li key={x}>
            {bekannt[x]?.typId && !bekannt[x].verborgen ? (
              <>
                <Link to={`/ablage/${bekannt[x].typId}/${x}`} className="verweis">
                  <Ehemalig id={x}>{titelOder(bekannt[x].titel)}</Ehemalig>
                </Link>
                {mehrereZiele(f) && <TypMarke typId={bekannt[x].typId} />}
              </>
            ) : (
              <span className={bekannt[x]?.verborgen ? 'verborgen-titel' : ''}>{titelOder(bekannt[x]?.titel)}</span>
            )}
            {/* Wer nur liest, sieht die Markierung am Feld, aber keine Aufforderung (#887). */}
            {unpassend?.includes(x) && (
              <>
                {' '}
                <Etikett art="warn" title={t('felder.verweis.unpassend.titel')}>
                  {unpassendText(typFelder, gruende?.[x] ?? [])}
                </Etikett>
              </>
            )}
          </li>
        ))}
      </ul>
    );
  }
  if (f.typ === 'janein') return roh ? t('ablage.mappeformular.ja') : t('ablage.mappeformular.nein');
  if (f.typ === 'formatiert') return roh ? <Formatiert text={String(roh)} /> : null;
  if (f.typ === 'datum') return formatiere(f, String(roh ?? ''));
  if (f.typ === 'zeitraum' || f.typ === 'prozent' || f.typ === 'betrag') return formatiere(f, ausRoh(f, roh));
  if (f.typ === 'langtext') return roh ? <span className="mehrzeilig">{String(roh)}</span> : null;
  if (f.typ === 'text' && f.format && roh) return <FormatWert f={f} wert={String(roh)} />;
  return String(roh ?? '');
}
