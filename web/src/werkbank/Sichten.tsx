import { istTeiltyp } from '../../../shared/src/teile';
import { SprachText } from '../einrichtung/Beschriftung';
import { optionText, typName } from '../../../shared/src/beschriftung';
import { useEffect, useMemo, useState } from 'react';
import { Ansage, useZiehen, Ziehgriff, type Ort } from '../ziehen';
import { einzigesZiel, SYSTEMSPALTEN, istSystemspalte, zieleVon, type Feld as FeldDef, type Mappe, type Mappentyp } from '../../../shared/src/model';
import {
  bedingungsfelder, bedingungsProblem, beschreibeBedingung, DYNAMISCH, EINHEITEN, gemeinsameTrefferlisten, kinderVon, mitNachkommen, OPERATOREN, OPERATOREN_JE_ART, operatorenFuer, spaltenDerSicht, trefferlistenProblem, wirksameTypen, typenDerSicht, zeigtAlleTypen, ALLE_TYPEN,
  ZAEHLVERGLEICHE, auswahlProbleme, OPS_EIGENES_FELD, passendeEigeneFelder, type Bedingung, type Bedingungsfeld, type Feldbedingung, type Einheit, type Operator, type Sicht, type SichtDaten, type WertAngabe, type Zaehlvergleich,
} from '../../../shared/src/sichten';
import { ausgeblendeteFelder } from '../../../shared/src/darstellung';
import { merkmalText } from '../../../shared/src/merkmale';
import { mappenApi } from '../api/mappen';
import { werkbankApi } from '../api/werkbank';
import { useDaten } from '../daten';
import { geheZu, Link, loeseWache } from '../ort';
import { Speicherleiste, useEntwurf } from '../Speicherleiste';
import { titelOder } from '../seiten';
import { Hilfe } from '../Hilfe';
import { Listenkopf } from '../Listenkopf';
import { elternkette, SichtBerechtigungen, SichtTestlauf } from './SichtRechte';
import { sichtRegelProblem, sichtRegelwerkVon } from '../../../shared/src/sichtrechte';
import { ANSICHT_SYMBOLE } from '../../../shared/src/ansichtsymbole';
import { AnsichtSymbol, Symbol } from '../Symbol';
import { t, tn } from '../sprache';
import { gebietsschema } from '../../../shared/src/sprache';
import { GeloeschteEintraege, Bereich, Fassungen, Feld, FeldGruppe, Fundstellen, HakenFeld, Hervorgehoben, KeineTreffer, Knopf, KnopfLink, ListenSuche, PaketChip, PaketFilter, Suchfeld, useBereiche, useListenSuche, ZeitraumEingabe, type Klappe, type ZeitraumRoh } from '../bausteine';
import { paketHerkunft, paketVonSicht, paketWahl, quellenSicht } from './listensuche';
import type { InstalliertesPaket } from '../../../shared/src/pakete';
import type { Zeitraumeinheit } from '../../../shared/src/feldarten';

/**
 * Sichten verwalten (#38) mit Bedingungen (#40, #41): Baum links, Bearbeitung rechts.
 * Eine Sicht zeigt Mappen ihrer Mappentypen, die alle Bedingungen erfüllen, und alles ihrer Untersichten.
 */

type Zeile = { s: Sicht; tiefe: number };
function baumzeilen(alle: Sicht[]): Zeile[] {
  const erg: Zeile[] = [];
  const gehe = (eltern: string | null, tiefe: number) => { for (const s of kinderVon(alle, eltern)) { erg.push({ s, tiefe }); gehe(s.id, tiefe + 1); } };
  gehe(null, 0);
  return erg;
}

/**
 * Ansichten in der Mitte: Baum zum Ordnen (#73). Mit Suche oder Paketfilter (#978) stehen nur die passenden Ansichten
 * da, mit Fundstellen und ohne Griffe – geordnet wird im ganzen Baum.
 */
export function SichtenListe({ offen, pakete = [] }: { offen?: string; pakete?: InstalliertesPaket[] }) {
  const d = useDaten();
  const alleZeilen = baumzeilen(d.sichten);
  const such = useListenSuche(alleZeilen, {
    quellen: ({ s }) => quellenSicht(s, { pakete, typen: d.typen }),
    herkunft: ({ s }) => paketVonSicht(s, pakete),
  });
  const zeilen = such.treffer.map((x) => x.eintrag);
  const fund = new Map(such.treffer.map((x) => [x.eintrag.s.id, x]));
  const typen = (s: Sicht) => typenDerSicht(s, d.typen.map((mappentyp) => mappentyp.id)).map((text) => d.typ(text)).filter((eintrag): eintrag is Mappentyp => !!eintrag);
  const [ansage, setAnsage] = useState('');
  const [fehler, setFehler] = useState<string>();
  const [hinweis, setHinweis] = useState<string>();
  const name = (id: string | null) => (id ? d.sicht(id)?.name ?? '' : '');
  /** „Heizung erbt jetzt von „Haus“: Standard R, 2 Regeln.“ bzw. „… erbt keine Regeln mehr.“ */
  const vererbtHinweis = (n: string, elternId: string | null) => {
    if (!elternId) return t('werkbank.sichten.liegt-jetzt-auf-der', { n });
    const kette = elternkette(d.sichten, elternId);
    const regeln = kette.reduce((x, s) => x + sichtRegelwerkVon(s).regeln.length, 0);
    const standard = sichtRegelwerkVon(kette[0]).grund;
    return t('werkbank.sichten.erbt-jetzt-die-berechtigungen', { n, name: name(elternId), wert: Object.entries(standard).filter(([, v]) => v).map(([k]) => k).join('') || '–', wert2: regeln ? t('werkbank.sichten.regeln', { anzahl: regeln }) : t('werkbank.sichten.keine-regeln') });
  };

  // Drag & Drop (#73): sofort gespeichert; Untersichten wandern mit, Kreise sind unmöglich.
  async function verschiebe(id: string, elternId: string | null, stelle: number) {
    setFehler(undefined);
    try {
      const vorher = d.sicht(id)?.elternId ?? null;
      await werkbankApi.sichtVerschieben(id, elternId, stelle);
      await d.neuLaden();
      setAnsage(t('werkbank.sichten.liegt-jetzt-an-stelle', { name: name(id), wert: elternId ? t('werkbank.sichten.unter', { name: name(elternId) }) : t('werkbank.sichten.auf-der-obersten-ebene'), wert2: stelle + 1 }));
      // Berechtigungen (#148): Mit der neuen Elternsicht gelten sofort deren Regeln.
      if (vorher !== elternId) setHinweis(vererbtHinweis(name(id), elternId));
    } catch (x) { setFehler((x as Error).message); }
  }
  const z = useZiehen({
    hinein: true,
    erlaubt: (quelle, ziel) => !mitNachkommen(d.sichten, quelle).some((s) => s.id === ziel),
    fertig: (quelle, ziel, ort: Ort) => {
      const zs = d.sicht(ziel);
      if (!zs) return;
      if (ort === 'in') { void verschiebe(quelle, ziel, kinderVon(d.sichten, ziel).filter((s) => s.id !== quelle).length); return; }
      const geschwister = kinderVon(d.sichten, zs.elternId).filter((s) => s.id !== quelle);
      const i = geschwister.findIndex((s) => s.id === ziel);
      void verschiebe(quelle, zs.elternId, ort === 'vor' ? i : i + 1);
    },
  });
  // Tastatur: Alt+↑/↓ in der Ebene, Alt+→ unter die vorherige Sicht, Alt+← eine Ebene höher.
  const tasten = (s: Sicht) => {
    const geschwister = kinderVon(d.sichten, s.elternId);
    const i = geschwister.findIndex((x) => x.id === s.id);
    return {
      hoch: i > 0 ? () => void verschiebe(s.id, s.elternId, i - 1) : undefined,
      runter: i < geschwister.length - 1 ? () => void verschiebe(s.id, s.elternId, i + 1) : undefined,
      rein: i > 0 ? () => void verschiebe(s.id, geschwister[i - 1].id, kinderVon(d.sichten, geschwister[i - 1].id).length) : undefined,
      raus: s.elternId ? () => {
        const eltern = d.sicht(s.elternId!)!;
        const ebene = kinderVon(d.sichten, eltern.elternId);
        void verschiebe(s.id, eltern.elternId, ebene.findIndex((x) => x.id === eltern.id) + 1);
      } : undefined,
    };
  };
  return (
    <>
      <Listenkopf titel={t('werkbank.sichten.ansichten')} hilfe="werkbank.sichten" beschreibung={t('werkbank.sichten.was-die-ablage-links')}>
        <KnopfLink to="/werkbank/sichten/neu" art="anlegen" groesse="klein">{t('werkbank.sichten.neu')}</KnopfLink>
      </Listenkopf>
      {fehler && <div className="hinweis schlecht"><p>{fehler}</p></div>}
      {hinweis && <div className="hinweis info"><p>{hinweis}</p><Knopf art="link" groesse="klein" onClick={() => setHinweis(undefined)}>{t('werkbank.sichten.ausblenden')}</Knopf></div>}
      <Ansage text={ansage} />
      {alleZeilen.length > 0 && (
        <ListenSuche wert={such.eingabe} setze={such.setEingabe} beschriftung={t('werkbank.listensuche.sichten.beschriftung')} platzhalter={t('werkbank.listensuche.sichten.platzhalter')} anker="werkbank.sichten.suche"
          treffer={such.treffer.length} aktiv={such.aktiv} anzahl={t('werkbank.listensuche.sichten.anzahl', { anzahl: alleZeilen.length })}
          filter={<PaketFilter wert={such.paket} setze={such.setPaket} pakete={paketWahl(such.paketeDa, pakete)} eigene={such.eigeneDa} />} />
      )}
      {!such.aktiv && zeilen.length > 1 && <p className="leise klein">{t('werkbank.sichten.zum-ordnen-am-griff')}</p>}
      {!alleZeilen.length && offen !== 'neu'
        ? <p className="leise leerliste">{t('werkbank.sichten.noch-keine-ansichten-ohne')}</p>
        : !zeilen.length && offen !== 'neu' ? <KeineTreffer zuruecksetzen={such.zuruecksetzen} />
        : <ul className="mappenliste">
            {offen === 'neu' && <li><span className="eintrag an werk"><span className="titel">{t('werkbank.sichten.neue-ansicht')}</span><span className="unter">{t('werkbank.sichten.noch-nicht-gespeichert')}</span></span></li>}
            {zeilen.map(({ s, tiefe }) => {
              const e = z.eintrag(s.id);
              const eintrag2 = typen(s);
              const probleme = s.bedingungen.filter((b) => bedingungsProblem(b, eintrag2)).length;
              const listenProblem = trefferlistenProblem(s.trefferliste, wirksameTypen(d.sichten, s.id, d.typen.map((x) => x.id)).map((x) => d.typ(x)).filter((x): x is Mappentyp => !!x));
              const kinder = kinderVon(d.sichten, s.id).length;
              const f = fund.get(s.id);
              const inhalt = (
                <Link to={`/werkbank/sichten/${s.id}`} className={`eintrag werk ${offen === s.id ? 'an' : ''}`}>
                    <span className="titel">{tiefe > 0 && !such.aktiv && <span className="leise" aria-hidden="true">└ </span>}<Hervorgehoben teile={f?.titel} text={s.name} /><PaketChip paket={paketHerkunft(paketVonSicht(s, pakete), pakete)} inLink /></span>
                    <span className="unter">
                      {zeigtAlleTypen(s) ? t('werkbank.sichten.alle-mappentypen') : eintrag2.length ? eintrag2.map((x) => x.name).join(', ') : t('werkbank.sichten.nur-zum-gruppieren')}
                      {s.bedingungen.length > 0 && t('werkbank.sichten.bedingungen', { anzahl: s.bedingungen.length })}
                      {kinder > 0 && t('werkbank.sichten.unteransichten', { anzahl: kinder })}
                      {d.zahlenDa && t('werkbank.sichten.mappen', { wert: (d.zaehler.sichten?.[s.id] ?? 0).toLocaleString(gebietsschema()) })}
                      {s.berechtigungen?.regeln.length ? t('werkbank.sichten.regeln-2', { anzahl: s.berechtigungen.regeln.length }) : ''}
                    </span>
                    {probleme > 0 && <span className="problem">{t('werkbank.sichten.bedingungen-ohne-wirkung-bitte', { anzahl: probleme })}</span>}
                    {listenProblem && <span className="problem">{t('werkbank.sichten.trefferliste-fehlt-zeigt-die')}</span>}
                    {f && <Fundstellen funde={f.funde} />}
                  </Link>
              );
              // Gefiltert (#978): ohne Griff und Einrückung – Ordnen geht nur im ganzen Baum.
              if (such.aktiv) return <li key={s.id}>{inhalt}</li>;
              return (
                <li key={s.id} {...e} className={`ziehbar ${e.className}`} style={{ paddingLeft: tiefe * 16 }}>
                  <Ziehgriff griff={z.griff(s.id, s.name)} tasten={tasten(s)} />
                  {inhalt}
                </li>
              );
            })}
          </ul>}
      <GeloeschteEintraege art="sicht" />
    </>
  );
}

/** Bereiche des Ansichten-Editors (#148) in der Reihenfolge der Sprungleiste. */
const SICHT_BEREICHE = [
  ['grunddaten', t('mappentypen.bereich.grunddaten')], ['mappentypen', t('mappentypen.bereich.mappentypen')], ['trefferliste', t('mappentypen.bereich.trefferliste')], ['bedingungen', t('mappentypen.bereich.bedingungen')],
  ['berechtigungen', t('mappentypen.bereich.berechtigungen')], ['testlauf', t('mappentypen.bereich.testlauf')],
  // Fassungen (#1006): erst nach dem Anlegen.
  ['fassungen', t('oberflaeche.fassungen.titel')],
] as const;
type SichtBereich = (typeof SICHT_BEREICHE)[number][0];

const leer = (): SichtDaten => ({ name: '', beschreibung: '', elternId: null, position: 0, typen: [], bedingungen: [], trefferliste: null, berechtigungen: null, symbol: null });
const datenVon = (s: Sicht): SichtDaten => ({ name: s.name, beschreibung: s.beschreibung, elternId: s.elternId, position: s.position, typen: s.typen, bedingungen: s.bedingungen, trefferliste: s.trefferliste ?? null, berechtigungen: s.berechtigungen ?? null, symbol: s.symbol ?? null, beschriftungen: s.beschriftungen ?? null });

export function SichtEditor({ id }: { id: string }) {
  const d = useDaten();
  const neu = id === 'neu';
  const vorhanden = neu ? undefined : d.sicht(id);
  const [basis, setBasis] = useState(() => JSON.stringify(vorhanden ? datenVon(vorhanden) : leer()));
  const [e, setE] = useState<SichtDaten>(() => JSON.parse(basis));
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [sendet, setSendet] = useState(false);
  const [vorschau, setVorschau] = useState<number | null>(null);
  const ent = useEntwurf(basis, JSON.stringify(e), { neu, liste: '/werkbank/sichten', zuruecksetzen: () => { setE(JSON.parse(basis)); setMeldung(undefined); } });
  const { geaendert } = ent;
  // Gleichzeitig bearbeiten (#917): der Stand, auf dem diese Bearbeitung beruht – geht beim Speichern mit.
  const [stand, setStand] = useState(vorhanden?.geaendert);
  // Hat inzwischen jemand anderes gespeichert und ist hier nichts geändert, gilt gleich der neue Stand.
  useEffect(() => {
    if (neu || !vorhanden || !stand || vorhanden.geaendert <= stand || geaendert) return;
    const frisch = JSON.stringify(datenVon(vorhanden));
    setBasis(frisch); setE(JSON.parse(frisch)); setStand(vorhanden.geaendert);
  }, [vorhanden?.geaendert, geaendert]); // eslint-disable-line react-hooks/exhaustive-deps -- nur übernehmen, wenn sich der gespeicherte Stand ändert; die übrigen Werte gelten zu diesem Zeitpunkt
  // Bereiche (#148) wie am Mappentyp: neu offen, bestehend eingeklappt bzw. wie zuletzt.
  const b = useBereiche(neu ? SICHT_BEREICHE.filter(([k]) => k !== 'fassungen') : SICHT_BEREICHE, 'sicht', neu ? null : id);
  const [fehlerOrte, setFehlerOrte] = useState<Set<SichtBereich>>(new Set());
  const untersicht = !!e.elternId;
  const liveFehler = (k: SichtBereich) => (k === 'berechtigungen' && (e.berechtigungen?.regeln ?? []).some((r) => !!sichtRegelProblem(r, untersicht)))
    || (k === 'bedingungen' && e.bedingungen.some((x) => !!bedingungsProblem(x, typenDerSicht(e, d.typen.map((mappentyp) => mappentyp.id)).map((text) => d.typ(text)).filter((eintrag): eintrag is Mappentyp => !!eintrag))));
  const hatFehler = (k: SichtBereich) => fehlerOrte.has(k) || liveFehler(k);
  const klappe = (k: SichtBereich): Klappe => b.klappe(k, hatFehler(k));

  const alleIds = d.typen.map((mappentyp) => mappentyp.id);
  const alleTypen = zeigtAlleTypen(e);
  const eigeneTypen = typenDerSicht(e, alleIds).map((text) => d.typ(text)).filter((eintrag): eintrag is Mappentyp => !!eintrag);
  // Eine neue Sicht ist im Baum noch nicht da; für die Auswahl der Elternsicht zählt sie als Blatt.
  const ausgeschlossen = new Set(neu ? [] : mitNachkommen(d.sichten, id).map((s) => s.id));
  const elternWahl = baumzeilen(d.sichten).filter(({ s }) => !ausgeschlossen.has(s.id));
  const geschwister = kinderVon(d.sichten, vorhanden?.elternId ?? null);
  const stelle = vorhanden ? geschwister.findIndex((s) => s.id === id) : -1;
  const untersichten = neu ? 0 : mitNachkommen(d.sichten, id).length - 1;
  // Wirksame Typen: eigene und die der Untersichten – sie bestimmen, welche Trefferlisten es gibt (#75).
  const wirksam = [...new Set([...typenDerSicht(e, alleIds), ...(neu ? [] : mitNachkommen(d.sichten, id).filter((s) => s.id !== id).flatMap((s) => typenDerSicht(s, alleIds)))])]
    .map((text) => d.typ(text)).filter((eintrag): eintrag is Mappentyp => !!eintrag);

  // Vorschau: Anzahl Treffer mit dem aktuellen Entwurf (kurz nach dem Tippen).
  const entwurf = JSON.stringify(e);
  useEffect(() => {
    let aktuell = true;
    const timer = setTimeout(() => {
      werkbankApi.sichtVorschau(neu ? null : id, { ...e, name: e.name || t('werkbank.sichten.vorschau') }).then((r) => aktuell && setVorschau(r.anzahl)).catch(() => aktuell && setVorschau(null));
    }, 350);
    return () => { aktuell = false; clearTimeout(timer); };
  }, [entwurf, d.stand]); // eslint-disable-line react-hooks/exhaustive-deps -- Vorschau hängt am Entwurf als Text (entwurf), nicht an der Objekt-Identität von e

  if (!neu && !vorhanden) return <div className="leer"><p>{t('werkbank.sichten.diese-ansicht-gibt-es')}</p></div>;

  async function speichern() {
    setSendet(true); setMeldung(undefined);
    try {
      // Die Stelle im Baum ändern nur Ordnen und Verschieben; ohne Angabe bleibt sie (bzw. ans Ende einer neuen Ebene).
      const s = neu ? await werkbankApi.sichtAnlegen({ ...e, position: undefined }) : await werkbankApi.sichtAendern(id, { ...e, position: undefined, stand });
      const neuBasis = JSON.stringify(datenVon(s));
      setBasis(neuBasis); setE(JSON.parse(neuBasis)); setFehlerOrte(new Set()); setStand(s.geaendert);
      loeseWache();
      if (neu) b.merke(s.id);
      await d.neuLaden();
      if (neu) geheZu(`/werkbank/sichten/${s.id}`); else setMeldung({ art: 'gut', text: t('werkbank.sichten.ansicht-gespeichert') });
    } catch (x) {
      setMeldung({ art: 'schlecht', text: (x as Error).message });
      // Inzwischen von jemand anderem gespeichert (#917): nichts überschrieben; den neuen Stand holen – „Verwerfen“ zeigt ihn.
      if ((x as { status?: number }).status === 409 && (x as { details?: { konflikt?: boolean } }).details?.konflikt) { await d.neuLaden(); return; }
      // Fehler in den Berechtigungen (#148): Bereich markieren und aufklappen; sonst die Grunddaten.
      const ort: SichtBereich = ((x as { details?: { berechtigungen?: boolean } }).details?.berechtigungen) ? 'berechtigungen' : 'grunddaten';
      setFehlerOrte(new Set([ort])); b.oeffne([ort]);
    }
    finally { setSendet(false); }
  }
  async function loeschen() {
    try { await werkbankApi.sichtLoeschen(id); loeseWache(); await d.neuLaden(); geheZu('/werkbank/sichten'); }
    catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }
  async function verschiebe(r: number) {
    const ids = geschwister.map((s) => s.id);
    const [x] = ids.splice(stelle, 1);
    ids.splice(stelle + r, 0, x);
    try { await werkbankApi.sichtenOrdnen(vorhanden!.elternId, ids); await d.neuLaden(); }
    catch (z) { setMeldung({ art: 'schlecht', text: (z as Error).message }); }
  }
  const setzeTyp = (text: string, an: boolean) => setE((x) => ({ ...x, typen: an ? [...x.typen, text] : x.typen.filter((y) => y !== text) }));

  return (
    <form className="editorform" onSubmit={(ev) => { ev.preventDefault(); void speichern(); }} onKeyDown={ent.tasten} noValidate>
      <div className="seitenkopf"><div>
        <p className="ueber">{t('werkbank.sichten.ansicht')}</p>
        <h1>{e.name || (neu ? t('werkbank.sichten.neue-ansicht') : t('werkbank.sichten.ohne-namen'))}</h1>
        {!neu && <p className="leise"><Link to={`/ablage/${id}`} className="verweis tippziel">{t('werkbank.sichten.in-der-ablage-oeffnen')}</Link></p>}
      </div></div>

      {b.leiste(hatFehler, t('werkbank.sichten.bereiche-der-ansicht'))}

      <Bereich id="grunddaten" titel={t('werkbank.sichten.grunddaten')} klappe={klappe('grunddaten')}
        kurz={e.elternId ? t('werkbank.sichten.unter-2', { wert: d.sicht(e.elternId)?.name ?? '…' }) : t('werkbank.sichten.oberste-ebene')}>
        <div className="raster">
          {/* Name und Beschreibung je Sprache (#728). */}
          <SprachText beschriftung={t('werkbank.sichten.name')} id="sicht-name" wert={e.name} placeholder={t('werkbank.sichten.z-b-vertraege-mit')} autoFocus={neu} teil="name" beschriftungen={e.beschriftungen ?? undefined}
            setzeWert={(name) => setE({ ...e, name })} setzeBeschriftungen={(b) => setE({ ...e, beschriftungen: (b ?? null) as SichtDaten['beschriftungen'] })} />
          <Feld beschriftung={t('werkbank.sichten.liegt-unter')} hinweis={t('werkbank.sichten.elternsicht-im-baum')}>
            <select value={e.elternId ?? ''} onChange={(x) => setE({ ...e, elternId: x.target.value || null })}>
              <option value="">{t('werkbank.sichten.oberste-ebene-2')}</option>
              {elternWahl.map(({ s, tiefe }) => <option key={s.id} value={s.id}>{'  '.repeat(tiefe)}{s.name}</option>)}
            </select></Feld>
        </div>
        <SprachText beschriftung={t('werkbank.sichten.beschreibung')} hinweis={t('werkbank.sichten.steht-in-der-ablage')} optional id="sicht-beschreibung" wert={e.beschreibung} teil="beschreibung" beschriftungen={e.beschriftungen ?? undefined}
          setzeWert={(beschreibung) => setE({ ...e, beschreibung })} setzeBeschriftungen={(b) => setE({ ...e, beschriftungen: (b ?? null) as SichtDaten['beschriftungen'] })} />
        <SymbolWahl wert={e.symbol ?? null} setze={(symbol) => setE({ ...e, symbol })} />
        {!neu && geschwister.length > 1 && (
          <div className="knoepfe">
            <span className="leise klein">{t('werkbank.sichten.reihenfolge-auf-dieser-ebene', { wert: stelle + 1, geschwister: geschwister.length })}</span>
            <Knopf symbol="sortiert-auf" gesperrt={geaendert ? t('werkbank.sichten.erst-speichern') : stelle <= 0} onClick={() => verschiebe(-1)}>{t('werkbank.sichten.nach-oben')}</Knopf>
            <Knopf symbol="sortiert-ab" gesperrt={geaendert ? t('werkbank.sichten.erst-speichern') : stelle >= geschwister.length - 1} onClick={() => verschiebe(1)}>{t('werkbank.sichten.nach-unten')}</Knopf>
          </div>
        )}
        {!neu && vorhanden && e.elternId !== vorhanden.elternId && (
          <p className="hinweis info klein">{e.elternId ? t('werkbank.sichten.nach-dem-speichern-erbt', { wert: d.sicht(e.elternId)?.name ?? '…' }) : t('werkbank.sichten.nach-dem-speichern-erbt-2')}</p>
        )}
      </Bereich>

      <Bereich id="mappentypen" titel={t('werkbank.sichten.mappentypen')} klappe={klappe('mappentypen')}
        kurz={alleTypen ? t('werkbank.sichten.alle-mappentypen') : eigeneTypen.length ? `${eigeneTypen.length}: ${eigeneTypen.map((mappentyp) => mappentyp.name).join(', ')}` : t('werkbank.sichten.nur-zum-gruppieren')}
        beschreibung={<>{t('werkbank.sichten.mappen-dieser-mappentypen-zeigt', { wert: untersichten > 0 ? t('werkbank.sichten.dazu-kommen-die-mappen', { anzahl: untersichten }) : t('werkbank.sichten.ohne-mappentyp-dient-sie') })}</>}>
        <HakenFeld beschriftung={t('werkbank.sichten.alle-mappentypen-2')} hinweis={t('werkbank.sichten.auch-kuenftige-z-b')}>
          <input type="checkbox" checked={alleTypen} onChange={(x) => setE((y) => ({ ...y, typen: x.target.checked ? [ALLE_TYPEN] : [] }))} />
        </HakenFeld>
        <FeldGruppe beschriftung={t('werkbank.sichten.typen-gewaehlt')} beschriftungVerbergen className="typwahl">
          {/* Teile (#1031) stehen in keiner Ansicht – nur an ihrer übergeordneten Mappe. */}
          {d.typen.filter((mappentyp) => !istTeiltyp(mappentyp) || e.typen.includes(mappentyp.id)).map((mappentyp) => (
            <label key={mappentyp.id} className="haken"><input type="checkbox" disabled={alleTypen} checked={alleTypen || e.typen.includes(mappentyp.id)} onChange={(x) => setzeTyp(mappentyp.id, x.target.checked)} /><span>{mappentyp.name}</span></label>
          ))}
        </FeldGruppe>
      </Bereich>

      <TrefferlistenWahl e={e} setE={setE} typen={wirksam} klappe={klappe('trefferliste')} />

      <Bedingungen e={e} setE={setE} typen={eigeneTypen} klappe={klappe('bedingungen')} />

      <SichtBerechtigungen e={e} setE={setE} alle={d.sichten.filter((s) => !ausgeschlossen.has(s.id))} klappe={klappe('berechtigungen')} />

      <SichtTestlauf id={neu ? null : id} e={e} klappe={klappe('testlauf')} />
      {vorhanden && <Fassungen art="sicht" eintrag={vorhanden.id} stand={vorhanden.geaendert} nachher={() => d.neuLaden()} klappe={klappe('fassungen')} />}

      <div className="hinweis info" role="status">
        <p>{vorschau === null ? t('werkbank.sichten.vorschau-wird-berechnet') : <>{tn('werkbank.sichten.diese-ansicht-zeigt-zurzeit', { b: <strong>{vorschau.toLocaleString(gebietsschema())} {t('werkbank.sichten.mappen-2', { anzahl: vorschau })}</strong>, wert: untersichten > 0 ? t('werkbank.sichten.mit-unteransichten') : '' })}</>}</p>
      </div>

      <Speicherleiste ent={ent} gegenstand={t('werkbank.sichten.ansicht')} sendet={sendet} meldung={meldung}
        loeschen={!neu ? {
          text: t('werkbank.sichten.ansicht-loeschen-2'),
          rueckfrage: { titel: t('werkbank.sichten.ansicht-loeschen', { name: vorhanden!.name }), text: t('werkbank.sichten.mappen-werden-nicht-geloescht', { hinweis: untersichten ? t('werkbank.sichten.ihre-unteransichten-ruecken-eine', { anzahl: untersichten }) : '' }), ja: t('werkbank.sichten.loeschen') },
          onClick: loeschen,
        } : undefined} />
    </form>
  );
}

/* ---------- Trefferliste (#75) ---------- */

/**
 * Symbol der Ansicht (#428): Raster aus der festen Auswahl (Lucide), mit Suche nach Namen und Bedeutung.
 * Gespeichert wird nur der Name; „Ohne Symbol“ bleibt möglich.
 */
function SymbolWahl({ wert, setze }: { wert: string | null; setze(n: string | null): void }) {
  const [offen, setOffen] = useState(false);
  const [suche, setSuche] = useState('');
  const q = suche.trim().toLowerCase();
  const titel = ANSICHT_SYMBOLE.flatMap((g) => g.symbole).find((x) => x.name === wert)?.titel;
  return (
    <div className="eigenschaft symbolwahl">
      <span id="symbolwahl-t">{t('werkbank.sicht.symbol')} <small>{t('werkbank.sicht.symbol.hinweis')}</small></span>
      <div className="knoepfe">
        <Knopf aria-expanded={offen} aria-labelledby="symbolwahl-t symbolwahl-w" onClick={() => setOffen(!offen)}>
          <span id="symbolwahl-w">{wert ? <><AnsichtSymbol name={wert} /> {titel ?? wert}</> : t('werkbank.sicht.symbol.ohne')}</span> <Symbol name="pfeil-unten" />
        </Knopf>
        {wert && <Knopf art="link" symbol="schliessen" onClick={() => setze(null)}>{t('werkbank.sicht.symbol.entfernen')}</Knopf>}
      </div>
      {offen && (
        <div className="symbolraster-rahmen">
          <Suchfeld wert={suche} setze={setSuche} beschriftung={t('werkbank.sicht.symbol.suchen')} platzhalter={t('werkbank.sicht.symbol.suchen')} />
          {ANSICHT_SYMBOLE.map((g) => {
            const liste = g.symbole.filter((x) => !q || x.titel.toLowerCase().includes(q) || x.name.includes(q) || g.gruppe.toLowerCase().includes(q));
            if (!liste.length) return null;
            return (
              <fieldset key={g.gruppe} className="symbolgruppe">
                <legend className="leise klein">{g.gruppe}</legend>
                <div className="symbolraster">
                  {liste.map((x) => (
                    <Knopf key={x.name} art="link" className={`symbolknopf${wert === x.name ? ' an' : ''}`} aria-pressed={wert === x.name} nurSymbol={x.titel}
                      onClick={() => { setze(x.name); setOffen(false); }}><AnsichtSymbol name={x.name} /></Knopf>
                  ))}
                </div>
              </fieldset>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TrefferlistenWahl({ e, setE, typen, klappe }: { e: SichtDaten; setE: (f: (x: SichtDaten) => SichtDaten) => void; typen: Mappentyp[]; klappe: Klappe }) {
  const listen = gemeinsameTrefferlisten(typen);
  const wahl = spaltenDerSicht(typen, e.trefferliste);
  const problem = trefferlistenProblem(e.trefferliste, typen);
  const name = (k: string) => (istSystemspalte(k) ? SYSTEMSPALTEN[k] : typen[0]?.felder.find((f) => f.key === k)?.label ?? k);
  const standard = listen.find((l) => l.standard);
  return (
    <Bereich id="trefferliste" titel={t('werkbank.sichten.trefferliste')} hilfe={<Hilfe ort="sicht.trefferliste" />} klappe={klappe}
      kurz={!typen.length ? t('werkbank.sichten.systemspalten') : problem ? t('werkbank.sichten.trefferliste-fehlt-standard') : (listen.find((l) => l.key === e.trefferliste)?.name ?? (standard ? t('werkbank.sichten.standard', { name: standard.name }) : t('werkbank.sichten.standard-2')))}>
      {!typen.length
        ? <p className="leise">{t('werkbank.sichten.ohne-mappentypen-zeigt-die')}</p>
        : <>
            <p className="leise">{tn('werkbank.sichten.welche-spalten-die-liste', { wert: typen.length > 1 && t('werkbank.sichten.bei-mehreren-mappentypen-gibt') })}</p>
            <Feld beschriftung={t('werkbank.sichten.trefferliste')} className="schmal">
              <select value={e.trefferliste ?? ''} onChange={(x) => setE((y) => ({ ...y, trefferliste: x.target.value || null }))}>
                <option value="">{standard ? t('werkbank.sichten.standard', { name: standard.name }) : t('werkbank.sichten.standard-systemspalten')}</option>
                {problem && <option value={e.trefferliste!}>{tn('werkbank.sichten.fehlt', { trefferliste: e.trefferliste })}</option>}
                {listen.map((l) => <option key={l.key} value={l.key}>{l.name}{l.standard ? t('werkbank.sichten.standard-3') : ''}</option>)}
              </select></Feld>
            {problem
              ? <p className="fehlertext klein">{problem}</p>
              : <p className="leise klein">{t('werkbank.sichten.spalten')}{' '}{wahl.spalten.length ? wahl.spalten.map(name).join(', ') : t('werkbank.sichten.keine-einfache-liste-mit')}</p>}
          </>}
    </Bereich>
  );
}

/* ---------- Bedingungen ---------- */

type Ziel = { wert: 'feld'; feld: Bedingungsfeld } | { wert: 'dokumente' | 'verknuepfungen'; register: string; name: string }
  | { wert: 'dokumenteGesamt' | 'verknuepfungenGesamt' | 'favorit' | 'frist' | 'merkmal' | 'merkmalNicht' };
const ZIEL_GESAMT: Record<'dokumenteGesamt' | 'verknuepfungenGesamt' | 'favorit' | 'frist' | 'merkmal' | 'merkmalNicht', string> = {
  dokumenteGesamt: t('werkbank.sichten.dokumente-insgesamt'), verknuepfungenGesamt: t('werkbank.sichten.verknuepfungen-insgesamt'), favorit: t('werkbank.sichten.ist-mein-favorit'), frist: t('werkbank.sichten.hat-frist-in-den'),
  // Merkmal der Ablage (#1032).
  merkmal: merkmalText('beruflich'), merkmalNicht: merkmalText('beruflich', true),
};

/** Register, die alle Typen der Sicht mit gleichem Schlüssel und gleicher Art haben (#66). */
function gemeinsameRegister(typen: Mappentyp[]): Array<{ wert: 'dokumente' | 'verknuepfungen'; register: string; name: string }> {
  if (!typen.length) return [];
  return typen[0].register.filter((r) => (r.art === 'dokumente' || r.art === 'verknuepfungen')
    && typen.every((mappentyp) => mappentyp.register.some((x) => x.key === r.key && x.art === r.art)))
    .map((r) => ({
      wert: r.art as 'dokumente' | 'verknuepfungen', register: r.key,
      name: [...new Set(typen.map((mappentyp) => mappentyp.register.find((x) => x.key === r.key)!.name))].join(' / '),
    }));
}

function Bedingungen({ e, setE, typen, klappe }: { e: SichtDaten; setE: (f: (x: SichtDaten) => SichtDaten) => void; typen: Mappentyp[]; klappe: Klappe }) {
  const d = useDaten();
  const felder = useMemo(() => bedingungsfelder(typen), [typen]);
  // Ausgeblendete Felder (#655) nicht für neue Bedingungen; bestehende bleiben wählbar.
  const aus = useMemo(() => new Set(typen.flatMap((x) => [...ausgeblendeteFelder(x)])), [typen]);
  const ziele: Ziel[] = [
    ...felder.map((f) => ({ wert: 'feld' as const, feld: f })),
    { wert: 'dokumenteGesamt' }, { wert: 'verknuepfungenGesamt' },
    ...gemeinsameRegister(typen),
    { wert: 'favorit' },
    { wert: 'frist' },
    { wert: 'merkmal' }, { wert: 'merkmalNicht' },
  ];
  const zielKey = (z: Ziel) => (z.wert === 'feld' ? `feld:${z.feld.key}` : 'register' in z ? `${z.wert}:${z.register}` : z.wert);
  const bKey = (b: Bedingung) => (b.art === 'feld' ? `feld:${b.feld}` : b.art === 'dokumente' || b.art === 'verknuepfungen' ? `${b.art}:${b.register}` : b.art === 'merkmal' && b.nicht ? 'merkmalNicht' : b.art);
  const zielName = (z: Ziel) => (z.wert === 'feld' ? z.feld.label : 'register' in z ? t('werkbank.sichten.in', { wert: z.wert === 'dokumente' ? t('werkbank.sichten.dokumente') : t('werkbank.sichten.verknuepfungen'), name: z.name }) : ZIEL_GESAMT[z.wert]);
  const setze = (i: number, b: Bedingung) => setE((x) => ({ ...x, bedingungen: x.bedingungen.map((y, j) => (j === i ? b : y)) }));
  const weg = (i: number) => setE((x) => ({ ...x, bedingungen: x.bedingungen.filter((_, j) => j !== i) }));
  const neu = (z: Ziel): Bedingung => (z.wert === 'feld'
    ? { art: 'feld', feld: z.feld.key, op: OPERATOREN_JE_ART[z.feld.art][0] }
    : z.wert === 'favorit' ? { art: 'favorit' }
    : z.wert === 'merkmal' || z.wert === 'merkmalNicht' ? { art: 'merkmal', merkmal: 'beruflich', ...(z.wert === 'merkmalNicht' ? { nicht: true } : {}) }
    : z.wert === 'frist' ? { art: 'frist', feld: null, tage: 30 }
    : 'register' in z ? { art: z.wert, register: z.register, vergleich: z.wert === 'dokumente' ? 'gleich' : 'mehr', anzahl: 0 }
    : { art: z.wert, vergleich: z.wert === 'dokumenteGesamt' ? 'gleich' : 'mehr', anzahl: 0 });
  const [titel, setTitel] = useState<Record<string, string>>({});
  const merke = (mid: string, text: string) => setTitel((x) => ({ ...x, [mid]: text }));

  return (
    <Bereich id="bedingungen" titel={t('werkbank.sichten.bedingungen-2')} hilfe={<Hilfe ort="sicht.bedingungen" />} klappe={klappe}
      kurz={e.bedingungen.length ? t('werkbank.sichten.bedingungen-3', { anzahl: e.bedingungen.length }) : t('werkbank.sichten.keine')}>
      {!typen.length
        ? <p className="leise">{t('werkbank.sichten.bedingungen-gelten-fuer-die')}</p>
        : <>
            <p className="leise">{tn('werkbank.sichten.die-ansicht-zeigt-nur', { b: <strong>{t('werkbank.sichten.alle')}</strong>, wert: typen.length > 1 && t('werkbank.sichten.bei-mehreren-mappentypen-gibt-2') })}</p>
            {e.bedingungen.length > 0 && (
              <ol className="bedingungen">
                {e.bedingungen.map((b, i) => {
                  const problem = bedingungsProblem(b, typen);
                  const ziel = ziele.find((z) => zielKey(z) === bKey(b));
                  return (
                    <li key={i} className={problem ? 'fehlerhaft' : ''}>
                      <div className="bedingungszeile">
                        <Feld beschriftung={t('werkbank.sichten.feld-oder-register')} beschriftungVerbergen><select value={ziel ? zielKey(ziel) : ''} onChange={(x) => { const z = ziele.find((y) => zielKey(y) === x.target.value); if (z) setze(i, neu(z)); }}>
                          {!ziel && <option value="">{t('werkbank.sichten.fehlt-2', { wert: b.art === 'feld' ? b.feld : 'register' in b ? b.register : b.art })}</option>}
                          <optgroup label={t('werkbank.sichten.felder')}>{ziele.filter((z) => z.wert === 'feld' && !z.feld.key.startsWith('_') && (!aus.has(z.feld.key) || zielKey(z) === bKey(b))).map((z) => <option key={zielKey(z)} value={zielKey(z)}>{(z as { feld: Bedingungsfeld }).feld.label}</option>)}</optgroup>
                          <optgroup label={t('werkbank.sichten.systemwerte')}>{ziele.filter((z) => z.wert === 'feld' && z.feld.key.startsWith('_')).map((z) => <option key={zielKey(z)} value={zielKey(z)}>{(z as { feld: Bedingungsfeld }).feld.label}</option>)}</optgroup>
                          <optgroup label={t('werkbank.sichten.anzahl')}>{ziele.filter((z) => z.wert !== 'feld' && z.wert !== 'favorit' && z.wert !== 'frist' && z.wert !== 'merkmal' && z.wert !== 'merkmalNicht').map((z) => <option key={zielKey(z)} value={zielKey(z)}>{zielName(z)}</option>)}</optgroup>
                          <optgroup label={t('werkbank.sichten.fristen')}><option value="frist">{ZIEL_GESAMT.frist}</option></optgroup>
                          <optgroup label={t('werkbank.sichten.persoenlich')}><option value="favorit">{ZIEL_GESAMT.favorit}</option></optgroup>
                          <optgroup label={t('werkbank.sichten.ablage')}><option value="merkmal">{ZIEL_GESAMT.merkmal}</option><option value="merkmalNicht">{ZIEL_GESAMT.merkmalNicht}</option></optgroup>
                        </select></Feld>
                        {b.art === 'feld' && ziel?.wert === 'feld'
                          ? <FeldBedingung b={b} feld={ziel.feld} setze={(n) => setze(i, n)} titel={titel} merke={merke} />
                          : b.art === 'frist' ? <FristBedingung b={b} typen={typen} setze={(n) => setze(i, n)} />
                          : b.art !== 'feld' && b.art !== 'favorit' && b.art !== 'merkmal' && <>
                              <Feld beschriftung={t('werkbank.sichten.vergleich')} beschriftungVerbergen><select value={b.vergleich} onChange={(x) => setze(i, { ...b, vergleich: x.target.value as Zaehlvergleich })}>
                                {Object.entries(ZAEHLVERGLEICHE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                              </select></Feld>
                              <Feld beschriftung={t('werkbank.sichten.anzahl')} beschriftungVerbergen><input type="number" min={0} className="kurz" value={b.anzahl} onChange={(x) => setze(i, { ...b, anzahl: Math.max(0, Math.trunc(Number(x.target.value) || 0)) })} /></Feld>
                            </>}
                        <Knopf art="link" groesse="klein" symbol="schliessen" onClick={() => weg(i)}>{t('werkbank.sichten.bedingung-entfernen')}</Knopf>
                      </div>
                      <p className={problem ? 'fehlertext klein' : 'leise klein'}>{problem ?? beschreibeBedingung(b, typen, (mid) => titel[mid] ?? d.person(mid), undefined, (id) => d.typ(id)?.name)}</p>
                    </li>
                  );
                })}
              </ol>
            )}
            <div className="knoepfe"><Knopf onClick={() => setE((x) => ({ ...x, bedingungen: [...x.bedingungen, neu(ziele.find((z) => z.wert !== 'feld' || !aus.has(z.feld.key)) ?? ziele[0])] }))}>{t('werkbank.sichten.bedingung')}</Knopf></div>
          </>}
    </Bereich>
  );
}

/** „hat Frist in den nächsten n Tagen“ (#133): ein Datumsfeld oder alle mit Erinnerung, optional nur meine. */
function FristBedingung({ b, typen, setze }: { b: Extract<Bedingung, { art: 'frist' }>; typen: Mappentyp[]; setze: (b: Bedingung) => void }) {
  const datumsfelder = typen.length ? typen[0].felder.filter((f) => f.typ === 'datum' && typen.every((mappentyp) => mappentyp.felder.some((g) => g.key === f.key && g.typ === 'datum'))) : [];
  return (
    <span className="wertgruppe umbruch">
      <Feld beschriftung={t('werkbank.sichten.datumsfeld')} beschriftungVerbergen><select value={b.feld ?? ''} onChange={(x) => setze({ ...b, feld: x.target.value || null })}>
        <option value="">{t('werkbank.sichten.alle-datumsfelder-die-eine')}</option>
        {datumsfelder.map((f) => <option key={f.key} value={f.key}>{f.label}{f.frist ? t('werkbank.sichten.erinnert') : ''}</option>)}
        {b.feld && !datumsfelder.some((f) => f.key === b.feld) && <option value={b.feld}>{t('werkbank.sichten.fehlt-3', { feld: b.feld })}</option>}
      </select></Feld>
      <span className="leise">{t('werkbank.sichten.in-den-naechsten')}</span>
      <Feld beschriftung={t('werkbank.sichten.tage')} beschriftungVerbergen><input type="number" min={0} max={3650} className="kurz" value={b.tage} onChange={(x) => setze({ ...b, tage: Math.max(0, Math.min(3650, Math.trunc(Number(x.target.value) || 0))) })} /></Feld>
      <span className="leise">{t('werkbank.sichten.tagen')}</span>
      <HakenFeld beschriftung={t('werkbank.sichten.nur-meine')} className="klein"><input type="checkbox" checked={!!b.nurMeine} onChange={(x) => setze({ ...b, nurMeine: x.target.checked || undefined })} /></HakenFeld>
    </span>
  );
}

type WertArt = WertAngabe['art'];

export function FeldBedingung({ b, feld, setze, titel, merke }: {
  b: Extract<Bedingung, { art: 'feld' }>; feld: Bedingungsfeld; setze: (b: Bedingung) => void;
  titel: Record<string, string>; merke: (id: string, text: string) => void;
}) {
  const d = useDaten();
  // „zeigt auf Mappe vom Typ …“ (#1036) nur bei Verweisen mit mehreren Zieltypen; eine gespeicherte Bedingung bleibt wählbar.
  const ops = operatorenFuer(feld).concat(b.op === 'zeigtAufTyp' && !operatorenFuer(feld).includes('zeigtAufTyp') ? ['zeigtAufTyp'] : []);
  const ohneWert = ['leer', 'nichtLeer', 'ja', 'nein'].includes(b.op);
  const zwei = b.op === 'zwischen' || b.op === 'ausserhalb';
  const datum = feld.art === 'datum' || feld.art === 'zeit';
  const standardWert = (op: Operator): WertAngabe | undefined => {
    if (['leer', 'nichtLeer', 'ja', 'nein'].includes(op)) return undefined;
    if (op === 'imZeitraum') return { art: 'jahr', versatz: 0 };
    if (op === 'zeigtAuf') return feld.art === 'person' || zielSystem(feld) === 'benutzer' ? { art: 'ich' } : { art: 'fest', wert: [] };
    if (op === 'einerVon' || op === 'zeigtAufTyp') return { art: 'fest', wert: [] };
    if (datum) return { art: 'heute', versatz: 0, einheit: 'tage' };
    if (feld.art === 'zeitraum') return { art: 'fest', wert: 'P3M' };
    return { art: 'fest', wert: feld.art === 'zahl' || feld.art === 'betrag' || feld.art === 'prozent' ? 0 : '' };
  };
  const zielSystem = (f: Bedingungsfeld) => { const z = f.feld ? einzigesZiel(f.feld) : undefined; return z ? d.typ(z)?.system ?? null : null; };
  const wechsleOp = (op: Operator) => {
    const n: Extract<Bedingung, { art: 'feld' }> = { art: 'feld', feld: b.feld, op };
    const w = standardWert(op);
    if (w) n.wert = b.wert && !['jahr', 'monat'].includes(b.wert.art) && op !== 'imZeitraum' && op !== 'zeigtAuf' && op !== 'einerVon' && op !== 'zeigtAufTyp' && b.op !== 'zeigtAufTyp' ? b.wert : w;
    if (op === 'zwischen' || op === 'ausserhalb') n.bis = b.bis ?? (datum ? { art: 'heute', versatz: 30, einheit: 'tage' } : n.wert);
    setze(n);
  };

  return (
    <>
      <Feld beschriftung={t('werkbank.sichten.vergleich')} beschriftungVerbergen><select value={b.op} onChange={(x) => wechsleOp(x.target.value as Operator)}>
        {ops.map((o) => <option key={o} value={o}>{OPERATOREN[o]}</option>)}
      </select></Feld>
      {!ohneWert && b.op === 'imZeitraum' && <Zeitraum w={b.wert} setze={(w) => setze({ ...b, wert: w })} />}
      {!ohneWert && b.op === 'einerVon' && <Auswahl feld={feld} w={b.wert} setze={(w) => setze({ ...b, wert: w })} />}
      {!ohneWert && b.op === 'zeigtAuf' && <Verweisziel feld={feld} w={b.wert} setze={(w) => setze({ ...b, wert: w })} titel={titel} merke={merke} system={zielSystem(feld)} />}
      {!ohneWert && b.op === 'zeigtAufTyp' && <ZieltypWahl feld={feld} w={b.wert} setze={(w) => setze({ ...b, wert: w })} />}
      {!ohneWert && !['imZeitraum', 'einerVon', 'zeigtAuf', 'zeigtAufTyp'].includes(b.op) && <>
        <Einzelwert feld={feld} w={b.wert} setze={(w) => setze({ ...b, wert: w })} />
        {zwei && <><span className="leise">{t('werkbank.sichten.und')}</span><Einzelwert feld={feld} w={b.bis} setze={(w) => setze({ ...b, bis: w })} /></>}
      </>}
    </>
  );
}

/** „zeigt auf Mappe vom Typ …“ (#1036): einer oder mehrere der Zieltypen des Verweisfelds (= einer von). */
function ZieltypWahl({ feld, w, setze }: { feld: Bedingungsfeld; w?: WertAngabe; setze: (w: WertAngabe) => void }) {
  const d = useDaten();
  const gewaehlt = w?.art === 'fest' && Array.isArray(w.wert) ? w.wert : [];
  const ziele = feld.feld ? zieleVon(feld.feld) : [];
  return (
    <FeldGruppe beschriftung={t('werkbank.sichten.zieltypen')} className="wertgruppe umbruch">
      {[...new Set([...ziele, ...gewaehlt])].map((id) => (
        <label key={id} className="haken klein"><input type="checkbox" checked={gewaehlt.includes(id)} onChange={(x) => setze({ art: 'fest', wert: x.target.checked ? [...gewaehlt, id] : gewaehlt.filter((y) => y !== id) })} />
          <span>{d.typ(id) ? typName(d.typ(id)!) : t('werkbank.sichten.typ-fehlt')}</span></label>
      ))}
    </FeldGruppe>
  );
}

function Einzelwert({ feld, w, setze }: { feld: Bedingungsfeld; w?: WertAngabe; setze: (w: WertAngabe) => void }) {
  const datum = feld.art === 'datum' || feld.art === 'zeit';
  const zahl = feld.art === 'zahl' || feld.art === 'betrag' || feld.art === 'prozent';
  // Zeitraum (#1035): Zahl und Einheit, gespeichert als P3M; verglichen wird in Tagen.
  if (feld.art === 'zeitraum') {
    const roh = zeitraumRohAus(w?.art === 'fest' ? String(w.wert) : 'P3M');
    return <ZeitraumEingabe aria-label={t('werkbank.sichten.wert')} wert={roh} setze={(r) => setze({ art: 'fest', wert: `P${r.anzahl.trim()}${ISO_EINHEIT[r.einheit]}` })} />;
  }
  if (datum) {
    const art: WertArt = w?.art === 'fest' ? 'fest' : 'heute';
    return (
      <span className="wertgruppe">
        <Feld beschriftung={t('werkbank.sichten.art-des-werts')} beschriftungVerbergen><select value={art} onChange={(x) => setze(x.target.value === 'fest' ? { art: 'fest', wert: new Date().toISOString().slice(0, 10) } : { art: 'heute', versatz: 0, einheit: 'tage' })}>
          <option value="heute">{DYNAMISCH.heute}</option><option value="fest">{t('werkbank.sichten.festes-datum')}</option>
        </select></Feld>
        {w?.art === 'fest'
          ? <Feld beschriftung={t('werkbank.sichten.datum')} beschriftungVerbergen><input type="date" value={String(w.wert)} onChange={(x) => setze({ art: 'fest', wert: x.target.value })} /></Feld>
          : <Versatz w={w?.art === 'heute' ? w : { art: 'heute' }} setze={setze} einheiten />}
      </span>
    );
  }
  const v = w?.art === 'fest' ? w.wert : '';
  return <Feld beschriftung={t('werkbank.sichten.wert')} beschriftungVerbergen><input className={zahl ? 'kurz' : ''} inputMode={zahl ? 'decimal' : undefined} value={String(v)}
    onChange={(x) => setze({ art: 'fest', wert: zahl ? (x.target.value === '' ? '' : Number(x.target.value.replace(',', '.'))) as number : x.target.value })} /></Feld>;
}

const ISO_EINHEIT: Record<Zeitraumeinheit, string> = { tage: 'D', wochen: 'W', monate: 'M', jahre: 'Y' };
/** Vergleichswert „P3M“ als Anzahl und Einheit; was halb getippt ist („P M“), bleibt sichtbar. */
function zeitraumRohAus(s: string): ZeitraumRoh {
  const m = /^P(.*)([DWMY])$/.exec(s);
  const einheit = (Object.keys(ISO_EINHEIT) as Zeitraumeinheit[]).find((k) => ISO_EINHEIT[k] === m?.[2]) ?? 'monate';
  return { anzahl: m?.[1] ?? '', einheit };
}

function Versatz({ w, setze, einheiten }: { w: WertAngabe; setze: (w: WertAngabe) => void; einheiten?: boolean }) {
  const versatz = 'versatz' in w ? Number(w.versatz) || 0 : 0;
  return (
    <>
      <Feld beschriftung={t('werkbank.sichten.richtung')} beschriftungVerbergen><select value={versatz < 0 ? '-' : '+'} onChange={(x) => setze({ ...w, versatz: Math.abs(versatz) * (x.target.value === '-' ? -1 : 1) } as WertAngabe)}>
        <option value="+">+</option><option value="-">−</option>
      </select></Feld>
      <Feld beschriftung={t('werkbank.sichten.anzahl')} beschriftungVerbergen><input type="number" min={0} className="kurz" value={Math.abs(versatz)} onChange={(x) => setze({ ...w, versatz: Math.abs(Math.trunc(Number(x.target.value) || 0)) * (versatz < 0 ? -1 : 1) } as WertAngabe)} /></Feld>
      {einheiten && w.art === 'heute' && (
        <Feld beschriftung={t('werkbank.sichten.einheit')} beschriftungVerbergen><select value={w.einheit ?? 'tage'} onChange={(x) => setze({ ...w, einheit: x.target.value as Einheit })}>
          {Object.entries(EINHEITEN).map(([k, eintrag]) => <option key={k} value={k}>{eintrag}</option>)}
        </select></Feld>
      )}
    </>
  );
}

function Zeitraum({ w, setze }: { w?: WertAngabe; setze: (w: WertAngabe) => void }) {
  const art = w?.art === 'monat' ? 'monat' : 'jahr';
  const aktuell: WertAngabe = w && (w.art === 'jahr' || w.art === 'monat') ? w : { art: 'jahr', versatz: 0 };
  return (
    <span className="wertgruppe">
      <Feld beschriftung={t('werkbank.sichten.zeitraum')} beschriftungVerbergen><select value={art} onChange={(x) => setze({ art: x.target.value as 'jahr' | 'monat', versatz: 'versatz' in aktuell ? aktuell.versatz : 0 })}>
        <option value="jahr">{t('werkbank.sichten.jahr')}</option><option value="monat">{t('werkbank.sichten.monat')}</option>
      </select></Feld>
      <span className="leise klein">{t('werkbank.sichten.aktuell')}</span>
      <Versatz w={aktuell} setze={setze} />
    </span>
  );
}

function Auswahl({ feld, w, setze }: { feld: Bedingungsfeld; w?: WertAngabe; setze: (w: WertAngabe) => void }) {
  const gewaehlt = w?.art === 'fest' && Array.isArray(w.wert) ? w.wert : [];
  return (
    <FeldGruppe beschriftung={t('werkbank.sichten.wert')} beschriftungVerbergen className="wertgruppe umbruch">
      {(feld.feld?.optionen ?? []).map((o) => (
        <label key={o} className="haken klein"><input type="checkbox" checked={gewaehlt.includes(o)}
          onChange={(x) => setze({ art: 'fest', wert: x.target.checked ? [...gewaehlt, o] : gewaehlt.filter((y) => y !== o) })} /><span>{feld.feld ? optionText(feld.feld, o) : o}</span></label>
      ))}
    </FeldGruppe>
  );
}

/** Ziel eines Verweises: bestimmte Mappen, aktueller Benutzer (bei Benutzer-Verweisen) oder seine Rollen (bei Rollen-Verweisen). */
function Verweisziel({ feld, w, setze, titel, merke, system }: {
  feld: Bedingungsfeld; w?: WertAngabe; setze: (w: WertAngabe) => void; titel: Record<string, string>; merke: (id: string, text: string) => void; system: string | null;
}) {
  const d = useDaten();
  const person = feld.art === 'person';
  const art = w?.art ?? 'fest';
  const gewaehlt = w?.art === 'fest' && Array.isArray(w.wert) ? w.wert : [];
  // Mehrere Zieltypen (#1036): Mappen aus allen.
  const zielTypen = person ? [d.typen.find((mappentyp) => mappentyp.system === 'benutzer')?.id].filter((x): x is string => !!x) : feld.feld ? zieleVon(feld.feld) : [];
  return (
    <span className="wertgruppe umbruch">
      <Feld beschriftung={t('werkbank.sichten.ziel')} beschriftungVerbergen><select value={art} onChange={(x) => setze(x.target.value === 'fest' ? { art: 'fest', wert: [] } : { art: x.target.value as 'ich' | 'meineRollen' })}>
        <option value="fest">{person ? t('werkbank.sichten.bestimmter-benutzer') : t('werkbank.sichten.bestimmte-mappe')}</option>
        {(person || system === 'benutzer') && <option value="ich">{DYNAMISCH.ich}</option>}
        {!person && system === 'rolle' && <option value="meineRollen">{DYNAMISCH.meineRollen}</option>}
      </select></Feld>
      {art === 'fest' && zielTypen.length > 0 && <MappenSuche typId={zielTypen} gewaehlt={gewaehlt} titel={titel} merke={merke} setze={(ids) => setze({ art: 'fest', wert: ids })} />}
    </span>
  );
}

export function MappenSuche({ typId, gewaehlt, titel, merke, setze }: { /** Ein Typ oder mehrere (#1036). */ typId: string | string[]; gewaehlt: string[]; titel: Record<string, string>; merke: (id: string, text: string) => void; setze: (ids: string[]) => void }) {
  const [eingabe, setEingabe] = useState('');
  const [treffer, setTreffer] = useState<Mappe[]>([]);
  const fehlend = gewaehlt.filter((x) => !titel[x]).join(',');
  useEffect(() => {
    for (const x of fehlend ? fehlend.split(',') : []) mappenApi.mappe(x).then((r) => merke(x, titelOder(r.mappe.titel))).catch(() => merke(x, '(gelöscht)'));
  }, [fehlend]); // eslint-disable-line react-hooks/exhaustive-deps -- Namen nur nachladen, wenn sich die Liste der fehlenden Mappen ändert
  useEffect(() => {
    if (!eingabe.trim()) { setTreffer([]); return; }
    let aktuell = true;
    const ids = Array.isArray(typId) ? typId : [typId];
    const timer = setTimeout(() => { void Promise.all(ids.map((x) => mappenApi.seite(`typ:${x}`, 0, 8, eingabe.trim()))).then((l) => aktuell && setTreffer(l.flatMap((x) => x.mappen))).catch(() => {}); }, 200);
    return () => { aktuell = false; clearTimeout(timer); };
  }, [eingabe, Array.isArray(typId) ? typId.join(',') : typId]); // eslint-disable-line react-hooks/exhaustive-deps -- die Liste der Typen als Text
  return (
    <span className="mappensuche">
      {gewaehlt.map((x) => <span key={x} className="chip">{titel[x] ?? '…'} <Knopf art="link" groesse="klein" nurSymbol={t('werkbank.sichten.entfernen-2')} onClick={() => setze(gewaehlt.filter((y) => y !== x))}><Symbol name="schliessen" /></Knopf></span>)}
      <Feld beschriftung={t('werkbank.sichten.mappe-suchen')} beschriftungVerbergen className="wahl">
        {(v) => <>
          <input {...v} placeholder={t('werkbank.sichten.suchen')} value={eingabe} onChange={(x) => setEingabe(x.target.value)} />
          {treffer.length > 0 && (
            <span className="wahlliste" role="listbox">
              {treffer.filter((m) => !gewaehlt.includes(m.id)).map((m) => (
                <Knopf key={m.id} art="link" onClick={() => { merke(m.id, titelOder(m.titel)); setze([...gewaehlt, m.id]); setEingabe(''); }}>{titelOder(m.titel)}</Knopf>
              ))}
            </span>
          )}
        </>}
      </Feld>
    </span>
  );
}

/**
 * Auswahlfilter am Referenzfeld (#172): „Nur Mappen, die …“ – Bedingungen auf Felder und
 * Systemwerte des Zieltyps, wie bei Sichten; dazu, wie viele Mappen passen.
 */
export function AuswahlFilter({ ziel, zielTypen, bedingungen, setze, eigeneFelder = [], feldKey = '' }: {
  /** Bei mehreren Zieltypen (#1036) ein Bild mit den Feldern, die alle haben, und den Namen; gezählt wird über `zielTypen`. */
  ziel: Mappentyp; zielTypen?: string[]; bedingungen: Feldbedingung[]; setze: (b: Feldbedingung[]) => void;
  /** Werte aus der eigenen Mappe (#173): Felder dieses Typs und das Referenzfeld selbst (kein Kreis). */
  eigeneFelder?: FeldDef[]; feldKey?: string;
}) {
  const eigeneNamen = Object.fromEntries(eigeneFelder.map((f) => [f.key, f.label]));
  const d = useDaten();
  const felder = useMemo(() => bedingungsfelder([ziel]), [ziel]);
  const [titel, setTitel] = useState<Record<string, string>>({});
  const merke = (mid: string, text: string) => setTitel((x) => ({ ...x, [mid]: text }));
  const [zahl, setZahl] = useState<{ passen: number; gesamt: number } | null>(null);
  const schluessel = JSON.stringify(bedingungen);
  useEffect(() => {
    let aktuell = true;
    const timer = setTimeout(() => { werkbankApi.auswahlZaehlen(zielTypen?.length ? zielTypen : [ziel.id], bedingungen).then((z) => aktuell && setZahl(z)).catch(() => aktuell && setZahl(null)); }, 300);
    return () => { aktuell = false; clearTimeout(timer); };
  }, [ziel.id, zielTypen?.join(','), schluessel]); // eslint-disable-line react-hooks/exhaustive-deps -- neu zählen nur bei anderem Ziel oder anderen Bedingungen (schluessel)
  const neu = (f: Bedingungsfeld): Feldbedingung => ({ art: 'feld', feld: f.key, op: OPERATOREN_JE_ART[f.art][0] });
  const aendere = (i: number, b: Bedingung) => { if (b.art === 'feld') setze(bedingungen.map((x, j) => (j === i ? b : x))); };
  return (
    <div className="auswahlfilter">
      <p className="klein"><strong>{t('werkbank.sichten.nur-mappen-die')}</strong> <span className="leise">{tn('werkbank.sichten.alle-bedingungen-erfuellen-leer', { name: ziel.name, hilfe: <Hilfe ort="werkbank.auswahlfilter" /> })}</span></p>
      {bedingungen.length > 0 && (
        <ol className="bedingungen">
          {bedingungen.map((b, i) => {
            const feld = felder.find((f) => f.key === b.feld);
            const problem = auswahlProbleme([b], ziel, { felder: eigeneFelder, feldKey })[0] ?? null;
            const moeglich = passendeEigeneFelder(b, ziel.felder, eigeneFelder, feldKey);
            const eigen = b.wert?.art === 'eigenesFeld' ? b.wert.feld : null;
            return (
              <li key={i} className={problem ? 'fehlerhaft' : ''}>
                <div className="bedingungszeile">
                  <Feld beschriftung={t('werkbank.sichten.feld-des-zieltyps')} beschriftungVerbergen><select value={feld ? b.feld : ''} onChange={(x) => { const f = felder.find((y) => y.key === x.target.value); if (f) aendere(i, neu(f)); }}>
                    {!feld && <option value="">{t('werkbank.sichten.fehlt-4', { feld: b.feld })}</option>}
                    <optgroup label={t('werkbank.sichten.felder')}>{felder.filter((f) => !f.key.startsWith('_')).map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</optgroup>
                    <optgroup label={t('werkbank.sichten.systemwerte')}>{felder.filter((f) => f.key.startsWith('_')).map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</optgroup>
                  </select></Feld>
                  {feld && (eigen === null
                    ? <FeldBedingung b={b} feld={feld} setze={(n) => aendere(i, n)} titel={titel} merke={merke} />
                    : <>
                        <Feld beschriftung={t('werkbank.sichten.vergleich')} beschriftungVerbergen><select value={b.op} onChange={(x) => aendere(i, { ...b, op: x.target.value as Operator })}>
                          {OPERATOREN_JE_ART[feld.art].filter((o) => OPS_EIGENES_FELD.includes(o)).map((o) => <option key={o} value={o}>{OPERATOREN[o]}</option>)}
                        </select></Feld>
                        <Feld beschriftung={t('werkbank.sichten.feld-dieser-mappe')} beschriftungVerbergen><select value={eigen} onChange={(x) => aendere(i, { ...b, wert: { art: 'eigenesFeld', feld: x.target.value } })}>
                          {!moeglich.some((m) => m.key === eigen) && <option value={eigen}>{t('werkbank.sichten.passt-nicht', { wert: eigeneNamen[eigen] ?? eigen })}</option>}
                          {moeglich.map((m) => <option key={m.key} value={m.key}>{t('werkbank.sichten.dieser-mappe', { label: m.label })}</option>)}
                        </select></Feld>
                      </>)}
                  {feld && (moeglich.length > 0 || eigen !== null) && (
                    <HakenFeld beschriftung={t('werkbank.sichten.wert-aus-dieser-mappe')} className="klein"><input type="checkbox" checked={eigen !== null} onChange={(x) => aendere(i, x.target.checked
                      ? { art: 'feld', feld: b.feld, op: OPS_EIGENES_FELD.includes(b.op) ? b.op : (OPERATOREN_JE_ART[feld.art].find((o) => OPS_EIGENES_FELD.includes(o)) ?? b.op), wert: { art: 'eigenesFeld', feld: moeglich[0]?.key ?? '' } }
                      : neu(feld))} /></HakenFeld>
                  )}
                  <Knopf art="link" groesse="klein" symbol="schliessen" onClick={() => setze(bedingungen.filter((_, j) => j !== i))}>{t('werkbank.sichten.entfernen')}</Knopf>
                </div>
                <p className={problem ? 'fehlertext klein' : 'leise klein'}>{problem ?? beschreibeBedingung(b, [ziel], (mid) => titel[mid] ?? d.person(mid), eigeneNamen, (id) => d.typ(id)?.name)}{eigen && !problem && <span> {' '}{t('werkbank.sichten.ist-dieses-feld-leer')}</span>}</p>
              </li>
            );
          })}
        </ol>
      )}
      <div className="zeile">
        <Knopf gesperrt={!felder.length} onClick={() => setze([...bedingungen, neu(felder[0])])}>{t('werkbank.sichten.bedingung')}</Knopf>
        {zahl && bedingungen.length > 0 && <span className="leise klein">{t('werkbank.sichten.von-passen', { passen: zahl.passen.toLocaleString(gebietsschema()), gesamt: zahl.gesamt.toLocaleString(gebietsschema()), name: ziel.name })}</span>}
      </div>
    </div>
  );
}
