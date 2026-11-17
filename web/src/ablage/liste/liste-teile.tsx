/** Teile einer Mappenliste (#1279): Dialoge, „Meintest du …?“, Leiste der Auswahl, Ergebnis und der Rumpf mit den Einträgen. */
import type { ReactNode } from 'react';
import { aufbewahrenBis, datumText, gesperrt, stichtagName } from '../../../../shared/src/archiv';
import type { Mappe } from '../../../../shared/src/model';
import type { GefahrRueckfrage } from '../../bausteine';
import { Knopf, Schalter } from '../../bausteine';
import { mappenApi } from '../../api/mappen';
import { geheZu, Link } from '../../ort';
import { Ehemalig } from '../../Person';
import { titelOder } from '../../seiten';
import { t, tn } from '../../sprache';
import { AehnlicheTreffer } from '../Aehnlich';
import { EmailMehrere } from '../EmailMehrere';
import { ExportDialog } from '../Export';
import { kopfsuche } from '../kopfsuche';
import { Stern } from '../Stern';
import { UnscharfHinweis } from '../Unscharf';
import type { Auswahl } from './auswahl';
import { kompakt, zahl } from './hilfen';
import { loescheAuswahl, type Ergebnis } from './liste-hooks';
import type { ListeKern } from './liste-kern';
import { Tabelle } from './Tabelle';
import { Fundstelle, GeaendertPunkt, Unter, Zeilenhaken } from './teile';

/** Exportieren (#153) und „Per E-Mail“ (#151) für die Auswahl. */
export function Dialoge({ l }: { l: ListeKern }) {
  const { p, wahl, s } = l;
  return (
    <>
      {l.exportOffen && (
        <ExportDialog
          sicht={p.sicht}
          link={p.link}
          ids={wahl?.gewaehlt.size ? [...wahl.gewaehlt] : null}
          anzahl={wahl?.gewaehlt.size ?? 0}
          gesamt={s.gesamt ?? 0}
          suche={l.suche}
          volltext={l.volltext}
          notizen={l.inNotizen}
          sortierung={l.sortierung}
          fertig={(meldung) => {
            l.setExportOffen(false);
            if (meldung) l.setErgebnis({ text: meldung, liste: [] });
          }}
        />
      )}
      {l.emailOffen && wahl && wahl.gewaehlt.size > 0 && (
        <EmailMehrere
          ids={[...wahl.gewaehlt]}
          fertig={(meldung) => {
            l.setEmailOffen(false);
            if (meldung) l.setErgebnis({ text: meldung, liste: [] });
          }}
        />
      )}
    </>
  );
}

/** Unscharfe Suche (#356): ohne genauen Treffer ähnliche Schreibweisen, „Meintest du …?“ sucht genau das Wort. */
export function Unscharf({ l }: { l: ListeKern }) {
  const { p, s, suche } = l;
  if (!s.unscharf) return null;
  return (
    <UnscharfHinweis
      u={s.unscharf}
      suchen={(x) => {
        if (suche || !p.link) {
          kopfsuche.setzeText(x);
          return;
        }
        const q = new URLSearchParams(p.link);
        q.set('volltext', x);
        geheZu(`/ablage/${p.sicht}${p.offen ? `/${p.offen}` : ''}?${q.toString()}`);
      }}
    />
  );
}

/** Rückfrage des Gefahr-Knopfs (#1212) mit den Zahlen der Probe – oder gesperrt, wenn sich nichts löschen lässt. */
function loeschAngaben(l: ListeKern) {
  const { probe, gewaehltText, korb } = l;
  const loeschFrage: GefahrRueckfrage =
    probe && probe.ids === gewaehltText && probe.mappen
      ? {
          titel: t('ablage.ablage.mappen-3', {
            anzahl: probe.mappen,
            zahl: zahl(probe.mappen),
            wert: probe.dokumente ? t('ablage.ablage.mit-dokumenten', { anzahl: probe.dokumente, zahl: zahl(probe.dokumente) }) : '',
            wert2: korb ? t('ablage.ablage.in-den-papierkorb-legen') : t('ablage.ablage.endgueltig-loeschen'),
          }),
          text: [
            korb ? t('ablage.ablage.dort-lassen-sie-sich') : t('ablage.ablage.das-laesst-sich-nicht'),
            probe.ausgelassen.length
              ? t('ablage.ablage.mappen-werden-ausgelassen-kein', {
                  anzahl: probe.ausgelassen.length,
                  zahl: zahl(probe.ausgelassen.length),
                })
              : '',
          ]
            .filter(Boolean)
            .join('\n\n'),
          ja: korb ? t('ablage.ablage.in-den-papierkorb') : t('ablage.ablage.endgueltig-loeschen-2'),
          mitGrund: true,
        }
      : { titel: t('ablage.ablage.loeschen-auswahl'), ja: t('ablage.ablage.loeschen'), mitGrund: true };
  const loeschSperre =
    probe && probe.ids === gewaehltText && !probe.mappen
      ? {
          grund: t('ablage.ablage.keine-loeschbar'),
          eintraege: probe.ausgelassen.slice(0, 8).map((x) => (
            <>
              {titelOder(x.titel)}: {x.grund}
            </>
          )),
          weitere: Math.max(0, probe.ausgelassen.length - 8),
        }
      : null;
  return { loeschFrage, loeschSperre };
}

/** Leiste der Auswahl (#149): „Alle … auswählen“, Exportieren, Per E-Mail, Löschen, Auswahl aufheben. */
export function Aktionsleiste({ l, wahl }: { l: ListeKern; wahl: Auswahl }) {
  const { p, s } = l;
  const { loeschFrage, loeschSperre } = loeschAngaben(l);
  const anhang = l.anhang;
  return (
    <div className="aktionsleiste" role="region" aria-label={t('ablage.ablage.auswahl')}>
      <span className="klein">
        {tn('ablage.ablage.von-ausgewaehlt', { b: <strong>{zahl(wahl.gewaehlt.size)}</strong>, zahl: zahl(s.gesamt ?? 0) })}
      </span>
      {!wahl.alle && (s.gesamt ?? 0) > wahl.gewaehlt.size && (
        <Knopf groesse="klein" onClick={() => l.alleWaehlen()}>
          {t('ablage.ablage.alle-auswaehlen', { zahl: zahl(s.gesamt ?? 0) })}
        </Knopf>
      )}
      <span className="luecke" aria-hidden="true" />
      {p.export && (
        <Knopf groesse="klein" symbol="herunterladen" onClick={() => l.setExportOffen(true)}>
          {t('ablage.ablage.exportieren')}
        </Knopf>
      )}
      {p.export && (
        <Knopf
          groesse="klein"
          symbol="email"
          onClick={() => {
            l.setExportOffen(false);
            l.setEmailOffen(true);
          }}>
          {t('ablage.ablage.per-e-mail')}
        </Knopf>
      )}
      {/* Gefahr leise mit Mülleimer (Leitsatz 4), Rückfrage mit Grund (#470) – rot gefüllt nur dort. */}
      <Knopf
        art="gefahr"
        groesse="klein"
        symbol="geloescht"
        rueckfrage={loeschFrage}
        gesperrt={loeschSperre}
        onClick={(_e, anlass) => loescheAuswahl({ p, w: l.w, d: l.d, korb: l.korb, anhang, setErgebnis: l.setErgebnis }, anlass)}>
        {t('ablage.ablage.loeschen-auswahl')}
      </Knopf>
      <Knopf groesse="klein" onClick={wahl.leeren}>
        {t('ablage.ablage.auswahl-aufheben')}
      </Knopf>
    </div>
  );
}

export function ErgebnisHinweis({ ergebnis, schliessen }: { ergebnis: Ergebnis; schliessen(): void }) {
  return (
    <div className={`hinweis ${ergebnis.liste.length ? 'warn' : 'info'}`} role="status">
      <p>{ergebnis.text}</p>
      {ergebnis.liste.length > 0 && (
        <ul className="klein">
          {ergebnis.liste.slice(0, 50).map((x) => (
            <li key={x.id}>
              {titelOder(x.titel)}: {x.grund}
            </li>
          ))}
          {ergebnis.liste.length > 50 && <li>{t('ablage.ablage.und-weitere', { zahl: zahl(ergebnis.liste.length - 50) })}</li>}
        </ul>
      )}
      <Knopf groesse="klein" onClick={schliessen}>
        {t('ablage.ablage.ausblenden')}
      </Knopf>
    </div>
  );
}

/** Archivmodus (#212): Hinweis, solange die Frist läuft – oder noch nicht begonnen hat (#1051). */
function ArchivChip({ l, m }: { l: ListeKern; m: Mappe }) {
  const typ = l.d.typ(m.typId);
  if (m.verborgen || !typ?.archiv || !gesperrt(typ.archiv, m)) return null;
  return (
    <>
      {' '}
      <span
        className="chip archiv klein"
        title={
          aufbewahrenBis(typ.archiv, m)
            ? t('ablage.ablage.archiv-aufbewahren-bis', { datumText: datumText(aufbewahrenBis(typ.archiv, m)!) })
            : t('ablage.ablage.archiv-frist-beginnt-mit', { feld: stichtagName(typ) })
        }>
        {t('ablage.ablage.archiv')}
      </span>
    </>
  );
}

/** Favorit = Abo (#422): je Favorit „bei Änderungen benachrichtigen“ – nur in der Favoritenliste; Ein/Aus als Schalter (#1188). */
function AboSchalter({ l, m }: { l: ListeKern; m: Mappe }) {
  const { p, s, d } = l;
  if (!(
    (p.sicht === 'favoriten' || !!d.sicht(p.sicht)?.bedingungen.some((x) => x.art === 'favorit')) &&
    !m.verborgen &&
    l.favoritenBenachrichtigung
  ))
    return null;
  return (
    <Schalter
      className="abo-schalter"
      an={!s.stumm.has(m.id)}
      beschriftung={t('ablage.ablage.benachrichtigen')}
      setze={(an) => {
        s.setzeStumm(m.id, !an);
        return mappenApi.favoritBenachrichtigen(m.id, an).catch((x) => {
          s.setzeStumm(m.id, an);
          throw x;
        });
      }}
    />
  );
}

/** Ein kompakter Eintrag (schmale Liste): Haken, Stern, Titel mit Nebenzeile, Fundstelle, Aufgabe oder Problem. */
function MappenEintrag({ l, m, i }: { l: ListeKern; m: Mappe; i: number }) {
  const { p, s, d, wahl, anhang } = l;
  const typ = d.typ(m.typId);
  const k = kompakt(m, { liste: p.listenSpalten ?? [], einTyp: !!p.typ, typ, bezuege: s.bezuege, person: d.person });
  return (
    <li
      className={`mit-stern${wahl ? ' mit-haken' : ''}${wahl?.gewaehlt.has(m.id) ? ' gewaehlt' : ''}${s.geaendert.has(m.id) ? ' abo-geaendert' : ''}`}
      {...(wahl && !m.verborgen ? wahl.druck(i) : {})}>
      {wahl && !m.verborgen && (
        <Zeilenhaken an={wahl.gewaehlt.has(m.id)} titel={k.titel} waehle={(an, bereich) => wahl.waehle(i, an, bereich)} />
      )}
      {m.verborgen ? <span /> : <Stern mappeId={m.id} an={s.favoriten.has(m.id)} titel={k.titel} />}
      <Link to={`/ablage/${p.sicht}/${m.id}${anhang}`} className={`eintrag ${p.offen === m.id ? 'an' : ''}`}>
        <span className={`titel ${m.verborgen ? 'verborgen-titel' : ''}`}>
          {s.geaendert.has(m.id) && <GeaendertPunkt />}
          {m.verborgen ? t('ablage.ablage.nicht-sichtbare-mappe') : <Ehemalig id={m.id}>{k.titel}</Ehemalig>}
          <ArchivChip l={l} m={m} />
        </span>
        <Unter text={k.unter} />
        {s.ausschnitte[m.id] && <Fundstelle a={s.ausschnitte[m.id]} />}
        {p.sicht === 'eingang' && s.aufgaben[m.id] ? (
          <span className="problem">{s.aufgaben[m.id]}</span>
        ) : (
          m.passt === false && <span className="problem">{p.typ ? t('ablage.ablage.passt-nicht-zur-definition') : m.problem}</span>
        )}
      </Link>
      <AboSchalter l={l} m={m} />
    </li>
  );
}

/** Die Einträge: leer, als Tabelle (breit) oder kompakt; „Weitere laden“ am Ende, ähnliche Treffer in der Suche. */
export function Rumpf({ l }: { l: ListeKern }) {
  const { p, s, wahl } = l;
  const nachladen: ReactNode =
    !s.alle && (s.laedt ? t('ablage.ablage.lade') : <Knopf onClick={s.mehr}>{t('ablage.ablage.weitere-laden')}</Knopf>);
  const setzeEnde = (el: HTMLElement | null) => {
    l.ende.current = el;
  };
  return (
    <div className={`listenrumpf${wahl?.gewaehlt.size ? ' mit-auswahl' : ''}`}>
      {s.gesamt === 0 ? (
        <p className="leise leerliste">{l.suche && p.sicht !== 'suche' ? t('ablage.ablage.nichts-gefunden') : p.leerText}</p>
      ) : l.tabelle ? (
        <Tabelle
          sicht={p.sicht}
          anhang={l.anhang}
          typ={p.typ}
          spaltenTyp={p.spaltenTyp}
          spalten={l.spalten}
          mappen={s.mappen}
          bezuege={s.bezuege}
          ausschnitte={s.ausschnitte}
          aufgaben={s.aufgaben}
          favoriten={s.favoriten}
          geaendert={s.geaendert}
          offen={p.offen}
          wahl={wahl}
          sortierung={l.sortierung}
          sortiere={l.sortiere}
          ende={nachladen ? setzeEnde : undefined}
          nachladen={nachladen}
        />
      ) : (
        <ul className="mappenliste">
          {s.mappen.map((m, i) => (
            <MappenEintrag key={m.id} l={l} m={m} i={i} />
          ))}
          {nachladen && (
            <li ref={setzeEnde} className="nachladen leise klein">
              {nachladen}
            </li>
          )}
        </ul>
      )}
      {p.sicht === 'suche' && <AehnlicheTreffer liste={s.aehnlich} sicht={p.sicht} anhang={l.anhang} />}
    </div>
  );
}
