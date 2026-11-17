/** Handlungen des Dokumentenregisters (#1279): Auswahl, Zusammenfügen, Post teilen, Entfernen, Texterkennung. */
import type { Dokument, Mappe } from '../../../../shared/src/model';
import { dokumenteApi, dokumentUrl } from '../../api/dokumente';
import { mappenApi } from '../../api/mappen';
import { Link } from '../../ort';
import { rueckfrage } from '../../rueckfrage';
import { t } from '../../sprache';
import { HINWEIS_MEHRFACH } from './hilfen';
import type { Kern } from './kern';

export function waehle(k: Kern, x: Dokument, an: boolean, bereich: boolean) {
  const { gewaehlt, anker, waehlbar } = k.w;
  const n = new Set(gewaehlt);
  if (bereich && anker) {
    const i = waehlbar.findIndex((y) => y.id === anker),
      j = waehlbar.findIndex((y) => y.id === x.id);
    if (i >= 0 && j >= 0)
      for (const y of waehlbar.slice(Math.min(i, j), Math.max(i, j) + 1)) {
        if (an) n.add(y.id);
        else n.delete(y.id);
      }
  } else if (an) n.add(x.id);
  else n.delete(x.id);
  k.w.setGewaehlt(n);
  k.w.setAnker(x.id);
}

export function alleHerunterladen(k: Kern) {
  const { auswahl } = k.w;
  let ersterMal = false;
  try {
    ersterMal = auswahl.length > 1 && !localStorage.getItem(HINWEIS_MEHRFACH);
    localStorage.setItem(HINWEIS_MEHRFACH, '1');
  } catch {
    /* egal */
  }
  k.w.setHinweis(ersterMal ? t('ablage.dokumente.dein-browser-fragt-beim') : undefined);
  // Nacheinander, mit kleinem Abstand – sonst verwerfen manche Browser einen Teil.
  auswahl.forEach((x, i) =>
    setTimeout(() => {
      const a = document.createElement('a');
      a.href = dokumentUrl(x.id, true);
      a.download = x.name;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
    }, i * 400),
  );
}

export function auswahlLoeschen(k: Kern) {
  k.p.entferneMehrere(k.w.auswahl.map((x) => x.id));
  if (k.a.ansicht && k.w.gewaehlt.has(k.a.ansicht)) k.a.setAnsicht(undefined);
  k.w.setGewaehlt(new Set());
}

export async function fuegeZusammen(k: Kern) {
  const { zusammen, setZusammen } = k.o;
  const { pdfAuswahl } = k.w;
  if (!zusammen) return;
  const ohneKorb = !k.d.zaehler.papierkorbTage;
  if (
    zusammen.entfernen &&
    ohneKorb &&
    !(await rueckfrage({
      titel: t('ablage.dokumente.ausgangsdokumente-endgueltig'),
      text: t('ablage.dokumente.der-papierkorb-ist-ausgeschaltet', { pdfAuswahl: pdfAuswahl.length }),
      ja: t('ablage.dokumente.zusammenfuegen-und-loeschen'),
      gefahr: true,
    }))
  )
    return;
  setZusammen({ ...zusammen, laeuft: true, fehler: undefined });
  try {
    const r = await dokumenteApi.fuegePdfZusammen({
      dokumente: pdfAuswahl.map((x) => x.id),
      name: zusammen.name.trim() || undefined,
      register: k.p.register.key,
      originaleEntfernen: zusammen.entfernen,
      bestaetigt: zusammen.entfernen && ohneKorb,
    });
    setZusammen(null);
    k.w.setGewaehlt(new Set());
    k.o.setPdfMeldung(t('ablage.dokumente.pdfs-zu-zusammengefuegt', { pdfAuswahl: pdfAuswahl.length, name: r.dokument.name }));
    await k.p.neuLaden?.();
  } catch (e) {
    setZusammen((z) => z && { ...z, laeuft: false, fehler: (e as Error).message });
  }
}

export async function pdfFertig(k: Kern, r: { dokumente: Dokument[]; posten: Mappe[] }) {
  k.o.setSeitenOffen(undefined);
  k.o.setPdfMeldung(
    r.posten.length ? (
      <>
        {t('ablage.dokumente.neue-posts-angelegt', { anzahl: r.posten.length })}{' '}
        {r.posten.map((p, i) => (
          <span key={p.id}>
            {i > 0 && ', '}
            <Link to={`/ablage/${p.typId}/${p.id}`} className="verweis">
              {String(p.werte.betreff ?? t('ablage.dokumente.post'))}
            </Link>
          </span>
        ))}
        {t('ablage.dokumente.diese-post-ist-erledigt')}
      </>
    ) : r.dokumente.length > 1 ? (
      t('ablage.dokumente.in-dokumente-geteilt', { dokumente: r.dokumente.length })
    ) : (
      t('ablage.dokumente.gespeichert', {
        name: r.dokumente[0]?.name,
        wert: k.versioniert ? t('ablage.dokumente.version', { wert: r.dokumente[0]?.version ?? 1 }) : '',
      })
    ),
  );
  await k.p.neuLaden?.();
}

export async function postTeilenAb(k: Kern, x: Dokument) {
  const { hauptReihe } = k.r;
  const ab = hauptReihe.findIndex((y) => y.id === x.id);
  if (ab <= 0) return;
  const weg = hauptReihe.slice(ab);
  if (
    !(await rueckfrage({
      titel: t('ablage.dokumente.post-teilen-ab-frage', { name: x.name }),
      text: t('ablage.dokumente.post-teilen-ab-text', { anzahl: weg.length }),
      ja: t('ablage.dokumente.post-teilen-ab'),
    }))
  )
    return;
  k.o.setPdfMeldung(undefined);
  k.sofort.setVersionFehler(undefined);
  try {
    const r = await mappenApi.postAbtrennen(
      x.mappeId,
      weg.map((y) => y.id),
    );
    k.o.setPdfMeldung(
      <>
        {t('ablage.dokumente.post-geteilt', { anzahl: weg.length })}{' '}
        <Link to={`/ablage/${r.neu.typId}/${r.neu.id}`} className="verweis">
          {String(r.neu.werte.betreff ?? t('ablage.dokumente.post'))}
        </Link>
      </>,
    );
    await k.p.neuLaden?.();
  } catch (e) {
    k.sofort.setVersionFehler((e as Error).message);
  }
}

export const teilenAb = (k: Kern, x: Dokument, weg: boolean) =>
  !!k.p.post && k.bearbeitbar && !weg && k.r.hauptReihe.findIndex((y) => y.id === x.id) > 0;

export async function anlagenFertig(k: Kern, m?: string) {
  k.o.setAlsAnlage(undefined);
  if (m) k.o.setPdfMeldung(m);
  await k.p.neuLaden?.();
}

/** Entfernen (#1211, Leitsatz 5): neutral, geht erst beim Speichern in den Papierkorb; mit älteren Versionen nachfragen. */
export async function entfernen(k: Kern, x: Dokument) {
  if (
    (x.aeltere ?? 0) > 0 &&
    !(await rueckfrage({
      titel: t('ablage.dokumente.mit-allen-versionen-loeschen', { name: x.name, wert: (x.aeltere ?? 0) + 1 }),
      text: k.d.zaehler.papierkorbTage ? t('ablage.dokumente.sie-kommen-beim-speichern') : t('ablage.dokumente.das-ist-endgueltig'),
      ja: t('ablage.dokumente.entfernen'),
    }))
  )
    return;
  k.p.entferne(x.id);
}

/** Nur eine Bearbeitung (Seiten, Verkleinern, Schwärzen) zugleich offen. */
export function nurEins(k: Kern, setze: (id: string | undefined) => void, id: string, jetzt: string | undefined) {
  k.o.setPdfMeldung(undefined);
  k.o.setSeitenOffen(undefined);
  k.o.setKleinOffen(undefined);
  k.o.setSchwarzOffen(undefined);
  setze(jetzt === id ? undefined : id);
}

export async function teilenAusblenden(k: Kern, id: string) {
  k.ocr.setTeilenWeg((w) => new Set(w).add(id));
  try {
    await dokumenteApi.teilenHinweisAus(id);
  } catch {
    /* bleibt ausgeblendet bis zum Neuladen */
  }
}

export async function erneut(k: Kern, id: string) {
  try {
    const x = await dokumenteApi.texterkennungErneut(id);
    k.ocr.setOcr((o) => ({ ...o, [id]: x.ocr }));
  } catch {
    /* bleibt */
  }
}

export async function zeigeText(k: Kern, id: string) {
  if (k.ocr.text?.id === id) {
    k.ocr.setText(null);
    return;
  }
  try {
    k.ocr.setText({ id, text: (await dokumenteApi.volltext(id)).text });
  } catch {
    k.ocr.setText({ id, text: null });
  }
}
