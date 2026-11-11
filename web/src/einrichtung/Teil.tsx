import { useState } from 'react';
import { feldLabel, typName } from '../../../shared/src/beschriftung';
import { einzigesZiel, type Feld as FeldDef, type Mappentyp } from '../../../shared/src/model';
import { istOffen, kopiereRegel, regelwerkVon, type Regelwerk } from '../../../shared/src/rechte';
import { istTeiltyp, leserechteAus } from '../../../shared/src/teile';
import { Feld, HakenFeld } from '../bausteine';
import { t } from '../sprache';

/** Ein Feld des Entwurfs, wie es der Editor kennt (Kennung kann sich bei neuen Feldern noch ändern – daher `_uid`). */
type EntwurfsFeld = Pick<FeldDef, 'key' | 'label' | 'typ' | 'zielTypen' | 'mehrfach' | 'pflicht' | 'beschriftungen'> & { _uid: string };

/** Verweisfelder, über die eine Mappe dazugehören kann: genau ein anderer Zieltyp, eine Mappe. */
const kandidaten = (felder: EntwurfsFeld[], eigeneId: string, typen: Mappentyp[]) => felder.filter((f) => {
  const z = f.typ === 'referenz' && !f.mehrfach ? einzigesZiel(f) : undefined;
  return !!z && z !== eigeneId && typen.some((x) => x.id === z && !x.system);
});

/**
 * Leserechte der übergeordneten Mappe als Vorgabe (#1031, Ergänzung Sicherheit): Hat der Typ noch keine eigenen
 * Berechtigungen, übernimmt er beim Einschalten bzw. beim Wechsel des Felds die Grundeinstellung „Lesen“ und die Regeln
 * zum Lesen des übergeordneten Typs. Danach sind es seine eigenen – der Editor sagt, dass Änderungen dort nicht mitgelten.
 */
function vorgabeRechte(eltern: Mappentyp | undefined, eigen: Regelwerk, entwurf: Mappentyp): { regelwerk: Regelwerk; ausgelassen: number } | null {
  if (!eltern || !istOffen(eigen) || istOffen(regelwerkVon(eltern))) return null;
  const r = leserechteAus(regelwerkVon(eltern), eigen, (regel) => { const k = kopiereRegel(regel, entwurf); return k.ausgelassen || !k.regel.wenn.length ? null : k.regel; });
  return istOffen(r.regelwerk) ? null : r;
}

/**
 * „Ist Teil einer anderen Mappe“ in den Grunddaten (#1031): Haken und das Verweisfeld, über das die Mappe dazugehört.
 * Das Feld wird Pflicht. Dazu, was es bedeutet: nur an der übergeordneten Mappe, keine eigene Ansicht, kein „+ Neu“ –
 * und dass Ausblenden kein Schutz ist (Ergänzung Sicherheit).
 */
export function TeilEinstellung({ eigeneId, felder, teilVon, berechtigungen, typen, entwurf, setze }: {
  eigeneId: string;
  felder: EntwurfsFeld[];
  /** `_uid` des gewählten Felds oder null (aus). */
  teilVon: string | null;
  berechtigungen: Regelwerk;
  /** Alle Mappentypen der Ablage (mit Berechtigungen – der Editor ist nur für Administratoren). */
  typen: Mappentyp[];
  /** Der Entwurf als Mappentyp, um Regeln auf seine Felder zu prüfen. */
  entwurf: Mappentyp;
  setze(patch: { teilVon: string | null; pflicht?: string; berechtigungen?: Regelwerk }): void;
}) {
  // Was beim Einschalten übernommen wurde – sichtbar, bis man speichert oder wieder wechselt.
  const [uebernommen, setUebernommen] = useState<string>();
  const moeglich = kandidaten(felder, eigeneId, typen);
  const feld = felder.find((f) => f._uid === teilVon);
  const zielId = feld ? einzigesZiel(feld) : undefined;
  const eltern = typen.find((x) => x.id === zielId);
  // Hat dieser Typ selbst Teile, kann er keiner werden (keine Ketten).
  const eigeneTeile = typen.filter((x) => x.id !== eigeneId && istTeiltyp(x) && x.felder.some((f) => f.key === x.teilVon && einzigesZiel(f) === eigeneId));
  const waehle = (uid: string | null) => {
    const f = felder.find((x) => x._uid === uid);
    const z = f ? typen.find((x) => x.id === einzigesZiel(f)) : undefined;
    const r = uid ? vorgabeRechte(z, berechtigungen, entwurf) : null;
    setze({ teilVon: uid, ...(f ? { pflicht: f._uid } : {}), ...(r ? { berechtigungen: r.regelwerk } : {}) });
    setUebernommen(r && z ? [t('mappentypen.teile.rechte-uebernommen', { eltern: typName(z) }), r.ausgelassen ? t('mappentypen.teile.rechte-ausgelassen', { anzahl: r.ausgelassen }) : ''].filter(Boolean).join(' ') : undefined);
  };
  return (
    <div className="teil-einstellung" data-anker="mappentyp.teil">
      <HakenFeld beschriftung={t('mappentypen.teile.einstellung-name')} hilfe="mappentyp.teil"
        hinweis={eigeneTeile.length ? t('mappentypen.teile.hat-teile', { typen: eigeneTeile.map((x) => typName(x)).join(', ') }) : moeglich.length ? t('mappentypen.teile.einstellung-hilfe') : t('mappentypen.teile.kein-feld')}>
        <input type="checkbox" checked={teilVon !== null} disabled={!teilVon && (!moeglich.length || eigeneTeile.length > 0)}
          onChange={(ev) => waehle(ev.target.checked ? (moeglich.length === 1 ? moeglich[0]._uid : '') : null)} />
      </HakenFeld>
      {teilVon !== null && <>
        <div className="raster">
          <Feld beschriftung={t('mappentypen.teile.feld')} id="typ-teil-feld" hinweis={t('mappentypen.teile.feld-hilfe')}>
            <select value={teilVon} onChange={(ev) => waehle(ev.target.value)}>
              <option value="">{t('mappentypen.teile.waehlen')}</option>
              {moeglich.map((f) => { const z = typen.find((x) => x.id === einzigesZiel(f)); return <option key={f._uid} value={f._uid}>{z ? `${feldLabel(f)} → ${typName(z)}` : feldLabel(f)}</option>; })}
            </select>
          </Feld>
        </div>
        {eltern && <p className="leise klein">{t('mappentypen.teile.bedeutet', { eltern: typName(eltern) })}</p>}
        {uebernommen && <div className="hinweis info"><p>{uebernommen}</p></div>}
        {eltern && <p className="leise klein">{t('mappentypen.teile.rechte', { eltern: typName(eltern) })}</p>}
        <p className="leise klein">{t('mappentypen.teile.kein-schutz')}</p>
      </>}
    </div>
  );
}
