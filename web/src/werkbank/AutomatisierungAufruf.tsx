import { useState } from 'react';
import { AUFRUF_GRENZEN, AUFRUF_RESERVIERT, PARAMETER_NAME, type AutomatisierungAnsicht, type Lauf, type WennAufruf } from '../../../shared/src/automatisierung';
import { gebietsschema } from '../../../shared/src/sprache';
import { api } from '../api';
import { Feld, Knopf } from '../bausteine';
import { Link } from '../ort';
import { rueckfrage } from '../rueckfrage';
import { t } from '../sprache';

/**
 * Wenn-Karte „Aufruf von außen“ (#679) in der Werkbank: Namen der Parameter an der Karte; darunter (nur gespeichert)
 * Adresse und Geheimnis – anlegen, kopieren, erneuern, entfernen. Das Geheimnis zeigt die Seite genau einmal, direkt
 * nach dem Anlegen bzw. Erneuern; danach kennt es nur noch der Aufrufer.
 */

const datum = (iso: string) => new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'medium', timeStyle: 'short' });

/** Namen aus dem Eingabefeld: getrennt durch Komma oder Leerzeichen, klein. */
const namenAus = (text: string) => text.split(/[\s,;]+/).map((n) => n.trim().toLowerCase()).filter(Boolean);
const gueltig = (n: string) => n.length <= AUFRUF_GRENZEN.name && PARAMETER_NAME.test(n) && !AUFRUF_RESERVIERT.includes(n);

/** Namen der Parameter; ungültige bleiben im Feld stehen und sind als Fehler genannt (gespeichert werden nur gültige). */
export function AufrufWenn({ w, setze }: { w: WennAufruf; setze: (w: WennAufruf) => void }) {
  const [text, setText] = useState(w.parameter.join(', '));
  const falsch = namenAus(text).filter((n) => !gueltig(n));
  const zuviele = namenAus(text).filter(gueltig).length > AUFRUF_GRENZEN.parameter;
  return (
    <Feld beschriftung={t('automatisierung.ui.aufruf.parameter')} className="breit"
      hinweis={t('automatisierung.ui.aufruf.parameter.hilfe', { anzahl: AUFRUF_GRENZEN.parameter, laenge: AUFRUF_GRENZEN.wert, beispiel: `{${w.parameter[0] ?? 'name'}}` })}
      fehler={falsch.length ? t('automatisierung.ui.aufruf.parameter.falsch', { namen: falsch.join(', ') }) : zuviele ? t('automatisierung.ui.aufruf.parameter.zuviele', { anzahl: AUFRUF_GRENZEN.parameter }) : undefined}>
      <input id="aufruf-parameter" value={text} placeholder={t('automatisierung.ui.aufruf.parameter.beispiel')} onChange={(x) => {
        setText(x.target.value);
        setze({ art: 'aufruf', parameter: [...new Set(namenAus(x.target.value).filter(gueltig))].slice(0, AUFRUF_GRENZEN.parameter) });
      }} />
    </Feld>
  );
}

/** Beispiel mit curl und openssl: Zeitstempel, Rumpf, Signatur über `<zeit>.<rumpf>`, POST mit den Köpfen. */
export function curlBeispiel(adresse: string, parameter: string[]): string {
  const rumpf = JSON.stringify(Object.fromEntries(parameter.slice(0, 2).map((n, i) => [n, i ? '2' : t('automatisierung.ui.aufruf.beispielwert')])));
  return [
    `GEHEIMNIS='whsec_…'`,
    `ZEIT=$(date +%s)`,
    `RUMPF='${rumpf}'`,
    `SIGNATUR=$(printf '%s.%s' "$ZEIT" "$RUMPF" | openssl dgst -sha256 -hmac "$GEHEIMNIS" | sed 's/^.* //')`,
    `curl -X POST -H 'X-DMS: 1' -H 'Content-Type: application/json' \\`,
    `  -H "X-DMS-Zeit: $ZEIT" -H "X-DMS-Signatur: v1=$SIGNATUR" \\`,
    `  --data "$RUMPF" '${adresse}'`,
  ].join('\n');
}

/**
 * Adresse und Geheimnis einer gespeicherten Automatisierung mit „Aufruf von außen“. Anlegen und Erneuern brauchen eine
 * frische Anmeldung (Server); Entfernen fragt nach. Ohne Adresse nimmt die Automatisierung nichts an.
 */
export function AufrufAdresse({ a, parameter, nachher }: { a: AutomatisierungAnsicht; parameter: string[]; nachher: () => Promise<void> }) {
  const [neu, setNeu] = useState<{ geheimnis: string; kopiert: boolean } | null>(null);
  const [kopiert, setKopiert] = useState(false);
  const s = a.aufruf ?? null;
  const lege = (was: 'adresse' | 'geheimnis') => async () => {
    const r = await api.automatisierungAufruf(a.id, was);
    setNeu({ geheimnis: r.geheimnis, kopiert: false });
    await nachher();
  };
  const kopiere = (text: string, gemerkt: () => void) => void navigator.clipboard?.writeText(text).then(gemerkt, () => {});
  return (
    <section className="automatisierung-bereich aufruf" aria-labelledby="aufruf-titel">
      <h3 className="h4" id="aufruf-titel">{t('automatisierung.ui.aufruf.titel')}</h3>
      {!s ? <>
        <p className="leise klein">{t('automatisierung.ui.aufruf.keine')}</p>
        <div className="knoepfe"><Knopf art="anlegen" groesse="klein" onClick={lege('adresse')}>{t('automatisierung.ui.aufruf.anlegen')}</Knopf></div>
      </> : <>
        <Feld beschriftung={t('automatisierung.ui.aufruf.adresse')} hinweis={t('automatisierung.ui.aufruf.seit', { erstellt: datum(s.erstellt), geheimnis: datum(s.geheimnisSeit) })} className="breit">
          <input id="aufruf-adresse" className="mono" readOnly value={s.adresse} onFocus={(x) => x.target.select()} />
        </Feld>
        <div className="knoepfe">
          <Knopf groesse="klein" onClick={() => kopiere(s.adresse, () => setKopiert(true))}>{kopiert ? t('automatisierung.ui.aufruf.kopiert') : t('automatisierung.ui.aufruf.adresse-kopieren')}</Knopf>
          <Knopf groesse="klein" onClick={lege('geheimnis')}>{t('automatisierung.ui.aufruf.neues-geheimnis')}</Knopf>
          <Knopf groesse="klein" onClick={async () => {
            if (await rueckfrage({ titel: t('automatisierung.ui.aufruf.neue-adresse.frage'), text: t('automatisierung.ui.aufruf.neue-adresse.text'), ja: t('automatisierung.ui.aufruf.neue-adresse') })) await lege('adresse')();
          }}>{t('automatisierung.ui.aufruf.neue-adresse')}</Knopf>
          <Knopf art="gefahr" groesse="klein" onClick={async () => {
            if (!(await rueckfrage({ titel: t('automatisierung.ui.aufruf.entfernen.frage'), text: t('automatisierung.ui.aufruf.entfernen.text'), ja: t('automatisierung.ui.aufruf.entfernen'), gefahr: true }))) return;
            await api.automatisierungAufrufEntfernen(a.id); setNeu(null); await nachher();
          }}>{t('automatisierung.ui.aufruf.entfernen')}</Knopf>
        </div>
      </>}
      {neu && (
        <div className="hinweis warn stapel" role="status">
          <p><strong>{t('automatisierung.ui.aufruf.geheimnis.titel')}</strong> {t('automatisierung.ui.aufruf.geheimnis.text')}</p>
          <Feld beschriftung={t('automatisierung.ui.aufruf.geheimnis')}>
            <input id="aufruf-geheimnis" className="mono" readOnly value={neu.geheimnis} onFocus={(x) => x.target.select()} />
          </Feld>
          <div className="knoepfe">
            <Knopf groesse="klein" onClick={() => kopiere(neu.geheimnis, () => setNeu({ ...neu, kopiert: true }))}>{neu.kopiert ? t('automatisierung.ui.aufruf.kopiert') : t('automatisierung.ui.aufruf.geheimnis-kopieren')}</Knopf>
            <Knopf groesse="klein" onClick={() => setNeu(null)}>{t('automatisierung.ui.aufruf.gesichert')}</Knopf>
          </div>
        </div>
      )}
      {s && !s.oeffentlich && <div className="hinweis info" role="status"><p>{t('automatisierung.ui.aufruf.heimnetz')} <Link to="/werkbank/betrieb" className="verweis">{t('automatisierung.ui.aufruf.heimnetz.link')}</Link>.</p></div>}
      <p className="leise klein">{t('automatisierung.ui.aufruf.schutz', { minuten: AUFRUF_GRENZEN.fensterS / 60, anzahl: AUFRUF_GRENZEN.jeAdresseJeMinute })}</p>
      {s && <details className="klein">
        <summary>{t('automatisierung.ui.aufruf.beispiel')}</summary>
        <pre className="mono">{curlBeispiel(s.adresse, parameter)}</pre>
      </details>}
    </section>
  );
}

/** Mitgeschickte Parameter eines Laufs (nur, wer „Automatisierungen“ verwaltet, bekommt sie vom Server). */
export function AufrufParameterZeile({ l }: { l: Lauf }) {
  const p = l.art === 'aufruf' && l.daten.parameter && typeof l.daten.parameter === 'object' ? Object.entries(l.daten.parameter as Record<string, unknown>) : [];
  if (!p.length) return null;
  return <p className="leise klein">{t('automatisierung.ui.aufruf.lauf-parameter', { liste: p.map(([k, v]) => `${k} = ${String(v)}`).join(', ') })}</p>;
}

/**
 * Werkbank-Übersicht (#679): Welche Adressen gerade Aufrufe von außen annehmen – Name und Adresse als Text (die Meldung
 * ist selbst ein Link); „Alle abschalten“ ist der Knopf der Meldung (schaltet die Automatisierungen aus).
 */
export function AufrufeUebersicht({ liste }: { liste: Array<{ id: string; name: string; adresse: string }> }) {
  return (
    <>
      <strong>{t('automatisierung.ui.uebersicht.aufrufe', { anzahl: liste.length })}</strong>{' '}
      {liste.map((x, i) => <span key={x.id}>{i ? ', ' : ''}„{x.name}“ (<span className="mono">{x.adresse}</span>)</span>)}.{' '}
      {t('automatisierung.ui.uebersicht.aufrufe.text')}
    </>
  );
}
