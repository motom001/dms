import { useEffect, useState } from 'react';
import { abwesenheitWirkt, KEINE_ABWESENHEIT, type Abwesenheit } from '../../../shared/src/model';
import { heuteIn } from '../../../shared/src/sichten';
import { api } from '../api';
import { useDaten } from '../daten';
import { useKonto } from '../konto';
import { Hilfe } from '../Hilfe';
import type { Hilfeort } from '../../../shared/src/hilfe';

/** Abwesenheit mit Vertreter (#78): Formular für das eigene Profil und für Administratoren in der Werkbank. */
const datum = (t: string | null) => (t ? t.split('-').reverse().join('.') : '');

export function zeitraumText(a: Abwesenheit): string {
  return a.von && a.bis ? `vom ${datum(a.von)} bis ${datum(a.bis)}` : a.von ? `ab ${datum(a.von)}` : a.bis ? `bis ${datum(a.bis)}` : 'ohne Enddatum';
}

export function AbwesenheitFormular({ benutzerId, wer, wert, offeneAufgaben, speichern, uebergeben, nachSpeichern, hilfe = 'profil.abwesenheit' }: {
  benutzerId: string; wer: 'du' | string; wert: Abwesenheit; offeneAufgaben: number; hilfe?: Hilfeort;
  speichern: (a: Abwesenheit) => Promise<unknown>; uebergeben: () => Promise<{ uebergeben: number }>; nachSpeichern?: () => Promise<void>;
}) {
  const d = useDaten();
  const [a, setA] = useState<Abwesenheit>(wert);
  useEffect(() => setA(wert), [JSON.stringify(wert)]); // eslint-disable-line react-hooks/exhaustive-deps
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [sendet, setSendet] = useState(false);
  const geaendert = JSON.stringify(a) !== JSON.stringify(wert);
  const vertreter = d.personen.find((p) => p.id === wert.vertreterId);
  const kandidaten = d.personen.filter((p) => p.aktiv !== false && p.id !== benutzerId);
  const du = wer === 'du';
  const wirkt = abwesenheitWirkt(wert, heuteIn());

  async function tu(f: () => Promise<string>) {
    setSendet(true); setMeldung(undefined);
    try { setMeldung({ art: 'gut', text: await f() }); await d.neuLaden(); await nachSpeichern?.(); }
    catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); }
    finally { setSendet(false); }
  }

  return (
    <form className="blatt" onSubmit={(e) => { e.preventDefault(); void tu(async () => { await speichern(a); return a.an ? 'Abwesenheit gespeichert.' : 'Abwesenheit ausgeschaltet.'; }); }}>
      <h2 className="h3">Abwesenheit <Hilfe ort={hilfe} /></h2>
      <p className="leise">Solange {du ? 'du' : wer} abwesend {du ? 'bist' : 'ist'}, gehen neue Aufgaben – von Hand vergebene, Erwähnungen und „passt nicht“ – an den Vertreter. Er bekommt dazu einen Hinweis im Eingang. Mit Zeitraum wirkt sie nur von–bis (jeweils einschließlich) und endet danach von selbst; ohne Datum, bis du sie ausschaltest.</p>
      {wert.an && <div className={`hinweis ${wirkt ? 'warn' : 'info'}`}><p>{du ? 'Du bist' : `${wer} ist`} {wirkt ? 'abwesend' : 'demnächst abwesend'} – {zeitraumText(wert)}, vertreten durch {vertreter?.name ?? '–'}.</p></div>}
      <label className="haken"><input type="checkbox" checked={a.an} onChange={(e) => setA({ ...a, an: e.target.checked })} /><span>Abwesend</span></label>
      <div className="raster">
        <label className="eigenschaft"><span>Von <small>optional</small></span><input type="date" value={a.von ?? ''} onChange={(e) => setA({ ...a, von: e.target.value || null })} /></label>
        <label className="eigenschaft"><span>Bis <small>optional, einschließlich</small></span><input type="date" value={a.bis ?? ''} min={a.von ?? undefined} onChange={(e) => setA({ ...a, bis: e.target.value || null })} /></label>
        <label className="eigenschaft"><span>Vertreter <small>{a.an ? 'Pflicht' : 'bleibt für das nächste Mal hinterlegt'}</small></span>
          <select value={a.vertreterId ?? ''} onChange={(e) => setA({ ...a, vertreterId: e.target.value || null })}>
            <option value="">– wählen –</option>
            {kandidaten.map((p) => <option key={p.id} value={p.id}>{p.name}{p.abwesend ? ` (${p.abwesend.wirkt ? 'abwesend' : 'demnächst abwesend'})` : ''}</option>)}
          </select></label>
      </div>
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
      <div className="knoepfe">
        {wert.vertreterId && offeneAufgaben > 0 && (
          <button type="button" className="knopf" disabled={sendet || geaendert} title={geaendert ? 'Erst speichern' : undefined}
            onClick={() => void tu(async () => { const r = await uebergeben(); return `${r.uebergeben} ${r.uebergeben === 1 ? 'Aufgabe' : 'Aufgaben'} an ${vertreter?.name ?? 'den Vertreter'} gegeben.`; })}>
            Alle {offeneAufgaben} offenen Aufgaben an {vertreter?.name ?? 'Vertreter'} geben
          </button>
        )}
        <button className="knopf primaer" disabled={sendet || !geaendert}>{sendet ? 'Speichere …' : 'Speichern'}</button>
      </div>
    </form>
  );
}

/** Profil → Abwesenheit (/profil/abwesenheit). */
export function MeineAbwesenheit() {
  const { ich, aktualisieren } = useKonto();
  const [stand, setStand] = useState<{ abwesenheit: Abwesenheit | null; offeneAufgaben: number } | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = async () => { try { setStand(await api.abwesenheit()); } catch (e) { setFehler((e as Error).message); } };
  useEffect(() => { void laden(); }, []);
  return (
    <div className="einspaltig schmal">
      <div className="mappenkopf">
        <p className="ueber">Profil · Abwesenheit</p>
        <h1>{ich.name || ich.email}</h1>
      </div>
      {fehler && <div className="hinweis schlecht"><p>{fehler}</p></div>}
      {!stand ? <p className="leise">Lade …</p> : (
        <AbwesenheitFormular benutzerId={ich.id} wer="du" wert={stand.abwesenheit ?? KEINE_ABWESENHEIT} offeneAufgaben={stand.offeneAufgaben}
          speichern={(a) => api.abwesenheitSetzen(a)} uebergeben={() => api.aufgabenAnVertreter()}
          nachSpeichern={async () => { await laden(); await aktualisieren(); }} />
      )}
    </div>
  );
}
