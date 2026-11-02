import { useCallback, useEffect, useState } from 'react';
import type { Entscheidung, UmwandlungsFeld, Umwandlungsvorgang, UmwandlungsVorschau } from '../../../shared/src/umwandlung';
import { api } from '../api';
import { useDaten } from '../daten';
import { Hilfe } from '../Hilfe';
import { Link } from '../ort';
import { rueckfrage } from '../rueckfrage';
import { t } from '../sprache';
import { alsMeldung, MeldungBox, type Meldung } from './Pakete';

/**
 * Werkbank → Pakete → Paket (#534): Nach einem Update, das ein Textfeld durch einen Verweis ersetzt (`aus_text`),
 * wandelt der Administrator die alten Angaben mit Vorschau um. Je Name: vorhandene Person, neu anlegen oder
 * überspringen. Jeder Vorgang lässt sich rückgängig machen.
 */
const datum = (iso: string) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
/** Wert der Auswahl je Name: „p:<Id>“, „neu“ oder „weg“. */
const alsWert = (e: Entscheidung) => (e.art === 'person' ? `p:${e.id}` : e.art === 'neu' ? 'neu' : 'weg');
const ausWert = (w: string): Entscheidung => (w.startsWith('p:') ? { art: 'person', id: w.slice(2) } : w === 'neu' ? { art: 'neu' } : { art: 'ueberspringen' });

export function PaketUmwandeln({ paket }: { paket: string }) {
  const d = useDaten();
  const [stand, setStand] = useState<{ felder: UmwandlungsFeld[]; vorgaenge: Umwandlungsvorgang[] } | null>(null);
  const [offen, setOffen] = useState<UmwandlungsFeld | null>(null);
  const [vorschau, setVorschau] = useState<UmwandlungsVorschau | null>(null);
  const [wahl, setWahl] = useState<Record<string, string>>({});
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<Meldung>();
  const laden = useCallback(() => { api.paketUmwandlungen(paket).then(setStand, () => setStand(null)); }, [paket]);
  useEffect(() => { laden(); }, [laden]);

  async function zeige(f: UmwandlungsFeld) {
    setMeldung(undefined); setLaeuft(true);
    try {
      const v = await api.paketUmwandlungVorschau(paket, f.typId, f.feldKey);
      setOffen(f); setVorschau(v); setWahl(Object.fromEntries(v.zeilen.map((z) => [z.schluessel, alsWert(z.vorschlag)])));
    } catch (e) { setMeldung(alsMeldung(e)); }
    finally { setLaeuft(false); }
  }
  async function umwandeln() {
    if (!offen || !vorschau) return;
    setLaeuft(true); setMeldung(undefined);
    try {
      const r = await api.paketUmwandeln(paket, offen.typId, offen.feldKey, Object.fromEntries(Object.entries(wahl).map(([k, w]) => [k, ausWert(w)])));
      setMeldung({ art: 'gut', text: t('pakete.umwandeln.fertig', { anzahl: r.umgewandelt, neu: r.neuePersonen, aus: r.ausgelassen.length }), gruende: r.ausgelassen.map((x) => `${x.titel || t('pakete.umwandeln.ohnetitel')}: ${x.grund}`) });
      setOffen(null); setVorschau(null); laden(); await d.neuLaden();
    } catch (e) { setMeldung(alsMeldung(e)); }
    finally { setLaeuft(false); }
  }
  async function zurueck(v: Umwandlungsvorgang) {
    if (!(await rueckfrage({ titel: t('pakete.umwandeln.zurueck.frage'), text: [t('pakete.umwandeln.zurueck.frage.text', { anzahl: v.mappen.length }), v.neuePersonen.length ? t('pakete.umwandeln.zurueck.frage.neu', { anzahl: v.neuePersonen.length }) : ''].filter(Boolean).join(' '), ja: t('pakete.umwandeln.zurueck.frage.ja') }))) return;
    setLaeuft(true); setMeldung(undefined);
    try {
      const r = await api.paketUmwandlungZurueck(paket, v.id);
      setMeldung({ art: 'gut', text: [t('pakete.umwandeln.zurueck.fertig', { anzahl: r.zurueck }), r.personenBehalten ? t('pakete.umwandeln.zurueck.behalten', { anzahl: r.personenBehalten }) : ''].filter(Boolean).join(' '), gruende: r.ausgelassen.map((x) => `${x.titel || t('pakete.umwandeln.ohnetitel')}: ${x.grund}`) });
      laden(); await d.neuLaden();
    } catch (e) { setMeldung(alsMeldung(e)); }
    finally { setLaeuft(false); }
  }

  if (!stand || (!stand.felder.length && !stand.vorgaenge.length)) return null;
  const offeneFelder = stand.felder.filter((f) => f.anzahl > 0);
  const nichts = !!vorschau && vorschau.zeilen.every((z) => wahl[z.schluessel] === 'weg');
  return (
    <section className="blatt" aria-label={t('pakete.umwandeln.titel')}>
      <h2 className="h3">{t('pakete.umwandeln.titel')} <Hilfe ort="werkbank.pakete.umwandeln" /></h2>
      <p className="leise klein">{t('pakete.umwandeln.text')}</p>
      <MeldungBox m={meldung} />
      {!offeneFelder.length ? <p className="leise klein">{t('pakete.umwandeln.keine')}</p> : (
        <ul className="stapel umw-felder">
          {offeneFelder.map((f) => (
            <li key={f.typId + f.feldKey} className="umw-feld">
              <span><strong>{f.typName} – {f.feldLabel}</strong><br /><span className="leise klein">{t('pakete.umwandeln.anzahl', { anzahl: f.anzahl, aus: f.ausLabel, ziel: f.zielTypName })}</span></span>
              <button type="button" className={`knopf klein ${offen?.typId === f.typId && offen.feldKey === f.feldKey ? 'an' : ''}`} disabled={laeuft} onClick={() => void zeige(f)}>{t('pakete.umwandeln.vorschau')}</button>
            </li>
          ))}
        </ul>
      )}
      {offen && vorschau && (
        <div className="stapel umw-vorschau" role="region" aria-label={t('pakete.umwandeln.vorschau.titel', { feld: `${offen.typName} – ${offen.feldLabel}` })}>
          <h3>{t('pakete.umwandeln.vorschau.titel', { feld: `${offen.typName} – ${offen.feldLabel}` })}</h3>
          <div className="hinweis info klein">
            <ul>
              <li>{t('pakete.umwandeln.vorschau.so', { aus: offen.ausLabel, feld: offen.feldLabel })}</li>
              {vorschau.pflichtAus && <li>{t('pakete.umwandeln.vorschau.pflicht', { aus: offen.ausLabel })}</li>}
              {(vorschau.vorlage || vorschau.spalten) && <li>{t('pakete.umwandeln.vorschau.titelspalten')}</li>}
              <li>{t('pakete.umwandeln.vorschau.zurueck')}</li>
            </ul>
          </div>
          {!vorschau.zeilen.length ? <p className="leise">{t('pakete.umwandeln.vorschau.leer')}</p> : (
            <ul className="umw-zeilen">
              {vorschau.zeilen.map((z) => (
                <li key={z.schluessel}>
                  <label className="umw-zeile">
                    <span><strong>„{z.name}“</strong> <span className="leise klein">{t('pakete.umwandeln.vorschau.mappen', { anzahl: z.mappen })}</span>
                      {z.passend.length > 1 && <> <span className="chip warn">{t('pakete.umwandeln.vorschau.mehrere', { anzahl: z.passend.length })}</span></>}</span>
                    <select className="umw-wahl" value={wahl[z.schluessel] ?? 'weg'} onChange={(e) => setWahl({ ...wahl, [z.schluessel]: e.target.value })}>
                      <optgroup label={t('pakete.umwandeln.vorschau.vorhanden', { ziel: offen.zielTypName })}>
                        {vorschau.kandidaten.map((k) => <option key={k.id} value={`p:${k.id}`}>{k.titel}</option>)}
                      </optgroup>
                      <option value="neu">{t('pakete.umwandeln.vorschau.neu', { ziel: offen.zielTypName, name: z.name })}</option>
                      <option value="weg">{t('pakete.umwandeln.vorschau.weg')}</option>
                    </select>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {vorschau.ausgelassen.length > 0 && (
            <details className="klein">
              <summary>{t('pakete.umwandeln.vorschau.ausgelassen', { anzahl: vorschau.ausgelassen.length })}</summary>
              <ul>{vorschau.ausgelassen.map((x) => <li key={x.mappeId}><Link to={`/ablage/${offen.typId}/${x.mappeId}`} className="verweis">{x.titel || t('pakete.umwandeln.ohnetitel')}</Link>: {x.grund}</li>)}</ul>
            </details>
          )}
          <div className="knoepfe">
            <button type="button" className="knopf primaer" disabled={laeuft || !vorschau.zeilen.length || nichts} onClick={() => void umwandeln()}>{laeuft ? t('pakete.umwandeln.laeuft') : t('pakete.umwandeln.los')}</button>
            <button type="button" className="textknopf" onClick={() => { setOffen(null); setVorschau(null); }}>{t('pakete.umwandeln.abbrechen')}</button>
          </div>
        </div>
      )}
      {stand.vorgaenge.length > 0 && (
        <>
          <h3>{t('pakete.umwandeln.bisher')}</h3>
          <ul className="stapel klein umw-felder">
            {stand.vorgaenge.map((v) => (
              <li key={v.id}>
                {datum(v.zeit)} · {v.typName} – {v.feldLabel}: {t('pakete.umwandeln.bisher.zeile', { anzahl: v.mappen.length, neu: v.neuePersonen.length })}
                {v.rueckgaengig
                  ? <span className="leise"> · {t('pakete.umwandeln.bisher.zurueck', { zeit: datum(v.rueckgaengig.zeit) })}</span>
                  : <> · <button type="button" className="textknopf" disabled={laeuft} onClick={() => void zurueck(v)}>{t('pakete.umwandeln.bisher.knopf')}</button></>}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
