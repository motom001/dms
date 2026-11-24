/**
 * Vorschau beim Installieren (#1635): Wer bekommt was? Die Vorschau eines Pakets mit Netz ist der Moment der
 * Entscheidung – dort steht konkret, an welche Adressen das Paket Inhalte aus welchen Bereichen schickt („aus allen
 * Bereichen …, ausgenommen: …“). Beim Paket Gesundheit kommt ein Hinweis nur, wenn schon ein Paket mit Netz aktiv ist
 * und neue Mappentypen hinausgehen (Abstimmung Sicherheit/Thomas, 24.11.2026) – keine weiteren Hinweise.
 */
import type { Mappentyp } from '../../../../shared/src/model';
import { istKiPaket, type InstalliertesPaket, type PaketCode } from '../../../../shared/src/pakete';
import { kiErlaubt, type KiStand } from '../../mappentypen';
import { t } from '../../sprache/sprache';

/** Id des Pakets Gesundheit im offiziellen Katalog. */
const GESUNDHEIT = 'gesundheit';

const host = (adresse: string) => {
  try {
    return new URL(adresse).host || adresse;
  } catch {
    return adresse;
  }
};

/** Wohin das Paket Inhalte schicken kann: feste Adressen (Host) und Dienst-Adressen aus den Einstellungen. */
function ziele(c: PaketCode): string {
  const fest = [...new Set(c.netz.map(host))];
  const einst = (c.adressen ?? []).map((a) => t('meldungen.pakete.netz.adresse', { a: a.name }));
  return [...fest, ...einst].join(', ');
}

/** Die Sätze für die Vorschau; null, wenn es nichts zu sagen gibt. */
export function diensteImNetz(x: {
  id: string;
  name: string;
  code: PaketCode | undefined;
  ki: KiStand;
  typen: Mappentyp[];
  installierte: InstalliertesPaket[];
}): { satz?: string; gesundheit?: string } | null {
  const typen = x.typen.filter((y) => y.system !== 'benutzer');
  const name = (y: Mappentyp) => y.name;
  const r: { satz?: string; gesundheit?: string } = {};
  if (x.code && istKiPaket(x.code)) {
    const an = ziele(x.code);
    const erlaubt = typen.filter((y) => kiErlaubt(x.ki, y.id));
    if (x.ki.alle) {
      const aus = typen.filter((y) => !kiErlaubt(x.ki, y.id)).map(name);
      r.satz = aus.length
        ? t('meldungen.pakete.netz.alle-ausser', { name: x.name, ziele: an, aus: aus.join(', ') })
        : t('meldungen.pakete.netz.alle', { name: x.name, ziele: an });
    } else
      r.satz = erlaubt.length
        ? t('meldungen.pakete.netz.liste', { name: x.name, ziele: an, bereiche: erlaubt.map(name).join(', ') })
        : t('meldungen.pakete.netz.keine', { name: x.name, ziele: an });
  }
  // Gesundheit: nur, wenn ein Paket mit Netz schon aktiv ist und neue Mappentypen mit hinausgehen.
  const aktiv = x.installierte.filter((p) => p.id !== x.id && !p.angehalten && istKiPaket(p.laeufer));
  if (x.id === GESUNDHEIT && x.ki.alle && aktiv.length)
    r.gesundheit = t('meldungen.pakete.netz.gesundheit', { pakete: aktiv.map((p) => p.name).join(', ') });
  return r.satz || r.gesundheit ? r : null;
}
