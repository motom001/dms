import { useRef } from 'react';
import { feldLabel, typName } from '../../../../shared/src/beschriftung';
import type { Abgleichtreffer } from '../../../../shared/src/erkennung';
import { titelAus, type Feld as FeldDef, type Mappentyp, type Werte } from '../../../../shared/src/model';
import type { Bezuege } from '../../api/mappen';
import { Knopf, KnopfLink } from '../../bausteine';
import { Hilfe } from '../../Hilfe';
import { Link } from '../../ort';
import { titelOder } from '../../seiten';
import { t, tn } from '../../sprache';
import { Symbol } from '../../Symbol';
import { farbeVon, type Marke } from '../bruecke';

/**
 * Kopf der Mitte bei Post (#1217): Titel, „Als Post öffnen“ (ein Weg – sieht aus wie ein Knopf) und „‹ Post 1 von 3 ›“
 * mit Knöpfen; am Rand das Hilfesymbol.
 */
export function PostKopf({
  titel,
  alsPost,
  pos,
  anzahl,
  vorige,
  naechste,
}: {
  titel: string;
  alsPost: string;
  pos: number;
  anzahl: number;
  vorige?: () => void;
  naechste?: () => void;
}) {
  return (
    <>
      <h2 className="ue-titel">
        <Symbol name="posteingang" /> {titel}
      </h2>
      <div className="ue-blaettern">
        <KnopfLink to={alsPost} anker="uebernehmen.als-post">
          {t('ablage.uebernehmen.als-post')}
        </KnopfLink>
        {pos >= 0 && anzahl > 0 && (
          <nav className="ue-blaettern-nav" aria-label={t('ablage.uebernehmen.blaettern')}>
            <Knopf nurSymbol={t('ablage.uebernehmen.vorige')} gesperrt={pos <= 0 || !vorige} onClick={vorige}>
              <Symbol name="pfeil-links" />
            </Knopf>
            <span className="klein">{t('ablage.uebernehmen.post-von', { nr: pos + 1, anzahl })}</span>
            <Knopf nurSymbol={t('ablage.uebernehmen.naechste')} gesperrt={pos >= anzahl - 1 || !naechste} onClick={naechste}>
              <Symbol name="pfeil-rechts" />
            </Knopf>
          </nav>
        )}
        <Hilfe ort="post.zuordnen" />
      </div>
    </>
  );
}

/**
 * Kopf der neuen Mappe wie überall sonst: Typ, Titel (wie er nach dem Speichern heißt), Stern und „Mappe ▾“ – beide
 * gehen erst nach dem Speichern: der Stern blass, „Mappe“ gesperrt mit Grund (Leitsatz 6).
 */
export function NeuKopf({ typ, werte, bekannt }: { typ: Mappentyp; werte: Werte; bekannt: Bezuege }) {
  const titel = titelAus(typ, werte, (id) => bekannt[id]?.titel ?? '');
  const spaeter = t('ablage.uebernehmen.nach-dem-speichern');
  return (
    <div className="mappenkopf">
      <p className="ueber">{typName(typ)}</p>
      <div className="titelzeile">
        <h1 className={titel ? '' : 'leise'}>{titel || t('ablage.mappeformular.neue-mappe')}</h1>
        <div className="mappenkopf-knoepfe">
          <Knopf art="eigen" className="stern" gesperrt nurSymbol={`${t('ablage.stern.zu-den-favoriten')} – ${spaeter}`}>
            <Symbol name="stern" />
          </Knopf>
          <Knopf groesse="klein" gesperrt={spaeter}>
            {t('ablage.aktionen.mappe')}
          </Knopf>
        </div>
      </div>
    </div>
  );
}

/**
 * Würde die Mappe doppelt (#938): „Rechnungsnummer R-1 gibt es schon: „…““ – mit Link und (bei Post) „Stattdessen
 * dorthin legen“, das „Vorhandene Mappe“ mit dieser Mappe wählt (#1217).
 */
export function DoppeltWarnung({
  liste,
  bezuege,
  legen,
}: {
  liste: Abgleichtreffer[];
  bezuege: Bezuege;
  legen?: (z: { id: string; typId: string; titel: string }) => void;
}) {
  return (
    <div className="hinweis warn ue-doppelt" role="alert">
      {liste.slice(0, 3).map((x) => {
        const b = x.belege.find((y) => !y.ueber && y.stark) ?? x.belege[0];
        const titel = bezuege[x.mappeId]?.titel ?? '';
        return (
          <div key={x.mappeId} className="ue-doppelt-zeile">
            <p>
              {tn('ablage.uebernehmen.gibt-es-schon', {
                feld: b?.feld ?? '',
                wert: b?.wert ?? '',
                link: (
                  <Link to={`/ablage/${x.typId}/${x.mappeId}`} className="verweis">
                    {titelOder(titel)}
                  </Link>
                ),
              })}
            </p>
            {legen && (
              <Knopf onClick={() => legen({ id: x.mappeId, typId: x.typId, titel })}>{t('ablage.uebernehmen.stattdessen-dorthin')}</Knopf>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Unter einem Verweisfeld: „Woran Ablago das erkennt“ und „auch gefunden … stattdessen nehmen“. */
export function VerweisBelege({
  f,
  liste,
  bezuege,
  marken,
  nehmen,
}: {
  f: FeldDef;
  liste: Abgleichtreffer[];
  bezuege: Bezuege;
  marken: Marke[];
  nehmen(x: Abgleichtreffer): void;
}) {
  const [erster, ...weitere] = liste;
  return (
    <div className="ue-belege klein" aria-label={t('ablage.uebernehmen.woran', { feld: feldLabel(f) })}>
      <p>
        <strong>{t('ablage.uebernehmen.woran-kurz', { titel: titelOder(bezuege[erster.mappeId]?.titel) })}</strong>
        {erster.unsicher && (
          <>
            {' '}
            <span className="chip warn">{t('ablage.post.unsicher').trim()}</span>
          </>
        )}
      </p>
      <ul>
        {erster.belege.map((b, i) => {
          const nr = marken.find((m) => m.nutzlast.mappeId === erster.mappeId && m.beleg === i)?.nr;
          return (
            <li key={`${b.feldKey}:${b.wert}:${i}`}>
              {nr && <span className={`ue-nr ${farbeVon(nr)}`}>{nr}</span>}{' '}
              {b.ueber
                ? t('ablage.uebernehmen.beleg-ueber', { feld: b.feld, wert: b.wert, ueber: b.ueber.feld })
                : t('ablage.uebernehmen.beleg', { feld: b.feld, wert: b.wert })}
            </li>
          );
        })}
      </ul>
      {weitere.length > 0 && (
        <p className="leise">
          {t('ablage.uebernehmen.auch-gefunden')}{' '}
          {weitere.map((x, i) => (
            <span key={x.mappeId}>
              {i > 0 && ', '}„{titelOder(bezuege[x.mappeId]?.titel)}“{' '}
              <Knopf groesse="klein" onClick={() => nehmen(x)}>
                {t('ablage.uebernehmen.stattdessen-nehmen')}
              </Knopf>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

/** Am Fuß der Mitte nur die Ablagefläche „Weitere Dokumente hierher ziehen“ (Klick wählt Dateien). */
export function Ablageflaeche({ hochladen }: { hochladen(f: File[]): void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="ue-ablage" data-anker="uebernehmen.ablegen">
      <Knopf className="ue-ablage-knopf" onClick={() => ref.current?.click()}>
        {t('ablage.uebernehmen.weitere-hierher')}
      </Knopf>
      <input
        ref={ref}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const f = [...(e.target.files ?? [])];
          e.target.value = '';
          if (f.length) hochladen(f);
        }}
      />
    </div>
  );
}
