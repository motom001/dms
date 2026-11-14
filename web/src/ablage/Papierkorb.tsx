import { useEffect, useState } from 'react';
import { formatiere } from '../../../shared/src/model';
import { mappenApi, type PapierkorbEintrag } from '../api/mappen';
import { useDaten } from '../daten';
import { geheZu, Link } from '../ort';
import { titelOder } from '../seiten';
import { Person } from '../Person';
import { Knopf } from '../bausteine';
import { hinweis } from '../rueckfrage';
import { t, tn } from '../sprache';
import { typName, feldLabel } from '../../../shared/src/beschriftung';
import { basis, datumZeit, melde } from './papierkorbStand';

/**
 * Papierkorb (#43): eine Mappe im Papierkorb ansehen, wiederherstellen, endgültig löschen. Die Liste steht seit #1197
 * in PapierkorbListe.tsx, der Stand in papierkorbStand.ts.
 */
export { PapierkorbListe } from './PapierkorbListe';
export { usePapierkorb } from './papierkorbStand';

/** Eine Mappe im Papierkorb: ansehen, wiederherstellen, endgültig löschen. */
export function PapierkorbDetail({ id, werkbank }: { id: string; werkbank: boolean }) {
  const d = useDaten();
  const [e, setE] = useState<PapierkorbEintrag | null | 'fehlt'>(null);
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string>();
  const [gruppe, setGruppe] = useState<PapierkorbEintrag[] | null>(null);
  useEffect(() => {
    setE(null);
    mappenApi.papierkorbEintrag(id, werkbank).then((x) => {
      setE(x);
      // Vorgang (#424): die anderen Mappen, die zusammen gelöscht wurden.
      if (x.vorgang) (werkbank ? mappenApi.papierkorbWerkbank().then((r) => r.eintraege) : mappenApi.papierkorb()).then(setGruppe, () => setGruppe([]));
    }, () => setE('fehlt'));
  }, [id, werkbank]);

  if (e === null) return <p className="leise">{t('ablage.papierkorb.lade')}</p>;
  if (e === 'fehlt') return <div className="leer"><p>{t('ablage.papierkorb.diese-mappe-liegt-nicht')}</p></div>;
  const typ = d.typ(e.typId);
  const zusammen = e.vorgang ? (gruppe ?? []).filter((x) => x.vorgang === e.vorgang) : [];

  async function alleWiederherstellen() {
    if (!e || e === 'fehlt' || !e.vorgang) return;
    setLaeuft('alle'); setMeldung(undefined);
    try {
      const r = await mappenApi.vorgangWiederherstellen(e.vorgang, werkbank);
      melde(); await d.neuLaden();
      await hinweis({ titel: t('ablage.papierkorb.wiederhergestellt'), text: t('ablage.papierkorb.mappen-samt-dokumenten-2', { anzahl: r.mappen, wert: r.verweiseWieder ? t('ablage.papierkorb.entfernte-verweise-sind-wieder', { anzahl: r.verweiseWieder }) : '', wert2: r.verweiseEntfallen ? t('ablage.papierkorb.verweise-auf-mappen-die', { anzahl: r.verweiseEntfallen }) : '' }) });
      const start = r.startId ? zusammen.find((x) => x.id === r.startId) : undefined;
      geheZu(start ? `/ablage/${start.typId}/${start.id}` : basis(werkbank));
    } catch (x) { setMeldung((x as Error).message); setLaeuft(null); }
  }

  async function wiederherstellen() {
    setLaeuft('zurueck'); setMeldung(undefined);
    try {
      const r = await mappenApi.wiederherstellen(id, werkbank);
      melde(); await d.neuLaden();
      // Nach den Berechtigungen nicht mehr sichtbar (#126): Bescheid sagen und in den Papierkorb zurück.
      if (r.hinweis) { await hinweis({ titel: t('ablage.papierkorb.wiederhergestellt'), text: r.hinweis }); geheZu(basis(werkbank)); return; }
      // Passt sie nicht mehr (z. B. eindeutiger Wert inzwischen vergeben), zeigt die Mappe selbst den Grund.
      geheZu(`/ablage/${r.mappe.passt === false ? 'eingang' : r.mappe.typId}/${r.mappe.id}`);
    } catch (x) { setMeldung((x as Error).message); setLaeuft(null); }
  }
  async function endgueltig() {
    setLaeuft('weg'); setMeldung(undefined);
    try { await mappenApi.endgueltigLoeschen(id, werkbank); melde(); await d.neuLaden(); geheZu(basis(werkbank)); }
    catch (x) { setMeldung((x as Error).message); setLaeuft(null); }
  }

  const felder = (typ?.felder ?? []).filter((f) => f.typ !== 'passwort');
  return (
    <div className="einspaltig">
      <div className="mappenkopf">
        <p className="ueber">{t('ablage.papierkorb.im-papierkorb', { wert: typ ? typName(typ) : t('ablage.papierkorb.mappe') })}</p>
        <h1>{titelOder(e.titel)}</h1>
        <dl className="index">
          <div><dt>{t('ablage.papierkorb.geloescht')}</dt><dd>{datumZeit(e.geloescht)}{werkbank && <> {' '}{t('ablage.papierkorb.von-2')}{' '}<Person id={e.geloeschtVon} /></>}</dd></div>
          <div><dt>{t('ablage.papierkorb.angelegt')}</dt><dd>{t('ablage.papierkorb.von-3', { datumZeit: datumZeit(e.erstellt) })}{' '}<Person id={e.erstelltVon} /></dd></div>
          <div><dt>{t('ablage.papierkorb.zuletzt-geaendert')}</dt><dd>{t('ablage.papierkorb.von-3', { datumZeit: datumZeit(e.geaendert) })}{' '}<Person id={e.geaendertVon} /></dd></div>
        </dl>
      </div>
      <section className="blatt">
        <dl className="eigenschaften">
          {felder.map((f) => {
            const v = e.werte[f.key];
            const text = f.typ === 'referenz'
              ? (Array.isArray(v) ? v.length : v ? 1 : 0) ? t('ablage.papierkorb.verknuepfte-mappen', { anzahl: Array.isArray(v) ? v.length : 1 }) : ''
              // Zusammengesetzt (#1050): ohne die Titel verwiesener Mappen – wie die Verweise hier.
              : formatiere(f, v, () => '', { felder, werte: e.werte });
            return <div key={f.key} style={{ display: 'contents' }}><dt>{feldLabel(f)}</dt><dd>{text || <span className="leise">–</span>}</dd></div>;
          })}
          <dt>{t('ablage.papierkorb.dokumente-2')}</dt><dd>{e.dokumente || <span className="leise">{t('ablage.papierkorb.keine')}</span>}</dd>
        </dl>
      </section>
      {zusammen.length > 1 && (
        <div className="hinweis info"><p>
          {zusammen.some((x) => x.id === x.vorgang) ? t('ablage.papierkorb.zusammen-geloescht-von', { anzahl: zusammen.length - 1, titel: titelOder(zusammen.find((x) => x.id === x.vorgang)!.titel) }) : t('ablage.papierkorb.zusammen-geloescht', { anzahl: zusammen.length - 1 })}{tn('ablage.papierkorb.holt-alle-zurueck-samt', { b: <strong>{t('ablage.papierkorb.alle-wiederherstellen')}</strong> })}</p></div>
      )}
      {/* Aufgelöste Post (#936): kein Wiederherstellen – der Weg zurück ist, die neue Mappe zu löschen. */}
      {e.aufgeloestIn
        ? <div className="hinweis info"><p>{tn('ablage.papierkorb.aufgeloest-in', { typ: d.typ(e.aufgeloestIn.typId) ? typName(d.typ(e.aufgeloestIn.typId)!) : '', link: e.aufgeloestIn.da ? <Link to={`/ablage/${e.aufgeloestIn.typId}/${e.aufgeloestIn.id}`} className="verweis">{titelOder(e.aufgeloestIn.titel)}</Link> : titelOder(e.aufgeloestIn.titel) })}{' '}{t('ablage.papierkorb.aufgeloest-zurueck')}</p></div>
        : <p className="leise klein">{t('ablage.papierkorb.beim-wiederherstellen-kommen')}</p>}
      {meldung && <div className="hinweis schlecht"><p>{meldung}</p></div>}
      <div className="knoepfe">
        {/* Gefahr leise mit Symbol und Rückfrage (Leitsatz 4, 5); Wiederherstellen ist die Hauptaktion, blau (Leitsatz 1) –
            Grün bleibt „+ …“ vorbehalten (Leitsatz 2). */}
        <Knopf art="gefahr" symbol="geloescht" gesperrt={!!laeuft && laeuft !== 'weg'} laeuft={laeuft === 'weg'} laeuftText={t('ablage.papierkorb.loesche')} onClick={() => endgueltig()}
          rueckfrage={{ titel: t('ablage.papierkorb.endgueltig-loeschen-3', { titelOder: titelOder(e.titel) }), text: t('ablage.papierkorb.das-laesst-sich-nicht'), ja: t('ablage.papierkorb.endgueltig-loeschen-2') }}>{t('ablage.papierkorb.endgueltig-loeschen-2')}</Knopf>
        {!e.aufgeloestIn && <Knopf art={zusammen.length > 1 ? 'neben' : 'haupt'} symbol="zuruecksetzen" gesperrt={!!laeuft && laeuft !== 'zurueck'} laeuft={laeuft === 'zurueck'} laeuftText={t('ablage.papierkorb.stelle-wieder-her')} onClick={() => wiederherstellen()}>{zusammen.length > 1 ? t('ablage.papierkorb.nur-diese-wiederherstellen') : t('ablage.papierkorb.wiederherstellen')}</Knopf>}
        {zusammen.length > 1 && <Knopf art="haupt" symbol="zuruecksetzen" gesperrt={!!laeuft && laeuft !== 'alle'} laeuft={laeuft === 'alle'} laeuftText={t('ablage.papierkorb.stelle-wieder-her')} onClick={() => alleWiederherstellen()}>{t('ablage.papierkorb.alle-wiederherstellen-2', { zusammen: zusammen.length })}</Knopf>}
      </div>
    </div>
  );
}
