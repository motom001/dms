/** Eine Dokumentzeile (#85, #1211; #1279 in Teile gegliedert): Kopf, Name mit Infozeile, Knöpfe und was darunter aufgeht. */
import type { Dokument, OcrStand } from '../../../../shared/src/model';
import { anlagenVon } from '../../../../shared/src/anlagen';
import { kannStempeln } from '../../../../shared/src/stempel';
import { t } from '../../sprache';
import { Hilfe } from '../../Hilfe';
import { Feld, Knopf, KnopfLink, Menue, Wahlhaken } from '../../bausteine';
import { AnlageMarke, AnlageZeile } from '../Anlagen';
import { Uebersetzbar } from '../Uebersetzung';
import { Vorschaubild } from '../Vorschaubild';
import { anlagenFertig, entfernen, erneut, waehle } from './aktionen';
import { Anzeige } from './Anzeige';
import { ansichtVon } from './hilfen';
import type { Kern } from './kern';
import { PdfSchutzAnzeige } from './PdfSchutzAnzeige';
import { punkte, type Zeilenlage } from './punkte';
import { DokTeilen, Herunterladen, Infozeile, Zustand } from './teile';
import { Versionen } from './Versionen';
import { ZeileDialoge } from './ZeileDialoge';

/** Anlage (#998): eingeklappte Zeile unter ihrem Hauptdokument; geht mit ihm, wenn es entfernt wird. */
function AnlageEintrag({ k, x, haupt }: { k: Kern; x: Dokument; haupt: Dokument }) {
  const { p, a } = k;
  const aWeg = p.entfernt.includes(x.id) || p.entfernt.includes(haupt.id);
  const aSicht = ansichtVon(x, a.original.has(x.id));
  const aAuf = x.id === a.ansicht && !aWeg;
  return (
    <AnlageZeile
      a={x}
      haupt={haupt}
      auf={aAuf}
      weg={aWeg}
      bearbeitbar={k.bearbeitbar}
      erste={anlagenVon(p.dokumente, haupt.id)[0]?.id === x.id}
      umschalten={aSicht ? () => a.umschalten(x) : undefined}
      fertig={(m) => anlagenFertig(k, m)}
      herunterladen={
        !aWeg && !k.stempelPflicht && p.mitnehmen !== false ? <Herunterladen x={x} archiv={aSicht?.art === 'archiv'} /> : undefined
      }
      vorschau={
        <Anzeige
          x={x}
          sicht={aSicht}
          imOriginal={a.original.has(x.id)}
          wechsle={() => a.wechsle(x)}
          laden={p.mitnehmen !== false && !k.stempelPflicht}
        />
      }
    />
  );
}

/** Archivnummer (#345) direkt an der Zeile vergeben. */
function AsnForm({ k }: { k: Kern }) {
  const { asn, setAsn, speichereAsn } = k.sofort;
  if (!asn) return null;
  return (
    <form
      className="asnform"
      onSubmit={(e) => {
        e.preventDefault();
        void speichereAsn();
      }}>
      <Feld beschriftung={t('ablage.dokumente.archivnummer')} beschriftungVerbergen fehler={asn.fehler}>
        <input
          autoFocus
          value={asn.wert}
          maxLength={40}
          placeholder="z. B. A-000123"
          onChange={(e) => setAsn({ ...asn, wert: e.target.value, fehler: undefined })}
        />
      </Feld>
      <Knopf art="haupt" groesse="klein" type="submit">
        {t('ablage.dokumente.uebernehmen')}
      </Knopf>
      <Knopf groesse="klein" onClick={() => setAsn(null)}>
        {t('ablage.dokumente.abbrechen')}
      </Knopf>
      <Hilfe ort="dokumente.archivnummer" />
    </form>
  );
}

/** Name, Infozeile und was an der Zeile aufgeht (Archivnummer, Versionen, Zustand, Schutz, Text). */
function DokName({ k, x, s, weg, klickbar, auf }: { k: Kern; x: Dokument; s?: OcrStand; weg: boolean; klickbar: boolean; auf: boolean }) {
  const { p, o, ocr } = k;
  return (
    <div className="dokname">
      {klickbar ? (
        <Knopf groesse="klein" className="dokname-knopf" aria-expanded={auf} onClick={() => k.a.umschalten(x)}>
          {x.name}
        </Knopf>
      ) : (
        <span className="dateiname">{x.name}</span>
      )}
      <AnlageMarke d={x} />
      <span className="leise klein">
        {weg ? (
          k.d.zaehler.papierkorbTage ? (
            t('ablage.dokumente.kommt-beim-speichern-in')
          ) : (
            t('ablage.dokumente.wird-beim-speichern-endgueltig')
          )
        ) : (
          <Infozeile x={x} s={s} />
        )}
      </span>
      {!weg && k.sofort.asn?.id === x.id && <AsnForm k={k} />}
      {!weg && o.versionenOffen === x.id && (
        <Versionen
          d={x}
          zurueck={!p.nurLesen && k.versioniert}
          neuLaden={p.neuLaden}
          mitnehmen={p.mitnehmen !== false}
          mitStempel={k.stempelPflicht && kannStempeln(x.mime) ? (n) => o.setStempelOffen({ id: x.id, version: n }) : undefined}
        />
      )}
      {/* Zustand nur, wenn etwas nicht stimmt (#1211): ruhige Zeile mit Ausweg. */}
      {!weg && <Zustand s={s} archiv={x.archivfassung} erneut={() => void erneut(k, x.id)} />}
      {!weg && x.pdfSchutz && <PdfSchutzAnzeige x={x} betreff={p.mappeTitel ?? ''} fertig={() => void p.neuLaden?.()} />}
      {!weg &&
        ocr.text?.id === x.id &&
        (ocr.text.text ? (
          <Uebersetzbar
            quelle={{ art: 'volltext', dokument: x.id }}
            original={ocr.text.text}
            darstellen={(v) => <pre className="volltext">{v}</pre>}>
            <pre className="volltext">{ocr.text.text}</pre>
          </Uebersetzbar>
        ) : (
          <pre className="volltext">{t('ablage.dokumente.kein-volltext-vorhanden')}</pre>
        ))}
    </div>
  );
}

/** Jede Zeile genau zwei Knöpfe (#1211): „Ansehen“ (am Handy „Öffnen“) und „⋯“; entfernt nur „Behalten“. */
function Zeilenaktionen({ k, x, weg, klickbar, lage }: { k: Kern; x: Dokument; weg: boolean; klickbar: boolean; lage: Zeilenlage }) {
  const { p, a } = k;
  const { handy } = a;
  const { sicht, auf } = lage;
  const menuePunkte = weg ? [] : punkte(k, x, lage);
  return (
    <div className={`zeilenaktionen${handy ? ' dk-handy' : ''}`}>
      {weg ? (
        !p.nurLesen && (
          <Knopf groesse="klein" onClick={() => p.entferne(x.id)}>
            {t('ablage.dokumente.behalten')}
          </Knopf>
        )
      ) : (
        <>
          {klickbar &&
            (handy && sicht ? (
              <KnopfLink art="haupt" href={sicht.url} aria-label={t('ablage.dokumente.oeffnen', { name: x.name })}>
                {t('ablage.dokumente.oeffnen-2')}
              </KnopfLink>
            ) : (
              !handy && (
                <Knopf groesse="klein" aria-expanded={auf} onClick={() => a.umschalten(x)}>
                  {auf ? t('ablage.dokumente.schliessen') : t('ablage.dokumente.ansehen')}
                </Knopf>
              )
            ))}
          {handy && !k.stempelPflicht && p.mitnehmen !== false && <DokTeilen d={x} />}
          <Menue
            beschriftung={t('ablage.dokumente.mehr', { name: x.name })}
            nurSymbol
            groesse={handy ? 'normal' : 'klein'}
            punkte={[
              ...menuePunkte,
              ...(!p.nurLesen
                ? [
                    {
                      key: 'entfernen',
                      symbol: 'geloescht' as const,
                      inhalt: t('ablage.dokumente.entfernen'),
                      titel: t('ablage.dokumente.entfernen.titel'),
                      tu: () => entfernen(k, x),
                    },
                  ]
                : []),
            ]}
          />
        </>
      )}
    </div>
  );
}

/** Hauptdokument (#998) mit Anlagen als Ziel für „Als Anlage an …“. */
function DokZeile({ k, x }: { k: Kern; x: Dokument }) {
  const { p, a, w } = k;
  const anlagen = anlagenVon(p.dokumente, x.id);
  const ziele = k.r.reihe.filter((y) => !y.anlageZu && y.id !== x.id && !p.entfernt.includes(y.id));
  const weg = p.entfernt.includes(x.id);
  const auf = x.id === a.ansicht && !weg;
  // Anzeige (#631): Archivfassung → Lesefassung → Original. Aufklappen geht auch, wenn nur das Original nicht anzeigbar ist.
  const sicht = ansichtVon(x, a.original.has(x.id));
  const klickbar = !weg && (!!sicht || !!ansichtVon(x, false));
  const s = k.ocr.standVon(x);
  const lage: Zeilenlage = { anlagen, ziele, sicht, klickbar: !!sicht, auf };
  return (
    <li
      ref={auf ? a.offenRef : undefined}
      className={`${auf ? 'an' : ''} ${weg ? 'weg' : ''} ${klickbar ? 'klickbar' : ''} ${w.gewaehlt.has(x.id) && !weg ? 'gewaehlt' : ''}`}
      onClick={(e) => a.zeilenKlick(x, e)}>
      <div className="dokzeile">
        <Wahlhaken
          an={w.gewaehlt.has(x.id) && !weg}
          gesperrt={weg}
          beschriftung={t('ablage.dokumente.auswaehlen-2', { name: x.name })}
          setze={(an, bereich) => waehle(k, x, an, bereich)}
        />
        <Vorschaubild d={x} />
        <DokName k={k} x={x} s={s} weg={weg} klickbar={klickbar} auf={auf} />
        <Zeilenaktionen k={k} x={x} weg={weg} klickbar={klickbar} lage={lage} />
      </div>
      <ZeileDialoge k={k} x={x} s={s} weg={weg} lage={lage} />
    </li>
  );
}

/** Eine Zeile der Liste: Anlage unter ihrem Hauptdokument oder Hauptdokument. */
export function Eintrag({ k, roh }: { k: Kern; roh: Dokument }) {
  const x = k.ocr.mitFrisch(roh);
  const haupt = k.r.hauptVon(x);
  if (haupt) return <AnlageEintrag k={k} x={x} haupt={haupt} />;
  return <DokZeile k={k} x={x} />;
}
