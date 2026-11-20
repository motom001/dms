/**
 * „Aus Dokument ausfüllen“ an einer Mappe (#1494): Woher das Dokument in der Mitte kommt – aus dieser Mappe, aus einer
 * verknüpften Mappe (z. B. die Rechnung am Vertrag; nur Dokumente, die die Person sehen darf) oder neu hochgeladen,
 * am Handy auch als Foto. Beim Hochladen fragt Ablago, ob das Dokument auch in der Mappe gespeichert werden soll;
 * ausgefüllt wird immer nur diese Mappe.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { nurHauptdokumente } from '../../../../shared/src/anlagen';
import { typName } from '../../../../shared/src/beschriftung';
import type { Dokument, Mappentyp } from '../../../../shared/src/model';
import { mappenApi, type MappeDetails } from '../../api/mappen';
import { werkbankApi, type TypVorschlaege } from '../../api/werkbank';
import { Feld, Knopf } from '../../bausteine';
import { useDaten } from '../../daten';
import { hinweis, rueckfrage } from '../../rueckfrage';
import { titelOder } from '../../seiten';
import { t } from '../../sprache';
import { istTouch, verkleinere } from '../PostKamera';

/** Höchstens so viele verknüpfte Mappen werden nach Dokumenten gefragt. */
const VERKNUEPFT_MAX = 12;

export interface FremdeQuelle {
  mappe: { id: string; titel: string; typId: string };
  dokumente: Dokument[];
}

/** Eine neue Datei, nur zum Ausfüllen gelesen (nicht gespeichert): Name, Vorschau und die erkannten Werte. */
export interface NurGelesen {
  name: string;
  mime: string;
  url: string;
  r: TypVorschlaege;
}

/** Ids der verknüpften Mappen, die die Person sehen darf: Verweise dieser Mappe und Mappen, die auf sie verweisen. */
function verknuepfteIds(details: MappeDetails, typ: Mappentyp): string[] {
  const ids = new Set<string>();
  for (const f of typ.felder) {
    if (f.typ !== 'referenz') continue;
    const v = details.mappe.werte[f.key];
    for (const id of Array.isArray(v) ? v : v ? [v] : []) if (typeof id === 'string' && !details.bezuege[id]?.verborgen) ids.add(id);
  }
  for (const r of details.rueckverweise) if (!r.verborgen) ids.add(r.quelleId);
  ids.delete(details.mappe.id);
  return [...ids].slice(0, VERKNUEPFT_MAX);
}

/** Dokumente mit Text aus den verknüpften Mappen – einmal beim Öffnen geladen; was nicht lesbar ist, fehlt. */
export function useVerknuepfteDokumente(details: MappeDetails, typ: Mappentyp, an: boolean): FremdeQuelle[] {
  const [quellen, setQuellen] = useState<FremdeQuelle[]>([]);
  const key = an ? verknuepfteIds(details, typ).join(',') : '';
  useEffect(() => {
    if (!key) return;
    let aktuell = true;
    void Promise.allSettled(key.split(',').map((id) => mappenApi.mappe(id))).then((liste) => {
      if (!aktuell) return;
      const aus: FremdeQuelle[] = [];
      for (const r of liste) {
        if (r.status !== 'fulfilled') continue;
        const dokumente = nurHauptdokumente(r.value.dokumente).filter((x) => x.ocr?.stand === 'fertig');
        const m = r.value.mappe;
        if (dokumente.length) aus.push({ mappe: { id: m.id, titel: m.titel ?? '', typId: m.typId }, dokumente });
      }
      setQuellen(aus);
    });
    return () => {
      aktuell = false;
    };
  }, [key]);
  return quellen;
}

/** Auswahl in der Mitte: getrennt nach „Diese Mappe“ und „Verknüpfte Mappen“; leer, solange es nichts zu wählen gibt. */
export function QuellenWahl({
  eigene,
  fremde,
  dokId,
  setDokId,
}: {
  eigene: Dokument[];
  fremde: FremdeQuelle[];
  dokId: string | undefined;
  setDokId(id: string): void;
}) {
  const d = useDaten();
  if (eigene.length + fremde.reduce((n, q) => n + q.dokumente.length, 0) < 1) return null;
  const typ = (id: string) => {
    const x = d.typ(id);
    return x ? `${typName(x)}: ` : '';
  };
  return (
    <div className="klein ue-dokwahl">
      <Feld beschriftung={t('ablage.uebernehmen.dokument')} beschriftungVerbergen>
        <select value={dokId ?? ''} onChange={(e) => setDokId(e.target.value)} data-anker="uebernehmen.quelle">
          {!dokId && <option value="">{t('ablage.uebernehmen.quelle-waehlen')}</option>}
          {eigene.length > 0 && (
            <optgroup label={t('ablage.uebernehmen.diese-mappe')}>
              {eigene.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </optgroup>
          )}
          {fremde.length > 0 && (
            <optgroup label={t('ablage.uebernehmen.verknuepfte-mappen')}>
              {fremde.flatMap((q) =>
                q.dokumente.map((x) => (
                  <option key={x.id} value={x.id}>
                    {t('ablage.uebernehmen.quelle-option', { typ: typ(q.mappe.typId), titel: titelOder(q.mappe.titel), name: x.name })}
                  </option>
                )),
              )}
            </optgroup>
          )}
        </select>
      </Feld>
    </div>
  );
}

/**
 * „Neues Dokument hochladen“ (#1494), am Handy auch „Foto aufnehmen“: Ablago fragt, ob es auch in der Mappe gespeichert
 * werden soll. Ja: hochladen ins erste Dokumentenregister – die Texterkennung läuft, die Seite lädt nach und zeigt es.
 * Nein (oder ohne Dokumentenregister): nur lesen, die Vorschläge stehen rechts, gespeichert wird die Datei nicht.
 */
export function NeuesDokument({
  details,
  typ,
  neuLaden,
  gespeichert,
  gelesen,
}: {
  details: MappeDetails;
  typ: Mappentyp;
  neuLaden: () => Promise<void>;
  gespeichert(id: string): void;
  gelesen(x: NurGelesen | null): void;
}) {
  const wahl = useRef<HTMLInputElement>(null);
  const kamera = useRef<HTMLInputElement>(null);
  const [laeuft, setLaeuft] = useState<string>();
  const register = typ.register.find((r) => r.art === 'dokumente');
  const darf = details.rechte?.U !== false;

  async function nimm(liste: FileList | null) {
    const dateien = [...(liste ?? [])].slice(0, 6);
    if (!dateien.length) return;
    const speichern =
      !!register &&
      darf &&
      (await rueckfrage({
        titel: t('ablage.uebernehmen.neu-speichern-frage', { anzahl: dateien.length }),
        text: t('ablage.uebernehmen.neu-speichern-text', { register: register.name }),
        ja: t('ablage.uebernehmen.neu-speichern-ja'),
        nein: t('ablage.uebernehmen.neu-speichern-nein'),
      }));
    try {
      if (speichern) await hochladenUndZeigen(dateien);
      else await nurLesen(dateien);
    } catch (e) {
      await hinweis({ titel: t('ablage.uebernehmen.nicht-hochgeladen'), text: (e as Error).message });
    } finally {
      setLaeuft(undefined);
    }
  }
  async function hochladenUndZeigen(dateien: File[]) {
    setLaeuft(t('ablage.uebernehmen.neu-laedt-hoch'));
    let erstes: string | undefined;
    for (const f of dateien) {
      const r = await mappenApi.ladeHoch(details.mappe.id, register!.key, f);
      erstes ??= r.dokument.id;
    }
    gelesen(null);
    await neuLaden();
    if (erstes) gespeichert(erstes);
  }
  async function nurLesen(dateien: File[]) {
    setLaeuft(t('ablage.uebernehmen.neu-liest'));
    const texte: string[] = [];
    let letzte: (TypVorschlaege & { text: string }) | undefined;
    for (const f of dateien) {
      // Fotos vorher verkleinern (wie „Post fotografieren“): schneller, und die Texterkennung braucht nicht mehr.
      const blob = f.type.startsWith('image/') ? await verkleinere(f) : f;
      letzte = await werkbankApi.vorschlaegeDatei(typ.id, blob, f.name, details.mappe.id);
      texte.push(letzte.text);
    }
    const r = dateien.length > 1 ? await werkbankApi.vorschlaege(typ.id, { text: texte.join('\n\n'), mappe: details.mappe.id }) : letzte!;
    gelesen({ name: dateien.map((f) => f.name).join(', '), mime: dateien[0].type, url: URL.createObjectURL(dateien[0]), r });
  }

  const auswahl = (e: { target: HTMLInputElement }) => {
    void nimm(e.target.files);
    e.target.value = '';
  };
  return (
    <div className="knoepfe ue-neu">
      {istTouch() && (
        <Knopf groesse="klein" symbol="kamera" gesperrt={!!laeuft} onClick={() => kamera.current?.click()}>
          {t('ablage.uebernehmen.neu-foto')}
        </Knopf>
      )}
      <Knopf groesse="klein" laeuft={!!laeuft} laeuftText={laeuft} onClick={() => wahl.current?.click()} data-anker="uebernehmen.neu">
        {t('ablage.uebernehmen.neu-hochladen')}
      </Knopf>
      <input ref={kamera} type="file" accept="image/*" capture="environment" hidden onChange={auswahl} />
      <input
        ref={wahl}
        type="file"
        accept="image/*,application/pdf,.vcf,text/vcard,.xml,application/xml,text/xml"
        multiple
        hidden
        onChange={auswahl}
        data-anker="uebernehmen.neu-datei"
      />
    </div>
  );
}

/** Vorschau einer nur gelesenen Datei: Bild oder PDF, sonst nur der Name. Die Adresse gibt sie beim Wechsel wieder frei. */
export function GelesenVorschau({ x }: { x: NurGelesen }) {
  useEffect(() => () => URL.revokeObjectURL(x.url), [x.url]);
  const bild = useMemo(() => x.mime.startsWith('image/'), [x.mime]);
  return (
    <div className="ue-gelesen">
      <p className="hinweis info" role="status">
        {t('ablage.uebernehmen.nur-gelesen', { name: x.name })}
      </p>
      {bild ? (
        <img src={x.url} alt={x.name} className="ue-gelesen-bild" />
      ) : x.mime === 'application/pdf' ? (
        <iframe src={x.url} title={x.name} className="ue-gelesen-pdf" />
      ) : null}
    </div>
  );
}
