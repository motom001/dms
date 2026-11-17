import { useState } from 'react';
import { textFehler, zahlFehler, type EinstellungFeld, type FeldVerweis } from '../../../../shared/src/paketeinstellungen';
import { Mehrfachauswahl } from '../../ablage/Mehrfachauswahl';
import { Feld, FeldGruppe, HakenFeld, Knopf, type FeldProps } from '../../bausteine';
import type { PaketEinstellungenStand } from '../../api/pakete';
import { t } from '../../sprache';

/**
 * Felder der Paket-Einstellungen (#197, #1279 aus PaketEinstellungen.tsx gezogen): ein Feld je Art im Rahmen `Feld`,
 * Verweise als Auswahl oder Mehrfachauswahl. Auch der Ablauf beim Installieren (PaketAblauf) fragt Pflichtfelder damit.
 */

export type Auswahl = PaketEinstellungenStand['auswahl'];

/** Mögliche Einträge eines Verweises (Mappentyp, Benutzer, Rolle, Ansicht). */
export const optionenVon = (f: EinstellungFeld, a: Auswahl): Array<{ id: string; name: string }> =>
  f.typ === 'mappentyp' ? a.typen : f.typ === 'benutzer' ? a.benutzer : f.typ === 'rolle' ? a.rollen : f.typ === 'sicht' ? a.sichten : [];

/**
 * Verweise als Mehrfachauswahl (#658) – dieselbe Bedienung wie bei Verweisfeldern (#602): suchen, die Auswahl steht
 * unter dem Feld, je mit „Entfernen“. `ausgeschlossen`: im anderen Feld gewählt (schliesst_aus), hier nicht angeboten.
 */
export function VerweisWahl({
  id,
  name,
  optionen,
  gewaehlt,
  setze,
  ausgeschlossen = [],
}: {
  id: string;
  name: string;
  optionen: Array<{ id: string; name: string }>;
  gewaehlt: string[];
  setze: (l: string[]) => void;
  ausgeschlossen?: string[];
}) {
  const [eingabe, setEingabe] = useState('');
  const [offen, setOffen] = useState(false);
  const such = eingabe.trim().toLowerCase();
  const frei = optionen.filter(
    (o) => !gewaehlt.includes(o.id) && !ausgeschlossen.includes(o.id) && (!such || o.name.toLowerCase().includes(such)),
  );
  const nameVon = (x: string) => optionen.find((o) => o.id === x)?.name ?? t('pakete.einstellungen.verweis-weg');
  return (
    <Mehrfachauswahl
      id={id}
      name={name}
      platzhalter={t('pakete.einstellungen.suchen')}
      eingabe={eingabe}
      setEingabe={setEingabe}
      offen={offen}
      setOffen={setOffen}
      vorschlaege={frei.slice(0, 50).map((o) => ({ id: o.id, text: o.name }))}
      leerText={t('pakete.einstellungen.nichts-frei')}
      waehle={(x) => {
        setze([...gewaehlt, x]);
        setEingabe('');
      }}
      entferne={(x) => setze(gewaehlt.filter((y) => y !== x))}
      gewaehlt={gewaehlt.map((x) => ({
        id: x,
        inhalt: nameVon(x),
        entfernenText: t('pakete.einstellungen.entfernen', { name: nameVon(x) }),
      }))}
    />
  );
}

/** Ein Feld mit den Bausteinen der Oberfläche; Verweise als Auswahllisten (gespeichert wird die Id). Rahmen: `Feld` (#967). */
export function Eingabe({
  f,
  wert,
  setze,
  fehler,
  auswahl,
  id,
  ausgeschlossen,
}: {
  f: EinstellungFeld;
  wert: unknown;
  setze: (v: unknown) => void;
  fehler?: string;
  auswahl: Auswahl;
  id: string;
  ausgeschlossen?: string[];
}) {
  const [geheimNeu, setGeheimNeu] = useState(false);
  const [warGesetzt] = useState(!!wert && typeof wert === 'object');
  // Muster A6: Pflicht ist der Normalfall und bleibt unmarkiert; ohne `pflicht` im Manifest steht „(optional)“ hinter
  // der Beschriftung (nicht beim Haken – der ist immer an oder aus). Der Rahmen setzt Hinweis, Fehler und aria.
  const name = f.name;
  const optional = !f.pflicht;
  const hinweis = [f.typ === 'adresse' ? t('fragen.adresse.feld') : null, f.hilfe];
  // Zahl (#657): die Prüfung am Feld zeigt der Rahmen wie jeden anderen Fehler.
  const zahl = f.typ === 'zahl' && wert != null ? String(wert).replace('.', ',').trim() : '';
  // Prüfregeln aus dem Manifest (#996): Länge und Muster – dieselbe Prüfung wie auf dem Server.
  const text =
    (f.typ === 'text' || f.typ === 'mehrzeilig') && typeof wert === 'string' && wert
      ? textFehler(f, f.typ === 'text' ? wert.trim() : wert)
      : null;
  const meldung = fehler ?? (zahl ? zahlFehler(f, zahl) : text);
  if (f.typ === 'janein')
    return (
      <HakenFeld beschriftung={name} hinweis={f.hilfe} fehler={meldung}>
        <input id={id} type="checkbox" checked={wert === true} onChange={(e) => setze(e.target.checked)} />
      </HakenFeld>
    );
  if (f.typ === 'mehrfachauswahl') {
    const l = Array.isArray(wert) ? wert.map(String) : [];
    return (
      <FeldGruppe beschriftung={name} optional={optional} hinweis={f.hilfe} fehler={meldung}>
        {(f.optionen ?? []).map((o) => (
          <label key={o} className="haken klein">
            <input
              type="checkbox"
              checked={l.includes(o)}
              onChange={(e) => setze(e.target.checked ? [...l, o] : l.filter((x) => x !== o))}
            />
            <span>{o}</span>
          </label>
        ))}
      </FeldGruppe>
    );
  }
  if (f.typ === 'geheim' && !!wert && typeof wert === 'object' && !geheimNeu)
    return (
      <FeldGruppe beschriftung={name} optional={optional} hinweis={f.hilfe} fehler={meldung}>
        <span className="chip gut">{t('werkbank.paketeinstellungen.gesetzt')}</span>
        <Knopf groesse="klein" onClick={() => setGeheimNeu(true)}>
          {t('werkbank.paketeinstellungen.aendern')}
        </Knopf>
        <Knopf
          art="gefahr"
          groesse="klein"
          symbol="geloescht"
          onClick={() => setze(null)}
          rueckfrage={{
            titel: t('werkbank.paketeinstellungen.geheim-loeschen.frage', { name }),
            text: t('werkbank.paketeinstellungen.geheim-loeschen.text'),
            ja: t('werkbank.paketeinstellungen.loeschen'),
          }}>
          {t('werkbank.paketeinstellungen.loeschen')}
        </Knopf>
      </FeldGruppe>
    );
  return (
    <Steuerelement
      f={f}
      wert={wert}
      setze={setze}
      auswahl={auswahl}
      rahmen={{ beschriftung: name, optional, hinweis, fehler: meldung, id }}
      ausgeschlossen={ausgeschlossen}
      geheim={{ neu: geheimNeu, warGesetzt }}
    />
  );
}

const VERWEISE: EinstellungFeld['typ'][] = ['mappentyp', 'benutzer', 'rolle', 'sicht'];

type Rahmen = Omit<FeldProps, 'children'>;

/**
 * Das Feld samt Eingabeelement (#1214): jede Art steht selbst im Feldrahmen (`rahmen` aus `Eingabe`), damit kein
 * Bedienelement ohne Rahmen bleibt; `v` (id, aria) kommt vom Rahmen.
 */
function Steuerelement({
  f,
  wert,
  setze,
  auswahl,
  rahmen,
  ausgeschlossen,
  geheim,
}: {
  f: EinstellungFeld;
  wert: unknown;
  setze: (v: unknown) => void;
  auswahl: Auswahl;
  rahmen: Rahmen;
  ausgeschlossen?: string[];
  geheim: { neu: boolean; warGesetzt: boolean };
}) {
  const liste = (optionen: Array<{ id: string; name: string }>) => (
    <Feld {...rahmen}>
      {(v) => (
        <select {...v} value={String(wert ?? '')} onChange={(e) => setze(e.target.value || null)}>
          <option value="">{t('werkbank.paketeinstellungen.keine-auswahl')}</option>
          {optionen.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      )}
    </Feld>
  );
  if (VERWEISE.includes(f.typ) && !f.mehrfach) return liste(optionenVon(f, auswahl));
  if (f.mehrfach)
    return (
      <Feld {...rahmen}>
        {(v) => (
          <VerweisWahl
            id={v.id}
            name={f.name}
            optionen={optionenVon(f, auswahl)}
            gewaehlt={Array.isArray(wert) ? wert.map(String) : wert ? [String(wert)] : []}
            setze={setze}
            ausgeschlossen={ausgeschlossen}
          />
        )}
      </Feld>
    );
  switch (f.typ) {
    // Dienst-Adresse (#444): nie voreingestellt, nur ein Beispiel im leeren Feld; beim Speichern bestätigen.
    case 'adresse':
      return (
        <Feld {...rahmen}>
          {(v) => (
            <input
              {...v}
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder={f.beispiel}
              value={String(wert ?? '')}
              onChange={(e) => setze(e.target.value || null)}
            />
          )}
        </Feld>
      );
    case 'mehrzeilig':
      return (
        <Feld {...rahmen}>{(v) => <textarea {...v} rows={4} value={String(wert ?? '')} onChange={(e) => setze(e.target.value)} />}</Feld>
      );
    case 'zahl':
      return <ZahlEingabe f={f} wert={wert} setze={setze} rahmen={rahmen} />;
    case 'datum':
      return (
        <Feld {...rahmen}>
          {(v) => <input {...v} type="date" value={String(wert ?? '')} onChange={(e) => setze(e.target.value || null)} />}
        </Feld>
      );
    case 'auswahl':
      return liste((f.optionen ?? []).map((o) => ({ id: o, name: o })));
    case 'geheim':
      return <GeheimEingabe wert={wert} setze={setze} rahmen={rahmen} geheim={geheim} />;
    case 'feld':
      return <FeldWahl wert={wert as FeldVerweis | null} setze={setze} auswahl={auswahl} rahmen={rahmen} />;
    case 'text':
      return (
        <Feld {...rahmen}>{(v) => <input {...v} type="text" value={String(wert ?? '')} onChange={(e) => setze(e.target.value)} />}</Feld>
      );
    default:
      return <Feld {...rahmen}>{() => null}</Feld>;
  }
}

/** Geheimnis neu eingeben: leer = nicht gesetzt, oder (beim Ändern) das gespeicherte behalten. */
function GeheimEingabe({
  wert,
  setze,
  rahmen,
  geheim,
}: {
  wert: unknown;
  setze: (v: unknown) => void;
  rahmen: Rahmen;
  geheim: { neu: boolean; warGesetzt: boolean };
}) {
  return (
    <Feld {...rahmen}>
      {(v) => (
        <input
          {...v}
          type="password"
          autoComplete="new-password"
          placeholder={
            wert === null && !geheim.neu ? t('werkbank.paketeinstellungen.nicht-gesetzt') : t('werkbank.paketeinstellungen.neuer-wert')
          }
          value={typeof wert === 'string' ? wert : ''}
          onChange={(e) => setze(e.target.value || (geheim.warGesetzt && geheim.neu ? { behalten: true } : null))}
        />
      )}
    </Feld>
  );
}

/** Feld eines Mappentyps (Typ „feld“): gespeichert als { typ, feld }. */
function FeldWahl({
  wert,
  setze,
  auswahl,
  rahmen,
}: {
  wert: FeldVerweis | null;
  setze: (v: unknown) => void;
  auswahl: Auswahl;
  rahmen: Rahmen;
}) {
  const optionen = auswahl.typen.flatMap((eintrag) =>
    eintrag.felder.map((g) => ({ id: `${eintrag.id}|${g.key}`, name: `${eintrag.name} › ${g.label}` })),
  );
  return (
    <Feld {...rahmen}>
      {(v) => (
        <select
          {...v}
          value={wert ? `${wert.typ}|${wert.feld}` : ''}
          onChange={(e) => {
            const [typ, feld] = e.target.value.split('|');
            setze(e.target.value ? { typ, feld } : null);
          }}>
          <option value="">{t('werkbank.paketeinstellungen.keine-auswahl')}</option>
          {optionen.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      )}
    </Feld>
  );
}

/**
 * Zahl (#657): nur Ziffern und ein Komma; min/max/schritt prüft Eingabe und zeigt die Meldung im Rahmen. Mit
 * `vorschlaege` eine Auswahl mit Beschriftung; „Eigener Wert …“ öffnet das Zahlenfeld (innerhalb von min/max).
 * `v` (id, aria) bekommt das gerade sichtbare Bedienelement, das die Beschriftung meint.
 */
function ZahlEingabe({ f, wert, setze, rahmen }: { f: EinstellungFeld; wert: unknown; setze: (v: unknown) => void; rahmen: Rahmen }) {
  const text = wert == null ? '' : String(wert).replace('.', ',');
  const passend = f.vorschlaege?.find((x) => String(x.wert) === String(wert));
  const [eigen, setEigen] = useState(!!f.vorschlaege && wert != null && wert !== '' && !passend);
  const ganz = f.schritt !== undefined && Number.isInteger(f.schritt) && Number.isInteger(f.min ?? 0);
  return (
    <Feld {...rahmen}>
      {(v) => {
        const feld = (
          <input
            {...(eigen || !f.vorschlaege ? v : {})}
            type="text"
            inputMode={ganz ? 'numeric' : 'decimal'}
            autoComplete="off"
            value={text}
            placeholder={f.min !== undefined && f.max !== undefined ? `${f.min}–${f.max}` : undefined}
            onChange={(e) => setze(e.target.value.replace(/[^0-9,.-]/g, '').replace('.', ',') || null)}
          />
        );
        return (
          <>
            {f.vorschlaege ? (
              <select
                {...(eigen ? {} : v)}
                value={eigen ? '__eigen' : passend ? String(passend.wert) : ''}
                onChange={(e) => {
                  if (e.target.value === '__eigen') {
                    setEigen(true);
                    return;
                  }
                  setEigen(false);
                  setze(e.target.value === '' ? null : Number(e.target.value));
                }}>
                {!f.pflicht && <option value="">{t('pakete.einstellung.zahl.keine')}</option>}
                {f.vorschlaege.map((x) => (
                  <option key={x.wert} value={String(x.wert)}>
                    {String(x.wert).replace('.', ',')} – {x.name}
                  </option>
                ))}
                <option value="__eigen">{t('pakete.einstellung.zahl.eigen')}</option>
              </select>
            ) : (
              feld
            )}
            {f.vorschlaege && eigen && feld}
          </>
        );
      }}
    </Feld>
  );
}
