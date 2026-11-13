import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type SucheStand } from '../api';
import { geheZu, Link, loeseWache } from '../ort';
import { Listenkopf } from '../Listenkopf';
import { Speicherleiste, useEntwurf } from '../Speicherleiste';
import { Symbol } from '../Symbol';
import { t, tn } from '../sprache';
import { EIGENE_WOERTER, gruppenMitWort, pruefeWortgruppe, SYNONYM_LAENGE, SYNONYM_MAX, type Wortgruppe } from '../../../shared/src/suche';
import type { Fundquelle } from '../../../shared/src/listensuche';
import { FeldGruppe, Fundstellen, Hervorgehoben, KeineTreffer, Knopf, KnopfLink, ListenSuche, NurLesenFeld, PaketChip, PaketFilter, useListenSuche } from '../bausteine';

/**
 * Werkbank → Gleichbedeutende Wörter (#992, vorher unten auf „Suche und Volltext“, #356): dreiteilig wie die anderen
 * Sammlungen der Werkbank. In der Mitte die Gruppen mit Suche (Baustein Suche, #978) und Filter nach Herkunft, rechts
 * die Wörter einer Gruppe einzeln – hinzufügen, ändern, entfernen, Reihenfolge ändern. Unter dem ersten Wort steht die
 * Gruppe in der Liste. Gruppen aus Paketen nur zum Ansehen; „Als eigene Gruppe übernehmen“ öffnet eine Kopie zum
 * Ändern (/werkbank/woerter/neu?kopie=<id>). Gespeichert wird mit Konfliktschutz wie bei Mappentypen (#917).
 */

export const WOERTER_PFAD = '/werkbank/woerter';
const pfad = (id: string) => `${WOERTER_PFAD}/${encodeURIComponent(id)}`;

export function useWoerter(offen: boolean) {
  const [stand, setStand] = useState<SucheStand | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => { try { setStand(await api.sucheStand()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); } }, []);
  useEffect(() => { if (offen) void laden(); }, [offen, laden]);
  return { stand, gruppen: stand?.synonyme ?? null, fehler, laden, setStand };
}
export type WoerterZustand = ReturnType<typeof useWoerter>;

const eigen = (g: Pick<Wortgruppe, 'quelle'>) => g.quelle === EIGENE_WOERTER;
/** Herkunft zum Anzeigen: „Eigene“ oder der Name des Pakets. */
const herkunftText = (g: Wortgruppe) => (eigen(g) ? t('suche.gruppen.eigene') : g.paketName ?? g.quelle);

/**
 * Worin die Liste sucht: das erste Wort (Titel), die übrigen Wörter (zusammen, damit sie in der Zeile hervorgehoben
 * stehen) und der Name des Pakets.
 */
function quellen(g: Wortgruppe): Fundquelle[] {
  return [
    { wo: '', text: g.woerter[0] ?? '', titel: true },
    { wo: t('suche.gruppen.fund.woerter'), text: g.woerter.slice(1).join(' · ') },
    ...(eigen(g) ? [] : [{ wo: t('suche.gruppen.fund.paket'), text: herkunftText(g) }]),
  ];
}

/** Mitte: je Gruppe eine Zeile – erstes Wort fett, die übrigen leise, darunter die Herkunft. */
export function WoerterListe({ z, offen }: { z: WoerterZustand; offen?: string }) {
  const liste = z.gruppen ?? [];
  const such = useListenSuche(liste, { quellen, herkunft: (g) => (eigen(g) ? null : g.quelle) });
  const pakete = such.paketeDa.map((id) => ({ id, name: liste.find((g) => g.quelle === id)?.paketName ?? id })).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      <Listenkopf titel={t('suche.gruppen.titel')} hilfe="werkbank.woerter" beschreibung={t('suche.gruppen.wirkung')}>
        <KnopfLink to={`${WOERTER_PFAD}/neu`} art="anlegen" groesse="klein" anker="werkbank.woerter.neu">{t('suche.gruppen.neu')}</KnopfLink>
      </Listenkopf>
      {z.fehler && <div className="hinweis schlecht"><p>{z.fehler}</p></div>}
      {liste.length > 0 && (
        <ListenSuche wert={such.eingabe} setze={such.setEingabe} beschriftung={t('suche.gruppen.suche.beschriftung')} platzhalter={t('suche.gruppen.suche.platzhalter')} anker="werkbank.woerter.suche"
          treffer={such.treffer.length} aktiv={such.aktiv} anzahl={t('suche.gruppen.anzahl', { anzahl: liste.length })}
          filter={<PaketFilter wert={such.paket} setze={such.setPaket} pakete={pakete} eigene={such.eigeneDa} beschriftung={t('suche.gruppen.herkunft')} />} />
      )}
      {!z.gruppen ? <p className="leise">{t('suche.lade')}</p>
        : !liste.length ? <Leer />
          : !such.treffer.length ? <KeineTreffer zuruecksetzen={such.zuruecksetzen} /> : (
            <ul className="mappenliste">
              {offen === 'neu' && <li><span className="eintrag an werk"><span className="titel">{t('suche.gruppen.neue')}</span><span className="unter">{t('suche.gruppen.ungespeichert')}</span></span></li>}
              {such.treffer.map(({ eintrag: g, titel, funde }) => {
                // Die übrigen Wörter stehen in der Zeile (hervorgehoben, wenn gefunden); weitere Fundstellen (Paket) darunter.
                const rest = funde.find((f) => f.wo === t('suche.gruppen.fund.woerter'));
                return (
                  <li key={g.id}><Link to={pfad(g.id)} className={`eintrag werk ${offen === g.id ? 'an' : ''}`}>
                    <span className="titel wortgruppe"><strong><Hervorgehoben teile={titel} text={g.woerter[0]} /></strong>
                      {g.woerter.length > 1 && <span className="leise"> · <Hervorgehoben teile={rest?.teile} text={g.woerter.slice(1).join(' · ')} /></span>}
                      {/* Herkunft als Chip hinter dem Namen, keine eigene Zeile (#1192); eigene Gruppen ohne Chip. */}
                      <PaketChip paket={eigen(g) ? null : { id: g.quelle, name: g.paketName }} inLink /></span>
                    <Fundstellen funde={funde.filter((f) => f !== rest && f.wo !== t('suche.gruppen.fund.paket'))} />
                  </Link></li>
                );
              })}
            </ul>
          )}
    </>
  );
}

/** Leerer Zustand: kurzer Satz mit Beispiel. */
function Leer() {
  return <p className="leise leerliste">{tn('suche.gruppen.leer', { beispiel: <strong>{t('suche.gruppen.leer.beispiel')}</strong> })}</p>;
}

/** Rechts: neue Gruppe, eigene Gruppe bearbeiten oder Gruppe aus einem Paket ansehen. */
export function WoerterRechts({ z, id }: { z: WoerterZustand; id?: string }) {
  if (!id) return <div className="platzhalter"><p>{t('suche.gruppen.waehlen')}</p></div>;
  if (!z.gruppen) return z.fehler ? <div className="leer"><p>{z.fehler}</p></div> : <p className="leise">{t('suche.lade')}</p>;
  if (id === 'neu') {
    const kopie = new URLSearchParams(location.search).get('kopie');
    const vorlage = kopie ? z.gruppen.find((g) => g.id === kopie) : undefined;
    return <WortgruppeEditor key={`neu-${vorlage?.id ?? ''}`} z={z} gruppen={z.gruppen} kopieVon={vorlage} />;
  }
  const g = z.gruppen.find((x) => x.id === id);
  if (!g) return <div className="leer"><p>{t('suche.gruppen.gibt-es-nicht')}</p></div>;
  return eigen(g) ? <WortgruppeEditor key={g.id} z={z} gruppen={z.gruppen} gruppe={g} /> : <PaketGruppe g={g} />;
}

/** Gruppe aus einem Paket: nur ansehen, mit Hinweis auf das Paket; als eigene Gruppe übernehmen (Kopie). */
function PaketGruppe({ g }: { g: Wortgruppe }) {
  return (
    <div className="einspaltig">
      <div className="mappenkopf">
        <p className="ueber">{t('suche.gruppen.titel')}</p>
        <h1>{g.woerter[0]}</h1>
        <p className="leise">{t('suche.gruppen.wirkung')}</p>
      </div>
      <div className="blatt stapel">
        <NurLesenFeld beschriftung={t('suche.gruppen.woerter')} herkunft={t('suche.gruppen.aus-paket', { paket: herkunftText(g) })} symbol="paket" breit>
          <ol className="wortliste">{g.woerter.map((w) => <li key={w}>{w}</li>)}</ol>
        </NurLesenFeld>
        <div className="knoepfe">
          <KnopfLink to={`${WOERTER_PFAD}/neu?kopie=${encodeURIComponent(g.id)}`} art="haupt">{t('suche.gruppen.uebernehmen')}</KnopfLink>
        </div>
        <p className="leise klein">{t('suche.gruppen.uebernehmen.text')}</p>
      </div>
    </div>
  );
}

/** Eine Zeile je Wort mit fester Kennung – so bleibt der Fokus beim Verschieben am Wort (und später passt hier je Wort eine Sprache hin). */
interface Zeile { k: number; wort: string }
let naechsteZeile = 1;
const zeilen = (woerter: readonly string[]): Zeile[] => woerter.map((wort) => ({ k: naechsteZeile++, wort }));
const woerterVon = (z: readonly Zeile[]) => z.map((x) => x.wort.replace(/\s+/g, ' ').trim()).filter(Boolean);

function WortgruppeEditor({ z, gruppen, gruppe, kopieVon }: { z: WoerterZustand; gruppen: Wortgruppe[]; gruppe?: Wortgruppe; kopieVon?: Wortgruppe }) {
  const neu = !gruppe;
  const start = gruppe?.woerter ?? kopieVon?.woerter ?? ['', ''];
  // Gespeicherter Stand der Wörter (bzw. der Anfang einer neuen Gruppe) – daran misst „ungespeichert“.
  const [basis, setBasis] = useState<string[]>(start);
  const [e, setE] = useState<Zeile[]>(() => zeilen(start));
  // Gleichzeitig bearbeiten (#917): der Stand, auf dem diese Bearbeitung beruht – geht beim Speichern mit.
  const [stand, setStand] = useState(gruppe?.geaendert);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [geprueft, setGeprueft] = useState(false);
  const [sendet, setSendet] = useState(false);
  const fokus = useRef<number | null>(null);
  // Verwerfen: zurück auf den gespeicherten Stand – nach einem Konflikt der neue, den jemand anderes gespeichert hat.
  const zuruecksetzen = () => { const w = gruppe?.woerter ?? start; setBasis(w); setE(zeilen(w)); setStand(gruppe?.geaendert); setMeldung(undefined); setGeprueft(false); };
  const ent = useEntwurf(JSON.stringify(basis), JSON.stringify(e.map((x) => x.wort)), { neu, liste: WOERTER_PFAD, zuruecksetzen });
  // Hat inzwischen jemand anderes gespeichert und ist hier nichts geändert, gilt gleich der neue Stand.
  useEffect(() => {
    if (!gruppe || !stand || gruppe.geaendert <= stand || ent.geaendert) return;
    setBasis(gruppe.woerter); setE(zeilen(gruppe.woerter)); setStand(gruppe.geaendert);
  }, [gruppe?.geaendert, ent.geaendert]); // eslint-disable-line react-hooks/exhaustive-deps -- nur übernehmen, wenn sich der gespeicherte Stand ändert
  useEffect(() => {
    if (fokus.current === null) return;
    document.getElementById(`wort-${fokus.current}`)?.focus();
    fokus.current = null;
  });

  const pruefung = pruefeWortgruppe(e.map((x) => x.wort));
  const setze = (k: number, wort: string) => setE((l) => l.map((x) => (x.k === k ? { ...x, wort } : x)));
  const schiebe = (i: number, r: number) => setE((l) => { const n = [...l]; const [x] = n.splice(i, 1); n.splice(i + r, 0, x); fokus.current = x.k; return n; });
  const entferne = (i: number) => setE((l) => { const n = l.filter((_, j) => j !== i); fokus.current = n[Math.min(i, n.length - 1)]?.k ?? null; return n; });
  const dazu = () => setE((l) => { const x = zeilen([''])[0]; fokus.current = x.k; return [...l, x]; });

  // Doppelte Wörter stehen gleich an ihrer Zeile (rot, „Steht schon weiter oben“); die übrigen Fehler zeigt Speichern.
  async function speichern() {
    setGeprueft(true);
    if (pruefung.fehler) return;
    setSendet(true); setMeldung(undefined);
    try {
      const woerter = woerterVon(e);
      if (neu) {
        const r = await api.synonymNeu(woerter);
        z.setStand(r); loeseWache(); geheZu(pfad(r.id), true);
        return;
      }
      const r = await api.synonymAendern(gruppe.id, woerter, stand);
      z.setStand(r);
      const jetzt = r.synonyme.find((x) => x.id === gruppe.id);
      setBasis(jetzt?.woerter ?? woerter); setE(zeilen(jetzt?.woerter ?? woerter)); setStand(jetzt?.geaendert); setGeprueft(false);
      loeseWache();
      setMeldung({ art: 'gut', text: t('suche.werkbank.gespeichert') });
    } catch (x) {
      setMeldung({ art: 'schlecht', text: (x as Error).message });
      // Inzwischen von jemand anderem gespeichert (#917): nichts überschrieben; den neuen Stand holen – „Verwerfen“ zeigt ihn.
      if ((x as { status?: number }).status === 409 && (x as { details?: { konflikt?: boolean } }).details?.konflikt) await z.laden();
    } finally { setSendet(false); }
  }
  async function loeschen() {
    if (!gruppe) return;
    try { z.setStand(await api.synonymLoeschen(gruppe.id)); loeseWache(); geheZu(WOERTER_PFAD, true); }
    catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }

  const titel = woerterVon(e)[0];
  return (
    <form className="einspaltig" onSubmit={(x) => { x.preventDefault(); void speichern(); }} onKeyDown={ent.tasten} noValidate>
      <div className="mappenkopf">
        <p className="ueber">{t('suche.gruppen.titel')}</p>
        <h1>{neu ? (kopieVon ? t('suche.gruppen.kopie') : t('suche.gruppen.neue')) : titel || gruppe.woerter[0]}</h1>
        <p className="leise">{t('suche.gruppen.wirkung')}</p>
      </div>
      {meldung && <div className={`hinweis ${meldung.art}`} role="status"><p>{meldung.text}</p></div>}
      {kopieVon && <div className="hinweis"><p>{t('suche.gruppen.kopie.text', { paket: herkunftText(kopieVon) })}</p></div>}
      <div className="blatt">
        <WortZeilen e={e} gruppen={gruppen} ausser={[gruppe?.id, kopieVon?.id]} doppelt={pruefung.doppelt} fehler={geprueft && !pruefung.doppelt.length ? pruefung.fehler : null}
          setze={setze} schiebe={schiebe} entferne={entferne} dazu={dazu} />
        <Speicherleiste ent={ent} gegenstand={t('suche.gruppen.gegenstand')} sendet={sendet} speicherbar={!!kopieVon}
          loeschen={!neu ? {
            text: t('suche.werkbank.entfernen'),
            rueckfrage: { titel: t('suche.werkbank.entfernen.frage'), text: gruppe?.woerter.join(', '), ja: t('suche.werkbank.entfernen') },
            onClick: loeschen,
          } : undefined} />
      </div>
    </form>
  );
}

/** Die Wörter einzeln: Eingabe, Hinweis auf andere Gruppen mit demselben Wort, nach oben/unten, entfernen. */
function WortZeilen({ e, gruppen, ausser, doppelt, fehler, setze, schiebe, entferne, dazu }: {
  e: Zeile[]; gruppen: Wortgruppe[]; ausser: Array<string | undefined>; doppelt: number[]; fehler: string | null;
  setze(k: number, wort: string): void; schiebe(i: number, r: number): void; entferne(i: number): void; dazu(): void;
}) {
  const andere = gruppen.filter((g) => !ausser.includes(g.id));
  return (
    <FeldGruppe beschriftung={t('suche.gruppen.woerter')} fehler={fehler} hinweis={t('suche.gruppen.woerter.hinweis', { SYNONYM_MAX, SYNONYM_LAENGE })}>
      <ol className="wortzeilen">
        {e.map((x, i) => {
          const auch = gruppenMitWort(andere, x.wort);
          const nr = { nr: i + 1, wort: x.wort.trim() || t('suche.gruppen.wort.leer') };
          return (
            <li key={x.k} className={doppelt.includes(i) ? 'doppelt' : undefined}>
              <span className="zeile">
                <input id={`wort-${x.k}`} type="text" value={x.wort} maxLength={SYNONYM_LAENGE} aria-label={t('suche.gruppen.wort', nr)} aria-invalid={doppelt.includes(i) || undefined}
                  placeholder={i === 0 ? t('suche.gruppen.wort.erstes') : undefined} onChange={(v) => setze(x.k, v.target.value)} />
                <Knopf art="link" groesse="klein" nurSymbol={t('suche.gruppen.wort.hoch', nr)} gesperrt={i === 0} onClick={() => schiebe(i, -1)}>↑</Knopf>
                <Knopf art="link" groesse="klein" nurSymbol={t('suche.gruppen.wort.runter', nr)} gesperrt={i === e.length - 1} onClick={() => schiebe(i, 1)}>↓</Knopf>
                <Knopf art="link" groesse="klein" nurSymbol={t('suche.gruppen.wort.entfernen', nr)} onClick={() => entferne(i)}><Symbol name="schliessen" /></Knopf>
              </span>
              {doppelt.includes(i) && <span className="fehlertext klein">{t('suche.gruppen.wort.doppelt')}</span>}
              {auch.length > 0 && <span className="leise klein">{tn('suche.gruppen.wort.auch', {
                gruppen: <>{auch.map((g, j) => <span key={g.id}>{j > 0 && ', '}<Link to={pfad(g.id)} className="verweis">{g.woerter[0]}</Link>{eigen(g) ? '' : ` (${herkunftText(g)})`}</span>)}</>,
              })}</span>}
            </li>
          );
        })}
      </ol>
      <div className="wortdazu"><Knopf art="link" groesse="klein" gesperrt={e.length >= SYNONYM_MAX} onClick={dazu}>{t('suche.gruppen.wort.dazu')}</Knopf></div>
    </FeldGruppe>
  );
}
