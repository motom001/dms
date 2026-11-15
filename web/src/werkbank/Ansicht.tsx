import { useCallback, useEffect, useMemo, useState } from 'react';
import { werkbankApi, type WerkbankAnsichtStand } from '../api/werkbank';
import { Link } from '../ort';
import { FeldGruppe } from '../bausteine';
import { Speicherleiste, useEntwurf } from '../Speicherleiste';
import {
  ansichtAus, BEREICHE, fuerAlle, GRUPPEN, inVorlage, OHNE_EINSTELLUNG, sichtbar, STUFEN, VORLAGEN, vorlageFuer, type Gruppe, type Vorlage,
} from '../../../shared/src/werkbankansicht';
import { t, tn } from '../sprache';
import { Kopf } from './Kopf';
import { useDaten } from '../daten';

/**
 * Werkbank anpassen (#281): welche Bereiche in der Leiste stehen.
 * Ausblenden ist kein Abschalten – direkte Links, Hilfe und Hinweise der Übersicht führen weiter hin.
 */

export function useWerkbankAnsicht() {
  const [stand, setStand] = useState<WerkbankAnsichtStand | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => {
    try { setStand(await werkbankApi.werkbankAnsicht()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); }
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
  const d = useDaten();
  // Vorgabe der Vorlage (#1032, #987): beruflich genutzt → Selbständig, sonst Einsteiger.
  const vorgabe = vorlageFuer({ beruflich: !!d.zaehler.merkmale?.beruflich });
  const [vorlage, setVorlage] = useState<Vorlage>(vorgabe);
  const [alle, setAlle] = useState<Set<string>>(new Set());
  const [ich, setIch] = useState<Set<string>>(new Set());
  // Meine Leiste (#987): eigene Stufe; '' = wie für alle.
  const [meine, setMeine] = useState<Vorlage | ''>('');
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [laeuft, setLaeuft] = useState(false);

  const zuruecksetzen = useCallback(() => {
    const a = s?.installation ?? OHNE_EINSTELLUNG;
    setVorlage(a.vorlage);
    setAlle(new Set(BEREICHE.filter((b) => fuerAlle(a, b.pfad)).map((b) => b.pfad)));
    setIch(new Set(s?.eigene.ein ?? []));
    setMeine(s?.eigene.vorlage ?? '');
  }, [s]);
  useEffect(() => { zuruecksetzen(); }, [zuruecksetzen]);

  const geaendert = useMemo(() => {
    if (!s) return false;
    const a = ansichtAus(vorlage, alle);
    const b = s.installation;
    const gleich = (x: string[], y: string[]) => x.length === y.length && x.every((v) => y.includes(v));
    return a.vorlage !== b.vorlage || !gleich(a.ein, b.ein) || !gleich(a.aus, b.aus) || !gleich([...ich].filter((p) => !fuerAlle(meine ? { ...a, vorlage: meine } : a, p)), s.eigene.ein)
      || meine !== (s.eigene.vorlage ?? '');
  }, [s, vorlage, alle, ich, meine]);
  // Noch nie eingestellt: Speichern geht auch ohne Änderung (übernimmt die Vorlage).
  const ent = useEntwurf(false, geaendert, { zuruecksetzen: () => { zuruecksetzen(); setMeldung(undefined); } });

  if (z.fehler) return <div className="hinweis schlecht"><p>{z.fehler}</p></div>;
  if (!s) return <p className="leise">{t('werkbank.ansicht.lade')}</p>;

  function waehleVorlage(v: Vorlage) {
    setVorlage(v);
    setAlle(new Set(BEREICHE.filter((b) => inVorlage(v, b.pfad)).map((b) => b.pfad)));
  }
  const schalte = (menge: Set<string>, setze: (m: Set<string>) => void, pfad: string, an: boolean) => {
    const m = new Set(menge);
    if (an) m.add(pfad); else m.delete(pfad);
    setze(m);
  };
  // Für mich ohne eigene Einblendung sichtbar: die Auswahl für alle, mit meiner Stufe statt der Vorlage (#987).
  const entwurf = ansichtAus(vorlage, alle);
  const sichtbarFuerMich = (pfad: string) => fuerAlle(meine ? { ...entwurf, vorlage: meine } : entwurf, pfad);
  async function speichern() {
    setLaeuft(true); setMeldung(undefined);
    try {
      const neu = await werkbankApi.setzeWerkbankAnsicht({ installation: ansichtAus(vorlage, alle), eigene: { ein: [...ich].filter((p) => !sichtbarFuerMich(p)), ...(meine ? { vorlage: meine } : {}) } });
      z.setStand({ ...neu, benutzt: s?.benutzt });
      setMeldung({ art: 'gut', text: t('werkbank.ansicht.gespeichert-die-leiste-links') });
    } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); } finally { setLaeuft(false); }
  }

  return (
    <div className="einspaltig">
      <Kopf titel={t('werkbank.ansicht.werkbank-anpassen')} ueber={t('werkbank.ansicht.werkbank')} hilfe="werkbank.ansicht">
        <p className="leise">{tn('werkbank.ansicht.blende-aus-was-du', { b: <strong>{t('werkbank.ansicht.ausblenden-schaltet-nichts-ab')}</strong>, link: <Link to="/werkbank" className="verweis">{t('werkbank.ansicht.uebersicht')}</Link> })}</p>
      </Kopf>
      {!s.eingestellt && <div className="hinweis"><p>{tn('werkbank.ansicht.noch-nicht-eingestellt-bisher', { b: <strong>{VORLAGEN.einsteiger.name}</strong>, b2: <strong>{VORLAGEN.haushalt.name}</strong> })}</p></div>}
      <form className="blatt" onSubmit={(x) => { x.preventDefault(); void speichern(); }} onKeyDown={ent.tasten}>
        <FeldGruppe beschriftung={t('konten.verwaltende.ansicht.vorlage')}>
          <div className="feldstapel">{STUFEN.map((v) => (
            <label key={v} className="haken"><input type="radio" name="vorlage" value={v} checked={vorlage === v} onChange={() => waehleVorlage(v)} />
              <span><strong>{VORLAGEN[v].name}</strong> <span className="leise">– {VORLAGEN[v].text}</span>
                {/* Vorgabe aus dem Merkmal „beruflich genutzt“ (#1032, #987). */}
                {v === vorgabe && <> <small className="chip">{t('werkbank.ansicht.vorgabe-nutzung')}</small></>}</span></label>
          ))}</div>
        </FeldGruppe>
        {/* Meine Leiste (#987, statt Expertenmodus): eigene Stufe je Person – kein Recht, nur die Leiste. */}
        <FeldGruppe beschriftung={t('werkbank.meine.titel')} hinweis={t('werkbank.meine.text')}>
          <div className="feldstapel">
            <label className="haken"><input type="radio" name="meine" value="" checked={!meine} onChange={() => setMeine('')} />
              <span>{t('werkbank.meine.wie-alle', { vorlage: VORLAGEN[vorlage].name })}</span></label>
            {STUFEN.map((v) => (
              <label key={v} className="haken"><input type="radio" name="meine" value={v} checked={meine === v} onChange={() => setMeine(v)} /><span>{VORLAGEN[v].name}</span></label>
            ))}
          </div>
        </FeldGruppe>
        <h2 className="h3">{t('werkbank.ansicht.bereiche')}</h2>
        <p className="leise klein">{t('konten.verwaltende.ansicht.text')}</p>
        {(Object.keys(GRUPPEN) as Gruppe[]).map((g) => (
          <div key={g} className="ansichtgruppe">
            <h3 className="gruppentitel">{GRUPPEN[g]}</h3>
            <ul className="stapel">
              {BEREICHE.filter((b) => b.gruppe === g).map((b) => {
                const zst = zustand[b.pfad] ?? {};
                const fuerAlleAn = alle.has(b.pfad);
                const mirAn = sichtbarFuerMich(b.pfad);
                const benutzt = !mirAn && !ich.has(b.pfad) && (s.benutzt?.includes(b.pfad) || zst.warn);
                return (
                  <li key={b.pfad} className="ansichtzeile">
                    <span className="ansichtname"><strong>{b.name}</strong> <span className="leise klein">{b.wann}</span>
                      {benutzt ? <span className="chip warn" title={t('werkbank.ansicht.bleibt-aktiv-nur-die')}>{t('werkbank.ansicht.aber-ausgeblendet', { wert: zst.warn ? t('werkbank.ansicht.mit-hinweis') : t('werkbank.ansicht.eingerichtet') })}</span> : null}</span>
                    <FeldGruppe className="ansichtwahl" beschriftung={b.name} beschriftungVerbergen>
                      <label className="haken"><input type="checkbox" checked={fuerAlleAn} aria-label={t('werkbank.ansicht.fuer-alle-zeigen', { name: b.name })} onChange={(x) => schalte(alle, setAlle, b.pfad, x.target.checked)} /><span>{t('werkbank.ansicht.fuer-alle')}</span></label>
                      <label className="haken"><input type="checkbox" checked={mirAn || ich.has(b.pfad)} disabled={mirAn} aria-label={t('werkbank.ansicht.nur-fuer-mich-zeigen', { name: b.name })} onChange={(x) => schalte(ich, setIch, b.pfad, x.target.checked)} /><span>{t('werkbank.ansicht.nur-fuer-mich')}</span></label>
                    </FeldGruppe>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {meldung && <div className={`hinweis ${meldung.art}`}><p>{meldung.text}</p></div>}
        <Speicherleiste ent={ent} gegenstand={t('werkbank.ansicht.auswahl')} sendet={laeuft} speicherbar={!s.eingestellt} />
      </form>
    </div>
  );
}
