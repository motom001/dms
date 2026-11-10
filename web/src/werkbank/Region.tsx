import { useCallback, useEffect, useState } from 'react';
import { setzeZeitzone } from '../../../shared/src/region';
import { api, type Region, type RegionStand } from '../api';
import { Speicherleiste, useEntwurf } from '../Speicherleiste';
import { t } from '../sprache';
import { gebietsschema } from '../../../shared/src/sprache';
import { Kopf } from './Kopf';

/**
 * Werkbank → Einstellungen → Region (#726): Land, Bundesland und Zeitzone an einer Stelle,
 * dazu die Feiertage des laufenden Jahres als Vorschau.
 */
export function useRegion(offen: boolean) {
  const [stand, setStand] = useState<RegionStand | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => { try { setStand(await api.region()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); } }, []);
  useEffect(() => { if (offen) void laden(); }, [offen, laden]);
  return { stand, fehler, laden, setStand };
}
export type RegionZustand = ReturnType<typeof useRegion>;

const datum = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(gebietsschema(), { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC' });

export function RegionPanel({ z }: { z: RegionZustand }) {
  const s = z.stand;
  const [e, setE] = useState<Region | null>(null);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [sendet, setSendet] = useState(false);
  useEffect(() => { if (s && !e) setE(s.region); }, [s, e]);
  const ent = useEntwurf(s?.region ?? null, e, { aus: !e, zuruecksetzen: () => { setE(s?.region ?? null); setMeldung(undefined); } });
  if (!s || !e) return z.fehler ? <div className="hinweis schlecht"><p>{z.fehler}</p></div> : <p className="leise">{t('werkbank.region.lade')}</p>;
  async function speichern() {
    setSendet(true);
    try {
      const n = await api.regionSetzen(e!);
      z.setStand(n); setE(n.region); setzeZeitzone(n.region.zeitzone);
      setMeldung({ art: 'gut', text: t('werkbank.region.gespeichert') });
    } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); } finally { setSendet(false); }
  }
  // Eine gespeicherte Zone, die nicht in der Liste steht (z. B. über die Schnittstelle), bleibt wählbar.
  const zonen = s.zeitzonen.includes(e.zeitzone) ? s.zeitzonen : [e.zeitzone, ...s.zeitzonen];
  const jahr = s.feiertage[0]?.datum.slice(0, 4) ?? '';
  return (
    <div className="einspaltig">
      <Kopf titel={t('werkbank.bereich.region.name')} ueber={t('werkbank.region.ueber')} hilfe="werkbank.region">
        <p className="leise">{t('werkbank.region.einleitung')}</p>
      </Kopf>
      {meldung && <div className={`hinweis ${meldung.art}`} role="status"><p>{meldung.text}</p></div>}
      <form className="blatt" onSubmit={(x) => { x.preventDefault(); void speichern(); }} onKeyDown={ent.tasten}>
        <label className="eigenschaft"><span>{t('werkbank.region.land')}</span>
          <select id="region-land" value={e.land} onChange={(x) => setE({ ...e, land: x.target.value })}>
            {Object.entries(s.laender).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></label>
        <label className="eigenschaft"><span>{t('werkbank.region.bundesland')} <small>{t('werkbank.region.bundesland.hinweis')}</small></span>
          <select id="region-bundesland" value={e.bundesland ?? ''} onChange={(x) => setE({ ...e, bundesland: x.target.value || null })}>
            <option value="">{t('werkbank.region.bundesland.keins')}</option>
            {Object.entries(s.bundeslaender).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></label>
        <label className="eigenschaft"><span>{t('werkbank.region.zeitzone')} <small>{t('werkbank.region.zeitzone.hinweis')}</small></span>
          <select id="region-zeitzone" value={e.zeitzone} onChange={(x) => setE({ ...e, zeitzone: x.target.value })}>
            {zonen.map((zz) => <option key={zz} value={zz}>{zz.replace(/_/g, ' ')}</option>)}
          </select></label>
        <Speicherleiste ent={ent} gegenstand={t('werkbank.bereich.region.name')} sendet={sendet} />
      </form>
      <section className="blatt" aria-labelledby="region-feiertage">
        <h2 className="h3" id="region-feiertage">{jahr ? t('werkbank.region.feiertage.jahr', { jahr }) : t('werkbank.region.feiertage')}</h2>
        {ent.geaendert && <p className="leise klein">{t('werkbank.region.feiertage.gespeichert')}</p>}
        {!s.region.bundesland
          ? <p className="leise">{t('werkbank.region.feiertage.ohne')}</p>
          : <ul>{s.feiertage.map((f) => <li key={f.datum}><span className="leise">{datum(f.datum)}</span> {f.name}</li>)}</ul>}
        <p className="leise klein">{t('werkbank.region.feiertage.wofuer')}</p>
      </section>
    </div>
  );
}
