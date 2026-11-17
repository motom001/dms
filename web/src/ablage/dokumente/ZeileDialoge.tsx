/** Was unter einer Dokumentzeile aufgeht (#1279): Anlage, Stempel, Verkleinern, Schwärzen, Seiten, Anzeige und „Über“. */
import type { Dokument, OcrStand } from '../../../../shared/src/model';
import { t } from '../../sprache';
import { Hilfe } from '../../Hilfe';
import { Knopf } from '../../bausteine';
import { AlsAnlage } from '../Anlagen';
import { LeerseitenBlock } from '../Leerseiten';
import { PdfSeiten } from '../PdfSeiten';
import { PdfVerkleinern } from '../PdfVerkleinern';
import { Schwaerzen } from '../Schwaerzen';
import { StempelDialog } from '../Stempel';
import { anlagenFertig, erneut, pdfFertig, teilenAusblenden, zeigeText } from './aktionen';
import { Anzeige } from './Anzeige';
import type { Kern } from './kern';
import type { Zeilenlage } from './punkte';
import { UeberDokument } from './UeberDokument';

/** Hinweis „Post teilen?“ (#579): nur an der Post, nur für PDFs, nur wer teilen darf – nie von selbst. */
function TeilenHinweis({ k, x }: { k: Kern; x: Dokument }) {
  const { o } = k;
  return (
    <div className="hinweis info teilenhinweis" role="status">
      <p>{t('volltext.teilen.hinweis', { seite: x.teilenAb! })}</p>
      <span className="zeilenaktionen">
        <Knopf
          art="haupt"
          groesse="klein"
          onClick={() => {
            o.setPdfMeldung(undefined);
            o.setKleinOffen(undefined);
            o.setSchwarzOffen(undefined);
            o.setTeilVorschlag({ id: x.id, ab: x.teilenAb! });
            o.setSeitenOffen(x.id);
          }}>
          {t('volltext.teilen.knopf')}
        </Knopf>
        <Knopf art="link" groesse="klein" onClick={() => teilenAusblenden(k, x.id)}>
          {t('volltext.teilen.weg')}
        </Knopf>
        <Hilfe ort="dokumente.sprachen" />
      </span>
    </div>
  );
}

/** „Über dieses Dokument“ mit den Wegen zu Text, Archivnummer und Versionen. */
function Ueber({ k, x, s }: { k: Kern; x: Dokument; s?: OcrStand }) {
  const { p, o } = k;
  return (
    <UeberDokument
      x={x}
      s={s}
      versioniert={k.versioniert}
      textOffen={k.ocr.text?.id === x.id}
      text={() => void zeigeText(k, x.id)}
      neu={p.nurLesen ? undefined : () => void erneut(k, x.id)}
      archivnummer={!p.nurLesen && p.neuLaden ? () => k.sofort.setAsn({ id: x.id, wert: x.archivnummer ?? '' }) : undefined}
      versionen={() => o.setVersionenOffen(o.versionenOffen === x.id ? undefined : x.id)}
    />
  );
}

/** Seiten bearbeiten (#335), auch mit Vorschlag aus „Post teilen?“ (#579). */
function Seiten({ k, x, anlagen }: { k: Kern; x: Dokument; anlagen: Dokument[] }) {
  const { o, p } = k;
  return (
    <PdfSeiten
      d={x}
      post={!!p.post}
      versioniert={k.versioniert}
      papierkorb={!!k.d.zaehler.papierkorbTage}
      teilAb={o.teilVorschlag?.id === x.id ? o.teilVorschlag.ab : undefined}
      anlagenMoeglich={!!p.post && !anlagen.length}
      schliessen={() => {
        o.setSeitenOffen(undefined);
        o.setTeilVorschlag(undefined);
      }}
      fertig={(r) => {
        o.setTeilVorschlag(undefined);
        void pdfFertig(k, r);
      }}
    />
  );
}

/** Kopie mit Stempel (#394), Verkleinern (#393) und Schwärzen (#392). */
function Bearbeiten({ k, x, anlagen }: { k: Kern; x: Dokument; anlagen: Dokument[] }) {
  const { o, p } = k;
  return (
    <>
      {o.stempelOffen?.id === x.id && (
        <StempelDialog
          key={`${x.id}-${o.stempelOffen.version ?? ''}`}
          d={x}
          typ={p.typ}
          mappe={p.mappeTitel ?? ''}
          version={o.stempelOffen.version}
          anlagen={anlagen}
          schliessen={() => o.setStempelOffen(undefined)}
        />
      )}
      {o.kleinOffen === x.id && (
        <PdfVerkleinern
          d={x}
          bearbeitbar={k.bearbeitbar}
          mitnehmen={p.mitnehmen !== false}
          schliessen={() => o.setKleinOffen(undefined)}
          fertig={(m, geaendert) => {
            o.setKleinOffen(undefined);
            o.setPdfMeldung(m);
            if (geaendert) void p.neuLaden?.();
          }}
        />
      )}
      {o.schwarzOffen === x.id && (
        <Schwaerzen
          d={x}
          schliessen={() => o.setSchwarzOffen(undefined)}
          fertig={(m) => {
            o.setSchwarzOffen(undefined);
            o.setPdfMeldung(m);
            void p.neuLaden?.();
          }}
        />
      )}
    </>
  );
}

/** „Post teilen?“ (#579) zeigen: Post, bearbeitbar, PDF mit Vorschlag, nicht ausgeblendet, Seiten nicht offen. */
const mitTeilenHinweis = (k: Kern, x: Dokument, weg: boolean) =>
  k.p.post &&
  k.bearbeitbar &&
  !weg &&
  x.mime === 'application/pdf' &&
  !!x.teilenAb &&
  !k.ocr.teilenWeg.has(x.id) &&
  k.o.seitenOffen !== x.id;

export function ZeileDialoge({ k, x, s, weg, lage }: { k: Kern; x: Dokument; s?: OcrStand; weg: boolean; lage: Zeilenlage }) {
  const { o, p, a } = k;
  const { anlagen, ziele, sicht, auf } = lage;
  const teilenHinweis = mitTeilenHinweis(k, x, weg);
  return (
    <>
      {o.alsAnlage === x.id && !weg && (
        <AlsAnlage d={x} ziele={ziele} schliessen={() => o.setAlsAnlage(undefined)} fertig={(m) => anlagenFertig(k, m)} />
      )}
      {!weg && <Bearbeiten k={k} x={x} anlagen={anlagen} />}
      {teilenHinweis && <TeilenHinweis k={k} x={x} />}
      {p.post && !weg && o.seitenOffen !== x.id && (
        <LeerseitenBlock x={x} l={k.leer.von(x)} darf={k.bearbeitbar} geaendert={(l) => k.leer.setze(x.id, l)} />
      )}
      {o.seitenOffen === x.id && !weg && <Seiten k={k} x={x} anlagen={anlagen} />}
      {auf && (
        <Anzeige
          x={x}
          sicht={sicht}
          ueber={<Ueber k={k} x={x} s={s} />}
          imOriginal={a.original.has(x.id)}
          wechsle={() => a.wechsle(x)}
          laden={p.mitnehmen !== false && !k.stempelPflicht}
        />
      )}
      {!auf && !weg && o.ueberOffen === x.id && <Ueber k={k} x={x} s={s} />}
    </>
  );
}
