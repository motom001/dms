import { useEffect, useRef, useState } from 'react';
import { feldLabel, typName } from '../../../../shared/src/beschriftung';
import type { PaketHinweis } from '../../../../shared/src/berechnet';
import {
  titelAus,
  type Feld as FeldDef,
  type Mappenkonflikt,
  type Mappentyp,
  type Verweiskonflikt,
  type Werte,
} from '../../../../shared/src/model';
import { istTeiltyp, uebergeordneteId } from '../../../../shared/src/teile';
import type { Bezuege, MappeDetails } from '../../api/mappen';
import { Feld, FeldGruppe, Knopf } from '../../bausteine';
import { useDaten } from '../../daten';
import { Link } from '../../ort';
import { titelOder } from '../../seiten';
import { t, tn } from '../../sprache';
import { Symbol } from '../../Symbol';
import { unpassendText, wann } from './hilfen';

/**
 * Verwaltungsmodus (#820): Diese Mappe dürfte die Person ohne Modus nicht lesen. Beim ersten Öffnen im Modus ein
 * deutlicher Hinweis (danach klein), dass es in der Historie der Mappe steht.
 */
export function NurImModus({ mappeId }: { mappeId: string }) {
  const [erstes] = useState(() => {
    try {
      const k = `dms:nur-im-modus:${mappeId}`;
      const da = sessionStorage.getItem(k);
      sessionStorage.setItem(k, '1');
      return !da;
    } catch {
      return true;
    }
  });
  return (
    <div className={erstes ? 'hinweis warn' : 'leise klein'} role={erstes ? 'alert' : undefined} id="nur-im-verwaltungsmodus">
      <p>{t('mappen.verwaltungsmodus.hinweis')}</p>
    </div>
  );
}

/** Rückmeldung zu „Link kopieren“ (#98); klappt das Kopieren nicht, steht der Link markiert zum Kopieren da. */
export function LinkKopiert({ link, ok, schliessen }: { link: string; ok: boolean; schliessen(): void }) {
  return (
    <div className={`hinweis ${ok ? 'gut' : 'warn'} linkkopiert`} role="status">
      <p>{ok ? t('ablage.mappeformular.link-kopiert') : t('ablage.mappeformular.kopieren-ging-nicht-markiere')}</p>
      <Feld beschriftung={t('ablage.mappeformular.link-auf-diese-mappe')} beschriftungVerbergen>
        <input type="text" readOnly value={link} onFocus={(e) => e.target.select()} autoFocus={!ok} />
      </Feld>
      <Knopf art="link" onClick={schliessen}>
        {t('ablage.mappeformular.schliessen')}
      </Knopf>
    </div>
  );
}

/**
 * Teil einer anderen Mappe (#1031, Hinweis Qualität E7): Wer einen Teil direkt öffnet, sieht oben deutlich „Teil von
 * ‹Rechnung …›“ mit dem Weg zurück. Ist die übergeordnete Mappe nicht lesbar, steht nur, dass sie nicht sichtbar ist.
 */
export function TeilVon({ typ, details }: { typ: Mappentyp; details: MappeDetails }) {
  const d = useDaten();
  const id = istTeiltyp(typ) ? uebergeordneteId(typ, details.mappe.werte) : null;
  if (!id) return null;
  const b = details.bezuege[id];
  const eltern = b ? d.typ(b.typId) : undefined;
  return (
    <div className="hinweis info teil-von" data-anker="mappe.teil-von">
      <p>
        {b && !b.verborgen
          ? tn('ablage.teile.teil-von', {
              mappe: (
                <Link to={`/ablage/${b.typId}/${id}`} className="verweis">
                  {eltern ? `${typName(eltern)} „${titelOder(b.titel)}“` : titelOder(b.titel)}
                </Link>
              ),
            })
          : t('ablage.teile.teil-von-verborgen')}
      </p>
    </div>
  );
}

/**
 * Ruhige Zeile (#1033, Hinweis Qualität): Ein Feld oder Abschnitt ist gerade ausgeblendet, hat aber Werte – „Abschnitt
 * Miete ist ausgeblendet – 3 Werte bleiben gespeichert · anzeigen“. So glaubt niemand, die Werte seien weg.
 */
export function AusgeblendetZeile({ text, anzeigen }: { text: string; anzeigen(): void }) {
  return (
    <p className="ausgeblendetzeile leise klein" data-anker="mappe.ausgeblendet">
      <Symbol name="auge-aus" />
      <span>{text}</span>
      <span aria-hidden="true">·</span>
      <Knopf art="link" groesse="klein" onClick={anzeigen}>
        {t('ablage.anzeige.anzeigen')}
      </Knopf>
    </p>
  );
}

/**
 * Hinweiszeile über den Registern (#887): Verweise, die nicht zu anderen Angaben der Mappe passen – gelb, ein Hinweis
 * und kein Fehler; ein Klick springt zum Feld. Nur für Personen, die die Mappe bearbeiten dürfen; sie verschwindet,
 * sobald es passt (nach dem Speichern) oder solange man das Feld gerade ändert.
 */
export function KonfliktZeile({ konflikte, felder, zeige }: { konflikte: Verweiskonflikt[]; felder: FeldDef[]; zeige(k: string): void }) {
  if (!konflikte.length) return null;
  const knopf = (k: Verweiskonflikt) => {
    const f = felder.find((x) => x.key === k.feld);
    return (
      <Knopf art="link" onClick={() => zeige(k.feld)}>
        {t('ablage.konflikt.zeile', { feld: f ? feldLabel(f) : k.feld, grund: unpassendText(felder, k.eigeneFelder) })}
      </Knopf>
    );
  };
  return (
    <div className="hinweis warn konfliktzeile" role="group" aria-label={t('ablage.konflikt.titel')} data-anker="mappe.konflikte">
      <Symbol name="warnung" />
      {konflikte.length === 1 ? (
        <p>{knopf(konflikte[0])}</p>
      ) : (
        <ul>
          {konflikte.map((k) => (
            <li key={k.feld}>{knopf(k)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Hinweise von Paketen (#1034) in der Hinweiszeile über den Registern – für alle, die die Mappe lesen. Ruhig (gelb,
 * Hinweis Qualität), nie rot; vor jedem Hinweis steht das Paket als Marke mit Symbol, damit er nie wie eine Meldung von
 * Ablago selbst aussieht (Ergänzung Sicherheit). Nur Text – der Server lässt nichts anderes zu, und hier wird nichts
 * als HTML, Markdown oder Link gedeutet. Speichern hindern sie nie.
 */
export function PaketHinweisZeile({ hinweise }: { hinweise: PaketHinweis[] }) {
  if (!hinweise.length) return null;
  const eintrag = (h: PaketHinweis) => (
    <>
      <span className="paketmarke" title={t('ablage.paket-hinweis.marke-titel', { paket: h.paketName })}>
        <Symbol name="paket" />
        {h.paketName}
      </span>{' '}
      <span className="pakettext">{h.text}</span>
    </>
  );
  return (
    <div
      className="hinweis warn konfliktzeile pakethinweise"
      role="group"
      aria-label={t('ablage.paket-hinweis.titel')}
      data-anker="mappe.pakethinweise">
      {hinweise.length === 1 ? (
        <p>{eintrag(hinweise[0])}</p>
      ) : (
        <ul>
          {hinweise.map((h) => (
            <li key={`${h.paket}|${h.schluessel}`}>{eintrag(h)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Vorgabe aus einem Paket (#1038): dieselbe Kennzeichnung „Paket …“ wie bei Hinweisen und Beispielen – ruhig, ohne Warnfarbe.
 * Die Mappe ist eine gewöhnliche Mappe; die Zeile sagt nur, woher sie kommt.
 */
export function VorgabeZeile({ paketName }: { paketName: string }) {
  return (
    <p className="leise klein" data-anker="mappe.vorgabe">
      {t('ablage.vorgabe.zeile')}{' '}
      <span className="paketmarke" title={t('ablage.vorgabe.marke-titel', { paket: paketName })}>
        <Symbol name="paket" />
        {paketName}
      </span>
    </p>
  );
}

/**
 * Rückfrage beim gleichzeitigen Bearbeiten (#609): je Feld, wer es wann worauf geändert hat und was du
 * eintragen wolltest – mit „Meins übernehmen“ und „Wert von … behalten“. Alles andere ist schon zusammengeführt.
 */
export function Konfliktfrage({
  konflikt,
  ich,
  sendet,
  waehle,
  speichern,
  abbrechen,
}: {
  konflikt: Mappenkonflikt & { wahl: Record<string, 'meins' | 'seins'> };
  ich: string;
  sendet: boolean;
  waehle: (feld: string, w: 'meins' | 'seins') => void;
  speichern: () => void;
  abbrechen: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  const alle = konflikt.konflikte.every((k) => konflikt.wahl[k.feld]);
  const text = (v: string) => (v ? `„${v}“` : t('mappen.konflikt.leer'));
  return (
    <div className="hinweis warn mappenkonflikt" role="group" aria-labelledby="mappenkonflikt-titel" tabIndex={-1} ref={ref}>
      <h2 className="h3" id="mappenkonflikt-titel">
        <Symbol name="warnung" /> {t('mappen.konflikt.titel')}
      </h2>
      <p>{t('mappen.konflikt.einleitung')}</p>
      {konflikt.konflikte.map((k) => {
        const selbst = k.von === ich;
        const werte = { name: k.name, feld: k.label, wann: wann(k.zeit), aktuell: text(k.aktuell), deins: text(k.deins) };
        const satz = k.geheim
          ? t(selbst ? 'mappen.konflikt.selbstGeheim' : 'mappen.konflikt.andererGeheim', werte)
          : t(selbst ? 'mappen.konflikt.selbst' : 'mappen.konflikt.anderer', werte);
        return (
          <FeldGruppe key={k.feld} className="mk-feld" beschriftung={t('mappen.konflikt.frage', { feld: k.label })}>
            <div className="mk-wahl">
              <p>{satz}</p>
              <label className="haken">
                <input
                  type="radio"
                  name={`mk-${k.feld}`}
                  checked={konflikt.wahl[k.feld] === 'meins'}
                  onChange={() => waehle(k.feld, 'meins')}
                />
                <span>
                  {selbst ? t('mappen.konflikt.hier') : t('mappen.konflikt.meins')}
                  {!k.geheim && <span className="leise"> – {text(k.deins)}</span>}
                </span>
              </label>
              <label className="haken">
                <input
                  type="radio"
                  name={`mk-${k.feld}`}
                  checked={konflikt.wahl[k.feld] === 'seins'}
                  onChange={() => waehle(k.feld, 'seins')}
                />
                <span>
                  {selbst ? t('mappen.konflikt.dort') : t('mappen.konflikt.seins', { name: k.name })}
                  {!k.geheim && <span className="leise"> – {text(k.aktuell)}</span>}
                </span>
              </label>
            </div>
          </FeldGruppe>
        );
      })}
      {!alle && <p className="leise klein">{t('mappen.konflikt.fehlt')}</p>}
      <div className="knoepfe">
        <Knopf onClick={abbrechen} gesperrt={sendet}>
          {t('mappen.konflikt.abbrechen')}
        </Knopf>
        <Knopf art="haupt" onClick={speichern} gesperrt={!alle} laeuft={sendet}>
          {t('mappen.konflikt.speichern')}
        </Knopf>
      </div>
    </div>
  );
}

/** Kopf der neuen Mappe im Fenster (#935): Typ und Titel, wie er nach dem Speichern heißt. */
export function FensterKopf({ typ, werte, bekannt }: { typ: Mappentyp; werte: Werte; bekannt: Bezuege }) {
  const titel = titelAus(typ, werte, (id) => bekannt[id]?.titel ?? '');
  return (
    <div className="mappenkopf">
      <p className="ueber">{typName(typ)}</p>
      <p className={`vf-mappentitel${titel ? '' : ' leise'}`}>{titel || t('ablage.mappeformular.neue-mappe')}</p>
    </div>
  );
}
