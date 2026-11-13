import { Link } from '../../ort';
import { Symbol } from '../../Symbol';
import { t } from '../../sprache';
import s from './PaketChip.module.css';

/**
 * Baustein PaketChip (#1192): woher ein Eintrag stammt – überall gleich, als kleiner Chip direkt hinter dem Namen:
 * Paket-Symbol und Paketname („Basis“), Tooltip „aus dem Paket Basis, Version 1.4.0“, Klick führt zur Paketseite.
 * Selbst angelegte Einträge haben keinen Chip; was Ablago selbst mitbringt, trägt „Ablago“ (ohne Link). Keine eigene
 * Zeile für die Herkunft. Anleitung im Entwicklerhandbuch, „Gestaltung und Bausteine → PaketChip“.
 *
 * In einer Liste ist die ganze Zeile schon ein Link: Dort steht der Chip mit `inLink` ohne eigenen Link (ein Link im
 * Link ist für Tastatur und Screenreader kaputt) – Name und Tooltip bleiben.
 */
export interface PaketHerkunft {
  id: string;
  /** Anzeigename; ohne Namen die Kennung. */
  name?: string | null;
  version?: string | null;
}

export interface PaketChipProps {
  /** Das Paket, `'ablago'` für Eingebautes, sonst (eigen) nichts. */
  paket: PaketHerkunft | 'ablago' | null | undefined;
  /** Steht in einem Link (Listenzeile): ohne eigenen Link. */
  inLink?: boolean;
  /** Eigener Tooltip statt „aus dem Paket …“ (z. B. „ersetzt die Vorlage von Ablago“). */
  titel?: string;
}

export function PaketChip({ paket, inLink, titel }: PaketChipProps) {
  if (!paket) return null;
  if (paket === 'ablago') {
    return <span className={s.chip} title={titel ?? t('oberflaeche.paketchip.ablago.titel')} data-paket="ablago">{t('oberflaeche.paketchip.ablago')}</span>;
  }
  const name = paket.name || paket.id;
  const tipp = titel ?? (paket.version ? t('oberflaeche.paketchip.titel-version', { name, version: paket.version }) : t('oberflaeche.paketchip.titel', { name }));
  const inhalt = <><Symbol name="paket" className={s.symbol} /><span>{name}</span></>;
  if (inLink) return <span className={s.chip} title={tipp} data-paket={paket.id}>{inhalt}</span>;
  return (
    <Link to={`/werkbank/pakete/${encodeURIComponent(paket.id)}`} className={`${s.chip} ${s.link}`} title={tipp}>
      {inhalt}
    </Link>
  );
}
