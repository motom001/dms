import { Fragment, useState } from 'react';
import { useZiehen, Ziehgriff } from '../ziehen';
import { ABSCHNITT_TITEL_MAX, type Abschnitt, type Feld as FeldDef, type Mappentyp } from '../../../shared/src/model';
import { Symbol } from '../Symbol';
import { t } from '../sprache';
import { HakenFeld, Knopf } from '../bausteine';
import { AnzeigeChip, AnzeigeEditor } from './Anzeige';
import { SprachText } from './Beschriftung';
import { neueId, type EntwurfAbschnitt, type EntwurfFeld, type EntwurfRegister } from './entwurf';

/**
 * Felder eines Feldregisters mit Abschnitten (#890): Ab einem Abschnitt beginnt eine neue Zeile – mit Überschrift als
 * dünne Linie mit Titel (auf Wunsch eingeklappt), ohne Überschrift nur als Umbruch. Abschnitte lassen sich hinzufügen,
 * verschieben (Pfeile, Alt+Pfeiltasten am Griff, Ziehen) und entfernen; die Reihenfolge der Felder bestimmt „Felder“.
 */
export function Feldaufteilung({
  r,
  felder,
  alle,
  typen,
  setze,
  ansage,
}: {
  r: EntwurfRegister;
  felder: EntwurfFeld[];
  setze: (a: EntwurfAbschnitt[]) => void;
  ansage: (text: string) => void;
  /** Anzeigen, wenn … (#1033): alle Felder des Typs (Bedingungen dürfen auf jedes schauen) und die Mappentypen. */
  alle: EntwurfFeld[];
  typen: Mappentyp[];
}) {
  const abschnitte = (r.abschnitte ?? []).filter((a) => felder.some((f) => f._uid === a.vor));
  const [bedingungOffen, setBedingungOffen] = useState<string | null>(null);
  const typTeil = {
    felder: alle.map(
      (x) =>
        ({
          key: x.key,
          label: x.label || x.key,
          typ: x.typ,
          optionen: x.optionen,
          zielTypen: x.zielTypen,
          mehrfach: x.mehrfach,
        }) as FeldDef,
    ),
  };
  /** Felder des Abschnitts: ab seinem FeldDef bis vor den nächsten Abschnitt – auf die darf seine Bedingung nicht schauen. */
  const eigeneVon = (a: EntwurfAbschnitt) => {
    const start = felder.findIndex((f) => f._uid === a.vor);
    const aus: string[] = [];
    for (let j = start; j >= 0 && j < felder.length; j++) {
      if (j > start && abschnitte.some((x) => x.vor === felder[j]._uid)) break;
      aus.push(felder[j].key);
    }
    return aus;
  };
  const frei = (uid: string, ausser?: string) => !abschnitte.some((a) => a.vor === uid && a._uid !== ausser);
  const name = (a: EntwurfAbschnitt) => a.titel.trim() || t('mappentypen.darstellung.umbruch');
  const feldName = (f: EntwurfFeld) => f.label || f.key;
  /** Nächstes FeldDef ohne Abschnitt nach oben (−1) bzw. unten (+1). */
  const ziel = (a: EntwurfAbschnitt, richtung: number) => {
    for (let j = felder.findIndex((f) => f._uid === a.vor) + richtung; j >= 0 && j < felder.length; j += richtung)
      if (frei(felder[j]._uid)) return felder[j];
    return undefined;
  };
  const setzeA = (uid: string, patch: Partial<EntwurfAbschnitt>) => setze(abschnitte.map((a) => (a._uid === uid ? { ...a, ...patch } : a)));
  const schiebe = (a: EntwurfAbschnitt, richtung: number) => {
    const f = ziel(a, richtung);
    if (!f) return;
    setzeA(a._uid, { vor: f._uid });
    ansage(t('mappentypen.darstellung.beginnt-jetzt-vor', { name: name(a), feld: feldName(f) }));
  };
  function hinzufuegen() {
    // Vor dem letzten FeldDef ohne Abschnitt; von dort schiebt man ihn an seinen Platz.
    const f = [...felder].reverse().find((x) => frei(x._uid));
    if (!f) return;
    setze([...abschnitte, { _uid: neueId(), vor: f._uid, titel: '' }]);
    ansage(t('mappentypen.darstellung.hinzugefuegt-vor', { feld: feldName(f) }));
  }
  /** Ablegen auf einem FeldDef: davor – oder danach, also vor dem nächsten FeldDef. */
  const ankerBei = (ziel: string, ort: string, quelle: string) => {
    const i = felder.findIndex((f) => `f:${f._uid}` === ziel);
    const f = i < 0 ? undefined : ort === 'nach' ? felder[i + 1] : felder[i];
    return f && frei(f._uid, quelle) ? f : undefined;
  };
  const zs = useZiehen({
    erlaubt: (quelle, ziel, ort) => ziel.startsWith('f:') && !!ankerBei(ziel, ort, quelle),
    fertig: (quelle, ziel, ort) => {
      const f = ankerBei(ziel, ort, quelle);
      const a = abschnitte.find((x) => x._uid === quelle);
      if (!f || !a) return;
      setzeA(quelle, { vor: f._uid });
      ansage(t('mappentypen.darstellung.beginnt-jetzt-vor', { name: name(a), feld: feldName(f) }));
    },
  });
  return (
    <div className="feldaufteilung">
      <p className="leise klein">{t('mappentypen.darstellung.aufteilung-hilfe')}</p>
      <ol className="aufteilung">
        {felder.map((f) => {
          const a = abschnitte.find((x) => x.vor === f._uid);
          const ze = zs.eintrag(`f:${f._uid}`);
          const ae = a ? zs.eintrag(a._uid) : null;
          return (
            <Fragment key={f._uid}>
              {a && ae && (
                <li {...ae} className={`abschnittzeile ${a.titel.trim() ? 'mit-titel' : ''} ${ae.className}`}>
                  <Ziehgriff
                    griff={zs.griff(a._uid, name(a))}
                    tasten={{ hoch: ziel(a, -1) ? () => schiebe(a, -1) : undefined, runter: ziel(a, 1) ? () => schiebe(a, 1) : undefined }}
                  />
                  <SprachText
                    beschriftungVerbergen
                    beschriftung={t('mappentypen.darstellung.ueberschrift')}
                    wert={a.titel}
                    placeholder={t('mappentypen.darstellung.ohne-ueberschrift')}
                    teil="titel"
                    beschriftungen={a.beschriftungen}
                    setzeWert={(titel) => setzeA(a._uid, { titel: titel.slice(0, ABSCHNITT_TITEL_MAX) })}
                    setzeBeschriftungen={(b) => setzeA(a._uid, { beschriftungen: b as Abschnitt['beschriftungen'] })}
                  />
                  <HakenFeld
                    beschriftung={t('mappentypen.darstellung.eingeklappt')}
                    className="klein"
                    hinweis={
                      !a.titel.trim() && (
                        <>
                          <Symbol name="schloss" /> {t('mappentypen.darstellung.eingeklappt-nur-mit-titel')}
                        </>
                      )
                    }>
                    <input
                      type="checkbox"
                      checked={!!a.eingeklappt && !!a.titel.trim()}
                      disabled={!a.titel.trim()}
                      onChange={(ev) => setzeA(a._uid, { eingeklappt: ev.target.checked || undefined })}
                    />
                  </HakenFeld>
                  {/* Anzeigen, wenn … (#1033): Symbol und Satz am Abschnitt, Bearbeiten darunter. */}
                  <AnzeigeChip regel={a.anzeigen} typ={typTeil} />
                  <Knopf
                    art="link"
                    groesse="klein"
                    aria-expanded={bedingungOffen === a._uid}
                    onClick={() => setBedingungOffen(bedingungOffen === a._uid ? null : a._uid)}>
                    {t('mappentypen.anzeige.am-abschnitt')}
                  </Knopf>
                  <div className="feldaktionen">
                    <Knopf
                      art="link"
                      gesperrt={!ziel(a, -1)}
                      onClick={() => schiebe(a, -1)}
                      nurSymbol={t('mappentypen.darstellung.nach-oben', { name: name(a) })}>
                      <Symbol name="sortiert-auf" />
                    </Knopf>
                    <Knopf
                      art="link"
                      gesperrt={!ziel(a, 1)}
                      onClick={() => schiebe(a, 1)}
                      nurSymbol={t('mappentypen.darstellung.nach-unten', { name: name(a) })}>
                      <Symbol name="sortiert-ab" />
                    </Knopf>
                    <Knopf
                      art="link"
                      onClick={() => {
                        setze(abschnitte.filter((x) => x._uid !== a._uid));
                        ansage(t('mappentypen.darstellung.entfernt', { name: name(a) }));
                      }}
                      nurSymbol={t('mappentypen.darstellung.entfernen', { name: name(a) })}>
                      <Symbol name="schliessen" />
                    </Knopf>
                  </div>
                </li>
              )}
              {a && bedingungOffen === a._uid && (
                <li className="abschnittanzeige">
                  <AnzeigeEditor
                    regel={a.anzeigen}
                    setze={(anzeigen) => setzeA(a._uid, { anzeigen })}
                    typ={typTeil}
                    eigene={eigeneVon(a)}
                    typen={typen}
                  />
                </li>
              )}
              <li {...ze} className={`aufteilungsfeld ${f.ausgeblendet ? 'ausgeblendet' : ''} ${ze.className}`}>
                {feldName(f)}
                {f.ausgeblendet && <span className="chip">{t('mappentypen.darstellung.chip.ausgeblendet')}</span>}
              </li>
            </Fragment>
          );
        })}
      </ol>
      <Knopf gesperrt={!felder.some((f) => frei(f._uid))} onClick={hinzufuegen}>
        {t('mappentypen.darstellung.abschnitt-hinzufuegen')}
      </Knopf>
    </div>
  );
}
