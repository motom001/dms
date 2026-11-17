import type { ReactNode } from 'react';
import type { ExternZustand, SicherungStand } from '../../api/betrieb';
import { t, tn } from '../../sprache';
import { Hilfe } from '../../Hilfe';
import { Link } from '../../ort';
import { gebietsschema } from '../../../../shared/src/sprache';
import { bytes, externText, zeit, zielName } from '../sicherungFormat';
import { TAGE } from './hilfen';

/* ---------- Sicherung außer Haus (#585) ---------- */

/** Abschnitt „Außer Haus“: Ziele (Pakete), letzte Kopie; ohne Paket ein Hinweis auf die Möglichkeiten. Das Handbuch nur über das Hilfesymbol (#1193). */
export function AusserHaus({ x }: { x: ExternZustand | null | undefined }) {
  return (
    <section className="blatt" id="ausser-haus">
      <h2 className="h3">
        {t('werkbank.sicherung.extern.titel')} <Hilfe ort="sicherung.extern" />
      </h2>
      {!x?.ziele.length ? (
        <p className="leise">
          {t('werkbank.sicherung.extern.ohne')}{' '}
          <Link to="/werkbank/pakete" className="verweis">
            {t('werkbank.sicherung.extern.pakete')}
          </Link>
        </p>
      ) : (
        <>
          <dl className="eigenschaften">
            {x.ziele.flatMap((z) => [
              <dt key={`n${z.id}`}>{z.name}</dt>,
              <dd key={`a${z.id}`} className="mono">
                {z.adresse ?? z.ziel ?? '–'}
              </dd>,
            ])}
            <dt>{t('werkbank.sicherung.extern.letzte')}</dt>
            <dd>
              {x.letzte ? (
                <>
                  {t('werkbank.sicherung.extern.letzte.wert', { datum: zeit(x.letzte.beginn) })} · {zielName(x, x.letzte.paket)} ·{' '}
                  {externText(x.letzte.stand)}
                  {x.letzte.entfernt && <span className="leise"> ({t('werkbank.sicherung.extern.letzte.entfernt')})</span>}
                </>
              ) : (
                <span className="leise">{t('werkbank.sicherung.extern.letzte.keine')}</span>
              )}
            </dd>
          </dl>
          <p className="leise klein">{t('werkbank.sicherung.extern.erklaerung')}</p>
        </>
      )}
    </section>
  );
}

/** Stand in einer Zeile (#366: früher die mittlere Spalte). */
/** Ohne Notfallblatt (#1193): Das gehört zur Verschlüsselung; fehlt es oder gilt nicht mehr, warnt `sicherungsHinweise`. */
export function StandZeile({ s }: { s: SicherungStand }) {
  const z = s.zustand;
  const teile: ReactNode[] = [
    <>
      {tn('werkbank.sicherung.letzte-sicherung', {
        wert: z.letzte ? zeit(z.letzte.ende) : t('werkbank.sicherung.noch-keine'),
        wert2: (z.fehler || z.zuAlt) && (
          <span className="fehlertext"> ({z.fehler ? t('werkbank.sicherung.fehlgeschlagen') : t('werkbank.sicherung.zu-alt')})</span>
        ),
      })}
    </>,
    t('werkbank.sicherung.sicherungen', { anzahl: s.liste.length, bytes: bytes(s.speicher.sicherungenBytes) }),
    s.plan.aktiv
      ? t('werkbank.sicherung.naechste-uhr', {
          wert: s.plan.haeufigkeit === 'taeglich' ? t('werkbank.sicherung.taeglich') : TAGE[s.plan.wochentag],
          uhrzeit: s.plan.uhrzeit,
        })
      : t('werkbank.sicherung.zeitplan-aus'),
    <>
      {s.speicher.frei === null
        ? t('werkbank.sicherung.platz-nicht-feststellbar')
        : t('werkbank.sicherung.frei', { bytes: bytes(s.speicher.frei) })}
      {s.speicher.knapp && <span className="fehlertext"> {t('werkbank.sicherung.knapp')}</span>}
    </>,
    ...(z.extern?.ziele.length
      ? [
          <>
            {z.extern.letzte
              ? t('werkbank.sicherung.extern.zeile', { datum: zeit(z.extern.letzte.stand.am) })
              : t('werkbank.sicherung.extern.zeile.keine')}
            {(z.extern.fehler || z.extern.zuAlt) && (
              <span className="fehlertext">
                {' '}
                ({z.extern.fehler ? t('werkbank.sicherung.extern.kurz.fehler') : t('werkbank.sicherung.extern.kurz.alt')})
              </span>
            )}
          </>,
        ]
      : []),
  ];
  return (
    <p className="klein standzeile">
      {teile.map((x, i) => (
        <span key={i}>
          {i > 0 && ' · '}
          {x}
        </span>
      ))}
    </p>
  );
}

/** Speicherplatz: heute, Hochrechnung, belegt, frei; Warnung, wenn es knapp wird. */
export function Speicherplatz({ s }: { s: SicherungStand }) {
  return (
    <section className="blatt" id="speicher">
      <h2 className="h3">
        {t('werkbank.sicherung.speicherplatz')} <Hilfe ort="sicherung.speicher" />
      </h2>
      <dl className="eigenschaften">
        <dt>{t('werkbank.sicherung.dokumente-und-dateien-heute')}</dt>
        <dd>
          {t('werkbank.sicherung.dateien', {
            bytes: bytes(s.speicher.dateienBytes),
            dateien: s.speicher.dateien.toLocaleString(gebietsschema()),
          })}
        </dd>
        <dt>{t('werkbank.sicherung.datenbank-heute')}</dt>
        <dd>{bytes(s.speicher.datenbankBytes)}</dd>
        <dt>{t('werkbank.sicherung.hochrechnung')}</dt>
        <dd>
          {tn('werkbank.sicherung.bis-zu-sicherungen', {
            stueck: s.speicher.hochrechnung.stueck,
            bytes: bytes(s.speicher.hochrechnung.bytes),
            span: <span className="leise klein">{t('werkbank.sicherung.jede-ist-vollstaendig-die')}</span>,
          })}
        </dd>
        <dt>{t('werkbank.sicherung.belegt-durch-sicherungen')}</dt>
        <dd>{t('werkbank.sicherung.in-sicherungen', { anzahl: s.speicher.anzahl, bytes: bytes(s.speicher.sicherungenBytes) })}</dd>
        <dt>{t('werkbank.sicherung.frei-im-sicherungsordner')}</dt>
        <dd>
          {s.speicher.frei === null
            ? t('werkbank.sicherung.nicht-feststellbar')
            : `${bytes(s.speicher.frei)}${s.speicher.gesamt ? t('werkbank.sicherung.von', { bytes: bytes(s.speicher.gesamt) }) : ''}`}
        </dd>
      </dl>
      {s.speicher.knapp && (
        <div className="hinweis warn">
          <p>
            {tn('werkbank.sicherung.weniger-frei-als-verringere', {
              b: <strong>{t('werkbank.sicherung.der-platz-wird-knapp')}</strong>,
              wert:
                s.speicher.frei !== null && s.speicher.frei < s.speicher.mindestBytes
                  ? t('werkbank.sicherung.der-eingestellte-mindest')
                  : t('werkbank.sicherung.zwei-weitere-sicherungen-brauchen'),
            })}
          </p>
        </div>
      )}
    </section>
  );
}

/** Speicherort: Ordner, eigenes Volume, andere Platte – mit Faustregel 3-2-1. */
export function Speicherort({ s }: { s: SicherungStand }) {
  return (
    <section className="blatt" id="ort">
      <h2 className="h3">
        {t('werkbank.sicherung.speicherort')} <Hilfe ort="sicherung.ort" />
      </h2>
      <dl className="eigenschaften">
        <dt>{t('werkbank.sicherung.ordner')}</dt>
        <dd className="mono">{s.zustand.ort.ordner}</dd>
        <dt>{t('werkbank.sicherung.eigenes-volume')}</dt>
        <dd>
          {s.zustand.ort.volume === null
            ? t('werkbank.sicherung.nicht-feststellbar')
            : s.zustand.ort.volume
              ? t('werkbank.sicherung.ja')
              : t('werkbank.sicherung.nein')}
        </dd>
        <dt>{t('werkbank.sicherung.andere-platte-als-die')}</dt>
        <dd>
          {s.zustand.ort.gleichePlatte === null
            ? t('werkbank.sicherung.nicht-feststellbar')
            : s.zustand.ort.gleichePlatte
              ? t('werkbank.sicherung.nein-dieselbe-platte')
              : t('werkbank.sicherung.ja')}
        </dd>
      </dl>
      <p className="leise klein">{t('werkbank.sicherung.faustregel-3-2-1')}</p>
    </section>
  );
}
