import { HakenFeld, Knopf, Wahlhaken } from '../bausteine';
import { useState, type ReactNode } from 'react';
import { Symbol } from '../Symbol';
import { betriebApi, type ExternZustand, type SicherungEintrag, type SicherungsPlan, type SicherungStand } from '../api/betrieb';
import { t, tn } from '../sprache';
import { useHandbuch } from '../Hilfe';
import { gebietsschema } from '../../../shared/src/sprache';
import { heikelLaden } from '../verwaltungsmodus';
import { Ansage } from '../ziehen';
import { bytes, externStatus, zeit, zielName } from './sicherungFormat';

/**
 * Liste der Sicherungen (#103, #975, #986) mit Mehrfachauswahl (#1169): Haken je Sicherung, „Alle auswählen“ und
 * „Ausgewählte löschen (n)“ mit einer Rückfrage für alle (Anzahl, Zeitraum, frei werdender Platz). Die neueste geprüfte
 * Sicherung ist geschützt. Gelöscht wird nacheinander mit Fortschritt; was scheitert, bleibt gewählt und steht mit
 * Grund über der Liste. Darüber ein Hinweis, was die Aufbewahrung von selbst wegräumt.
 */

const ART = { manuell: t('werkbank.sicherung.von-hand'), automatisch: t('werkbank.sicherung.art.automatisch'), 'vor-wiederherstellung': t('werkbank.sicherung.vor-einer-wiederherstellung') } as Record<string, string>;

const beginnVon = (x: SicherungEintrag) => x.meta?.beginn ?? x.schlank?.beginn ?? null;

/**
 * Geschützt (#1169): die neueste geprüfte Sicherung (Prüfsumme unverändert oder Probe in Ordnung). Ist noch keine
 * geprüft, die neueste überhaupt – so bleibt beim Aufräumen immer eine stehen.
 */
export function geschuetzteSicherung(liste: SicherungEintrag[]): { name: string; geprueft: boolean } | null {
  const mitZeit = liste.filter((x) => beginnVon(x)).sort((a, b) => beginnVon(b)!.localeCompare(beginnVon(a)!));
  const geprueft = mitZeit.find((x) => x.pruefung?.ok || x.probe?.ok);
  if (geprueft) return { name: geprueft.name, geprueft: true };
  return mitZeit[0] ? { name: mitZeit[0].name, geprueft: false } : null;
}

/** Hinweis auf die Aufbewahrung (#1169): was Ablago von selbst wegräumt, mit Link zur Einstellung darunter. */
function Aufbewahrung({ plan }: { plan: SicherungsPlan }) {
  const a = plan.aufbewahrung;
  const text = plan.nurNeueste ? t('werkbank.sicherung.liste.aufbewahrung.neueste') : t('werkbank.sicherung.liste.aufbewahrung', { taeglich: a.taeglich, woechentlich: a.woechentlich, monatlich: a.monatlich });
  return <p className="leise klein">{text} <a href="#zeitplan" className="verweis">{t('werkbank.sicherung.liste.aufbewahrung.aendern')}</a></p>;
}

/** Zelle „Wo“: „lokal ✓ · extern ✓ geprüft“ – je Paket ein Teil, Einzelheiten im Titel. */
function OrtZelle({ e, extern }: { e: SicherungEintrag; extern: ExternZustand | null | undefined }) {
  const staende = Object.entries(e.extern ?? {});
  const mehrere = staende.length > 1;
  return (
    <span className="ort-zelle">
      <span className="gutertext">{t('werkbank.sicherung.extern.lokal')} <Symbol name="haken" /></span>
      {staende.map(([id, s]) => {
        const ok = s.status === 'geprueft' || s.status === 'hochgeladen';
        const name = extern ? zielName(extern, id) : id;
        const titel = [name, s.ziel, s.grund, t('werkbank.sicherung.extern.stand', { datum: zeit(s.am) })].filter(Boolean).join(' – ');
        return (
          <span key={id} title={titel}>{' · '}
            <span className={s.status === 'fehlgeschlagen' ? 'fehlertext' : s.status === 'geprueft' ? 'gutertext' : ok ? '' : 'leise'}>
              {mehrere ? `${name}: ` : ''}{t('werkbank.sicherung.extern.extern')} {s.status === 'fehlgeschlagen' ? <Symbol name="warnung" /> : s.status === 'geprueft' ? <Symbol name="haken" /> : s.status === 'offen' || s.status === 'laeuft' ? <Symbol name="stoppuhr" /> : null} {externStatus(s)}
            </span>
          </span>
        );
      })}
    </span>
  );
}

/**
 * Nach „Herunterladen“ (#975): der Hinweis auf das Notfallblatt, Größe und Prüfsumme zum späteren Prüfen der Kopie und
 * die Metadaten (.json), ohne die sich die Sicherung auf einem neuen Gerät nicht einspielen lässt.
 */
function Heruntergeladen({ e, schliessen }: { e: SicherungEintrag; schliessen(): void }) {
  const handbuch = useHandbuch();
  const sha = e.meta?.sha256 ?? e.schlank?.sha256 ?? null;
  const beginn = beginnVon(e);
  return (
    <div className="hinweis info" role="status">
      <p><strong>{t('werkbank.sicherung.laden.notfallblatt')}</strong> {t('werkbank.sicherung.laden.text', { zeit: beginn ? zeit(beginn) : e.name })}</p>
      <dl className="eigenschaften">
        <dt>{t('werkbank.sicherung.laden.datei')}</dt><dd className="mono">{`${e.name}.dms-sicherung`}</dd>
        <dt>{t('werkbank.sicherung.groesse')}</dt><dd>{t('werkbank.sicherung.laden.bytes', { bytes: bytes(e.bytes), genau: e.bytes.toLocaleString(gebietsschema()) })}</dd>
        <dt>{t('werkbank.sicherung.laden.sha256')}</dt><dd className="mono umbruch">{sha ?? t('werkbank.sicherung.metadaten-fehlen')}</dd>
      </dl>
      {(e.meta || e.schlank) && <p>{tn('werkbank.sicherung.laden.metadaten', { link: <a href={betriebApi.sicherungMetadatenUrl(e.name)} download className="verweis">{t('werkbank.sicherung.laden.metadaten-link')}</a> })}</p>}
      <div className="knoepfe">
        <a href={`${handbuch('admin', 'sicherung/')}#kopie-prufen`} target="_blank" rel="noreferrer" className="verweis">{t('werkbank.sicherung.laden.handbuch')}</a>
        <Knopf groesse="klein" onClick={schliessen}>{t('werkbank.sicherung.laden.schliessen')}</Knopf>
      </div>
    </div>
  );
}

/** Rückfrage für die Auswahl (#1169): Anzahl, Zeitraum und frei werdender Platz. */
function sammelFrage(auswahl: SicherungEintrag[]) {
  const zeiten = auswahl.map(beginnVon).filter((x): x is string => !!x).sort();
  const platz = bytes(auswahl.reduce((n, x) => n + x.bytes, 0));
  const zeitraum = !zeiten.length ? '' : zeiten.length === 1 || zeiten[0] === zeiten.at(-1) ? t('werkbank.sicherung.liste.frage.zeitpunkt', { zeit: zeit(zeiten[0]) }) : t('werkbank.sicherung.liste.frage.zeitraum', { von: zeit(zeiten[0]), bis: zeit(zeiten.at(-1)!) });
  return { titel: t('werkbank.sicherung.liste.frage.titel', { anzahl: auswahl.length }), text: `${zeitraum}${t('werkbank.sicherung.liste.frage.text', { platz })}`, ja: t('werkbank.sicherung.endgueltig-loeschen') };
}

type Fehlschlag = { name: string; wann: string; grund: string };

/** Zeile der Tabelle: Haken, Angaben, Herunterladen · Prüfen · Löschen. */
function Zeile({ x, s, ortSpalte, an, waehle, geschuetzt, fehlschlag, aktionen }: {
  x: SicherungEintrag; s: SicherungStand; ortSpalte: boolean; an: boolean; waehle(an: boolean): void; geschuetzt: boolean; fehlschlag?: Fehlschlag; aktionen: ReactNode;
}) {
  const beginn = beginnVon(x);
  const wann = beginn ? zeit(beginn) : x.name;
  return (
    <tr className={an ? 'an' : undefined}>
      <td className="sicherung-wahl"><Wahlhaken an={an} gesperrt={geschuetzt} setze={waehle} beschriftung={t('werkbank.sicherung.liste.waehlen', { zeit: wann })} /></td>
      <td className="kurz" title={x.name}>{wann}
        {geschuetzt && <> <span className="chip gut" title={t('werkbank.sicherung.liste.geschuetzt.titel')}>{t('werkbank.sicherung.liste.geschuetzt')}</span></>}
        {fehlschlag && <> <span className="chip schlecht" title={fehlschlag.grund}>{t('werkbank.sicherung.liste.nicht-geloescht')}</span></>}</td>
      <td>{x.meta ? ART[x.meta.art] ?? x.meta.art : x.schlank ? <span className="leise">{t('werkbank.sicherung.extern.zurueck')}</span> : <span className="fehlertext">{t('werkbank.sicherung.metadaten-fehlen')}</span>}
        {x.meta && s.zustand.fingerabdruck && x.meta.verschluesselung.fingerabdruck !== s.zustand.fingerabdruck && <> <span className="chip warn" title={t('werkbank.sicherung.schluessel-braucht-das-notfallblatt', { fingerabdruck: x.meta.verschluesselung.fingerabdruck })}>{t('werkbank.sicherung.frueherer-schluessel')}</span></>}</td>
      <td className="rechts kurz">{bytes(x.bytes)}</td>
      <td>{x.meta ? t('werkbank.sicherung.mappen-dateien', { mappen: x.meta.anzahl.mappen.toLocaleString(gebietsschema()), dateien: x.meta.anzahl.dateien.toLocaleString(gebietsschema()) }) : '–'}{x.meta && <span className="leise klein"> {' '}{t('werkbank.sicherung.ablago', { dms: x.meta.umgebung.dms })}</span>}</td>
      {ortSpalte && <td><OrtZelle e={x} extern={s.zustand.extern} /></td>}
      <td>{x.pruefung ? <span className={`chip ${x.pruefung.ok ? 'gut' : 'schlecht'}`} title={t('werkbank.sicherung.geprueft', { zeit: zeit(x.pruefung.am) })}>{x.pruefung.ok ? t('werkbank.sicherung.unveraendert') : t('werkbank.sicherung.weicht-ab')}</span> : <span className="leise">–</span>}</td>
      <td>{x.probe ? <span className={`chip ${x.probe.ok ? 'gut' : 'schlecht'}`} title={`${zeit(x.probe.am)}: ${x.probe.info}`}>{x.probe.ok ? t('werkbank.sicherung.in-ordnung') : t('werkbank.sicherung.fehler')}</span> : <span className="leise">–</span>}</td>
      <td className="kurz"><span className="sicherung-aktionen">{aktionen}</span></td>
    </tr>
  );
}

export function SicherungListe({ s, laeuft, laden }: { s: SicherungStand; laeuft: boolean; laden(): Promise<void> }) {
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [prueft, setPrueft] = useState<string>();
  // Herunterladen (#975): Name der zuletzt geladenen Sicherung – darunter Hinweis, Größe und Prüfsumme.
  const [geladen, setGeladen] = useState<string>();
  const [auswahl, setAuswahl] = useState<Set<string>>(new Set());
  const [fortschritt, setFortschritt] = useState<{ fertig: number; gesamt: number } | null>(null);
  const [fehlschlaege, setFehlschlaege] = useState<Fehlschlag[]>([]);
  const [ansage, setAnsage] = useState('');
  // Sicherungen mit einem früheren Schlüssel (#47).
  const alte = s.liste.filter((x) => x.meta && s.zustand.fingerabdruck && x.meta.verschluesselung.fingerabdruck !== s.zustand.fingerabdruck);
  // Spalte „Wo“ (#585), sobald es ein Ziel außer Haus gibt oder eine Sicherung schon einen Stand hat.
  const ortSpalte = !!s.zustand.extern?.ziele.length || s.liste.some((x) => x.extern);
  const schutz = geschuetzteSicherung(s.liste);
  const waehlbar = s.liste.filter((x) => x.name !== schutz?.name).map((x) => x.name);
  const gewaehlt = s.liste.filter((x) => auswahl.has(x.name) && x.name !== schutz?.name);
  const loescht = fortschritt !== null;
  const waehle = (name: string, an: boolean) => setAuswahl((x) => { const y = new Set(x); if (an) y.add(name); else y.delete(name); return y; });

  async function tu(f: () => Promise<unknown>, gut?: string) {
    setMeldung(undefined);
    try { await f(); await laden(); if (gut) setMeldung({ art: 'gut', text: gut }); } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }
  /** Ausgewählte nacheinander löschen (#1169); was scheitert, bleibt gewählt und steht mit Grund da. */
  async function sammelLoeschen() {
    const liste = gewaehlt;
    setMeldung(undefined); setFehlschlaege([]);
    const nicht: Fehlschlag[] = [];
    for (const [i, x] of liste.entries()) {
      setFortschritt({ fertig: i, gesamt: liste.length });
      try { await betriebApi.sicherungLoeschen(x.name); } catch (e) { const b = beginnVon(x); nicht.push({ name: x.name, wann: b ? zeit(b) : x.name, grund: (e as Error).message }); }
    }
    setFortschritt(null);
    setFehlschlaege(nicht);
    setAuswahl(new Set(nicht.map((x) => x.name)));
    const geloescht = liste.length - nicht.length;
    setAnsage(t('werkbank.sicherung.liste.geloescht', { anzahl: geloescht }));
    if (geloescht) setMeldung({ art: 'gut', text: t('werkbank.sicherung.liste.geloescht', { anzahl: geloescht }) });
    await laden();
  }
  // „Prüfen“ (#986): läuft und Fehler in der Zeile; das Ergebnis steht danach in der Spalte „Geprüft“.
  const pruefKnopf = (name: string, moeglich: boolean) => (
    <Knopf art="link" gesperrt={(laeuft && prueft !== name) || !moeglich || loescht} laeuft={laeuft && prueft === name} laeuftText={t('werkbank.sicherung.prueft')}
      onClick={async () => { setPrueft(name); await betriebApi.sicherungPruefen(name); await laden(); }}>{t('werkbank.sicherung.pruefen')}</Knopf>
  );
  const loeschFrage = (x: SicherungEintrag) => ({ titel: t('werkbank.sicherung.sicherung-vom-loeschen', { wert: x.meta ? zeit(x.meta.beginn) : x.name }), text: t('werkbank.sicherung.sie-ist-danach-endgueltig'), ja: t('werkbank.sicherung.endgueltig-loeschen') });
  // „Herunterladen“ (#975): heikle Handlung (frische Anmeldung), dann lädt der Browser selbst – mit Fortschritt und Abbrechen.
  const ladeKnopf = (name: string) => (
    <Knopf art="link" onClick={async () => { if (await heikelLaden(betriebApi.sicherungDateiUrl(name))) setGeladen(name); }}>{t('werkbank.sicherung.herunterladen')}</Knopf>
  );
  const heruntergeladen = geladen ? s.liste.find((x) => x.name === geladen) : undefined;

  return (
    <section className="blatt" id="liste">
      <h2 className="h3">{t('werkbank.sicherung.sicherungen-2')}</h2>
      <Aufbewahrung plan={s.plan} />
      {alte.length > 0 && (
        <div className="hinweis info">
          <p>{tn('werkbank.sicherung.zum-wiederherstellen-brauchst-du', { b: <strong>{t('werkbank.sicherung.sicherungen-sind-mit-einem', { anzahl: alte.length })}</strong> })}</p>
          <div className="knoepfe"><Knopf art="gefahr" symbol="geloescht" groesse="klein" gesperrt={laeuft || loescht}
            rueckfrage={{ titel: t('werkbank.sicherung.alle-sicherungen-mit-frueherem', { anzahl: alte.length }), text: t('werkbank.sicherung.sie-sind-danach-endgueltig'), ja: t('werkbank.sicherung.endgueltig-loeschen') }}
            onClick={() => { void tu(async () => { for (const x of alte) await betriebApi.sicherungLoeschen(x.name); }, t('werkbank.sicherung.sicherungen-mit-frueherem-schluessel')); }}>
            {t('werkbank.sicherung.sicherungen-mit-frueherem-schluessel-2')}</Knopf></div>
        </div>
      )}
      <Ansage text={ansage} />
      {!s.liste.length ? <p className="leise">{tn('werkbank.sicherung.noch-keine-sicherung-im', { span: <span className="mono">{s.zustand.ort.ordner}</span> })}</p> : <>
        <div className="zeile sicherung-auswahl">
          <HakenFeld beschriftung={t('werkbank.sicherung.liste.alle')}>
            <input type="checkbox" disabled={!waehlbar.length || loescht} checked={!!waehlbar.length && gewaehlt.length === waehlbar.length} onChange={(x) => setAuswahl(x.target.checked ? new Set(waehlbar) : new Set())} />
          </HakenFeld>
          {gewaehlt.length > 0 && <Knopf art="gefahr" symbol="geloescht" gesperrt={laeuft || loescht} rueckfrage={sammelFrage(gewaehlt)} onClick={() => { void sammelLoeschen(); }}>{t('werkbank.sicherung.liste.loeschen', { anzahl: gewaehlt.length })}</Knopf>}
        </div>
        {schutz && <p className="leise klein">{t(schutz.geprueft ? 'werkbank.sicherung.liste.schutz' : 'werkbank.sicherung.liste.schutz.neueste')}</p>}
        {fortschritt && (
          <div className="stapel" role="status">
            <p>{t('werkbank.sicherung.liste.fortschritt', { fertig: fortschritt.fertig + 1, gesamt: fortschritt.gesamt })}</p>
            <progress max={fortschritt.gesamt} value={fortschritt.fertig} />
          </div>
        )}
        {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
        {fehlschlaege.length > 0 && <div className="hinweis schlecht" role="alert"><p>{t('werkbank.sicherung.liste.fehlschlaege', { anzahl: fehlschlaege.length })}</p><ul>{fehlschlaege.map((x) => <li key={x.name}>{x.wann}: {x.grund}</li>)}</ul></div>}
        <div className="trefferliste"><table>
          <thead><tr><th><span className="sr">{t('werkbank.sicherung.liste.auswahl')}</span></th><th>{t('werkbank.sicherung.zeitpunkt')}</th><th>{t('werkbank.sicherung.art')}</th><th className="rechts">{t('werkbank.sicherung.groesse')}</th><th>{t('werkbank.sicherung.inhalt')}</th>{ortSpalte && <th>{t('werkbank.sicherung.extern.spalte')}</th>}<th>{t('werkbank.sicherung.pruefsumme')}</th><th>{t('werkbank.sicherung.probe')}</th><th><span className="sr">{t('werkbank.sicherung.aktionen')}</span></th></tr></thead>
          <tbody>{s.liste.map((x) => (
            <Zeile key={x.name} x={x} s={s} ortSpalte={ortSpalte} an={auswahl.has(x.name) || geladen === x.name} waehle={(an) => waehle(x.name, an)} geschuetzt={x.name === schutz?.name}
              fehlschlag={fehlschlaege.find((f) => f.name === x.name)}
              aktionen={<>
                {ladeKnopf(x.name)}
                {pruefKnopf(x.name, !!(x.meta || x.schlank))}
                <Knopf art="gefahr" symbol="geloescht" groesse="klein" gesperrt={laeuft || loescht} rueckfrage={loeschFrage(x)} onClick={() => { void tu(() => betriebApi.sicherungLoeschen(x.name), t('werkbank.sicherung.sicherung-geloescht')); }}>{t('werkbank.sicherung.loeschen')}</Knopf>
              </>} />
          ))}</tbody>
        </table></div>
      </>}
      {heruntergeladen && <Heruntergeladen e={heruntergeladen} schliessen={() => setGeladen(undefined)} />}
      <p className="leise klein">{t('werkbank.sicherung.pruefen-rechnet-die-pruefsumme')}</p>
    </section>
  );
}
