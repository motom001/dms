import { useEffect, useMemo, useState } from 'react';
import { Ansage, useZiehen, ziehTasten, type Ort } from '../ziehen';
import { SYSTEMSPALTEN, istSystemspalte, type Feld, type Mappe, type Mappentyp } from '../../../shared/src/model';
import {
  bedingungsfelder, bedingungsProblem, beschreibeBedingung, DYNAMISCH, EINHEITEN, gemeinsameTrefferlisten, kinderVon, mitNachkommen, OPERATOREN, OPERATOREN_JE_ART, spaltenDerSicht, trefferlistenProblem, wirksameTypen,
  ZAEHLVERGLEICHE, auswahlProbleme, OPS_EIGENES_FELD, passendeEigeneFelder, type Bedingung, type Bedingungsfeld, type Feldbedingung, type Einheit, type Operator, type Sicht, type SichtDaten, type WertAngabe, type Zaehlvergleich,
} from '../../../shared/src/sichten';
import { api } from '../api';
import { useDaten } from '../daten';
import { geheZu, Link, loeseWache, useUngespeichert } from '../ort';
import { titelOder } from '../seiten';
import { Hilfe } from '../Hilfe';
import { Bereich, SICHT_BEREICHE, useBereiche, type Klappe, type SichtBereich } from '../einrichtung/Bereich';
import { elternkette, SichtBerechtigungen, SichtTestlauf } from './SichtRechte';
import { sichtRegelProblem, sichtRegelwerkVon } from '../../../shared/src/sichtrechte';
import { rueckfrage } from '../rueckfrage';

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

export function SichtenListe({ offen }: { offen?: string }) {
  const d = useDaten();
  const zeilen = baumzeilen(d.sichten);
  const typen = (s: Sicht) => s.typen.map((t) => d.typ(t)).filter((t): t is Mappentyp => !!t);
  const [ansage, setAnsage] = useState('');
  const [fehler, setFehler] = useState<string>();
  const [hinweis, setHinweis] = useState<string>();
  const name = (id: string | null) => (id ? d.sicht(id)?.name ?? '' : '');
  /** „Heizung erbt jetzt von „Haus“: Standard R, 2 Regeln.“ bzw. „… erbt keine Regeln mehr.“ */
  const vererbtHinweis = (n: string, elternId: string | null) => {
    if (!elternId) return `„${n}“ liegt jetzt auf der obersten Ebene und erbt keine Berechtigungen mehr; es gelten nur ihre eigenen.`;
    const kette = elternkette(d.sichten, elternId);
    const regeln = kette.reduce((x, s) => x + sichtRegelwerkVon(s).regeln.length, 0);
    const standard = sichtRegelwerkVon(kette[0]).grund;
    return `„${n}“ erbt jetzt die Berechtigungen von „${name(elternId)}“: Standard ${Object.entries(standard).filter(([, v]) => v).map(([k]) => k).join('') || '–'}${regeln ? `, ${regeln} Regel${regeln === 1 ? '' : 'n'}` : ', keine Regeln'}. Ihr eigener Standard und ✓ in ihren Regeln wirken jetzt nicht mehr.`;
  };

  // Drag & Drop (#73): sofort gespeichert; Untersichten wandern mit, Kreise sind unmöglich.
  async function verschiebe(id: string, elternId: string | null, stelle: number) {
    setFehler(undefined);
    try {
      const vorher = d.sicht(id)?.elternId ?? null;
      await api.sichtVerschieben(id, elternId, stelle);
      await d.neuLaden();
      setAnsage(`${name(id)} liegt jetzt ${elternId ? `unter „${name(elternId)}“` : 'auf der obersten Ebene'} an Stelle ${stelle + 1}.`);
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
      <div className="listenkopf">
        <div><h1>Ansichten</h1><p className="leise klein">Was die Ablage links anbietet: Mappentypen, Bedingungen und die Ordnung als Baum. <Hilfe ort="werkbank.sichten" /></p></div>
        <Link to="/werkbank/sichten/neu" className="knopf primaer klein">+ Neu</Link>
      </div>
      {fehler && <div className="hinweis schlecht"><p>{fehler}</p></div>}
      {hinweis && <div className="hinweis info"><p>{hinweis}</p><button type="button" className="textknopf klein" onClick={() => setHinweis(undefined)}>Ausblenden</button></div>}
      <Ansage text={ansage} />
      {zeilen.length > 1 && <p className="leise klein">Zum Ordnen am Griff ⠿ ziehen: zwischen zwei Ansichten oder auf eine Ansicht (wird Unteransicht).</p>}
      {!zeilen.length && offen !== 'neu'
        ? <p className="leise leerliste">Noch keine Ansichten. Ohne Ansicht erscheinen Mappen nur unter „Zu erledigen“ und über Verweise.</p>
        : <ul className="mappenliste">
            {offen === 'neu' && <li><span className="eintrag an werk"><span className="titel">Neue Ansicht</span><span className="unter">noch nicht gespeichert</span></span></li>}
            {zeilen.map(({ s, tiefe }) => {
              const e = z.eintrag(s.id);
              const t = typen(s);
              const probleme = s.bedingungen.filter((b) => bedingungsProblem(b, t)).length;
              const listenProblem = trefferlistenProblem(s.trefferliste, wirksameTypen(d.sichten, s.id).map((x) => d.typ(x)).filter((x): x is Mappentyp => !!x));
              const kinder = kinderVon(d.sichten, s.id).length;
              return (
                <li key={s.id} {...e} className={`ziehbar ${e.className}`} style={{ paddingLeft: tiefe * 16 }}>
                  <button {...z.griff(s.id, s.name)} onKeyDown={(ev) => ziehTasten(ev, tasten(s))}><span aria-hidden="true">⠿</span></button>
                  <Link to={`/werkbank/sichten/${s.id}`} className={`eintrag werk ${offen === s.id ? 'an' : ''}`}>
                    <span className="titel">{tiefe > 0 && <span className="leise" aria-hidden="true">└ </span>}{s.name}</span>
                    <span className="unter">
                      {t.length ? t.map((x) => x.name).join(', ') : 'nur zum Gruppieren'}
                      {s.bedingungen.length > 0 && ` · ${s.bedingungen.length} Bedingung${s.bedingungen.length === 1 ? '' : 'en'}`}
                      {kinder > 0 && ` · ${kinder} Unteransicht${kinder === 1 ? '' : 'en'}`}
                      {` · ${(d.zaehler.sichten?.[s.id] ?? 0).toLocaleString('de-DE')} Mappen`}
                      {s.berechtigungen?.regeln.length ? ` · ${s.berechtigungen.regeln.length} Regel${s.berechtigungen.regeln.length === 1 ? '' : 'n'}` : ''}
                    </span>
                    {probleme > 0 && <span className="problem">{probleme} Bedingung{probleme === 1 ? '' : 'en'} ohne Wirkung – bitte prüfen</span>}
                    {listenProblem && <span className="problem">Trefferliste fehlt – zeigt die Standardliste</span>}
                  </Link>
                </li>
              );
            })}
          </ul>}
    </>
  );
}

const leer = (): SichtDaten => ({ name: '', beschreibung: '', elternId: null, position: 0, typen: [], bedingungen: [], trefferliste: null, berechtigungen: null });
const datenVon = (s: Sicht): SichtDaten => ({ name: s.name, beschreibung: s.beschreibung, elternId: s.elternId, position: s.position, typen: s.typen, bedingungen: s.bedingungen, trefferliste: s.trefferliste ?? null, berechtigungen: s.berechtigungen ?? null });

export function SichtEditor({ id }: { id: string }) {
  const d = useDaten();
  const neu = id === 'neu';
  const vorhanden = neu ? undefined : d.sicht(id);
  const [basis, setBasis] = useState(() => JSON.stringify(vorhanden ? datenVon(vorhanden) : leer()));
  const [e, setE] = useState<SichtDaten>(() => JSON.parse(basis));
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [sendet, setSendet] = useState(false);
  const [vorschau, setVorschau] = useState<number | null>(null);
  const geaendert = JSON.stringify(e) !== basis;
  useUngespeichert(geaendert);
  // Bereiche (#148) wie am Mappentyp: neu offen, bestehend eingeklappt bzw. wie zuletzt.
  const b = useBereiche(SICHT_BEREICHE, 'sicht', neu ? null : id);
  const [fehlerOrte, setFehlerOrte] = useState<Set<SichtBereich>>(new Set());
  const untersicht = !!e.elternId;
  const liveFehler = (k: SichtBereich) => (k === 'berechtigungen' && (e.berechtigungen?.regeln ?? []).some((r) => !!sichtRegelProblem(r, untersicht)))
    || (k === 'bedingungen' && e.bedingungen.some((x) => !!bedingungsProblem(x, e.typen.map((t) => d.typ(t)).filter((t): t is Mappentyp => !!t))));
  const hatFehler = (k: SichtBereich) => fehlerOrte.has(k) || liveFehler(k);
  const klappe = (k: SichtBereich): Klappe => b.klappe(k, hatFehler(k));

  const eigeneTypen = e.typen.map((t) => d.typ(t)).filter((t): t is Mappentyp => !!t);
  // Eine neue Sicht ist im Baum noch nicht da; für die Auswahl der Elternsicht zählt sie als Blatt.
  const ausgeschlossen = new Set(neu ? [] : mitNachkommen(d.sichten, id).map((s) => s.id));
  const elternWahl = baumzeilen(d.sichten).filter(({ s }) => !ausgeschlossen.has(s.id));
  const geschwister = kinderVon(d.sichten, vorhanden?.elternId ?? null);
  const stelle = vorhanden ? geschwister.findIndex((s) => s.id === id) : -1;
  const untersichten = neu ? 0 : mitNachkommen(d.sichten, id).length - 1;
  // Wirksame Typen: eigene und die der Untersichten – sie bestimmen, welche Trefferlisten es gibt (#75).
  const wirksam = [...new Set([...e.typen, ...(neu ? [] : mitNachkommen(d.sichten, id).filter((s) => s.id !== id).flatMap((s) => s.typen))])]
    .map((t) => d.typ(t)).filter((t): t is Mappentyp => !!t);

  // Vorschau: Anzahl Treffer mit dem aktuellen Entwurf (kurz nach dem Tippen).
  const entwurf = JSON.stringify(e);
  useEffect(() => {
    let aktuell = true;
    const t = setTimeout(() => {
      api.sichtVorschau(neu ? null : id, { ...e, name: e.name || 'Vorschau' }).then((r) => aktuell && setVorschau(r.anzahl)).catch(() => aktuell && setVorschau(null));
    }, 350);
    return () => { aktuell = false; clearTimeout(t); };
  }, [entwurf, d.stand]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!neu && !vorhanden) return <div className="leer"><p>Diese Ansicht gibt es nicht (mehr).</p></div>;

  async function speichern() {
    setSendet(true); setMeldung(undefined);
    try {
      const s = neu ? await api.sichtAnlegen({ ...e, position: undefined }) : await api.sichtAendern(id, e.elternId !== vorhanden!.elternId ? { ...e, position: undefined } : e);
      const neuBasis = JSON.stringify(datenVon(s));
      setBasis(neuBasis); setE(JSON.parse(neuBasis)); setFehlerOrte(new Set());
      loeseWache();
      if (neu) b.merke(s.id);
      await d.neuLaden();
      if (neu) geheZu(`/werkbank/sichten/${s.id}`); else setMeldung({ art: 'gut', text: 'Ansicht gespeichert.' });
    } catch (x) {
      setMeldung({ art: 'schlecht', text: (x as Error).message });
      // Fehler in den Berechtigungen (#148): Bereich markieren und aufklappen; sonst die Grunddaten.
      const ort: SichtBereich = ((x as { details?: { berechtigungen?: boolean } }).details?.berechtigungen) ? 'berechtigungen' : 'grunddaten';
      setFehlerOrte(new Set([ort])); b.oeffne([ort]);
    }
    finally { setSendet(false); }
  }
  async function loeschen() {
    const hinweis = untersichten ? ` Ihre ${untersichten} Unteransicht${untersichten === 1 ? '' : 'en'} rücken eine Ebene nach oben.` : '';
    if (!(await rueckfrage({ titel: `Ansicht „${vorhanden!.name}“ löschen?`, text: `Mappen werden nicht gelöscht.${hinweis}`, ja: 'Löschen', gefahr: true }))) return;
    try { await api.sichtLoeschen(id); loeseWache(); await d.neuLaden(); geheZu('/werkbank/sichten'); }
    catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }
  async function verschiebe(r: number) {
    const ids = geschwister.map((s) => s.id);
    const [x] = ids.splice(stelle, 1);
    ids.splice(stelle + r, 0, x);
    try { await api.sichtenOrdnen(vorhanden!.elternId, ids); await d.neuLaden(); }
    catch (z) { setMeldung({ art: 'schlecht', text: (z as Error).message }); }
  }
  const setzeTyp = (t: string, an: boolean) => setE((x) => ({ ...x, typen: an ? [...x.typen, t] : x.typen.filter((y) => y !== t) }));

  return (
    <form onSubmit={(ev) => { ev.preventDefault(); void speichern(); }} noValidate>
      <div className="seitenkopf"><div>
        <p className="ueber">Ansicht</p>
        <h1>{e.name || (neu ? 'Neue Ansicht' : 'Ohne Namen')}</h1>
        {!neu && <p className="leise"><Link to={`/ablage/${id}`} className="verweis">In der Ablage öffnen →</Link></p>}
      </div></div>

      {b.leiste(hatFehler, 'Bereiche der Ansicht')}

      <Bereich id="grunddaten" titel="Grunddaten" klappe={klappe('grunddaten')}
        kurz={e.elternId ? `unter „${d.sicht(e.elternId)?.name ?? '…'}“` : 'oberste Ebene'}>
        <div className="raster">
          <label className="eigenschaft"><span>Name</span><input value={e.name} placeholder="z. B. Verträge mit Kündigungsfrist" onChange={(x) => setE({ ...e, name: x.target.value })} autoFocus={neu} /></label>
          <label className="eigenschaft"><span>Liegt unter <small>Elternsicht im Baum</small></span>
            <select value={e.elternId ?? ''} onChange={(x) => setE({ ...e, elternId: x.target.value || null })}>
              <option value="">– oberste Ebene –</option>
              {elternWahl.map(({ s, tiefe }) => <option key={s.id} value={s.id}>{'  '.repeat(tiefe)}{s.name}</option>)}
            </select></label>
        </div>
        <label className="eigenschaft"><span>Beschreibung <small>steht in der Ablage über der Liste</small></span><input value={e.beschreibung} onChange={(x) => setE({ ...e, beschreibung: x.target.value })} /></label>
        {!neu && geschwister.length > 1 && (
          <div className="knoepfe">
            <span className="leise klein">Reihenfolge auf dieser Ebene: {stelle + 1} von {geschwister.length}</span>
            <button type="button" className="knopf klein" disabled={stelle <= 0 || geaendert} title={geaendert ? 'Erst speichern' : undefined} onClick={() => void verschiebe(-1)}>↑ nach oben</button>
            <button type="button" className="knopf klein" disabled={stelle >= geschwister.length - 1 || geaendert} title={geaendert ? 'Erst speichern' : undefined} onClick={() => void verschiebe(1)}>↓ nach unten</button>
          </div>
        )}
        {!neu && vorhanden && e.elternId !== vorhanden.elternId && (
          <p className="hinweis info klein">{e.elternId ? `Nach dem Speichern erbt die Ansicht die Berechtigungen von „${d.sicht(e.elternId)?.name ?? '…'}“.` : 'Nach dem Speichern erbt die Ansicht keine Berechtigungen mehr.'}</p>
        )}
      </Bereich>

      <Bereich id="mappentypen" titel="Mappentypen" klappe={klappe('mappentypen')}
        kurz={eigeneTypen.length ? `${eigeneTypen.length}: ${eigeneTypen.map((t) => t.name).join(', ')}` : 'nur zum Gruppieren'}
        beschreibung={<>Mappen dieser Mappentypen zeigt die Ansicht selbst. {untersichten > 0 ? `Dazu kommen die Mappen ihrer ${untersichten} Unteransicht${untersichten === 1 ? '' : 'en'}.` : 'Ohne Mappentyp dient sie nur zum Gruppieren von Unteransichten.'} Zeigt sie mehrere Mappentypen, gibt es kein „+ Neu“; als Spalten bietet sie nur an, was alle Mappentypen gemeinsam haben.</>}>
        <div className="typwahl">
          {d.typen.map((t) => (
            <label key={t.id} className="haken"><input type="checkbox" checked={e.typen.includes(t.id)} onChange={(x) => setzeTyp(t.id, x.target.checked)} /><span>{t.name}</span></label>
          ))}
        </div>
      </Bereich>

      <TrefferlistenWahl e={e} setE={setE} typen={wirksam} klappe={klappe('trefferliste')} />

      <Bedingungen e={e} setE={setE} typen={eigeneTypen} klappe={klappe('bedingungen')} />

      <SichtBerechtigungen e={e} setE={setE} alle={d.sichten.filter((s) => !ausgeschlossen.has(s.id))} klappe={klappe('berechtigungen')} />

      <SichtTestlauf id={neu ? null : id} e={e} klappe={klappe('testlauf')} />

      <div className="hinweis info" role="status">
        <p>{vorschau === null ? 'Vorschau wird berechnet …' : <>Diese Ansicht zeigt zurzeit <strong>{vorschau.toLocaleString('de-DE')} {vorschau === 1 ? 'Mappe' : 'Mappen'}</strong>{untersichten > 0 ? ' (mit Unteransichten)' : ''}.</>}</p>
      </div>

      <div className="speicherleiste">
        {neu ? <Link to="/werkbank/sichten" className="textknopf">Entwurf verwerfen</Link> : <button type="button" className="textknopf gefahr" onClick={() => void loeschen()}>Ansicht löschen</button>}
        <span className={`status ${meldung?.art === 'schlecht' ? 'schlecht' : ''}`} role="status">{meldung?.text ?? (geaendert && !neu ? 'Ungespeicherte Änderungen' : '')}</span>
        <div className="knoepfe">
          {!neu && <button type="button" className="knopf" disabled={!geaendert || sendet} onClick={() => { setE(JSON.parse(basis)); setMeldung(undefined); }}>Änderungen verwerfen</button>}
          <button className="knopf primaer" disabled={sendet || (!geaendert && !neu)}>{sendet ? 'Speichere …' : 'Ansicht speichern'}</button>
        </div>
      </div>
    </form>
  );
}

/* ---------- Trefferliste (#75) ---------- */

function TrefferlistenWahl({ e, setE, typen, klappe }: { e: SichtDaten; setE: (f: (x: SichtDaten) => SichtDaten) => void; typen: Mappentyp[]; klappe: Klappe }) {
  const listen = gemeinsameTrefferlisten(typen);
  const wahl = spaltenDerSicht(typen, e.trefferliste);
  const problem = trefferlistenProblem(e.trefferliste, typen);
  const name = (k: string) => (istSystemspalte(k) ? SYSTEMSPALTEN[k] : typen[0]?.felder.find((f) => f.key === k)?.label ?? k);
  const standard = listen.find((l) => l.standard);
  return (
    <Bereich id="trefferliste" titel="Trefferliste" hilfe={<Hilfe ort="sicht.trefferliste" />} klappe={klappe}
      kurz={!typen.length ? 'Systemspalten' : problem ? 'Trefferliste fehlt – Standard' : (listen.find((l) => l.key === e.trefferliste)?.name ?? (standard ? `Standard („${standard.name}“)` : 'Standard'))}>
      {!typen.length
        ? <p className="leise">Ohne Mappentypen zeigt die Ansicht die Systemspalten (Titel, Typ, angelegt, geändert).</p>
        : <>
            <p className="leise">Welche Spalten die Liste in der Ablage zeigt. Die Trefferlisten richtest du am Mappentyp ein.
              {typen.length > 1 && ' Bei mehreren Mappentypen gibt es nur Listen, die alle Mappentypen haben, und darin nur die gemeinsamen Spalten; Titel und Typ stehen immer vorn.'}</p>
            <label className="eigenschaft schmal"><span>Trefferliste</span>
              <select value={e.trefferliste ?? ''} onChange={(x) => setE((y) => ({ ...y, trefferliste: x.target.value || null }))}>
                <option value="">{standard ? `Standard („${standard.name}“)` : 'Standard (Systemspalten)'}</option>
                {problem && <option value={e.trefferliste!}>– {e.trefferliste} (fehlt) –</option>}
                {listen.map((l) => <option key={l.key} value={l.key}>{l.name}{l.standard ? ' – Standard' : ''}</option>)}
              </select></label>
            {problem
              ? <p className="fehlertext klein">{problem}</p>
              : <p className="leise klein">Spalten: {wahl.spalten.length ? wahl.spalten.map(name).join(', ') : 'keine – einfache Liste mit Titel und zwei Feldern'}</p>}
          </>}
    </Bereich>
  );
}

/* ---------- Bedingungen ---------- */

type Ziel = { wert: 'feld'; feld: Bedingungsfeld } | { wert: 'dokumente' | 'verknuepfungen'; register: string; name: string }
  | { wert: 'dokumenteGesamt' | 'verknuepfungenGesamt' | 'favorit' | 'frist' };
const ZIEL_GESAMT: Record<'dokumenteGesamt' | 'verknuepfungenGesamt' | 'favorit' | 'frist', string> = {
  dokumenteGesamt: 'Dokumente insgesamt', verknuepfungenGesamt: 'Verknüpfungen insgesamt', favorit: 'ist mein Favorit', frist: 'hat Frist in den nächsten Tagen',
};

/** Register, die alle Typen der Sicht mit gleichem Schlüssel und gleicher Art haben (#66). */
function gemeinsameRegister(typen: Mappentyp[]): Array<{ wert: 'dokumente' | 'verknuepfungen'; register: string; name: string }> {
  if (!typen.length) return [];
  return typen[0].register.filter((r) => (r.art === 'dokumente' || r.art === 'verknuepfungen')
    && typen.every((t) => t.register.some((x) => x.key === r.key && x.art === r.art)))
    .map((r) => ({
      wert: r.art as 'dokumente' | 'verknuepfungen', register: r.key,
      name: [...new Set(typen.map((t) => t.register.find((x) => x.key === r.key)!.name))].join(' / '),
    }));
}

function Bedingungen({ e, setE, typen, klappe }: { e: SichtDaten; setE: (f: (x: SichtDaten) => SichtDaten) => void; typen: Mappentyp[]; klappe: Klappe }) {
  const d = useDaten();
  const felder = useMemo(() => bedingungsfelder(typen), [typen]);
  const ziele: Ziel[] = [
    ...felder.map((f) => ({ wert: 'feld' as const, feld: f })),
    { wert: 'dokumenteGesamt' }, { wert: 'verknuepfungenGesamt' },
    ...gemeinsameRegister(typen),
    { wert: 'favorit' },
    { wert: 'frist' },
  ];
  const zielKey = (z: Ziel) => (z.wert === 'feld' ? `feld:${z.feld.key}` : 'register' in z ? `${z.wert}:${z.register}` : z.wert);
  const bKey = (b: Bedingung) => (b.art === 'feld' ? `feld:${b.feld}` : b.art === 'dokumente' || b.art === 'verknuepfungen' ? `${b.art}:${b.register}` : b.art);
  const zielName = (z: Ziel) => (z.wert === 'feld' ? z.feld.label : 'register' in z ? `${z.wert === 'dokumente' ? 'Dokumente' : 'Verknüpfungen'} in „${z.name}“` : ZIEL_GESAMT[z.wert]);
  const setze = (i: number, b: Bedingung) => setE((x) => ({ ...x, bedingungen: x.bedingungen.map((y, j) => (j === i ? b : y)) }));
  const weg = (i: number) => setE((x) => ({ ...x, bedingungen: x.bedingungen.filter((_, j) => j !== i) }));
  const neu = (z: Ziel): Bedingung => (z.wert === 'feld'
    ? { art: 'feld', feld: z.feld.key, op: OPERATOREN_JE_ART[z.feld.art][0] }
    : z.wert === 'favorit' ? { art: 'favorit' }
    : z.wert === 'frist' ? { art: 'frist', feld: null, tage: 30 }
    : 'register' in z ? { art: z.wert, register: z.register, vergleich: z.wert === 'dokumente' ? 'gleich' : 'mehr', anzahl: 0 }
    : { art: z.wert, vergleich: z.wert === 'dokumenteGesamt' ? 'gleich' : 'mehr', anzahl: 0 });
  const [titel, setTitel] = useState<Record<string, string>>({});
  const merke = (mid: string, t: string) => setTitel((x) => ({ ...x, [mid]: t }));

  return (
    <Bereich id="bedingungen" titel="Bedingungen" hilfe={<Hilfe ort="sicht.bedingungen" />} klappe={klappe}
      kurz={e.bedingungen.length ? `${e.bedingungen.length} Bedingung${e.bedingungen.length === 1 ? '' : 'en'}` : 'keine'}>
      {!typen.length
        ? <p className="leise">Bedingungen gelten für die eigenen Mappentypen der Ansicht – wähle oben mindestens einen.</p>
        : <>
            <p className="leise">Die Ansicht zeigt nur Mappen, die <strong>alle</strong> Bedingungen erfüllen. Werte wie „heute“ oder „aktueller Benutzer“ werden bei jedem Öffnen neu berechnet.
              {typen.length > 1 && ' Bei mehreren Mappentypen gibt es nur Felder und Register, die alle Mappentypen gleich haben, und die Systemwerte. Ein gemeinsames Register zählt je Typ über dessen eigene Quellen.'}</p>
            {e.bedingungen.length > 0 && (
              <ol className="bedingungen">
                {e.bedingungen.map((b, i) => {
                  const problem = bedingungsProblem(b, typen);
                  const ziel = ziele.find((z) => zielKey(z) === bKey(b));
                  return (
                    <li key={i} className={problem ? 'fehlerhaft' : ''}>
                      <div className="bedingungszeile">
                        <select aria-label="Feld oder Register" value={ziel ? zielKey(ziel) : ''} onChange={(x) => { const z = ziele.find((y) => zielKey(y) === x.target.value); if (z) setze(i, neu(z)); }}>
                          {!ziel && <option value="">– {b.art === 'feld' ? b.feld : 'register' in b ? b.register : b.art} (fehlt) –</option>}
                          <optgroup label="Felder">{ziele.filter((z) => z.wert === 'feld' && !z.feld.key.startsWith('_')).map((z) => <option key={zielKey(z)} value={zielKey(z)}>{(z as { feld: Bedingungsfeld }).feld.label}</option>)}</optgroup>
                          <optgroup label="Systemwerte">{ziele.filter((z) => z.wert === 'feld' && z.feld.key.startsWith('_')).map((z) => <option key={zielKey(z)} value={zielKey(z)}>{(z as { feld: Bedingungsfeld }).feld.label}</option>)}</optgroup>
                          <optgroup label="Anzahl">{ziele.filter((z) => z.wert !== 'feld' && z.wert !== 'favorit' && z.wert !== 'frist').map((z) => <option key={zielKey(z)} value={zielKey(z)}>{zielName(z)}</option>)}</optgroup>
                          <optgroup label="Fristen"><option value="frist">{ZIEL_GESAMT.frist}</option></optgroup>
                          <optgroup label="Persönlich"><option value="favorit">{ZIEL_GESAMT.favorit}</option></optgroup>
                        </select>
                        {b.art === 'feld' && ziel?.wert === 'feld'
                          ? <FeldBedingung b={b} feld={ziel.feld} setze={(n) => setze(i, n)} titel={titel} merke={merke} />
                          : b.art === 'frist' ? <FristBedingung b={b} typen={typen} setze={(n) => setze(i, n)} />
                          : b.art !== 'feld' && b.art !== 'favorit' && <>
                              <select aria-label="Vergleich" value={b.vergleich} onChange={(x) => setze(i, { ...b, vergleich: x.target.value as Zaehlvergleich })}>
                                {Object.entries(ZAEHLVERGLEICHE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                              </select>
                              <input aria-label="Anzahl" type="number" min={0} className="kurz" value={b.anzahl} onChange={(x) => setze(i, { ...b, anzahl: Math.max(0, Math.trunc(Number(x.target.value) || 0)) })} />
                            </>}
                        <button type="button" className="textknopf gefahr klein" onClick={() => weg(i)}>Bedingung entfernen</button>
                      </div>
                      <p className={problem ? 'fehlertext klein' : 'leise klein'}>{problem ?? beschreibeBedingung(b, typen, (mid) => titel[mid] ?? d.person(mid))}</p>
                    </li>
                  );
                })}
              </ol>
            )}
            <div className="knoepfe"><button type="button" className="knopf klein" onClick={() => setE((x) => ({ ...x, bedingungen: [...x.bedingungen, neu(ziele[0])] }))}>+ Bedingung</button></div>
          </>}
    </Bereich>
  );
}

/** „hat Frist in den nächsten n Tagen“ (#133): ein Datumsfeld oder alle mit Erinnerung, optional nur meine. */
function FristBedingung({ b, typen, setze }: { b: Extract<Bedingung, { art: 'frist' }>; typen: Mappentyp[]; setze: (b: Bedingung) => void }) {
  const datumsfelder = typen.length ? typen[0].felder.filter((f) => f.typ === 'datum' && typen.every((t) => t.felder.some((g) => g.key === f.key && g.typ === 'datum'))) : [];
  return (
    <span className="wertgruppe umbruch">
      <select aria-label="Datumsfeld" value={b.feld ?? ''} onChange={(x) => setze({ ...b, feld: x.target.value || null })}>
        <option value="">alle Datumsfelder mit Erinnerung</option>
        {datumsfelder.map((f) => <option key={f.key} value={f.key}>{f.label}{f.frist ? ' (erinnert)' : ''}</option>)}
        {b.feld && !datumsfelder.some((f) => f.key === b.feld) && <option value={b.feld}>{b.feld} (fehlt)</option>}
      </select>
      <span className="leise">in den nächsten</span>
      <input aria-label="Tage" type="number" min={0} max={3650} className="kurz" value={b.tage} onChange={(x) => setze({ ...b, tage: Math.max(0, Math.min(3650, Math.trunc(Number(x.target.value) || 0))) })} />
      <span className="leise">Tagen</span>
      <label className="haken klein"><input type="checkbox" checked={!!b.nurMeine} onChange={(x) => setze({ ...b, nurMeine: x.target.checked || undefined })} /><span>nur meine</span></label>
    </span>
  );
}

type WertArt = WertAngabe['art'];

export function FeldBedingung({ b, feld, setze, titel, merke }: {
  b: Extract<Bedingung, { art: 'feld' }>; feld: Bedingungsfeld; setze: (b: Bedingung) => void;
  titel: Record<string, string>; merke: (id: string, t: string) => void;
}) {
  const d = useDaten();
  const ops = OPERATOREN_JE_ART[feld.art];
  const ohneWert = ['leer', 'nichtLeer', 'ja', 'nein'].includes(b.op);
  const zwei = b.op === 'zwischen' || b.op === 'ausserhalb';
  const datum = feld.art === 'datum' || feld.art === 'zeit';
  const standardWert = (op: Operator): WertAngabe | undefined => {
    if (['leer', 'nichtLeer', 'ja', 'nein'].includes(op)) return undefined;
    if (op === 'imZeitraum') return { art: 'jahr', versatz: 0 };
    if (op === 'zeigtAuf') return feld.art === 'person' || zielSystem(feld) === 'benutzer' ? { art: 'ich' } : { art: 'fest', wert: [] };
    if (op === 'einerVon') return { art: 'fest', wert: [] };
    if (datum) return { art: 'heute', versatz: 0, einheit: 'tage' };
    return { art: 'fest', wert: feld.art === 'zahl' || feld.art === 'betrag' ? 0 : '' };
  };
  const zielSystem = (f: Bedingungsfeld) => (f.feld?.zielTyp ? d.typ(f.feld.zielTyp)?.system ?? null : null);
  const wechsleOp = (op: Operator) => {
    const n: Extract<Bedingung, { art: 'feld' }> = { art: 'feld', feld: b.feld, op };
    const w = standardWert(op);
    if (w) n.wert = b.wert && !['jahr', 'monat'].includes(b.wert.art) && op !== 'imZeitraum' && op !== 'zeigtAuf' && op !== 'einerVon' ? b.wert : w;
    if (op === 'zwischen' || op === 'ausserhalb') n.bis = b.bis ?? (datum ? { art: 'heute', versatz: 30, einheit: 'tage' } : n.wert);
    setze(n);
  };

  return (
    <>
      <select aria-label="Vergleich" value={b.op} onChange={(x) => wechsleOp(x.target.value as Operator)}>
        {ops.map((o) => <option key={o} value={o}>{OPERATOREN[o]}</option>)}
      </select>
      {!ohneWert && b.op === 'imZeitraum' && <Zeitraum w={b.wert} setze={(w) => setze({ ...b, wert: w })} />}
      {!ohneWert && b.op === 'einerVon' && <Auswahl feld={feld} w={b.wert} setze={(w) => setze({ ...b, wert: w })} />}
      {!ohneWert && b.op === 'zeigtAuf' && <Verweisziel feld={feld} w={b.wert} setze={(w) => setze({ ...b, wert: w })} titel={titel} merke={merke} system={zielSystem(feld)} />}
      {!ohneWert && !['imZeitraum', 'einerVon', 'zeigtAuf'].includes(b.op) && <>
        <Einzelwert feld={feld} w={b.wert} setze={(w) => setze({ ...b, wert: w })} />
        {zwei && <><span className="leise">und</span><Einzelwert feld={feld} w={b.bis} setze={(w) => setze({ ...b, bis: w })} /></>}
      </>}
    </>
  );
}

function Einzelwert({ feld, w, setze }: { feld: Bedingungsfeld; w?: WertAngabe; setze: (w: WertAngabe) => void }) {
  const datum = feld.art === 'datum' || feld.art === 'zeit';
  const zahl = feld.art === 'zahl' || feld.art === 'betrag';
  if (datum) {
    const art: WertArt = w?.art === 'fest' ? 'fest' : 'heute';
    return (
      <span className="wertgruppe">
        <select aria-label="Art des Werts" value={art} onChange={(x) => setze(x.target.value === 'fest' ? { art: 'fest', wert: new Date().toISOString().slice(0, 10) } : { art: 'heute', versatz: 0, einheit: 'tage' })}>
          <option value="heute">{DYNAMISCH.heute}</option><option value="fest">festes Datum</option>
        </select>
        {w?.art === 'fest'
          ? <input aria-label="Datum" type="date" value={String(w.wert)} onChange={(x) => setze({ art: 'fest', wert: x.target.value })} />
          : <Versatz w={w?.art === 'heute' ? w : { art: 'heute' }} setze={setze} einheiten />}
      </span>
    );
  }
  const v = w?.art === 'fest' ? w.wert : '';
  return <input aria-label="Wert" className={zahl ? 'kurz' : ''} inputMode={zahl ? 'decimal' : undefined} value={String(v)}
    onChange={(x) => setze({ art: 'fest', wert: zahl ? (x.target.value === '' ? '' : Number(x.target.value.replace(',', '.'))) as number : x.target.value })} />;
}

function Versatz({ w, setze, einheiten }: { w: WertAngabe; setze: (w: WertAngabe) => void; einheiten?: boolean }) {
  const versatz = 'versatz' in w ? Number(w.versatz) || 0 : 0;
  return (
    <>
      <select aria-label="Richtung" value={versatz < 0 ? '-' : '+'} onChange={(x) => setze({ ...w, versatz: Math.abs(versatz) * (x.target.value === '-' ? -1 : 1) } as WertAngabe)}>
        <option value="+">+</option><option value="-">−</option>
      </select>
      <input aria-label="Anzahl" type="number" min={0} className="kurz" value={Math.abs(versatz)} onChange={(x) => setze({ ...w, versatz: Math.abs(Math.trunc(Number(x.target.value) || 0)) * (versatz < 0 ? -1 : 1) } as WertAngabe)} />
      {einheiten && w.art === 'heute' && (
        <select aria-label="Einheit" value={w.einheit ?? 'tage'} onChange={(x) => setze({ ...w, einheit: x.target.value as Einheit })}>
          {Object.entries(EINHEITEN).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
        </select>
      )}
    </>
  );
}

function Zeitraum({ w, setze }: { w?: WertAngabe; setze: (w: WertAngabe) => void }) {
  const art = w?.art === 'monat' ? 'monat' : 'jahr';
  const aktuell: WertAngabe = w && (w.art === 'jahr' || w.art === 'monat') ? w : { art: 'jahr', versatz: 0 };
  return (
    <span className="wertgruppe">
      <select aria-label="Zeitraum" value={art} onChange={(x) => setze({ art: x.target.value as 'jahr' | 'monat', versatz: 'versatz' in aktuell ? aktuell.versatz : 0 })}>
        <option value="jahr">Jahr</option><option value="monat">Monat</option>
      </select>
      <span className="leise klein">aktuell</span>
      <Versatz w={aktuell} setze={setze} />
    </span>
  );
}

function Auswahl({ feld, w, setze }: { feld: Bedingungsfeld; w?: WertAngabe; setze: (w: WertAngabe) => void }) {
  const gewaehlt = w?.art === 'fest' && Array.isArray(w.wert) ? w.wert : [];
  return (
    <span className="wertgruppe umbruch">
      {(feld.feld?.optionen ?? []).map((o) => (
        <label key={o} className="haken klein"><input type="checkbox" checked={gewaehlt.includes(o)}
          onChange={(x) => setze({ art: 'fest', wert: x.target.checked ? [...gewaehlt, o] : gewaehlt.filter((y) => y !== o) })} /><span>{o}</span></label>
      ))}
    </span>
  );
}

/** Ziel eines Verweises: bestimmte Mappen, aktueller Benutzer (bei Benutzer-Verweisen) oder seine Rollen (bei Rollen-Verweisen). */
function Verweisziel({ feld, w, setze, titel, merke, system }: {
  feld: Bedingungsfeld; w?: WertAngabe; setze: (w: WertAngabe) => void; titel: Record<string, string>; merke: (id: string, t: string) => void; system: string | null;
}) {
  const d = useDaten();
  const person = feld.art === 'person';
  const art = w?.art ?? 'fest';
  const gewaehlt = w?.art === 'fest' && Array.isArray(w.wert) ? w.wert : [];
  const zielTyp = person ? d.typen.find((t) => t.system === 'benutzer')?.id : feld.feld?.zielTyp;
  return (
    <span className="wertgruppe umbruch">
      <select aria-label="Ziel" value={art} onChange={(x) => setze(x.target.value === 'fest' ? { art: 'fest', wert: [] } : { art: x.target.value as 'ich' | 'meineRollen' })}>
        <option value="fest">{person ? 'bestimmter Benutzer' : 'bestimmte Mappe'}</option>
        {(person || system === 'benutzer') && <option value="ich">{DYNAMISCH.ich}</option>}
        {!person && system === 'rolle' && <option value="meineRollen">{DYNAMISCH.meineRollen}</option>}
      </select>
      {art === 'fest' && zielTyp && <MappenSuche typId={zielTyp} gewaehlt={gewaehlt} titel={titel} merke={merke} setze={(ids) => setze({ art: 'fest', wert: ids })} />}
    </span>
  );
}

export function MappenSuche({ typId, gewaehlt, titel, merke, setze }: { typId: string; gewaehlt: string[]; titel: Record<string, string>; merke: (id: string, t: string) => void; setze: (ids: string[]) => void }) {
  const [eingabe, setEingabe] = useState('');
  const [treffer, setTreffer] = useState<Mappe[]>([]);
  const fehlend = gewaehlt.filter((x) => !titel[x]).join(',');
  useEffect(() => {
    for (const x of fehlend ? fehlend.split(',') : []) api.mappe(x).then((r) => merke(x, titelOder(r.mappe.titel))).catch(() => merke(x, '(gelöscht)'));
  }, [fehlend]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!eingabe.trim()) { setTreffer([]); return; }
    let aktuell = true;
    const t = setTimeout(() => api.seite(`typ:${typId}`, 0, 8, eingabe.trim()).then((s) => aktuell && setTreffer(s.mappen)).catch(() => {}), 200);
    return () => { aktuell = false; clearTimeout(t); };
  }, [eingabe, typId]);
  return (
    <span className="mappensuche">
      {gewaehlt.map((x) => <span key={x} className="chip">{titel[x] ?? '…'} <button type="button" className="textknopf klein" aria-label="entfernen" onClick={() => setze(gewaehlt.filter((y) => y !== x))}>×</button></span>)}
      <span className="wahl">
        <input aria-label="Mappe suchen" placeholder="suchen …" value={eingabe} onChange={(x) => setEingabe(x.target.value)} />
        {treffer.length > 0 && (
          <span className="wahlliste" role="listbox">
            {treffer.filter((m) => !gewaehlt.includes(m.id)).map((m) => (
              <button key={m.id} type="button" onClick={() => { merke(m.id, titelOder(m.titel)); setze([...gewaehlt, m.id]); setEingabe(''); }}>{titelOder(m.titel)}</button>
            ))}
          </span>
        )}
      </span>
    </span>
  );
}

/**
 * Auswahlfilter am Referenzfeld (#172): „Nur Mappen, die …“ – Bedingungen auf Felder und
 * Systemwerte des Zieltyps, wie bei Sichten; dazu, wie viele Mappen passen.
 */
export function AuswahlFilter({ ziel, bedingungen, setze, eigeneFelder = [], feldKey = '' }: {
  ziel: Mappentyp; bedingungen: Feldbedingung[]; setze: (b: Feldbedingung[]) => void;
  /** Werte aus der eigenen Mappe (#173): Felder dieses Typs und das Referenzfeld selbst (kein Kreis). */
  eigeneFelder?: Feld[]; feldKey?: string;
}) {
  const eigeneNamen = Object.fromEntries(eigeneFelder.map((f) => [f.key, f.label]));
  const d = useDaten();
  const felder = useMemo(() => bedingungsfelder([ziel]), [ziel]);
  const [titel, setTitel] = useState<Record<string, string>>({});
  const merke = (mid: string, t: string) => setTitel((x) => ({ ...x, [mid]: t }));
  const [zahl, setZahl] = useState<{ passen: number; gesamt: number } | null>(null);
  const schluessel = JSON.stringify(bedingungen);
  useEffect(() => {
    let aktuell = true;
    const t = setTimeout(() => { api.auswahlZaehlen(ziel.id, bedingungen).then((z) => aktuell && setZahl(z)).catch(() => aktuell && setZahl(null)); }, 300);
    return () => { aktuell = false; clearTimeout(t); };
  }, [ziel.id, schluessel]); // eslint-disable-line react-hooks/exhaustive-deps
  const neu = (f: Bedingungsfeld): Feldbedingung => ({ art: 'feld', feld: f.key, op: OPERATOREN_JE_ART[f.art][0] });
  const aendere = (i: number, b: Bedingung) => { if (b.art === 'feld') setze(bedingungen.map((x, j) => (j === i ? b : x))); };
  return (
    <div className="auswahlfilter">
      <p className="klein"><strong>Nur Mappen, die …</strong> <span className="leise">alle Bedingungen erfüllen; leer: alle „{ziel.name}“. <Hilfe ort="werkbank.auswahlfilter" /></span></p>
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
                  <select aria-label="Feld des Zieltyps" value={feld ? b.feld : ''} onChange={(x) => { const f = felder.find((y) => y.key === x.target.value); if (f) aendere(i, neu(f)); }}>
                    {!feld && <option value="">– {b.feld} (fehlt) –</option>}
                    <optgroup label="Felder">{felder.filter((f) => !f.key.startsWith('_')).map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</optgroup>
                    <optgroup label="Systemwerte">{felder.filter((f) => f.key.startsWith('_')).map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</optgroup>
                  </select>
                  {feld && (eigen === null
                    ? <FeldBedingung b={b} feld={feld} setze={(n) => aendere(i, n)} titel={titel} merke={merke} />
                    : <>
                        <select aria-label="Vergleich" value={b.op} onChange={(x) => aendere(i, { ...b, op: x.target.value as Operator })}>
                          {OPERATOREN_JE_ART[feld.art].filter((o) => OPS_EIGENES_FELD.includes(o)).map((o) => <option key={o} value={o}>{OPERATOREN[o]}</option>)}
                        </select>
                        <select aria-label="Feld dieser Mappe" value={eigen} onChange={(x) => aendere(i, { ...b, wert: { art: 'eigenesFeld', feld: x.target.value } })}>
                          {!moeglich.some((m) => m.key === eigen) && <option value={eigen}>{eigeneNamen[eigen] ?? eigen} (passt nicht)</option>}
                          {moeglich.map((m) => <option key={m.key} value={m.key}>{m.label} dieser Mappe</option>)}
                        </select>
                      </>)}
                  {feld && (moeglich.length > 0 || eigen !== null) && (
                    <label className="haken klein"><input type="checkbox" checked={eigen !== null} onChange={(x) => aendere(i, x.target.checked
                      ? { art: 'feld', feld: b.feld, op: OPS_EIGENES_FELD.includes(b.op) ? b.op : (OPERATOREN_JE_ART[feld.art].find((o) => OPS_EIGENES_FELD.includes(o)) ?? b.op), wert: { art: 'eigenesFeld', feld: moeglich[0]?.key ?? '' } }
                      : neu(feld))} /><span>Wert aus dieser Mappe</span></label>
                  )}
                  <button type="button" className="textknopf gefahr klein" onClick={() => setze(bedingungen.filter((_, j) => j !== i))}>Entfernen</button>
                </div>
                <p className={problem ? 'fehlertext klein' : 'leise klein'}>{problem ?? beschreibeBedingung(b, [ziel], (mid) => titel[mid] ?? d.person(mid), eigeneNamen)}{eigen && !problem && <span> – ist dieses Feld leer, gilt die Bedingung nicht.</span>}</p>
              </li>
            );
          })}
        </ol>
      )}
      <div className="zeile">
        <button type="button" className="knopf klein" disabled={!felder.length} onClick={() => setze([...bedingungen, neu(felder[0])])}>+ Bedingung</button>
        {zahl && bedingungen.length > 0 && <span className="leise klein">{zahl.passen.toLocaleString('de-DE')} von {zahl.gesamt.toLocaleString('de-DE')} „{ziel.name}“ passen</span>}
      </div>
    </div>
  );
}
