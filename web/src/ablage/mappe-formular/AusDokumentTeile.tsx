import { feldLabel, typName } from '../../../../shared/src/beschriftung';
import { darfErstellen } from '../../../../shared/src/model';
import { HakenFeld, Knopf } from '../../bausteine';
import { titelOder } from '../../seiten';
import { t } from '../../sprache';
import { AusDokument, type AusDokumentErgebnis } from '../AusDokument';
import type { Kern } from './kern';
import { AngebotZeile } from './angebote';

/**
 * „Aus Dokument ausfüllen“ (#391) an einer neuen Mappe: der Knopf über dem Formular – bzw. der Dialog (Foto, Datei),
 * solange er offen ist. An einer gespeicherten Mappe steht es fest im Menü „Mappe“ und öffnet die Prüfansicht (#1494).
 */
export function AusDokumentLeiste({ z, titel, fertig }: { z: Kern; titel: string; fertig(e: AusDokumentErgebnis): void }) {
  const { typ, mappe, details } = z.p;
  if (z.adOffen)
    return (
      <AusDokument
        typ={typ}
        titel={titel}
        mappeId={mappe?.id}
        dokumente={(details?.dokumente ?? []).filter((x) => x.ocr?.stand === 'fertig')}
        fertig={fertig}
        schliessen={() => z.setAdOffen(false)}
      />
    );
  return (
    <div className="ad-leiste">
      <Knopf groesse="klein" symbol="kamera" onClick={() => z.setAdOffen(true)}>
        {titel}
      </Knopf>
    </div>
  );
}

/** Ergebnis von „Aus Dokument ausfüllen“: Meldung, E-Rechnung und „gehört dazu“ (#1043), neue Mappen, Alternativen. */
export function AusDokumentErgebnisse({
  z,
  neuAnlegen,
  alternativeUebernehmen,
  vorschlagZuruecknehmen,
}: {
  z: Kern;
  neuAnlegen(k: string): Promise<void>;
  alternativeUebernehmen(k: string): void;
  vorschlagZuruecknehmen(k: string): void;
}) {
  const { typ } = z.p;
  const alternativen = Object.entries(z.vorschlaege)
    .filter(([, v]) => v.art === 'alternative')
    .map(([k]) => k);
  if (!(z.adMeldung || Object.keys(z.adNeu).length > 0 || z.adPositionen || z.adDazu.length > 0 || z.adAngebote.length > 0)) return null;
  return (
    <div className="hinweis info ad-ergebnis" role="status">
      {z.adMeldung && <p>{z.adMeldung}</p>}
      {/* Angebote von Paketen (#1724): ein Knopf im vorhandenen Hinweis, Abruf erst nach Klick. */}
      {z.adAngebote.map((a) => (
        <AngebotZeile key={`${a.paket.id}:${a.schluessel}`} z={z} a={a} />
      ))}
      <Danach z={z} />
      {Object.entries(z.adNeu).map(([k, n]) => {
        const f = typ.felder.find((x) => x.key === k);
        const ziel = z.d.typ(n.typId);
        return f && ziel ? (
          <p key={k}>
            {t('ablage.mappeformular.fuer-gibt-es-noch', {
              label: feldLabel(f),
              values: Object.values(n.werte).slice(0, 3).join(', '),
            })}{' '}
            {darfErstellen(ziel) && (
              <Knopf groesse="klein" onClick={() => neuAnlegen(k)}>
                {t('ablage.mappeformular.mit-diesen-angaben-anlegen', { name: ziel.name })}
              </Knopf>
            )}
          </p>
        ) : null;
      })}
      {(alternativen.length > 0 || Object.keys(z.vorschlaege).length > 0) && (
        <div className="knoepfe">
          {alternativen.length > 0 && (
            <Knopf groesse="klein" onClick={() => alternativen.forEach(alternativeUebernehmen)}>
              {t('ablage.mappeformular.alle-alternativen-uebernehmen')}
            </Knopf>
          )}
          <Knopf
            groesse="klein"
            onClick={() => {
              Object.keys(z.vorschlaege).forEach(vorschlagZuruecknehmen);
              z.setAdMeldung(undefined);
              z.setAdAngebote([]);
              z.setAdNeu({});
              z.setAdPositionen(null);
              z.setAdDazu([]);
            }}>
            {t('ablage.mappeformular.alle-vorschlaege-zuruecknehmen')}
          </Knopf>
        </div>
      )}
    </div>
  );
}

/** Was beim Speichern noch geschieht (#1043): Positionen der E-Rechnung anlegen, Mappen, die dazugehören, verknüpfen. */
function Danach({ z }: { z: Kern }) {
  const { typ } = z.p;
  const pos = z.adPositionen;
  return (
    <>
      {pos && (
        <HakenFeld
          beschriftung={t('ablage.mappeformular.positionen-anlegen', {
            anzahl: pos.zeilen.length,
            feld: feldLabel(typ.felder.find((f) => f.key === pos.feld) ?? { key: pos.feld, label: pos.feld }),
          })}
          hinweis={
            [
              pos.vorhanden ? t('ablage.mappeformular.positionen-vorhanden', { anzahl: pos.vorhanden }) : '',
              pos.weitere ? t('ablage.mappeformular.positionen-weitere', { anzahl: pos.weitere }) : '',
            ]
              .filter(Boolean)
              .join(' ') || undefined
          }>
          <input type="checkbox" checked={pos.an} onChange={(e) => z.setAdPositionen((x) => x && { ...x, an: e.target.checked })} />
        </HakenFeld>
      )}
      {z.adDazu.map((x) => (
        <HakenFeld
          key={x.mappeId}
          beschriftung={t('ablage.mappeformular.dazu-verknuepfen', {
            typ: typName(z.d.typ(x.typId) ?? { name: '' }),
            titel: titelOder(x.titel),
            feld: x.feld,
          })}
          hinweis={x.gruende.length ? t('ablage.mappeformular.dazu-gefunden', { gruende: x.gruende.join(', ') }) : undefined}>
          <input
            type="checkbox"
            checked={x.an}
            onChange={(e) => z.setAdDazu((l) => l.map((y) => (y.mappeId === x.mappeId ? { ...y, an: e.target.checked } : y)))}
          />
        </HakenFeld>
      ))}
    </>
  );
}
