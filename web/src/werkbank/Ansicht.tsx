import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type WerkbankAnsichtStand } from '../api';
import { Hilfe } from '../Hilfe';
import { Link } from '../ort';
import { Speicherleiste, useEntwurf } from '../Speicherleiste';
import {
  ansichtAus, BEREICHE, fuerAlle, GRUPPEN, inVorlage, OHNE_EINSTELLUNG, sichtbar, VORLAGEN, type Gruppe, type Vorlage,
} from '../../../shared/src/werkbankansicht';

/**
 * Werkbank anpassen (#281): welche Bereiche in der Leiste stehen.
 * Ausblenden ist kein Abschalten – direkte Links, Hilfe und Hinweise der Übersicht führen weiter hin.
 */

export function useWerkbankAnsicht() {
  const [stand, setStand] = useState<WerkbankAnsichtStand | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => {
    try { setStand(await api.werkbankAnsicht()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); }
  }, []);
  useEffect(() => { void laden(); }, [laden]);
  /** Ohne Stand (z. B. ältere Server) bleibt alles sichtbar. */
  const zeigen = useCallback((pfad: string) => !stand || sichtbar(stand.installation, stand.eigene, pfad), [stand]);
  return { stand, setStand, fehler, laden, zeigen };
}
export type WerkbankAnsichtZustand = ReturnType<typeof useWerkbankAnsicht>;

/** Was der Dialog aus der Leiste über einen Bereich wissen muss: ein Hinweis. */
export interface BereichZustand { warn?: string | number }

export function AnsichtPanel({ z, zustand }: { z: WerkbankAnsichtZustand; zustand: Record<string, BereichZustand> }) {
  const s = z.stand;
  const [vorlage, setVorlage] = useState<Vorlage>('haushalt');
  const [alle, setAlle] = useState<Set<string>>(new Set());
  const [ich, setIch] = useState<Set<string>>(new Set());
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [laeuft, setLaeuft] = useState(false);

  const zuruecksetzen = useCallback(() => {
    const a = s?.installation ?? OHNE_EINSTELLUNG;
    setVorlage(a.vorlage);
    setAlle(new Set(BEREICHE.filter((b) => fuerAlle(a, b.pfad)).map((b) => b.pfad)));
    setIch(new Set(s?.eigene.ein ?? []));
  }, [s]);
  useEffect(() => { zuruecksetzen(); }, [zuruecksetzen]);

  const geaendert = useMemo(() => {
    if (!s) return false;
    const a = ansichtAus(vorlage, alle);
    const b = s.installation;
    const gleich = (x: string[], y: string[]) => x.length === y.length && x.every((v) => y.includes(v));
    return a.vorlage !== b.vorlage || !gleich(a.ein, b.ein) || !gleich(a.aus, b.aus) || !gleich([...ich].filter((p) => !alle.has(p)), s.eigene.ein);
  }, [s, vorlage, alle, ich]);
  // Noch nie eingestellt: Speichern geht auch ohne Änderung (übernimmt die Vorlage).
  const ent = useEntwurf(false, geaendert, { zuruecksetzen: () => { zuruecksetzen(); setMeldung(undefined); } });

  if (z.fehler) return <div className="hinweis schlecht"><p>{z.fehler}</p></div>;
  if (!s) return <p className="leise">Lade …</p>;

  function waehleVorlage(v: Vorlage) {
    setVorlage(v);
    setAlle(new Set(BEREICHE.filter((b) => inVorlage(v, b.pfad)).map((b) => b.pfad)));
  }
  const schalte = (menge: Set<string>, setze: (m: Set<string>) => void, pfad: string, an: boolean) => {
    const m = new Set(menge);
    if (an) m.add(pfad); else m.delete(pfad);
    setze(m);
  };
  async function speichern() {
    setLaeuft(true); setMeldung(undefined);
    try {
      const neu = await api.setzeWerkbankAnsicht({ installation: ansichtAus(vorlage, alle), eigene: { ein: [...ich].filter((p) => !alle.has(p)) } });
      z.setStand({ ...neu, benutzt: s?.benutzt });
      setMeldung({ art: 'gut', text: 'Gespeichert. Die Leiste links zeigt jetzt diese Bereiche.' });
    } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); } finally { setLaeuft(false); }
  }

  return (
    <div className="einspaltig">
      <div className="mappenkopf">
        <p className="ueber">Werkbank</p>
        <h1>Werkbank anpassen</h1>
        <p className="leise">Blende aus, was du nicht brauchst. <strong>Ausblenden schaltet nichts ab:</strong> Alles läuft weiter, Links und Hilfe führen weiter hin, und Hinweise wie „Sicherung zu alt“ erscheinen immer in der <Link to="/werkbank" className="verweis">Übersicht</Link>. <Hilfe ort="werkbank.ansicht" /></p>
      </div>
      {!s.eingestellt && <div className="hinweis"><p>Noch nicht eingestellt – bisher siehst du alle Bereiche. Für einen Haushalt reicht meist die Vorlage <strong>Haushalt</strong>.</p></div>}
      <form className="blatt" onSubmit={(x) => { x.preventDefault(); void speichern(); }} onKeyDown={ent.tasten}>
        <fieldset className="wahl">
          <legend className="h3">Vorlage für alle Administratoren</legend>
          {(Object.keys(VORLAGEN) as Vorlage[]).map((v) => (
            <label key={v} className="haken"><input type="radio" name="vorlage" value={v} checked={vorlage === v} onChange={() => waehleVorlage(v)} />
              <span><strong>{VORLAGEN[v].name}</strong> <span className="leise">– {VORLAGEN[v].text}</span></span></label>
          ))}
        </fieldset>
        <h2 className="h3">Bereiche</h2>
        <p className="leise klein">„Für alle“ gilt für jeden Administrator. „Nur für mich“ blendet einen Bereich zusätzlich bei dir ein.</p>
        {(Object.keys(GRUPPEN) as Gruppe[]).map((g) => (
          <div key={g} className="ansichtgruppe">
            <h3 className="gruppentitel">{GRUPPEN[g]}</h3>
            <ul className="stapel">
              {BEREICHE.filter((b) => b.gruppe === g).map((b) => {
                const zst = zustand[b.pfad] ?? {};
                const fuerAlleAn = alle.has(b.pfad);
                const benutzt = !fuerAlleAn && !ich.has(b.pfad) && (s.benutzt?.includes(b.pfad) || zst.warn);
                return (
                  <li key={b.pfad} className="ansichtzeile">
                    <span className="ansichtname"><strong>{b.name}</strong> <span className="leise klein">{b.wann}</span>
                      {benutzt ? <span className="chip warn" title="Bleibt aktiv – nur die Leiste zeigt ihn nicht.">{zst.warn ? 'mit Hinweis' : 'eingerichtet'}, aber ausgeblendet</span> : null}</span>
                    <span className="ansichtwahl">
                      <label className="haken"><input type="checkbox" checked={fuerAlleAn} aria-label={`${b.name} für alle zeigen`} onChange={(x) => schalte(alle, setAlle, b.pfad, x.target.checked)} /><span>für alle</span></label>
                      <label className="haken"><input type="checkbox" checked={fuerAlleAn || ich.has(b.pfad)} disabled={fuerAlleAn} aria-label={`${b.name} nur für mich zeigen`} onChange={(x) => schalte(ich, setIch, b.pfad, x.target.checked)} /><span>nur für mich</span></label>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {meldung && <div className={`hinweis ${meldung.art}`}><p>{meldung.text}</p></div>}
        <Speicherleiste ent={ent} gegenstand="Auswahl" sendet={laeuft} speicherbar={!s.eingestellt} />
      </form>
    </div>
  );
}
