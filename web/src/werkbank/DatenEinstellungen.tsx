import { useCallback, useEffect, useState } from 'react';
import { Feld, Schalter } from '../bausteine';
import { betriebApi, type DatenStand } from '../api/betrieb';
import { mappenApi } from '../api/mappen';
import { useDaten } from '../daten';
import { rueckfrage } from '../rueckfrage';
import { Speicherleiste, useEntwurf } from '../Speicherleiste';
import { t } from '../sprache';
import { melde } from '../ablage/papierkorbStand';
import { Kopf } from './Kopf';

/**
 * Werkbank → Daten sichern → Einstellungen (#1196, #1197): dauerhafte Einstellungen, die vorher mitten in den
 * Abläufen unter „Daten sichern“ standen: Aufbewahrung im Papierkorb (#43, #800; vorher oben im Papierkorb) und „Was
 * Benutzer selbst dürfen“ (Meine Daten exportieren, #255; vorher im Vollexport).
 */
export function useDatenEinstellungen(offen: boolean) {
  const [stand, setStand] = useState<DatenStand | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => { try { setStand(await betriebApi.daten()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); } }, []);
  useEffect(() => { if (offen) void laden(); }, [offen, laden]);
  return { stand, fehler, laden };
}
export type DatenEinstellungenZustand = ReturnType<typeof useDatenEinstellungen>;

/** Papierkorb (#1197): wie lange Gelöschtes bleibt, wie lange die Historie endgültig gelöschter Mappen. */
function Papierkorb({ s, laden }: { s: DatenStand; laden(): Promise<void> }) {
  const d = useDaten();
  const [tage, setTage] = useState(String(s.tage));
  const [hTage, setHTage] = useState(String(s.historieTage));
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const n = Number(tage);
  const h = Number(hTage);
  const ent = useEntwurf({ tage: String(s.tage), hTage: String(s.historieTage) }, { tage, hTage }, {
    zuruecksetzen: () => { setTage(String(s.tage)); setHTage(String(s.historieTage)); setMeldung(undefined); },
  });
  async function speichern() {
    if (n === 0 && s.imPapierkorb && !(await rueckfrage({ titel: t('ablage.papierkorb.papierkorb-ausschalten'), text: t('ablage.papierkorb.alle-eintraege-darin-werden', { anzahl: s.imPapierkorb }), ja: t('ablage.papierkorb.ausschalten-und-leeren'), gefahr: true }))) return;
    try {
      const r = await mappenApi.papierkorbTage({ tage: n, historieTage: h });
      setTage(String(r.tage)); setHTage(String(r.historieTage)); melde(); await d.neuLaden(); await laden();
      setMeldung({ art: 'gut', text: t('ablage.papierkorb.gespeichert', { wert: r.geleert ? t('ablage.papierkorb.mappen-endgueltig-geloescht', { anzahl: r.geleert }) : '' }) });
    } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }
  return (
    <form className="blatt" id="papierkorb" onSubmit={(ev) => { ev.preventDefault(); void speichern(); }} onKeyDown={ent.tasten}>
      <h2 className="h3">{t('werkbank.daten.papierkorb.titel')}</h2>
      <Feld beschriftung={t('ablage.papierkorb.tage-feld')} hinweis={[t('ablage.papierkorb.0-kein-papierkorb-loeschen'), t('ablage.papierkorb.geloeschte-mappen-und-einzeln')]}>
        <input type="number" min={0} max={3650} value={tage} onChange={(ev) => { setTage(ev.target.value); setMeldung(undefined); }} />
      </Feld>
      <Feld beschriftung={t('ablage.papierkorb.historie-feld')} hinweis={t('ablage.papierkorb.tage-danach-wird-ihre')}>
        <input type="number" min={0} max={36500} value={hTage} onChange={(ev) => { setHTage(ev.target.value); setMeldung(undefined); }} />
      </Feld>
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
      <Speicherleiste ent={ent} gegenstand={t('ablage.papierkorb.aufbewahrung')} ungueltig={!Number.isInteger(n) || n < 0 || !Number.isInteger(h) || h < 0} />
    </form>
  );
}

/** „Was Benutzer selbst dürfen“: Meine Daten exportieren (#255) – an oder aus für alle. */
function BenutzerDuerfen({ an, laden }: { an: boolean; laden(): Promise<void> }) {
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  async function setze(neu: boolean) {
    setMeldung(undefined);
    try {
      await betriebApi.persoenlicherExport(neu); await laden();
      setMeldung({ art: 'gut', text: neu ? t('werkbank.daten.export.an') : t('werkbank.daten.export.aus') });
    } catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); }
  }
  return (
    <section className="blatt" id="benutzer-duerfen">
      <h2 className="h3">{t('werkbank.daten.benutzer.titel')}</h2>
      <Schalter an={an} beschriftung={t('werkbank.daten.export.schalter')} hinweis={t('werkbank.daten.export.hinweis')} setze={(neu) => setze(neu)} />
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
    </section>
  );
}

export function DatenEinstellungenPanel({ z }: { z: DatenEinstellungenZustand }) {
  const s = z.stand;
  if (!s) return z.fehler ? <div className="hinweis schlecht"><p>{z.fehler}</p></div> : <p className="leise">{t('werkbank.daten.lade')}</p>;
  return (
    <div className="einspaltig">
      <Kopf titel={t('werkbank.bereich.daten.name')} ueber={t('werkbank.daten.ueber')} hilfe="werkbank.daten">
        <p className="leise">{t('werkbank.daten.einleitung')}</p>
      </Kopf>
      <Papierkorb key={`${s.tage}|${s.historieTage}`} s={s} laden={z.laden} />
      <BenutzerDuerfen an={s.persoenlich} laden={z.laden} />
    </div>
  );
}
