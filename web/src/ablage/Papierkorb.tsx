import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { formatiere, SYSTEMSPALTEN } from '../../../shared/src/model';
import { api, type DokumentImKorb, type PapierkorbEintrag } from '../api';
import { useDaten } from '../daten';
import { geheZu, Link } from '../ort';
import { titelOder } from '../seiten';
import { Person } from '../Person';
import { Hilfe } from '../Hilfe';
import { Speicherleiste, useEntwurf } from '../Speicherleiste';
import { hinweis, rueckfrage } from '../rueckfrage';

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
  const [dokumente, setDokumente] = useState<DokumentImKorb[]>([]);
  const [tage, setTage] = useState<number | null>(null);
  const [historieTage, setHistorieTage] = useState<number | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => {
    try {
      if (werkbank) { const r = await api.papierkorbWerkbank(); setEintraege(r.eintraege); setDokumente(r.dokumente ?? []); setTage(r.tage); setHistorieTage(r.historieTage); }
      else { const [m, dok] = await Promise.all([api.papierkorb(), api.papierkorbDokumente()]); setEintraege(m); setDokumente(dok); }
      setFehler(undefined);
    } catch (e) { setFehler((e as Error).message); }
  }, [werkbank]);
  useEffect(() => {
    if (!aktiv) return;
    void laden();
    addEventListener(GEAENDERT, laden);
    return () => removeEventListener(GEAENDERT, laden);
  }, [aktiv, laden]);
  return { eintraege, dokumente, tage, setTage, historieTage, setHistorieTage, fehler, laden };
}
export type PapierkorbZustand = ReturnType<typeof usePapierkorb>;

/** Aufbewahrung in Worten. */
export function aufbewahrung(tage: number | undefined | null) {
  if (!tage) return 'Gelöschte Mappen und Dokumente werden sofort endgültig gelöscht.';
  return `Gelöschte Mappen und Dokumente bleiben ${tage === 1 ? 'einen Tag' : `${tage} Tage`} hier und werden danach endgültig gelöscht.`;
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
    const was = [liste.length ? (liste.length === 1 ? 'eine Mappe (samt Dokumenten)' : `${liste.length} Mappen (samt Dokumenten)`) : '', z.dokumente.length ? (z.dokumente.length === 1 ? 'ein Dokument' : `${z.dokumente.length} Dokumente`) : ''].filter(Boolean).join(' und ');
    if (!(await rueckfrage({ titel: `${werkbank ? 'Den ganzen Papierkorb (alle Benutzer)' : 'Deinen Papierkorb'} leeren?`, text: `${was.charAt(0).toUpperCase()}${was.slice(1)} ${liste.length + z.dokumente.length === 1 ? 'wird' : 'werden'} endgültig gelöscht.`, ja: 'Papierkorb leeren', gefahr: true }))) return;
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

  // Mit verknüpften Mappen gelöscht (#424): Mappen eines Vorgangs gehören zusammen.
  const imVorgang = new Map<string, number>();
  for (const e of liste) if (e.vorgang) imVorgang.set(e.vorgang, (imVorgang.get(e.vorgang) ?? 0) + 1);
  const vorgangChip = (e: PapierkorbEintrag) => {
    const n = e.vorgang ? imVorgang.get(e.vorgang) ?? 0 : 0;
    return n > 1 ? <span className="chip lb-chip" title={`Zusammen mit ${n - 1} weiteren Mappen gelöscht – lassen sich gemeinsam wiederherstellen`}>{e.id === e.vorgang ? `mit ${n - 1} verknüpften` : 'verknüpft'}</span> : null;
  };
  const tabelle = breite >= spalten.length * 110;
  const leerenKnopf = liste.length + z.dokumente.length > 0
    ? <button type="button" className="knopf klein gefahr-rand" disabled={laeuft} onClick={() => void leeren()}>{laeuft ? 'Leere …' : 'Papierkorb leeren'}</button> : null;
  return (
    <>
      <div ref={mess} className="breitenmesser" aria-hidden="true" />
      <div className="listenkopf">
        <div>
          <h1>Papierkorb</h1>
          <p className="leise klein">{werkbank ? 'Was alle Benutzer gelöscht haben. ' : 'Was du gelöscht hast. '}{aufbewahrung(tage)} <Hilfe ort={werkbank ? 'werkbank.papierkorb' : 'ablage.papierkorb'} /></p>
        </div>
        {!werkbank && leerenKnopf}
      </div>
      {/* Werkbank (#366): Aufbewahrung und Leeren gehören zusammen, oben in der Mitte. */}
      {werkbank && <PapierkorbEinstellungen z={z} leeren={leerenKnopf} />}
      {z.fehler && <div className="hinweis schlecht"><p>{z.fehler}</p></div>}
      {meldung && <div className="hinweis schlecht"><p>{meldung}</p></div>}
      <div className="listenrumpf">
      {z.eintraege === null
        ? <p className="leise">Lade …</p>
        : !liste.length && !z.dokumente.length
          ? <p className="leise leerliste">Der Papierkorb ist leer.</p>
          : !liste.length ? <DokumenteImKorb z={z} werkbank={werkbank} /> : <>
              <p className="listenzahl leise klein">{liste.length} {liste.length === 1 ? 'Mappe' : 'Mappen'}{z.dokumente.length ? ` · ${z.dokumente.length} ${z.dokumente.length === 1 ? 'Dokument' : 'Dokumente'} (unten)` : ''}</p>
              {!tabelle && (
                <ul className="mappenliste">
                  {liste.map((e) => (
                    <li key={e.id}>
                      <Link to={`${basis(werkbank)}/${e.id}`} className={`eintrag ${offen === e.id ? 'an' : ''}`}>
                        <span className="titel">{titelOder(e.titel)}{vorgangChip(e)}</span>
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
                              {i === 1 ? <><Link to={ziel}>{wert(e)}</Link>{vorgangChip(e)}</> : wert(e)}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>}
              <DokumenteImKorb z={z} werkbank={werkbank} />
            </>}
      </div>
    </>
  );
}

/** Einzelne Dokumente im Papierkorb (#344): Art „Dokument“, aus welcher Mappe und welchem Register; direkt wiederherstellen. */
function DokumenteImKorb({ z, werkbank }: { z: PapierkorbZustand; werkbank: boolean }) {
  const d = useDaten();
  const [laeuft, setLaeuft] = useState<string>();
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: ReactNode }>();
  if (!z.dokumente.length) return null;
  async function zurueck(x: DokumentImKorb) {
    setLaeuft(x.id); setMeldung(undefined);
    try {
      const r = await api.dokumentWiederherstellen(x.id, werkbank);
      melde(); await d.neuLaden();
      setMeldung({ art: 'gut', text: <>„{x.name}“ liegt wieder in <Link to={`/ablage/${r.typId}/${x.mappeId}`} className="verweis">{titelOder(x.mappeTitel)}</Link> (Register {x.register}).</> });
    } catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); }
    finally { setLaeuft(undefined); }
  }
  async function weg(x: DokumentImKorb) {
    if (!(await rueckfrage({ titel: `„${x.name}“${x.versionen ? ` mit allen ${x.versionen + 1} Versionen` : ''} endgültig löschen?`, text: 'Das lässt sich nicht rückgängig machen.', ja: 'Endgültig löschen', gefahr: true }))) return;
    setLaeuft(x.id); setMeldung(undefined);
    try { await api.dokumentEndgueltig(x.id, werkbank); melde(); await d.neuLaden(); }
    catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); }
    finally { setLaeuft(undefined); }
  }
  return (
    <section className="korbdokumente">
      <h2 className="h3">Dokumente</h2>
      <p className="listenzahl leise klein">{z.dokumente.length} {z.dokumente.length === 1 ? 'Dokument' : 'Dokumente'}, einzeln aus einer Mappe gelöscht</p>
      {meldung && <div className={`hinweis ${meldung.art}`}><p>{meldung.text}</p></div>}
      <ul className="mappenliste">
        {z.dokumente.map((x) => (
          <li key={x.id} className="korbdokument">
            <div className="eintrag">
              <span className="titel"><span className="chip" title="Art">Dokument</span> {x.name}</span>
              <span className="unter">
                aus {x.mappe === 'da' ? <Link to={`/ablage/${x.typId}/${x.mappeId}`} className="verweis">{titelOder(x.mappeTitel)}</Link> : titelOder(x.mappeTitel)}
                {' '}· Register {x.register} · {groesseText(x.groesse)}{x.versionen ? ` · ${x.versionen + 1} Versionen` : ''}
                {' '}· gelöscht {datumZeit(x.geloescht)}{werkbank ? ` von ${d.person(x.geloeschtVon)}` : ''}
              </span>
              {x.mappe === 'papierkorb' && <span className="leise klein">Die Mappe liegt selbst im Papierkorb – stelle zuerst die Mappe wieder her.</span>}
              {x.mappe === 'weg' && <span className="leise klein">Die Mappe gibt es nicht mehr.</span>}
            </div>
            <div className="knoepfe">
              <button type="button" className="knopf klein" disabled={!!laeuft || x.mappe !== 'da'} onClick={() => void zurueck(x)}>{laeuft === x.id ? '…' : 'Wiederherstellen'}</button>
              <button type="button" className="textknopf gefahr" disabled={!!laeuft} onClick={() => void weg(x)}>Endgültig löschen</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

const groesseText = (b: number) => (b < 1024 ? `${b} B` : b < 1024 ** 2 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 ** 2).toFixed(1).replace('.', ',')} MB`);

/** Eine Mappe im Papierkorb: ansehen, wiederherstellen, endgültig löschen. */
export function PapierkorbDetail({ id, werkbank }: { id: string; werkbank: boolean }) {
  const d = useDaten();
  const [e, setE] = useState<PapierkorbEintrag | null | 'fehlt'>(null);
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string>();
  const [gruppe, setGruppe] = useState<PapierkorbEintrag[] | null>(null);
  useEffect(() => {
    setE(null);
    api.papierkorbEintrag(id, werkbank).then((x) => {
      setE(x);
      // Vorgang (#424): die anderen Mappen, die zusammen gelöscht wurden.
      if (x.vorgang) (werkbank ? api.papierkorbWerkbank().then((r) => r.eintraege) : api.papierkorb()).then(setGruppe, () => setGruppe([]));
    }, () => setE('fehlt'));
  }, [id, werkbank]);

  if (e === null) return <p className="leise">Lade …</p>;
  if (e === 'fehlt') return <div className="leer"><p>Diese Mappe liegt nicht (mehr) im Papierkorb.</p></div>;
  const typ = d.typ(e.typId);
  const zusammen = e.vorgang ? (gruppe ?? []).filter((x) => x.vorgang === e.vorgang) : [];

  async function alleWiederherstellen() {
    if (!e || e === 'fehlt' || !e.vorgang) return;
    setLaeuft('alle'); setMeldung(undefined);
    try {
      const r = await api.vorgangWiederherstellen(e.vorgang, werkbank);
      melde(); await d.neuLaden();
      await hinweis({ titel: 'Wiederhergestellt', text: `${r.mappen} ${r.mappen === 1 ? 'Mappe' : 'Mappen'} samt Dokumenten${r.verweiseWieder ? `; ${r.verweiseWieder === 1 ? 'ein entfernter Verweis ist' : `${r.verweiseWieder} entfernte Verweise sind`} wieder gesetzt` : ''}${r.verweiseEntfallen ? `; ${r.verweiseEntfallen} ${r.verweiseEntfallen === 1 ? 'Verweis' : 'Verweise'} auf Mappen, die es nicht mehr gibt, entfallen` : ''}.` });
      const start = r.startId ? zusammen.find((x) => x.id === r.startId) : undefined;
      geheZu(start ? `/ablage/${start.typId}/${start.id}` : basis(werkbank));
    } catch (x) { setMeldung((x as Error).message); setLaeuft(null); }
  }

  async function wiederherstellen() {
    setLaeuft('zurueck'); setMeldung(undefined);
    try {
      const r = await api.wiederherstellen(id, werkbank);
      melde(); await d.neuLaden();
      // Nach den Berechtigungen nicht mehr sichtbar (#126): Bescheid sagen und in den Papierkorb zurück.
      if (r.hinweis) { await hinweis({ titel: 'Wiederhergestellt', text: r.hinweis }); geheZu(basis(werkbank)); return; }
      // Passt sie nicht mehr (z. B. eindeutiger Wert inzwischen vergeben), zeigt die Mappe selbst den Grund.
      geheZu(`/ablage/${r.mappe.passt === false ? 'eingang' : r.mappe.typId}/${r.mappe.id}`);
    } catch (x) { setMeldung((x as Error).message); setLaeuft(null); }
  }
  async function endgueltig() {
    if (!(await rueckfrage({ titel: `„${titelOder(e && e !== 'fehlt' ? e.titel : '')}“ endgültig löschen?`, text: 'Das lässt sich nicht rückgängig machen.', ja: 'Endgültig löschen', gefahr: true }))) return;
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
      {zusammen.length > 1 && (
        <div className="hinweis info"><p>
          Zusammen mit {zusammen.length - 1} weiteren {zusammen.length === 2 ? 'Mappe' : 'Mappen'} gelöscht („mit verknüpften Mappen löschen“)
          {zusammen.some((x) => x.id === x.vorgang) ? <>, ausgehend von „{titelOder(zusammen.find((x) => x.id === x.vorgang)!.titel)}“</> : null}.
          {' '}<strong>Alle wiederherstellen</strong> holt alle zurück – samt der Verweise untereinander und der Verweise, die dabei an anderen Mappen entfernt wurden.
        </p></div>
      )}
      <p className="leise klein">Beim Wiederherstellen kommen Dokumente und Verweise mit. Verweise auf Mappen, die es nicht mehr gibt, entfallen; ist ein eindeutiger Wert inzwischen vergeben, landet die Mappe unter „Zu erledigen“.</p>
      {meldung && <div className="hinweis schlecht"><p>{meldung}</p></div>}
      <div className="knoepfe">
        <button type="button" className="knopf gefahr-rand" disabled={!!laeuft} onClick={() => void endgueltig()}>{laeuft === 'weg' ? 'Lösche …' : 'Endgültig löschen'}</button>
        <button type="button" className={`knopf ${zusammen.length > 1 ? '' : 'gruen'}`} disabled={!!laeuft} onClick={() => void wiederherstellen()}>{laeuft === 'zurueck' ? 'Stelle wieder her …' : zusammen.length > 1 ? 'Nur diese wiederherstellen' : 'Wiederherstellen'}</button>
        {zusammen.length > 1 && <button type="button" className="knopf gruen" disabled={!!laeuft} onClick={() => void alleWiederherstellen()}>{laeuft === 'alle' ? 'Stelle wieder her …' : `Alle ${zusammen.length} wiederherstellen`}</button>}
      </div>
    </div>
  );
}

/** Werkbank: Aufbewahrung einstellen und Papierkorb leeren (#366: oben in der Mitte). */
function PapierkorbEinstellungen({ z, leeren }: { z: PapierkorbZustand; leeren?: ReactNode }) {
  const d = useDaten();
  const [tage, setTage] = useState(String(z.tage ?? ''));
  const [hTage, setHTage] = useState(String(z.historieTage ?? ''));
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  useEffect(() => { if (z.tage !== null) setTage(String(z.tage)); }, [z.tage]);
  useEffect(() => { if (z.historieTage !== null) setHTage(String(z.historieTage)); }, [z.historieTage]);
  const n = Number(tage);
  const h = Number(hTage);
  const ent = useEntwurf({ tage: String(z.tage), hTage: String(z.historieTage) }, { tage, hTage }, {
    aus: z.tage === null, zuruecksetzen: () => { setTage(String(z.tage)); setHTage(String(z.historieTage)); setMeldung(undefined); },
  });
  async function speichern() {
    const anzahl = (z.eintraege?.length ?? 0) + z.dokumente.length;
    if (n === 0 && anzahl && !(await rueckfrage({ titel: 'Papierkorb ausschalten?', text: `${anzahl === 1 ? 'Was darin liegt, wird' : `Alle ${anzahl} Einträge darin werden`} sofort endgültig gelöscht.`, ja: 'Ausschalten und leeren', gefahr: true }))) return;
    try {
      const r = await api.papierkorbTage({ tage: n, historieTage: h });
      z.setTage(r.tage); z.setHistorieTage(r.historieTage); melde(); await d.neuLaden();
      setMeldung({ art: 'gut', text: `Gespeichert.${r.geleert ? ` ${r.geleert} ${r.geleert === 1 ? 'Mappe' : 'Mappen'} endgültig gelöscht.` : ''}` });
    } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }
  return (
      <form className="blatt" id="aufbewahrung" onSubmit={(ev) => { ev.preventDefault(); void speichern(); }} onKeyDown={ent.tasten}>
        <div className="blattkopf zeile-zwischen"><h2 className="h3">Aufbewahrung</h2>{leeren}</div>
        <label className="eigenschaft"><span>Tage <small>0 = kein Papierkorb, Löschen ist sofort endgültig</small></span>
          <input type="number" min={0} max={3650} value={tage} onChange={(ev) => { setTage(ev.target.value); setMeldung(undefined); }} /></label>
        <p className="leise klein">Gelöschte Mappen und einzeln gelöschte Dokumente kommen in den Papierkorb. Nur das Entfernen der Demo-Daten ist immer sofort endgültig.</p>
        <label className="eigenschaft"><span>Historie endgültig gelöschter Mappen behalten <small>Tage, danach wird ihre Änderungshistorie gelöscht</small></span>
          <input type="number" min={0} max={36500} value={hTage} onChange={(ev) => { setHTage(ev.target.value); setMeldung(undefined); }} /></label>
        {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
        <Speicherleiste ent={ent} gegenstand="Aufbewahrung" ungueltig={!Number.isInteger(n) || n < 0 || !Number.isInteger(h) || h < 0} />
      </form>
  );
}
