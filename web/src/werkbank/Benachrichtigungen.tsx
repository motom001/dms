import { useCallback, useEffect, useState } from 'react';
import { FREIGABE_STANDARD, FREIGABEN, type FavoritenFreigabe } from '../../../shared/src/favoritenfreigabe';
import { api } from '../api';
import { useDaten } from '../daten';
import { Hilfe } from '../Hilfe';
import { rueckfrage } from '../rueckfrage';
import { Speicherleiste, useEntwurf } from '../Speicherleiste';
import { t } from '../sprache';

type Rolle = { id: string; name: string; system: boolean };

/** Freigabe „Favoriten benachrichtigen“ (#506) laden; nur, solange der Bereich offen ist. */
export function useFavoritenFreigabe(aktiv: boolean) {
  const [stand, setStand] = useState<{ freigabe: FavoritenFreigabe; rollen: Rolle[] } | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => {
    try { setStand(await api.favoritenFreigabe()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); }
  }, []);
  useEffect(() => { if (aktiv) void laden(); }, [aktiv, laden]);
  return { stand, setStand, fehler, laden };
}
export type FavoritenFreigabeZustand = ReturnType<typeof useFavoritenFreigabe>;

const ZU = 'werkbank_favoriten_zu';

/**
 * Werkbank → Einstellungen → Benachrichtigungen und Aufgaben (#354, #506): Favoriten benachrichtigen für alle,
 * je Rolle oder für niemanden. „Rolle“ heißt beides: die Systemrollen Administrator und Mitglied als feste
 * Einträge, darunter die fachlichen Rollen. Dazu die Vorgabe für neue Benutzer und „auf alle anwenden“.
 * Zuklappbar wie die Tägliche Zusammenfassung darüber.
 */
export function FavoritenFreigabeBlock({ z }: { z: FavoritenFreigabeZustand }) {
  const d = useDaten();
  const gespeichert = z.stand?.freigabe ?? FREIGABE_STANDARD;
  const [f, setF] = useState<FavoritenFreigabe>(gespeichert);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [sendet, setSendet] = useState(false);
  useEffect(() => { if (z.stand) setF(z.stand.freigabe); }, [z.stand]);
  const ent = useEntwurf(gespeichert, f, { aus: !z.stand, zuruecksetzen: () => { setF(gespeichert); setMeldung(undefined); } });
  const zu = d.einstellungen[ZU] === true;
  const rollen = z.stand?.rollen ?? [];
  const system = rollen.filter((r) => r.system), weitere = rollen.filter((r) => !r.system);
  const keineRolle = f.erlaubt === 'rollen' && !f.rollen.length;

  async function speichern() {
    setSendet(true); setMeldung(undefined);
    try { z.setStand(await api.favoritenFreigabeSpeichern(f)); setMeldung({ art: 'gut', text: t('werkbank.favoriten.gespeichert') }); }
    catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); }
    finally { setSendet(false); }
  }
  async function anwenden() {
    if (!(await rueckfrage({ titel: t('werkbank.favoriten.anwenden.frage'), text: gespeichert.vorgabe ? t('werkbank.favoriten.anwenden.frage.an') : t('werkbank.favoriten.anwenden.frage.aus'), ja: t('werkbank.favoriten.anwenden.ja') }))) return;
    try { const r = await api.favoritenVorgabeAnwenden(); setMeldung({ art: 'gut', text: t('werkbank.favoriten.angewandt', { anzahl: r.benutzer }) }); await d.neuLaden(); }
    catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); }
  }
  const rolleWahl = (r: Rolle) => (
    <label key={r.id} className="haken"><input type="checkbox" checked={f.rollen.includes(r.id)}
      onChange={(e) => setF({ ...f, rollen: e.target.checked ? [...f.rollen, r.id] : f.rollen.filter((x) => x !== r.id) })} /><span>{r.name}</span></label>
  );

  return (
    <form className="blatt sammel-zusammenfassung" id="favoriten-freigabe" onSubmit={(e) => { e.preventDefault(); void speichern(); }} onKeyDown={ent.tasten}>
      <h2 className="h3">
        <button type="button" className="sammel-aufklapper" aria-expanded={!zu} aria-controls="favoriten-freigabe-inhalt"
          onClick={() => d.setzeEinstellung(ZU, zu ? null : true)}>
          <span className="sammel-pfeil" aria-hidden="true">{zu ? '▸' : '▾'}</span>{t('werkbank.favoriten.titel')}
        </button>
        {zu && z.stand && <span className="leise klein sammel-stand">{t.frei(`werkbank.favoriten.stand.${gespeichert.erlaubt}`, { anzahl: gespeichert.rollen.length })}</span>}
      </h2>
      <div id="favoriten-freigabe-inhalt" className="sammel-inhalt" hidden={zu}>
        <p className="leise klein">{t('werkbank.favoriten.text')} <Hilfe ort="werkbank.favoriten" /></p>
        {z.fehler && <p className="fehlertext">{z.fehler}</p>}
        <fieldset className="wahl">
          <legend className="klein">{t('werkbank.favoriten.erlaubt')}</legend>
          {FREIGABEN.map((v) => (
            <label key={v} className="haken"><input type="radio" name="favoriten-erlaubt" value={v} checked={f.erlaubt === v} onChange={() => setF({ ...f, erlaubt: v })} />
              <span>{t.frei(`werkbank.favoriten.${v}`)}</span></label>
          ))}
        </fieldset>
        {f.erlaubt === 'rollen' && (
          <div className="fz-rollen">
            <p className="klein fz-rollen-titel">{t('werkbank.favoriten.systemrollen')}</p>
            {system.map(rolleWahl)}
            <p className="klein fz-rollen-titel">{t('werkbank.favoriten.weitere')}</p>
            {weitere.length ? weitere.map(rolleWahl) : <p className="leise klein">{t('werkbank.favoriten.weitere.keine')}</p>}
            {keineRolle && <p className="fehlertext klein">{t('werkbank.fehler.freigabe.rollen')}</p>}
          </div>
        )}
        {f.erlaubt === 'aus' && <p className="leise klein">{t('werkbank.favoriten.aus.hinweis')}</p>}
        <label className="haken"><input type="checkbox" checked={f.vorgabe} onChange={(e) => setF({ ...f, vorgabe: e.target.checked })} />
          <span>{t('werkbank.favoriten.vorgabe')}<small className="hilfe">{t('werkbank.favoriten.vorgabe.hilfe')}</small></span></label>
        <div className="knoepfe">
          <button type="button" className="knopf klein" disabled={ent.geaendert} onClick={() => void anwenden()}>{t('werkbank.favoriten.anwenden')}</button>
        </div>
        {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
      </div>
      {(!zu || ent.geaendert) && <Speicherleiste ent={ent} gegenstand={t('werkbank.favoriten.gegenstand')} sendet={sendet} ungueltig={keineRolle} />}
    </form>
  );
}
