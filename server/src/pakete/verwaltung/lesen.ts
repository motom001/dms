/**
 * Paket lesen (`liesPaket`): Manifest und Inhalte aus den Dateien eines Archivs; wirft mit allen Fehlern auf einmal.
 * Die Schritte (#1278, Schritt 6a-2) stehen in lesen-lauf.ts (Manifest), lesen-typen.ts (Mappentypen, Ansichten),
 * lesen-inhalt.ts (Beispiele bis Rundgänge) und lesen-code.ts (Code, Aktionen) – in dieser Reihenfolge, wie vorher.
 */
import { istHerausgeber } from '../../../../shared/src/kennungen';
import { Fachfehler } from '../../grundlagen/fehler';
import { t } from '../../sprache/sprache';
import { liesKurzanleitung } from '../../../../shared/src/mitkommt';
import { type Paket, str } from './format';
import { liesSprachteil } from './inhalt-pruefen';
import { liesCodeTeil } from './lesen-code';
import {
  liesAblaufvorlagen,
  liesAutomatisierungen,
  liesBeispiele,
  liesEntdecken,
  liesVorgabenUndUmbau,
  liesWortlisten,
  pruefeKennungen,
  pruefeTabellen,
} from './lesen-inhalt';
import { liesManifest, neuerLeseLauf, ohneOrdner, pruefeKopf } from './lesen-lauf';
import { liesSichten, liesTypen } from './lesen-typen';

/** Liest Manifest und Inhalte aus den Dateien eines Archivs; wirft mit allen Fehlern auf einmal. */
export function liesPaket(roh: Map<string, Buffer>): Paket {
  const dateien = ohneOrdner(roh);
  const fehler: string[] = [];
  const m = liesManifest(dateien, fehler);
  const l = neuerLeseLauf(dateien, fehler, m);
  const abh = l.abh;
  const { erg, fr } = pruefeKopf(l);
  // Sprachpaket (#731): nur Texte – kein Code, keine Mappentypen, keine anderen Dateien.
  const sprache = m.sprache !== undefined ? liesSprachteil(m, dateien, fehler) : null;
  const typen = liesTypen(l);
  const sichten = liesSichten(l);
  const { beispiele, beispielDateien } = liesBeispiele(l, typen);
  const { vt, umbau } = liesVorgabenUndUmbau(l, typen, beispiele);
  const { automatisierungen, zeitplanKarten } = liesAutomatisierungen(l, typen);
  const ablaufvorlagen = liesAblaufvorlagen(l, typen);
  const wortlisten = liesWortlisten(l);
  pruefeTabellen(l, typen);
  const entdecken = liesEntdecken(l, typen);
  pruefeKennungen(l, typen, sichten);
  const { einst, ma, code } = liesCodeTeil(l, typen, zeitplanKarten);
  if (fehler.length) throw new Fachfehler(422, t('meldungen.pakete.das-paket-ist-ungueltig'), { gruende: fehler });
  return {
    manifest: {
      id: str(m.id),
      name: str(m.name).trim(),
      version: str(m.version),
      beschreibung: str(m.beschreibung),
      autor: { name: str((m.autor as Record<string, unknown>)?.name), github: str((m.autor as Record<string, unknown>)?.github) },
      lizenz: str(m.lizenz),
      dms: str(m.dms),
      abhaengigkeiten: Object.fromEntries(Object.entries(abh).map(([k, v]) => [k, str(v)])),
      ...(m.code !== undefined ? { code: m.code } : {}),
      ...(erg.ergaenzt ? { ergaenzt: erg.ergaenzt } : {}),
      ...(istHerausgeber(m.herausgeber) ? { herausgeber: m.herausgeber } : {}),
      ...(fr.ersetzt.length ? { ersetzt: fr.ersetzt } : {}),
    },
    typen,
    sichten,
    beispiele,
    wortlisten,
    automatisierungen,
    readme: dateien.get('README.md')?.toString('utf8') ?? '',
    einstellungen: einst.beschreibung,
    code,
    sprache,
    ...(beispielDateien.size ? { beispielDateien } : {}),
    ...(vt.vorgaben.length ? { vorgaben: vt.vorgaben } : {}),
    ...(vt.ergaenzungen.length ? { ergaenzungen: vt.ergaenzungen } : {}),
    ...(vt.vorlagenDateien.size ? { vorlagenDateien: vt.vorlagenDateien } : {}),
    // Umbau-Schritt in denselben Typ (#1658): Felder umbenennen beim Update – kein Umzug, das macht typ-update.ts.
    ...(umbau.some((s) => s.von !== s.nach) ? { umbau: umbau.filter((s) => s.von !== s.nach) } : {}),
    ...(umbau.some((s) => s.von === s.nach) ? { umbenennen: umbau.filter((s) => s.von === s.nach) } : {}),
    ...(ma.aktionen.length ? { mappenaktionen: ma.aktionen } : {}),
    ...(ablaufvorlagen.length ? { ablaufvorlagen } : {}),
    // Kurzanleitung (#1047): Ungültiges übergeht Ablago still, wie ältere Versionen das ganze Feld.
    ...(() => {
      const k = liesKurzanleitung(m.kurzanleitung);
      return k ? { kurzanleitung: k } : {};
    })(),
    ...(Object.keys(entdecken).length ? { entdecken } : {}),
  };
}
