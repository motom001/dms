import { useCallback, useEffect, useState } from 'react';
import { Schalter } from '../bausteine';
import { betriebApi, type DatenStand } from '../api/betrieb';
import { t } from '../sprache';
import { Kopf } from './Kopf';

/**
 * Werkbank → Daten sichern → Einstellungen (#1196, #1197): dauerhafte Einstellungen, die vorher mitten in den
 * Abläufen unter „Daten sichern“ standen. Hier: „Was Benutzer selbst dürfen“ (Meine Daten exportieren, #255).
 */
export function useDatenEinstellungen(offen: boolean) {
  const [stand, setStand] = useState<DatenStand | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => { try { setStand(await betriebApi.daten()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); } }, []);
  useEffect(() => { if (offen) void laden(); }, [offen, laden]);
  return { stand, fehler, laden };
}
export type DatenEinstellungenZustand = ReturnType<typeof useDatenEinstellungen>;

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
      <BenutzerDuerfen an={s.persoenlich} laden={z.laden} />
    </div>
  );
}
