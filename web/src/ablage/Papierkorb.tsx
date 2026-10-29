import { useCallback, useEffect, useRef, useState } from 'react';
import { formatiere, SYSTEMSPALTEN } from '../../../shared/src/model';
import { api, type PapierkorbEintrag } from '../api';
import { useDaten } from '../daten';
import { geheZu, Link } from '../ort';
import { titelOder } from '../seiten';
import { Person } from '../Person';
import { Hilfe } from '../Hilfe';

/**
 * Papierkorb (#43). In der Ablage sieht jeder, was er selbst gelöscht hat; in der Werkbank
 * sehen Administratoren alles. Nach der eingestellten Aufbewahrung wird endgültig gelöscht.
 */

const GEAENDERT = 'dms:papierkorb';
const melde = () => dispatchEvent(new Event(GEAENDERT));
const datumZeit = (iso: string) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
const basis = (werkbank: boolean) => (werkbank ? '/werkbank/papierkorb' : '/ablage/papierkorb');

export function usePapierkorb(werkbank: boolean, aktiv = true) {
  const [eintraege, setEintraege] = useState<PapierkorbEintrag[] | null>(null);
  const [tage, setTage] = useState<number | null>(null);
  const [historieTage, setHistorieTage] = useState<number | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => {
    try {
      if (werkbank) { const r = await api.papierkorbWerkbank(); setEintraege(r.eintraege); setTage(r.tage); setHistorieTage(r.historieTage); }
      else setEintraege(await api.papierkorb());
      setFehler(undefined);
    } catch (e) { setFehler((e as Error).message); }
  }, [werkbank]);
  useEffect(() => {
    if (!aktiv) return;
    void laden();
    addEventListener(GEAENDERT, laden);
    return () => removeEventListener(GEAENDERT, laden);
  }, [aktiv, laden]);
  return { eintraege, tage, setTage, historieTage, setHistorieTage, fehler, laden };
}
export type PapierkorbZustand = ReturnType<typeof usePapierkorb>;

/** Aufbewahrung in Worten. */
export function aufbewahrung(tage: number | undefined | null) {
  if (!tage) return 'Gelöschte Mappen werden sofort endgültig gelöscht.';
  return `Gelöschte Mappen bleiben ${tage === 1 ? 'einen Tag' : `${tage} Tage`} hier und werden danach endgültig gelöscht.`;
}

export function PapierkorbListe({ z, werkbank, offen }: { z: PapierkorbZustand; werkbank: boolean; offen?: string }) {
  const d = useDaten();
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<string>();
  const tage = werkbank ? z.tage : d.zaehler.papierkorbTage;
  const liste = z.eintraege ?? [];
  // Wie die Ablage: schmal → kompakte Einträge, breit → Tabelle.
  const mess = useRef<HTMLDivElement>(null);
  const [breite, setBreite] = useState(0);
  useEffect(() => {
    const el = mess.current;
    if (!el) return;
    const o = new ResizeObserver(([e]) => setBreite(e.contentRect.width));
    o.observe(el);
    return () => o.disconnect();
  }, []);

  async function leeren() {
    if (!confirm(`${werkbank ? 'Den ganzen Papierkorb (alle Benutzer)' : 'Deinen Papierkorb'} leeren? ${liste.length === 1 ? 'Die Mappe wird' : `Alle ${liste.length} Mappen werden`} endgültig gelöscht – samt ihrer Dokumente.`)) return;
    setLaeuft(true); setMeldung(undefined);
    try { await api.papierkorbLeeren(werkbank); melde(); await d.neuLaden(); geheZu(basis(werkbank)); }
    catch (e) { setMeldung((e as Error).message); }
    finally { setLaeuft(false); }
  }

  const spalten: Array<[string, (e: PapierkorbEintrag) => string]> = [
    ['Mappentyp', (e) => d.typ(e.typId)?.name ?? ''],
    [SYSTEMSPALTEN._titel, (e) => titelOder(e.titel)],
    [SYSTEMSPALTEN._erstelltVon, (e) => d.person(e.erstelltVon)],
    [SYSTEMSPALTEN._erstellt, (e) => datumZeit(e.erstellt)],
    [SYSTEMSPALTEN._geaendertVon, (e) => d.person(e.geaendertVon)],
    [SYSTEMSPALTEN._geaendert, (e) => datumZeit(e.geaendert)],
    ...(werkbank ? [['Gelöscht von', (e: PapierkorbEintrag) => d.person(e.geloeschtVon)] as [string, (e: PapierkorbEintrag) => string]] : []),
    ['Gelöscht', (e) => datumZeit(e.geloescht)],
  ];

  const tabelle = breite >= spalten.length * 110;
  return (
    <>
      <div ref={mess} className="breitenmesser" aria-hidden="true" />
      <div className="listenkopf">
        <div>
          <h1>Papierkorb</h1>
          <p className="leise klein">{werkbank ? 'Was alle Benutzer gelöscht haben. ' : 'Was du gelöscht hast. '}{aufbewahrung(tage)} <Hilfe ort={werkbank ? 'werkbank.papierkorb' : 'ablage.papierkorb'} /></p>
        </div>
        {liste.length > 0 && <button type="button" className="knopf klein gefahr-rand" disabled={laeuft} onClick={() => void leeren()}>{laeuft ? 'Leere …' : 'Papierkorb leeren'}</button>}
      </div>
      {z.fehler && <div className="hinweis schlecht"><p>{z.fehler}</p></div>}
      {meldung && <div className="hinweis schlecht"><p>{meldung}</p></div>}
      <div className="listenrumpf">
      {z.eintraege === null
        ? <p className="leise">Lade …</p>
        : !liste.length
          ? <p className="leise leerliste">Der Papierkorb ist leer.</p>
          : <>
              <p className="listenzahl leise klein">{liste.length} {liste.length === 1 ? 'Mappe' : 'Mappen'}</p>
              {!tabelle && (
                <ul className="mappenliste">
                  {liste.map((e) => (
                    <li key={e.id}>
                      <Link to={`${basis(werkbank)}/${e.id}`} className={`eintrag ${offen === e.id ? 'an' : ''}`}>
                        <span className="titel">{titelOder(e.titel)}</span>
                        <span className="unter">{d.typ(e.typId)?.name ?? ''} · gelöscht {datumZeit(e.geloescht)}{werkbank ? ` von ${d.person(e.geloeschtVon)}` : ''}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {tabelle && <div className="trefferliste">
                <table>
                  <thead><tr>{spalten.map(([n]) => <th key={n}>{n}</th>)}</tr></thead>
                  <tbody>
                    {liste.map((e) => {
                      const ziel = `${basis(werkbank)}/${e.id}`;
                      return (
                        <tr key={e.id} className={offen === e.id ? 'an' : ''} onClick={(ev) => { if (!(ev.target as HTMLElement).closest('a')) geheZu(ziel); }}>
                          {spalten.map(([n, wert], i) => (
                            <td key={n} className={n === 'Gelöscht' || n === SYSTEMSPALTEN._erstellt || n === SYSTEMSPALTEN._geaendert ? 'kurz' : ''}>
                              {i === 1 ? <Link to={ziel}>{wert(e)}</Link> : wert(e)}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>}
            </>}
      </div>
    </>
  );
}

/** Eine Mappe im Papierkorb: ansehen, wiederherstellen, endgültig löschen. */
export function PapierkorbDetail({ id, werkbank }: { id: string; werkbank: boolean }) {
  const d = useDaten();
  const [e, setE] = useState<PapierkorbEintrag | null | 'fehlt'>(null);
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string>();
  useEffect(() => {
    setE(null);
    api.papierkorbEintrag(id, werkbank).then(setE, () => setE('fehlt'));
  }, [id, werkbank]);

  if (e === null) return <p className="leise">Lade …</p>;
  if (e === 'fehlt') return <div className="leer"><p>Diese Mappe liegt nicht (mehr) im Papierkorb.</p></div>;
  const typ = d.typ(e.typId);

  async function wiederherstellen() {
    setLaeuft('zurueck'); setMeldung(undefined);
    try {
      const r = await api.wiederherstellen(id, werkbank);
      melde(); await d.neuLaden();
      // Passt sie nicht mehr (z. B. eindeutiger Wert inzwischen vergeben), zeigt die Mappe selbst den Grund.
      geheZu(`/ablage/${r.mappe.passt === false ? 'eingang' : r.mappe.typId}/${r.mappe.id}`);
    } catch (x) { setMeldung((x as Error).message); setLaeuft(null); }
  }
  async function endgueltig() {
    if (!confirm(`„${titelOder(e && e !== 'fehlt' ? e.titel : '')}“ endgültig löschen? Das lässt sich nicht rückgängig machen.`)) return;
    setLaeuft('weg'); setMeldung(undefined);
    try { await api.endgueltigLoeschen(id, werkbank); melde(); await d.neuLaden(); geheZu(basis(werkbank)); }
    catch (x) { setMeldung((x as Error).message); setLaeuft(null); }
  }

  const felder = (typ?.felder ?? []).filter((f) => f.typ !== 'passwort');
  return (
    <div className="einspaltig">
      <div className="mappenkopf">
        <p className="ueber">{typ?.name ?? 'Mappe'} · im Papierkorb</p>
        <h1>{titelOder(e.titel)}</h1>
        <dl className="index">
          <div><dt>Gelöscht</dt><dd>{datumZeit(e.geloescht)}{werkbank && <> von <Person id={e.geloeschtVon} /></>}</dd></div>
          <div><dt>Angelegt</dt><dd>{datumZeit(e.erstellt)} von <Person id={e.erstelltVon} /></dd></div>
          <div><dt>Zuletzt geändert</dt><dd>{datumZeit(e.geaendert)} von <Person id={e.geaendertVon} /></dd></div>
        </dl>
      </div>
      <section className="blatt">
        <dl className="eigenschaften">
          {felder.map((f) => {
            const v = e.werte[f.key];
            const text = f.typ === 'referenz'
              ? (Array.isArray(v) ? v.length : v ? 1 : 0) ? `${Array.isArray(v) ? v.length : 1} verknüpfte Mappe${Array.isArray(v) && v.length !== 1 ? 'n' : ''}` : ''
              : formatiere(f, v);
            return <div key={f.key} style={{ display: 'contents' }}><dt>{f.label}</dt><dd>{text || <span className="leise">–</span>}</dd></div>;
          })}
          <dt>Dokumente</dt><dd>{e.dokumente || <span className="leise">keine</span>}</dd>
        </dl>
      </section>
      <p className="leise klein">Beim Wiederherstellen kommen Dokumente und Verweise mit. Verweise auf Mappen, die es nicht mehr gibt, entfallen; ist ein eindeutiger Wert inzwischen vergeben, landet die Mappe im Eingang.</p>
      {meldung && <div className="hinweis schlecht"><p>{meldung}</p></div>}
      <div className="knoepfe">
        <button type="button" className="knopf gefahr-rand" disabled={!!laeuft} onClick={() => void endgueltig()}>{laeuft === 'weg' ? 'Lösche …' : 'Endgültig löschen'}</button>
        <button type="button" className="knopf gruen" disabled={!!laeuft} onClick={() => void wiederherstellen()}>{laeuft === 'zurueck' ? 'Stelle wieder her …' : 'Wiederherstellen'}</button>
      </div>
    </div>
  );
}

/** Werkbank: Aufbewahrung einstellen. */
export function PapierkorbEinstellungen({ z }: { z: PapierkorbZustand }) {
  const d = useDaten();
  const [tage, setTage] = useState(String(z.tage ?? ''));
  const [hTage, setHTage] = useState(String(z.historieTage ?? ''));
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  useEffect(() => { if (z.tage !== null) setTage(String(z.tage)); }, [z.tage]);
  useEffect(() => { if (z.historieTage !== null) setHTage(String(z.historieTage)); }, [z.historieTage]);
  const n = Number(tage);
  const h = Number(hTage);
  const geaendert = String(z.tage) !== tage || String(z.historieTage) !== hTage;
  async function speichern() {
    const anzahl = z.eintraege?.length ?? 0;
    if (n === 0 && anzahl && !confirm(`Papierkorb ausschalten? Die ${anzahl === 1 ? 'eine Mappe darin wird' : `${anzahl} Mappen darin werden`} sofort endgültig gelöscht.`)) return;
    try {
      const r = await api.papierkorbTage({ tage: n, historieTage: h });
      z.setTage(r.tage); z.setHistorieTage(r.historieTage); melde(); await d.neuLaden();
      setMeldung({ art: 'gut', text: `Gespeichert.${r.geleert ? ` ${r.geleert} ${r.geleert === 1 ? 'Mappe' : 'Mappen'} endgültig gelöscht.` : ''}` });
    } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }
  return (
    <div className="einspaltig">
      <div className="mappenkopf">
        <p className="ueber">Werkbank</p>
        <h1>Papierkorb</h1>
        <p className="leise">{aufbewahrung(z.tage)} Jeder Benutzer sieht in der Ablage, was er selbst gelöscht hat, und kann es wiederherstellen oder endgültig löschen. Hier siehst du alles.</p>
      </div>
      <form className="blatt" onSubmit={(ev) => { ev.preventDefault(); void speichern(); }}>
        <h2 className="h3">Aufbewahrung</h2>
        <label className="eigenschaft"><span>Tage <small>0 = kein Papierkorb, Löschen ist sofort endgültig</small></span>
          <input type="number" min={0} max={3650} value={tage} onChange={(ev) => { setTage(ev.target.value); setMeldung(undefined); }} /></label>
        <p className="leise klein">Einzeln gelöschte Dokumente und das Entfernen der Demo-Daten sind immer sofort endgültig.</p>
        <label className="eigenschaft"><span>Protokoll endgültig gelöschter Mappen behalten <small>Tage, danach wird ihre Änderungshistorie gelöscht</small></span>
          <input type="number" min={0} max={36500} value={hTage} onChange={(ev) => { setHTage(ev.target.value); setMeldung(undefined); }} /></label>
        {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
        <div className="knoepfe"><button className="knopf primaer" disabled={!Number.isInteger(n) || n < 0 || !Number.isInteger(h) || h < 0 || !geaendert}>Speichern</button></div>
      </form>
    </div>
  );
}
