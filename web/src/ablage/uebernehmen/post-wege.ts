import { typName } from '../../../../shared/src/beschriftung';
import { POST_STAND, type Dokument, type Mappentyp } from '../../../../shared/src/model';
import { mappenApi, type MappeDetails } from '../../api/mappen';
import { useDaten } from '../../daten';
import { geheZu, loeseWache } from '../../ort';
import { hinweis } from '../../rueckfrage';
import { titelOder } from '../../seiten';
import { t } from '../../sprache';
import { useMappenZiel } from '../NeuePost';
import { merkeAufloesung } from '../Post';
import type { UeMeldung } from './bruecke-zustand';

/** Was die Wege der Post brauchen: die Post, ihre Dokumente in der Mitte und was mit ihnen mitgeht. */
interface PostLage {
  details: MappeDetails;
  typ: Mappentyp;
  sicht: string;
  doks: Dokument[];
  mitDoks: string[];
  emlAus: { originalEmail?: false };
  neuLaden: () => Promise<void>;
  setMeldung(m: UeMeldung): void;
}

/**
 * Wege der Post (#934, #936, #1217): ab hier abtrennen, weitere Dokumente dazu (auch per Ziehen auf „Neue Post“), in
 * eine vorhandene Mappe legen, ohne Mappe erledigen – und danach weiter mit der nächsten Post.
 */
export function usePostWege({ details, typ, sicht, doks, mitDoks, emlAus, neuLaden, setMeldung }: PostLage) {
  const d = useDaten();
  const m = details.mappe;
  const post = typ.system === 'post';
  const postRegister = typ.register.find((r) => r.art === 'dokumente')?.key ?? 'dokumente';
  async function abtrennen(ab: number) {
    const weg = doks.slice(ab).map((x) => x.id);
    try {
      const r = await mappenApi.postAbtrennen(m.id, weg);
      setMeldung({ art: 'gut', text: t('ablage.uebernehmen.abgetrennt', { anzahl: weg.length, titel: titelOder(r.neu.titel) }) });
      await neuLaden();
      await d.neuLaden();
    } catch (e) {
      await hinweis({ titel: t('ablage.uebernehmen.nicht-abgetrennt'), text: (e as Error).message });
    }
  }
  async function hochladen(dateien: File[]) {
    const fehler: string[] = [];
    for (const f of dateien) {
      try {
        await mappenApi.ladeHoch(m.id, postRegister, f);
      } catch (e) {
        fehler.push(`„${f.name}“: ${(e as Error).message}`);
      }
    }
    if (fehler.length) await hinweis({ titel: t('ablage.uebernehmen.nicht-hochgeladen'), text: fehler.join('\n') });
    await neuLaden();
    await d.neuLaden();
  }
  useMappenZiel(
    post
      ? {
          name: titelOder(m.titel),
          titel: t('ablage.uebernehmen.in-diese-post'),
          text: t('ablage.uebernehmen.in-diese-post-text'),
          nimm: (x) => void hochladen(x),
        }
      : null,
  );

  /** Weiter mit der nächsten Post aus „Neue Post“ (wie nach dem Speichern, #936); ohne weitere die Ansicht. */
  async function weiter(nach?: { id: string; typId: string; titel: string; vorhanden: boolean; leerseiten?: number }) {
    // Was rechts eingetragen war, gehört zu keiner Mappe mehr – ohne Rückfrage weiter.
    loeseWache();
    await d.neuLaden();
    const np = d.zaehler.neuePost;
    const naechste = np
      ? (await mappenApi.seite(np, 0, 2).catch(() => null))?.mappen.find((x) => !x.verborgen && x.id !== m.id)
      : undefined;
    if (naechste && np) {
      if (nach) merkeAufloesung({ fuer: naechste.id, ...nach });
      geheZu(`/ablage/${np}/${naechste.id}/uebernehmen`);
    } else if (nach) geheZu(`/ablage/${nach.typId}/${nach.id}`);
    else geheZu(`/ablage/${np ?? sicht}`);
  }
  /**
   * In eine vorhandene Mappe legen (Nacharbeit #936: auch dort wird die Post aufgelöst). „Kopie in der Post behalten“
   * gibt es in der Oberfläche nicht mehr (#1217, Entscheidung Thomas) – nur die Schnittstelle kennt `kopieren` noch.
   */
  async function inVorhandene(ziel: { id: string; typId: string; titel: string }) {
    const zt = d.typ(ziel.typId);
    const reg = zt?.register.find((r) => r.art === 'dokumente')?.key;
    if (details.dokumente.length && !reg) {
      await hinweis({
        titel: t('ablage.uebernehmen.nicht-zugeordnet'),
        text: t('ablage.uebernehmen.ohne-dokumentenregister', { typ: zt ? typName(zt) : '' }),
      });
      return;
    }
    try {
      const r = await mappenApi.zuordnen(m.id, {
        ziel: ziel.id,
        register: reg,
        dokumente: mitDoks,
        kopieren: false,
        aufloesen: true,
        ...emlAus,
      });
      if (r.hinweis) await hinweis({ titel: t('ablage.mappeformular.post-bleibt-zugeordnet'), text: r.hinweis });
      await weiter(r.aufgeloest ? { ...ziel, titel: r.ziel.titel ?? ziel.titel, vorhanden: true, leerseiten: r.leerseiten } : undefined);
    } catch (e) {
      await hinweis({ titel: t('ablage.uebernehmen.nicht-zugeordnet'), text: (e as Error).message });
    }
  }
  async function ohneMappe() {
    try {
      await mappenApi.mappeAendern(m.id, { werte: { stand: POST_STAND.erledigt } });
      await weiter();
    } catch (e) {
      await hinweis({ titel: t('ablage.uebernehmen.nicht-erledigt'), text: (e as Error).message });
    }
  }
  return { abtrennen, hochladen, inVorhandene, ohneMappe };
}
