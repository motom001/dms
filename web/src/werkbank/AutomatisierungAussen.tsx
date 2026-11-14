import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  AUSSEN_GRENZEN, AUSSEN_METHODEN, AUSSEN_PARAMETER_NAME, INHALTSSTUFEN, istEmailFeld, platzhalterErlaubt, platzhalterFuer, zielFuer, zielHost, zielProblem,
  type AutomatisierungAnsicht, type AussenZiel, type DannEmail, type DannUrl, type Empfaenger, type Inhaltsstufe, type Kontextdaten, type MailEmpfaenger, type WennKarte,
} from '../../../shared/src/automatisierung';
import type { Mappentyp } from '../../../shared/src/model';
import { gebietsschema } from '../../../shared/src/sprache';
import { automatisierungApi, type AussenZustellung } from '../api/automatisierung';
import { Bereich, Feld, HakenFeld, Knopf, Platzhalter, usePlatzhalterEinsetzen, type Klappe, type PlatzhalterGruppe } from '../bausteine';
import { Link } from '../ort';
import { rueckfrage } from '../rueckfrage';
import { t } from '../sprache';

/**
 * Karten nach außen (#671) in der Werkbank: „URL aufrufen“ und „E-Mail senden“ im Editor, das Geheimnis einer Karte für
 * die Signatur, der Verlauf der Zustellungen (ohne Inhalte) und die Liste der freigegebenen Ziele
 * (Werkbank → Automatisierungen → Ziele nach außen). Prüfen und Zustellen macht der Server.
 */

const zeit = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'short', timeStyle: 'short' }) : '');

/**
 * Platzhalter einer Automatisierung gruppiert (#1177): „Allgemein“ (Mappe, Datum, Personen aus dem Ereignis …) und die
 * Felder des Mappentyps unter seinem Namen – für den Baustein Platzhalter. Bei „URL aufrufen“ nur die, die zur
 * Inhaltsstufe passen.
 */
export function platzhalterGruppen(wenn: WennKarte, typ: Mappentyp | null, stufe?: Inhaltsstufe): PlatzhalterGruppe[] {
  const liste = platzhalterFuer(wenn, typ).filter((p) => !stufe || platzhalterErlaubt(p.key, stufe, wenn));
  const feld = new Set((typ?.felder ?? []).map((f) => f.key));
  return [
    { name: t('automatisierung.ui.platzhalter.allgemein'), eintraege: liste.filter((p) => !feld.has(p.key)).map((p) => ({ key: p.key, text: p.label })) },
    ...(typ ? [{ name: typ.name, eintraege: liste.filter((p) => feld.has(p.key)).map((p) => ({ key: p.key, text: p.label })) }] : []),
  ];
}

/* ---------- URL aufrufen ---------- */

export function UrlKarte({ karte, wenn, typ, k, a, setze }: { karte: DannUrl; wenn: WennKarte; typ: Mappentyp | null; k: Kontextdaten; a?: AutomatisierungAnsicht; setze: (k: DannUrl) => void }) {
  const ein = usePlatzhalterEinsetzen();
  const ziel = karte.adresse ? zielFuer(karte.adresse, k.ziele ?? []) : null;
  const stufe = async (neu: Inhaltsstufe) => {
    if (neu !== 'werte') { setze({ ...karte, inhalt: neu, bestaetigt: undefined }); return; }
    // „Mit Werten“ nur nach Bestätigung: Daten verlassen Ablago (#671).
    if (await rueckfrage({ titel: t('automatisierung.ui.karte.dann.url.werte.frage'), text: t('automatisierung.ui.karte.dann.url.werte.text'), ja: t('automatisierung.ui.karte.dann.url.werte.ja') })) {
      setze({ ...karte, inhalt: 'werte', methode: 'POST', bestaetigt: true });
    }
  };
  const gespeichert = !!a && [...a.dann, ...a.sonst].some((x) => x.id === karte.id && x.art === 'url');
  return (
    <div className="karte offen">
      <Feld beschriftung={t('automatisierung.ui.karte.dann.url.adresse')} className="breit"
        hinweis={ziel ? t(ziel.heimnetz ? 'automatisierung.ui.karte.dann.url.ziel.heimnetz' : 'automatisierung.ui.karte.dann.url.ziel.ok', { ziel: ziel.adresse }) : t('automatisierung.ui.karte.dann.url.adresse.hilfe')}
        fehler={karte.adresse && !ziel ? t('automatisierung.ui.karte.dann.url.ziel.fehlt', { host: zielHost(karte.adresse) }) : undefined}>
        <input className="mono" value={karte.adresse} maxLength={AUSSEN_GRENZEN.adresse} placeholder="https://hooks.example.org/ablago" list="aussen-ziele"
          onChange={(x) => setze({ ...karte, adresse: x.target.value })} />
      </Feld>
      <datalist id="aussen-ziele">{(k.ziele ?? []).map((z) => <option key={z.adresse} value={z.adresse} />)}</datalist>
      <p className="klein"><Link to="/werkbank/automatisierungen/ziele" className="verweis">{t('automatisierung.ui.karte.dann.url.ziele-link')}</Link></p>
      <div className="raster">
        <Feld beschriftung={t('automatisierung.ui.karte.dann.url.methode')}>
          <select value={karte.methode} onChange={(x) => setze({ ...karte, methode: x.target.value === 'GET' ? 'GET' : 'POST' })}>
            {AUSSEN_METHODEN.map((m) => <option key={m} value={m} disabled={m === 'GET' && karte.inhalt === 'werte'}>{m}</option>)}
          </select>
        </Feld>
        <Feld beschriftung={t('automatisierung.ui.karte.dann.url.inhalt')} hinweis={t.frei(`automatisierung.ui.karte.dann.url.inhalt.${karte.inhalt}.text`)}>
          <select value={karte.inhalt} onChange={(x) => void stufe(x.target.value as Inhaltsstufe)}>
            {INHALTSSTUFEN.map((s) => <option key={s} value={s}>{t.frei(`automatisierung.ui.karte.dann.url.inhalt.${s}`)}</option>)}
          </select>
        </Feld>
      </div>
      {karte.inhalt === 'werte' && <div className="hinweis warn" role="status"><p><strong>{t('automatisierung.ui.karte.dann.url.werte.hinweis.titel')}</strong> {t('automatisierung.ui.karte.dann.url.werte.hinweis')}</p></div>}
      <fieldset className="eigenschaft breit"><legend>{t('automatisierung.ui.karte.dann.url.parameter')}</legend>
        <ul className="stapel">
          {karte.parameter.map((p, i) => (
            <li key={i} className="bedingungszeile">
              <Feld beschriftung={t('automatisierung.ui.karte.dann.url.parameter.name')} fehler={p.name && !AUSSEN_PARAMETER_NAME.test(p.name) ? t('automatisierung.ui.karte.dann.url.parameter.falsch') : undefined}>
                <input className="mono" value={p.name} maxLength={AUSSEN_GRENZEN.name} placeholder={t('automatisierung.ui.aufruf.parameter.beispiel').split(',')[0]}
                  onChange={(x) => setze({ ...karte, parameter: karte.parameter.map((y, j) => (j === i ? { ...y, name: x.target.value.toLowerCase() } : y)) })} />
              </Feld>
              <Feld beschriftung={t('automatisierung.ui.karte.dann.url.parameter.wert')}>
                <input {...ein.feld(`p${i}`, p.wert, (w) => setze({ ...karte, parameter: karte.parameter.map((y, j) => (j === i ? { ...y, wert: w } : y)) }))} value={p.wert} maxLength={AUSSEN_GRENZEN.wert}
                  onChange={(x) => setze({ ...karte, parameter: karte.parameter.map((y, j) => (j === i ? { ...y, wert: x.target.value } : y)) })} />
              </Feld>
              <Knopf art="link" groesse="klein" symbol="schliessen" onClick={() => setze({ ...karte, parameter: karte.parameter.filter((_, j) => j !== i) })}>{t('automatisierung.ui.entfernen')}</Knopf>
            </li>
          ))}
        </ul>
        {karte.parameter.length < AUSSEN_GRENZEN.parameter && <Knopf groesse="klein" onClick={() => setze({ ...karte, parameter: [...karte.parameter, { name: '', wert: '' }] })}>{t('automatisierung.ui.karte.dann.url.parameter.hinzu')}</Knopf>}
        <p className="leise klein">{t('automatisierung.ui.karte.dann.url.parameter.hilfe', { anzahl: AUSSEN_GRENZEN.parameter })}</p>
      </fieldset>
      {karte.parameter.length > 0 && <Platzhalter einsetzen={ein.einsetzen} gruppen={platzhalterGruppen(wenn, typ, karte.inhalt)} />}
      <p className="leise klein">{t('automatisierung.ui.karte.dann.url.text')}</p>
      {a && gespeichert ? <UrlGeheimnis a={a} karte={karte.id} /> : <p className="leise klein">{t('automatisierung.ui.karte.dann.url.geheimnis.erst-speichern')}</p>}
    </div>
  );
}

/** Geheimnis einer gespeicherten Karte „URL aufrufen“: anlegen bzw. erneuern (nur einmal sichtbar), entfernen. */
function UrlGeheimnis({ a, karte }: { a: AutomatisierungAnsicht; karte: string }) {
  const [stand, setStand] = useState(a.geheimnisse?.find((g) => g.karte === karte) ?? null);
  const [neu, setNeu] = useState<{ geheimnis: string; kopiert: boolean } | null>(null);
  const [fehler, setFehler] = useState<string>();
  const lege = async () => {
    setFehler(undefined);
    try { const r = await automatisierungApi.automatisierungGeheimnis(a.id, karte); setNeu({ geheimnis: r.geheimnis, kopiert: false }); setStand({ karte, erstellt: r.erstellt }); } catch (e) { setFehler((e as Error).message); }
  };
  return (
    <section className="automatisierung-bereich aufruf" aria-label={t('automatisierung.ui.karte.dann.url.geheimnis')}>
      <p className="klein">{stand ? t('automatisierung.ui.karte.dann.url.geheimnis.seit', { zeit: zeit(stand.erstellt) }) : t('automatisierung.ui.karte.dann.url.geheimnis.keins')}</p>
      <div className="knoepfe">
        <Knopf groesse="klein" onClick={async () => {
          if (!stand || await rueckfrage({ titel: t('automatisierung.ui.karte.dann.url.geheimnis.neu.frage'), text: t('automatisierung.ui.karte.dann.url.geheimnis.neu.text'), ja: t('automatisierung.ui.karte.dann.url.geheimnis.neu') })) await lege();
        }}>{stand ? t('automatisierung.ui.karte.dann.url.geheimnis.neu') : t('automatisierung.ui.karte.dann.url.geheimnis.anlegen')}</Knopf>
        {stand && <Knopf art="gefahr" groesse="klein" symbol="geloescht"
          rueckfrage={{ titel: t('automatisierung.ui.karte.dann.url.geheimnis.entfernen.frage'), text: t('automatisierung.ui.karte.dann.url.geheimnis.entfernen.text'), ja: t('automatisierung.ui.karte.dann.url.geheimnis.entfernen') }}
          onClick={async () => {
          try { await automatisierungApi.automatisierungGeheimnisEntfernen(a.id, karte); setStand(null); setNeu(null); } catch (e) { setFehler((e as Error).message); }
        }}>{t('automatisierung.ui.karte.dann.url.geheimnis.entfernen')}</Knopf>}
      </div>
      {fehler && <p className="fehlertext klein">{fehler}</p>}
      {neu && (
        <div className="hinweis warn stapel" role="status">
          <p><strong>{t('automatisierung.ui.aufruf.geheimnis.titel')}</strong> {t('automatisierung.ui.aufruf.geheimnis.text')}</p>
          <Feld beschriftung={t('automatisierung.ui.aufruf.geheimnis')}>
            <input id={`geheimnis-${karte}`} className="mono" readOnly value={neu.geheimnis} onFocus={(x) => x.target.select()} />
          </Feld>
          <div className="knoepfe">
            <Knopf groesse="klein" onClick={() => void navigator.clipboard?.writeText(neu.geheimnis).then(() => setNeu({ ...neu, kopiert: true }), () => {})}>{neu.kopiert ? t('automatisierung.ui.aufruf.kopiert') : t('automatisierung.ui.aufruf.geheimnis-kopieren')}</Knopf>
            <Knopf groesse="klein" onClick={() => setNeu(null)}>{t('automatisierung.ui.aufruf.gesichert')}</Knopf>
          </div>
        </div>
      )}
      <p className="leise klein">{t('automatisierung.ui.karte.dann.url.geheimnis.text')}</p>
    </section>
  );
}

/* ---------- E-Mail senden ---------- */

/** „An“ einer E-Mail: Auswahl wie bei Aufgaben (über `wahl`), dazu E-Mail-Felder der Mappe und beliebige Adressen. */
export function EmailKarte({ karte, wenn, typ, ohneMappe, setze, wahl }: {
  karte: DannEmail; wenn: WennKarte; typ: Mappentyp | null; ohneMappe: boolean; setze: (k: DannEmail) => void;
  /** Auswahl einer Person, Rolle, eines Felds … (wie bei Aufgaben), `extra` = zusätzliche Optionen. */
  wahl: (e: Empfaenger, setze: (e: Empfaenger | MailEmpfaenger) => void, extra: ReactNode) => ReactNode;
}) {
  const ein = usePlatzhalterEinsetzen();
  const emailFelder = ohneMappe ? [] : (typ?.felder ?? []).filter((f) => istEmailFeld(f));
  const extra = <>
    <option value="adresse:">{t('automatisierung.ui.karte.dann.email.adresse')}</option>
    {emailFelder.length > 0 && <optgroup label={t('automatisierung.ui.karte.dann.email.felder')}>{emailFelder.map((f) => <option key={f.key} value={`feld:${f.key}`}>{f.label}</option>)}</optgroup>}
  </>;
  const setzeAn = (i: number, e: MailEmpfaenger) => setze({ ...karte, an: karte.an.map((x, j) => (j === i ? e : x)) });
  return (
    <div className="karte offen">
      <fieldset className="eigenschaft breit"><legend>{t('automatisierung.ui.karte.dann.email.an')}</legend>
        <ul className="stapel">
          {karte.an.map((e, i) => (
            <li key={i} className="bedingungszeile">
              {e.art === 'adresse'
                ? <Feld beschriftung={t('automatisierung.ui.karte.dann.email.adresse.feld')}><input type="email" value={e.adresse} placeholder="lena@example.org" onChange={(x) => setzeAn(i, { art: 'adresse', adresse: x.target.value })} /></Feld>
                : wahl(e, (n) => setzeAn(i, n), extra)}
              <Knopf art="link" groesse="klein" symbol="schliessen" onClick={() => setze({ ...karte, an: karte.an.filter((_, j) => j !== i) })}>{t('automatisierung.ui.entfernen')}</Knopf>
            </li>
          ))}
        </ul>
        {karte.an.length < AUSSEN_GRENZEN.an && <Knopf groesse="klein" onClick={() => setze({ ...karte, an: [...karte.an, { art: 'person', id: '' }] })}>{t('automatisierung.ui.empfaenger.hinzu')}</Knopf>}
        <p className="leise klein">{t('automatisierung.ui.karte.dann.email.an.hilfe')}</p>
        {karte.an.some((e) => e.art === 'feld') && <p className="leise klein">{t('automatisierung.ui.karte.dann.email.an.feld')}</p>}
      </fieldset>
      <Feld beschriftung={t('automatisierung.ui.karte.dann.email.betreff')} className="breit">
        <input {...ein.feld('betreff', karte.betreff, (x) => setze({ ...karte, betreff: x }))} value={karte.betreff} maxLength={AUSSEN_GRENZEN.betreff} onChange={(x) => setze({ ...karte, betreff: x.target.value })} />
      </Feld>
      <Feld beschriftung={t('automatisierung.ui.karte.dann.email.text')} className="breit">
        <textarea {...ein.feld('text', karte.text, (x) => setze({ ...karte, text: x }))} rows={4} value={karte.text} maxLength={AUSSEN_GRENZEN.text} onChange={(x) => setze({ ...karte, text: x.target.value })} />
      </Feld>
      <Platzhalter einsetzen={ein.einsetzen} gruppen={platzhalterGruppen(wenn, typ)} />
      <p className="leise klein">{t('automatisierung.ui.karte.dann.email.hinweis', { anzahl: AUSSEN_GRENZEN.mailsJeAutomatisierungJeTag, alle: AUSSEN_GRENZEN.mailsJeTag })}</p>
    </div>
  );
}

/* ---------- Zustellungen ---------- */

const ZUSTAND_ART: Record<string, string> = { zugestellt: 'gut', aufgegeben: 'schlecht', offen: 'info', verworfen: 'leise' };

/** Zustellungen nach außen einer Automatisierung (#671): Ziel, Zustand, Status bzw. Fehler – nie Inhalte. */
export function Zustellungen({ a, klappe }: { a: AutomatisierungAnsicht; klappe: Klappe }) {
  const [liste, setListe] = useState<AussenZustellung[] | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => { try { setListe(await automatisierungApi.automatisierungZustellungen(a.id)); } catch (e) { setFehler((e as Error).message); } }, [a.id]);
  useEffect(() => { void laden(); const z = setInterval(() => void laden(), 10_000); return () => clearInterval(z); }, [laden]);
  return (
    <Bereich id="zustellungen" titel={t('automatisierung.ui.zustellungen')} klappe={klappe}
      kurz={liste?.length ? t('automatisierung.ui.bereich.zuletzt', { zeit: zeit(liste[0].erstellt) }) : t('automatisierung.ui.zustellungen.leer')}>
      <p className="leise klein">{t('automatisierung.ui.zustellungen.text')}</p>
      {fehler && <p className="fehlertext">{fehler}</p>}
      {!liste ? <p className="leise">{t('automatisierung.ui.lade')}</p> : !liste.length ? <p className="leise">{t('automatisierung.ui.zustellungen.leer')}</p> : (
        <table className="aenderungen">
          <thead><tr><th>{t('automatisierung.ui.zustellungen.wann')}</th><th>{t('automatisierung.ui.zustellungen.ziel')}</th><th>{t('automatisierung.ui.zustellungen.zustand')}</th><th>{t('automatisierung.ui.schritte.einzelheiten')}</th></tr></thead>
          <tbody>{liste.map((z) => (
            <tr key={z.id}>
              <td>{zeit(z.erstellt)}</td>
              <td className="mono">{z.ziel}</td>
              <td><span className={`chip ${ZUSTAND_ART[z.zustand] ?? ''}`}>{t.frei(`automatisierung.ui.zustellungen.${z.zustand}`)}</span></td>
              <td className={z.fehler || z.status ? '' : 'leise'}>{[z.status ? `HTTP ${z.status}` : '', z.fehler ?? '', z.versuche > 1 ? t('automatisierung.ui.zustellungen.versuche', { anzahl: z.versuche }) : ''].filter(Boolean).join(' · ') || '–'}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </Bereich>
  );
}

/* ---------- Ziele nach außen ---------- */

/** Werkbank → Automatisierungen → Ziele nach außen (#671): nur an diese Adressen ruft „URL aufrufen“. */
export function AussenZiele({ nachher }: { nachher: () => void }) {
  const [ziele, setZiele] = useState<AussenZiel[] | null>(null);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [sendet, setSendet] = useState(false);
  useEffect(() => { void automatisierungApi.automatisierungZiele().then((r) => setZiele(r.ziele.length ? r.ziele : [{ adresse: '', heimnetz: false }]), (e: Error) => setMeldung({ art: 'schlecht', text: e.message })); }, []);
  if (!ziele) return meldung ? <div className="hinweis schlecht"><p>{meldung.text}</p></div> : <p className="leise">{t('automatisierung.ui.lade')}</p>;
  const setzeZiel = (i: number, z: Partial<AussenZiel>) => setZiele(ziele.map((x, j) => (j === i ? { ...x, ...z } : x)));
  const speichern = async () => {
    setSendet(true); setMeldung(undefined);
    try {
      const r = await automatisierungApi.automatisierungZieleSetzen(ziele.filter((z) => z.adresse.trim()));
      setZiele(r.ziele.length ? r.ziele : [{ adresse: '', heimnetz: false }]);
      setMeldung({ art: r.betroffen.length ? 'schlecht' : 'gut', text: r.betroffen.length ? t('automatisierung.ui.ziele.betroffen', { namen: r.betroffen.map((x) => `„${x.name}“`).join(', ') }) : t('automatisierung.ui.ziele.gespeichert') });
      nachher();
    } catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); } finally { setSendet(false); }
  };
  return (
    <div className="editorform">
      <div className="mappenkopf">
        <p className="ueber">{t('automatisierung.ui.ueber')}</p>
        <h1>{t('automatisierung.ui.ziele')}</h1>
        <p className="leise">{t('automatisierung.ui.ziele.text')}</p>
      </div>
      {meldung && <div className={`hinweis ${meldung.art}`} role="status"><p>{meldung.text}</p></div>}
      <div className="stapel">
        {ziele.map((z, i) => {
          const problem = z.adresse.trim() ? zielProblem(z.adresse, z.heimnetz) : null;
          return (
            <section key={i} className="karte offen" aria-label={z.adresse || t('automatisierung.ui.ziele.adresse')}>
              <Feld beschriftung={t('automatisierung.ui.ziele.adresse')} fehler={problem ?? undefined} hinweis={t('automatisierung.ui.ziele.adresse.hilfe')} className="breit">
                <input className="mono" value={z.adresse} maxLength={AUSSEN_GRENZEN.adresse} placeholder="https://hooks.example.org/ablago" onChange={(x) => setzeZiel(i, { adresse: x.target.value })} />
              </Feld>
              <HakenFeld beschriftung={t('automatisierung.ui.ziele.heimnetz')} hinweis={t('automatisierung.ui.ziele.heimnetz.hilfe')}>
                <input type="checkbox" checked={z.heimnetz} onChange={(x) => setzeZiel(i, { heimnetz: x.target.checked })} />
              </HakenFeld>
              {z.heimnetz && <div className="hinweis warn"><p>{t('automatisierung.ui.ziele.heimnetz.warnung')}</p></div>}
              <Feld beschriftung={t('automatisierung.ui.ziele.notiz')} optional className="breit">
                <input value={z.notiz ?? ''} maxLength={200} onChange={(x) => setzeZiel(i, { notiz: x.target.value })} />
              </Feld>
              {z.erstellt && <p className="leise klein">{t('automatisierung.ui.ziele.seit', { zeit: zeit(z.erstellt) })}</p>}
              <div className="knoepfe"><Knopf art="link" groesse="klein" symbol="schliessen" onClick={() => setZiele(ziele.filter((_, j) => j !== i))}>{t('automatisierung.ui.entfernen')}</Knopf></div>
            </section>
          );
        })}
      </div>
      {/* „+ Ziel“ in eigener Zeile (#1213): klein neben dem Hauptknopf wurde er auf dessen Höhe gestreckt. */}
      {ziele.length < AUSSEN_GRENZEN.ziele && <div className="knoepfe links"><Knopf groesse="klein" onClick={() => setZiele([...ziele, { adresse: '', heimnetz: false }])}>{t('automatisierung.ui.ziele.hinzu')}</Knopf></div>}
      <div className="knoepfe">
        <Knopf art="haupt" laeuft={sendet} gesperrt={ziele.some((z) => z.adresse.trim() && zielProblem(z.adresse, z.heimnetz))} onClick={() => speichern()}>{t('automatisierung.ui.ziele.speichern')}</Knopf>
      </div>
      <p className="leise klein">{t('automatisierung.ui.ziele.schutz', { sekunden: AUSSEN_GRENZEN.zeitlimitS })}</p>
    </div>
  );
}
