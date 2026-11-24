import { type ChangeEvent, type Dispatch, type SetStateAction, useEffect, useState } from 'react';
import { dokumenteApi } from '../api/dokumente';
import { sucheApi, type ErkennungStand } from '../api/suche';
import { Link } from '../ort';
import { Hilfe } from '../Hilfe';
import { Symbol } from '../Symbol';
import { t, t as tx } from '../sprache';
import { FRISTEN, JAHRE_MAX, type Archiv } from '../../../shared/src/archiv';
import { STEMPEL_MODI, type StempelModus, type StempelTyp } from '../../../shared/src/stempel';
import { useStempelVorlagen } from '../ablage/Stempel';
import { rueckfrage } from '../rueckfrage';
import { abflussBestaetigen } from '../werkbank/ErkennungPaket';
import {
  AUS_DOKUMENT_STANDARD,
  BESCHRIFTUNG_MAX,
  ENGINE_EINGEBAUT,
  WIEDERFINDEN_FELDTYPEN,
  type AusDokument,
} from '../../../shared/src/erkennung';
import { abfangen, Bereich, Feld, FeldGruppe, HakenFeld, type Klappe } from '../bausteine';
import { betriebApi } from '../api/betrieb';
import type { SelbstStufe } from '../../../shared/src/darf';
import { ArchivLeer, mitStichtag } from './ArchivLeer';
import { SprachText } from './Beschriftung';
import { ERKENNBAR_AN_MAX } from '../../../shared/src/model';
import type { Beschriftungen, TypTeile } from '../../../shared/src/beschriftung';
import type { Entwurf } from './entwurf';

/**
 * Archivmodus, Stempel und Erkennung am Mappentyp (#1279 aus Einrichtung.tsx gezogen): die drei Bereiche des Editors
 * mit ihren Einstellungen.
 */
type Teil = { e: Entwurf; setE: Dispatch<SetStateAction<Entwurf>>; klappe: Klappe };

export function ArchivBereich({ e, setE, klappe, typId }: Teil & { typId?: string }) {
  return (
    <Bereich
      id="archiv"
      titel={t('mappentypen.editor.archivmodus')}
      hilfe={<Hilfe ort="mappentyp.archiv" />}
      klappe={klappe}
      kurz={
        e.archiv ? (
          <>
            {t('mappentypen.editor.an-jahre-ab', { jahre: e.archiv.jahre })}{' '}
            {e.archiv.stichtag
              ? (e.felder.find((f) => f.key === e.archiv!.stichtag)?.label ?? e.archiv.stichtag)
              : t('mappentypen.editor.anlagedatum')}
            {e.archiv.stichtag && e.archiv.leererStichtag === 'laeuftNicht' ? ` · ${t('mappentypen.editor.kurz-laeuft-nicht')}` : ''}
          </>
        ) : (
          t('mappentypen.editor.aus')
        )
      }>
      <ArchivEinstellung
        archiv={e.archiv}
        setze={(archiv) => setE({ ...e, archiv })}
        datumsfelder={e.felder.filter((f) => f.typ === 'datum' && f.key).map((f) => ({ key: f.key, label: f.label || f.key }))}
        typId={typId}
      />
    </Bereich>
  );
}

export function StempelBereich({ e, setE, klappe }: Teil) {
  return (
    <Bereich
      id="stempel"
      titel={t('mappentypen.editor.stempel-beim-weitergeben')}
      hilfe={<Hilfe ort="mappentyp.stempel" />}
      klappe={klappe}
      kurz={e.stempel ? STEMPEL_MODI[e.stempel.modus] : t('mappentypen.editor.aus')}>
      <StempelEinstellung stempel={e.stempel} setze={(stempel) => setE({ ...e, stempel })} />
    </Bereich>
  );
}

export function ErkennungBereich({ e, setE, klappe }: Teil) {
  return (
    <Bereich
      id="erkennung"
      titel={t('mappentypen.editor.erkennung')}
      hilfe={<Hilfe ort="mappentyp.erkennungstyp" />}
      klappe={klappe}
      kurz={[
        e.ausDokument?.aus ? t('mappentypen.editor.knopf-aus') : `„${e.ausDokument?.beschriftung || AUS_DOKUMENT_STANDARD}“`,
        t('mappentypen.editor.felder-markiert', { zahl: e.felder.filter((f) => f.erkennung).length }),
        t('mappentypen.editor.felder-wiederfinden', { zahl: e.felder.filter((f) => f.wiederfinden).length }),
        ...(!e.autoZuordnen && !e.archiv ? [t('mappentypen.editor.zuordnen.kurz-nie')] : []),
      ].join(' · ')}>
      {/* Woran man ihn erkennt (#937): seit #1645 hier statt in den Grunddaten – man sucht es bei der Erkennung. */}
      {e._teilVon === null && (
        <SprachText
          beschriftung={t('mappentypen.editor.woran-erkennt')}
          optional
          hinweis={t('mappentypen.editor.woran-erkennt-hilfe', { anzahl: ERKENNBAR_AN_MAX - e.erkennbarAn.length })}
          id="typ-erkennbar"
          wert={e.erkennbarAn}
          placeholder={t('mappentypen.editor.woran-erkennt-beispiel')}
          teil="erkennbarAn"
          beschriftungen={e.beschriftungen}
          setzeWert={(erkennbarAn) => setE((x) => ({ ...x, erkennbarAn: erkennbarAn.slice(0, ERKENNBAR_AN_MAX) }))}
          setzeBeschriftungen={(b) => setE((x) => ({ ...x, beschriftungen: b as Beschriftungen<TypTeile> | undefined }))}
        />
      )}
      <ErkennungTyp
        ad={e.ausDokument}
        setze={(ausDokument) => setE((x) => ({ ...x, ausDokument }))}
        wiederfinden={e.felder.filter((f) => f.wiederfinden && WIEDERFINDEN_FELDTYPEN.includes(f.typ)).map((f) => f.label || f.key)}
        felder={e.felder.filter((f) => f.erkennung).map((f) => f.label || f.key)}
      />
      <ZuordnenWahl e={e} setE={setE} />
    </Bereich>
  );
}

/**
 * Post automatisch zuordnen (#337) – seit #1639 nur die Ausnahme: Ob Ablago von sich aus zuordnet, entscheidet „Was
 * Ablago darf“ für alle Mappentypen. „Wie in ‚Was Ablago darf‘“ (Standard) nennt die aktuelle Wahl in Worten; „Hier nie
 * automatisch zuordnen“ etwa für Verträge. Im Archivmodus nie (unverändert).
 */
function ZuordnenWahl({ e, setE }: Pick<Teil, 'e' | 'setE'>) {
  const [selbst, setSelbst] = useState<SelbstStufe | null>(null);
  useEffect(() => {
    betriebApi.darf().then(
      (d) => setSelbst(d.selbst),
      () => setSelbst(null),
    );
  }, []);
  const folgt = e.autoZuordnen && !e.archiv;
  const setze = (autoZuordnen: boolean) => setE((x) => ({ ...x, autoZuordnen }));
  return (
    <FeldGruppe beschriftung={t('mappentypen.editor.post-automatisch-zuordnen')}>
      <div className="feldstapel">
        <label className="haken">
          <input type="radio" name="post-zuordnen" checked={folgt} disabled={!!e.archiv} onChange={() => setze(true)} />
          <span>
            <span className="haken-titel">{t('mappentypen.editor.zuordnen.wie-darf')}</span>
            {selbst && (
              <small className="hilfe">
                {t('mappentypen.editor.zuordnen.zurzeit', { antwort: tx.frei(`werkbank.darf.selbst.${selbst}`) })}{' '}
                {selbst === 'alles' ? t('mappentypen.editor.zuordnen.alles') : t('mappentypen.editor.zuordnen.sonst')}
              </small>
            )}
          </span>
        </label>
        <label className="haken">
          <input type="radio" name="post-zuordnen" checked={!folgt} disabled={!!e.archiv} onChange={() => setze(false)} />
          <span>
            <span className="haken-titel">{t('mappentypen.editor.zuordnen.nie')}</span>
            <small className="hilfe">{t('mappentypen.editor.zuordnen.nie.text')}</small>
          </span>
        </label>
      </div>
      <p className="hilfe klein">
        {e.archiv ? (
          <>
            <Symbol name="schloss" /> {t('mappentypen.editor.im-archivmodus-nicht-moeglich')}
          </>
        ) : (
          <>
            {t('mappentypen.editor.zuordnen.hilfe')}{' '}
            <Link to="/werkbank#was-ablago-darf" className="verweis">
              {t('mappentypen.editor.zuordnen.zu-darf')}
            </Link>
            . {t('mappentypen.editor.sicher-heisst-absender-eindeutig')}
          </>
        )}
      </p>
    </FeldGruppe>
  );
}

/**
 * Archivmodus (#212): Frist, Stichtag; beim Einschalten Vorschau, beim Ausschalten Rückfrage. Mit Stichtag-FeldDef auch, was
 * gilt, wenn es leer ist (#1051): ab Anlagedatum (Vorgabe) oder „läuft noch nicht ab“ – die Vorschau nennt, wie viele
 * Mappen ein leeres FeldDef haben.
 */
function ArchivEinstellung({
  archiv,
  setze,
  datumsfelder,
  typId,
}: {
  archiv: Archiv | null;
  setze: (a: Archiv | null) => void;
  datumsfelder: Array<{ key: string; label: string }>;
  typId?: string;
}) {
  const [vorschau, setVorschau] = useState<{ mappen: number; darfWeg: number; stichtagLeer?: number } | null>(null);
  const feldName = datumsfelder.find((f) => f.key === archiv?.stichtag)?.label ?? archiv?.stichtag ?? '';
  const text = JSON.stringify(archiv);
  useEffect(() => {
    if (!archiv || !typId) {
      setVorschau(null);
      return;
    }
    let aktuell = true;
    dokumenteApi
      .archivVorschau(typId, archiv)
      .then((v) => aktuell && setVorschau(v))
      .catch(() => aktuell && setVorschau(null));
    return () => {
      aktuell = false;
    };
  }, [text, typId]); // eslint-disable-line react-hooks/exhaustive-deps -- Vorschau hängt am eingegebenen Text; archiv wird daraus abgeleitet
  const vorschlag = FRISTEN.some((f) => f.jahre === archiv?.jahre);
  return (
    <div className="stapel">
      <p className="leise">{t('mappentypen.editor.fuer-belege-mit-aufbewahrungspflicht')}</p>
      <HakenFeld beschriftung={t('mappentypen.editor.archivmodus-einschalten')} hinweis={t('mappentypen.editor.gilt-auch-fuer-vorhandene')}>
        <input
          type="checkbox"
          checked={!!archiv}
          onChange={abfangen(async (ev: ChangeEvent<HTMLInputElement>) => {
            if (ev.target.checked) setze({ jahre: 8, stichtag: datumsfelder[0]?.key ?? null });
            else if (
              await rueckfrage({
                titel: t('mappentypen.editor.archivmodus-ausschalten'),
                text: t('mappentypen.editor.danach-lassen-sich-mappen'),
                ja: t('mappentypen.editor.ausschalten'),
                gefahr: true,
              })
            )
              setze(null);
          })}
        />
      </HakenFeld>
      {archiv && (
        <>
          <div className="raster">
            <Feld beschriftung={t('mappentypen.editor.aufbewahrungsfrist')}>
              <select
                value={vorschlag ? String(archiv.jahre) : 'eigen'}
                onChange={(ev) => setze({ ...archiv, jahre: ev.target.value === 'eigen' ? 3 : Number(ev.target.value) })}>
                {FRISTEN.map((f) => (
                  <option key={f.jahre} value={f.jahre}>
                    {t('mappentypen.editor.jahre', { jahre: f.jahre, text: f.text })}
                  </option>
                ))}
                <option value="eigen">{t('mappentypen.editor.eigene-zahl')}</option>
              </select>
            </Feld>
            {!vorschlag && (
              <Feld beschriftung={t('mappentypen.editor.jahre-2')}>
                <input
                  type="number"
                  min={1}
                  max={JAHRE_MAX}
                  value={archiv.jahre}
                  onChange={(ev) => setze({ ...archiv, jahre: Math.max(1, Math.min(JAHRE_MAX, Math.trunc(Number(ev.target.value) || 1))) })}
                />
              </Feld>
            )}
            <Feld beschriftung={t('mappentypen.editor.stichtag')} hinweis={t('mappentypen.editor.frist-bis-ende-des')}>
              <select value={archiv.stichtag ?? ''} onChange={(ev) => setze(mitStichtag(archiv, ev.target.value || null))}>
                {datumsfelder.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
                <option value="">{t('mappentypen.editor.anlagedatum-der-mappe')}</option>
              </select>
            </Feld>
            {archiv.stichtag && <ArchivLeer archiv={archiv} feldName={feldName} setze={setze} />}
          </div>
          {vorschau && (
            <p className="hinweis info">
              {t('mappentypen.editor.mappen-sind-betroffen', {
                anzahl: vorschau.mappen,
                wert: vorschau.darfWeg ? t('mappentypen.editor.davon-waeren-schon-darf', { anzahl: vorschau.darfWeg }) : '',
              })}
              {archiv.stichtag && !!vorschau.stichtagLeer && (
                <>
                  {' '}
                  {archiv.leererStichtag === 'laeuftNicht'
                    ? t('mappentypen.editor.leer-anzahl-laeuft-nicht', { anzahl: vorschau.stichtagLeer, feld: feldName })
                    : t('mappentypen.editor.leer-anzahl-ab-anlage', { anzahl: vorschau.stichtagLeer, feld: feldName })}
                </>
              )}
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** Erkennung am Mappentyp (#391): Knopf „Aus Dokument ausfüllen“ mit eigener Beschriftung oder ausgeblendet. */
function ErkennungTyp({
  ad,
  setze,
  wiederfinden,
  felder,
}: {
  ad: AusDokument | null;
  setze: (a: AusDokument | null) => void;
  wiederfinden: string[];
  felder: string[];
}) {
  const an = !ad?.aus;
  // Erkennung (#511): eingebaut oder ein Paket mit dms:erkennen; leer = Standard aus der Werkbank.
  const [stand, setStand] = useState<ErkennungStand | null>(null);
  useEffect(() => {
    sucheApi.erkennungStand().then(setStand, () => setStand(null));
  }, []);
  // Ohne leere Angaben speichern: nichts gesetzt → null.
  const neu = (x: AusDokument) => {
    const o = Object.fromEntries(Object.entries(x).filter(([, v]) => v !== undefined && v !== '' && v !== false)) as AusDokument;
    return Object.keys(o).length ? o : null;
  };
  const engine = ad?.engine ?? '';
  const standardName = stand?.standard.paket
    ? (stand.pakete.find((p) => p.id === stand.standard.paket)?.name ?? stand.standard.paket)
    : tx('erkennung.typ.engine.eingebaut');
  async function waehle(wert: string) {
    const p = stand?.pakete.find((x) => x.id === wert);
    if (p?.netz && !(await abflussBestaetigen(p.name))) return;
    setze(neu({ ...ad, engine: wert || undefined, abfluss: p?.netz ? true : undefined }));
  }
  return (
    <div className="raster">
      <div className="eigenschaft unten">
        <HakenFeld
          beschriftung={t('mappentypen.editor.knopf-aus-dokument-ausfuellen')}
          hinweis={t('mappentypen.editor.in-jeder-mappe-dieses')}>
          <input type="checkbox" checked={an} onChange={(ev) => setze(neu({ ...ad, aus: ev.target.checked ? undefined : true }))} />
        </HakenFeld>
      </div>
      {an && (
        <Feld beschriftung={t('mappentypen.editor.beschriftung')} optional>
          <input
            id="typ-ad-beschriftung"
            maxLength={BESCHRIFTUNG_MAX}
            placeholder={t('mappentypen.editor.z-b-visitenkarte-scannen', { AUS_DOKUMENT_STANDARD })}
            value={ad?.beschriftung ?? ''}
            onChange={(ev) => setze(neu({ ...ad, beschriftung: ev.target.value || undefined }))}
          />
        </Feld>
      )}
      {an && stand && (stand.pakete.length > 0 || engine) && (
        <Feld beschriftung={tx('erkennung.typ.engine')} hinweis={tx('erkennung.typ.engine.hilfe')}>
          <select id="typ-ad-engine" value={engine} onChange={(ev) => void waehle(ev.target.value)}>
            <option value="">{tx('erkennung.typ.engine.standard', { name: standardName })}</option>
            <option value={ENGINE_EINGEBAUT}>{tx('erkennung.typ.engine.eingebaut')}</option>
            {stand.pakete.map((p) => (
              <option key={p.id} value={p.id}>
                {p.netz ? tx('erkennung.typ.engine.netz', { name: p.name }) : tx('erkennung.typ.engine.paket', { name: p.name })}
              </option>
            ))}
            {engine && engine !== ENGINE_EINGEBAUT && !stand.pakete.some((p) => p.id === engine) && (
              <option value={engine}>{engine}</option>
            )}
          </select>
        </Feld>
      )}
      <p className="leise klein" style={{ gridColumn: '1 / -1' }}>
        {felder.length
          ? t('mappentypen.editor.aus-dokument-fuellt', { felder: felder.join(', ') })
          : t('mappentypen.editor.kein-feld-aus-dokument')}
      </p>
      {/* Zum Wiederfinden (#938): woran Ablago vorhandene Mappen dieses Typs im Dokument wiederfindet. */}
      <p className="leise klein" style={{ gridColumn: '1 / -1' }}>
        {wiederfinden.length
          ? t('mappentypen.editor.wiederfinden-ueber', { felder: wiederfinden.join(', ') })
          : t('mappentypen.editor.kein-feld-wiederfinden')}
      </p>
    </div>
  );
}

/** Stempel beim Weitergeben (#394): je Mappentyp aus, als Vorschlag oder als Pflicht – mit Vorlage. */
function StempelEinstellung({ stempel, setze }: { stempel: StempelTyp | null; setze: (s: StempelTyp | null) => void }) {
  const vorlagen = useStempelVorlagen();
  const modus: StempelModus = stempel?.modus ?? 'aus';
  return (
    <div className="raster">
      <Feld beschriftung={t('mappentypen.editor.beim-herunterladen-exportieren-und')}>
        <select
          id="typ-stempel-modus"
          value={modus}
          onChange={(ev) => {
            const m = ev.target.value as StempelModus;
            setze(m === 'aus' ? null : { modus: m, vorlage: stempel?.vorlage ?? vorlagen?.[0]?.id ?? null });
          }}>
          {Object.entries(STEMPEL_MODI).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </Feld>
      {stempel && (
        <Feld
          beschriftung={t('mappentypen.editor.vorlage-2')}
          hinweis={
            <>
              <Link to="/werkbank/stempel" className="verweis">
                {t('mappentypen.editor.vorlagen-bearbeiten')}
              </Link>
            </>
          }>
          <select
            id="typ-stempel-vorlage"
            value={stempel.vorlage ?? ''}
            onChange={(ev) => setze({ ...stempel, vorlage: ev.target.value || null })}>
            {!vorlagen?.some((v) => v.id === stempel.vorlage) && (
              <option value={stempel.vorlage ?? ''}>
                {stempel.vorlage ? t('mappentypen.editor.unbekannte-vorlage') : t('mappentypen.editor.stempel-standard')}
              </option>
            )}
            {(vorlagen ?? []).map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} – {v.text.split('\n').join(' / ')}
              </option>
            ))}
          </select>
        </Feld>
      )}
      <p className="leise klein" style={{ gridColumn: '1 / -1' }}>
        {modus === 'pflicht'
          ? t('mappentypen.editor.pflicht-dokumente-dieses-mappentyps')
          : modus === 'vorschlag'
            ? t('mappentypen.editor.vorschlag-beim-weitergeben-ist')
            : t('mappentypen.editor.kein-stempel-vorgegeben-benutzer')}
      </p>
    </div>
  );
}
