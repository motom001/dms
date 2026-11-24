import type { ReactNode } from 'react';
import { feldLabel, optionText } from '../../../../shared/src/beschriftung';
import { eingabemodus, formatFehler } from '../../../../shared/src/feldformate';
import { betragZahl, leseZahl, zieleVon, type Feld as FeldDef, type Mappentyp, type Wert, type Werte } from '../../../../shared/src/model';
import type { Bezuege } from '../../api/mappen';
import { vorbelegungAus } from '../../../../shared/src/sichten';
import { DatumEingabe, Feld, FeldGruppe, ProzentEingabe, ZeitraumEingabe, type FeldProps } from '../../bausteine';
import { t } from '../../sprache';
import { leeresPasswort, type Roh, type RohBetrag, type RohPasswort, type RohZeitraum } from '../../werte';
import { FormatiertEingabe } from '../Formatiert';
import { FormatLink } from './feld-teile';
import { MappenWahlKern, type NeuesFormular } from './MappenWahl';
import { PasswortEingabe } from './PasswortEingabe';

export interface FeldEingabeProps {
  feld: FeldDef;
  roh: Roh | undefined;
  fehler?: string;
  setze: (v: Roh) => void;
  eigeneId?: string;
  /** Gespeicherter Wert (#732): Übersetzt wird immer nur er, nie die Eingabe. */
  gespeichert?: Wert;
  /** Format PLZ (#535): gilt die deutsche Regel? Dann am Handy die Zifferntastatur. */
  plzDeutsch?: boolean;
  /** Unter dem Feld, z. B. ein Vorschlag aus „Aus Dokument ausfüllen“ (#391). */
  zusatz?: ReactNode;
  /** Typ der Mappe und Verweise, die nicht (mehr) zum Auswahlfilter passen (#172); Felder des Typs für den Grund (#887). */
  typId?: string;
  typFelder?: FeldDef[];
  unpassend?: string[];
  /** Je unpassender Mappe die eigenen Felder, mit denen sie nicht zusammenpasst (#887). */
  gruende?: Record<string, string[]>;
  /** Erkannte Angaben für eine neue Mappe des Zieltyps (#935): füllen das Fenster „+ … anlegen“ vor. */
  neu?: Record<string, unknown>;
  /** Werte dieser Mappe, von denen der Auswahlfilter abhängt (#173). */
  eigene?: Werte;
  bekannt: Bezuege;
  merke: (id: string, b: { titel: string; typId: string }) => void;
  /** Grund, warum das Feld hier nur angezeigt wird. */
  gesperrt?: string;
  /** Berechtigungen (#126): ohne „Bearbeiten“ bzw. ohne „Passwörter sehen“. */
  nurLesen?: boolean;
  passwortSehen?: boolean;
  /** Fenster „+ … anlegen“ am Verweisfeld (#935): das Formular der neuen Mappe. */
  neuesFormular: NeuesFormular;
}

/** Was jede Eingabe braucht: den Feldrahmen, was darunter steht, die Id der Eingabe und die Typen der Ablage. */
interface Rahmen {
  rahmen: Omit<FeldProps, 'children'>;
  unter: ReactNode;
  id: string;
  typ(id: string | undefined): Mappentyp | undefined;
}

/** Die Eingabe je Feldart; `breit` für lange und formatierte Texte. */
export function eingabe(p: FeldEingabeProps, r: Rahmen): { ctl: ReactNode; breit: boolean } {
  const { feld: f, roh, setze } = p;
  const { rahmen, unter, id } = r;
  switch (f.typ) {
    case 'langtext':
      return {
        breit: true,
        ctl: (
          <Feld {...rahmen}>
            {(v) => (
              <>
                <textarea {...v} rows={3} value={String(roh ?? '')} onChange={(e) => setze(e.target.value)} />
                {unter}
              </>
            )}
          </Feld>
        ),
      };
    case 'zahl':
    case 'prozent':
    case 'zeitraum':
    case 'datum':
    case 'janein':
      return { breit: false, ctl: einfacheEingabe(p, r) };
    case 'betrag':
      return { breit: false, ctl: betragEingabe(p, r) };
    case 'auswahl':
      return { breit: false, ctl: auswahlEingabe(p, r) };
    case 'referenz':
      return { breit: false, ctl: verweisEingabe(p, r) };
    case 'formatiert':
      return { breit: true, ctl: <FormatiertEingabe id={id} wert={String(roh ?? '')} setze={setze} rahmen={rahmen} unter={unter} /> };
    case 'passwort':
      return {
        breit: false,
        ctl: (
          <PasswortEingabe
            rahmen={rahmen}
            unter={unter}
            feld={f}
            roh={(roh ?? leeresPasswort) as RohPasswort}
            setze={setze}
            mappeId={p.eigeneId}
            nurLesen={p.nurLesen}
            sehen={p.passwortSehen ?? true}
          />
        ),
      };
    default:
      return { breit: false, ctl: textEingabe(p, r) };
  }
}

/** Zahl, Prozent, Zeitraum, Datum und Ja/Nein: eine Eingabe im Feldrahmen. */
function einfacheEingabe({ feld: f, roh, setze }: FeldEingabeProps, { rahmen, unter }: Rahmen) {
  return (
    <Feld {...rahmen}>
      {(v) => (
        <>
          {f.typ === 'zahl' && <input {...v} inputMode="decimal" value={String(roh ?? '')} onChange={(e) => setze(e.target.value)} />}
          {/* Prozent (#1035): „19“, „19 %“ und „19,0“ ergeben dasselbe. */}
          {f.typ === 'prozent' && <ProzentEingabe id={v.id} wert={String(roh ?? '')} setze={setze} aria-invalid={v['aria-invalid']} />}
          {/* Zeitraum (#1035): Zahl und Einheit, „1 Monat“ / „3 Monate“. */}
          {f.typ === 'zeitraum' && (
            <ZeitraumEingabe
              id={v.id}
              wert={(roh ?? { anzahl: '', einheit: 'monate' }) as RohZeitraum}
              setze={setze}
              aria-invalid={v['aria-invalid']}
            />
          )}
          {/* Datum (#1496): Kalender mit Kalenderwochen, Tippen bleibt direkt. */}
          {f.typ === 'datum' && <DatumEingabe {...v} wert={String(roh ?? '')} setze={setze} />}
          {f.typ === 'janein' && (
            <label className="haken">
              <input {...v} type="checkbox" checked={!!roh} onChange={(e) => setze(e.target.checked)} />
              <span>{t('ablage.mappeformular.ja')}</span>
            </label>
          )}
          {unter}
        </>
      )}
    </Feld>
  );
}

function betragEingabe({ roh, setze }: FeldEingabeProps, { rahmen, unter }: Rahmen) {
  const b = (roh ?? { betrag: '', waehrung: 'EUR' }) as RohBetrag;
  return (
    <Feld {...rahmen}>
      {(v) => (
        <>
          <div className="betrag">
            <input
              {...v}
              inputMode="decimal"
              // Leer (#1493): immer „0,00“ – ein Minus sähe aus wie ein schon eingetragener Wert; „nur negativ“ sagt der Hinweis.
              placeholder="0,00"
              value={b.betrag}
              onChange={(e) => setze({ ...b, betrag: e.target.value })}
              onBlur={() => {
                // Nach dem Verlassen mit den Nachkommastellen der Währung (#1608): „12,5“ wird „12,50“.
                const n = leseZahl(b.betrag);
                const schoen = n != null && Number.isFinite(n) ? betragZahl(n, b.waehrung) : b.betrag;
                if (schoen !== b.betrag) setze({ ...b, betrag: schoen });
              }}
            />
            <input
              aria-label={t('ablage.mappeformular.waehrung')}
              className="mono"
              maxLength={3}
              value={b.waehrung}
              onChange={(e) => setze({ ...b, waehrung: e.target.value.toUpperCase() })}
            />
          </div>
          {unter}
        </>
      )}
    </Feld>
  );
}

function auswahlEingabe({ feld: f, roh, setze }: FeldEingabeProps, { rahmen, unter }: Rahmen) {
  const optionen = f.optionen ?? [];
  if (f.mehrfach) {
    const gewaehlt = (roh as string[]) ?? [];
    return (
      <FeldGruppe {...rahmen}>
        <div className="auswahlliste">
          {optionen.map((o) => (
            <label key={o} className="haken">
              <input
                type="checkbox"
                checked={gewaehlt.includes(o)}
                onChange={(e) => setze(e.target.checked ? [...gewaehlt, o] : gewaehlt.filter((x) => x !== o))}
              />
              <span>{optionText(f, o)}</span>
            </label>
          ))}
        </div>
        {unter}
      </FeldGruppe>
    );
  }
  const r = String(roh ?? '');
  return (
    <Feld {...rahmen}>
      {(v) => (
        <>
          <select {...v} value={r} onChange={(e) => setze(e.target.value)}>
            <option value="">{t('ablage.mappeformular.keine-angabe')}</option>
            {/* Gespeichert wird der feste Wert, gezeigt die Beschriftung (#728). */}
            {optionen.map((o) => (
              <option key={o} value={o}>
                {optionText(f, o)}
              </option>
            ))}
            {r && !optionen.includes(r) && <option value={r}>{r}</option>}
          </select>
          {unter}
        </>
      )}
    </Feld>
  );
}

function verweisEingabe(p: FeldEingabeProps, { rahmen, unter, typ }: Rahmen) {
  const { feld: f, typId, typFelder = [] } = p;
  // Mehrere Zieltypen (#1036): alle, die die Person kennt; nur aus Paketen ohne installierten Zieltyp: Hinweis.
  const ziele = zieleVon(f)
    .map((z) => typ(z))
    .filter((x): x is Mappentyp => !!x);
  const ziel = ziele[0];
  if (!ziel)
    return (
      <FeldGruppe {...rahmen}>
        <p className="leise">
          {f.zielOptional?.length && !zieleVon(f).length
            ? t('felder.verweis.noch-kein-ziel')
            : t('ablage.mappeformular.der-ziel-mappentyp-existiert')}
        </p>
      </FeldGruppe>
    );
  return (
    <Feld {...rahmen}>
      {(v) => (
        <>
          <MappenWahlKern
            id={v.id}
            ziel={ziel}
            ziele={ziele}
            gleicherTyp={!!f.gleicherTyp}
            mehrfach={!!f.mehrfach}
            wert={p.roh as string | string[] | undefined}
            eigeneId={p.eigeneId}
            bekannt={p.bekannt}
            merke={p.merke}
            setze={p.setze}
            sicht={(f.auswahlFilter?.length || ziele.length > 1) && typId ? `feld:${typId}:${f.key}` : undefined}
            pruefen={
              typId && (f.auswahlFilter?.length || typFelder.some((x) => x.folgtAus?.feld === f.key))
                ? { typId, feldKey: f.key }
                : undefined
            }
            vorbelegen={{ ...p.neu, ...(f.auswahlFilter?.length ? vorbelegungAus(f.auswahlFilter, ziel) : {}) }}
            unpassend={p.unpassend}
            gruende={p.gruende}
            eigene={p.eigene}
            typFelder={typFelder}
            neuesFormular={p.neuesFormular}
            feldName={feldLabel(f)}
          />
          {unter}
        </>
      )}
    </Feld>
  );
}

/** Text (auch mit Format): E-Mail, Telefon, Internetseite (#535) daneben direkt antippen, sobald die Angabe passt. */
function textEingabe({ feld: f, roh, setze, plzDeutsch }: FeldEingabeProps, { rahmen, unter }: Rahmen) {
  const w = String(roh ?? '').trim();
  const link =
    (f.format === 'email' || f.format === 'telefon' || f.format === 'internetseite') &&
    w &&
    !formatFehler(f, w, { felder: [], werte: {} }) ? (
      <FormatLink f={f} wert={w} nurSymbol />
    ) : null;
  return (
    <Feld {...rahmen}>
      {(v) => (
        <>
          <div className="ff-eingabe">
            <input
              {...v}
              value={String(roh ?? '')}
              onChange={(e) => setze(e.target.value)}
              inputMode={eingabemodus(f, plzDeutsch)}
              {...(f.format === 'iban'
                ? { autoCapitalize: 'characters', spellCheck: false }
                : f.format
                  ? { autoCapitalize: 'off', autoCorrect: 'off', spellCheck: false }
                  : {})}
            />
            {link}
          </div>
          {unter}
        </>
      )}
    </Feld>
  );
}
