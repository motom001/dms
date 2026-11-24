/**
 * Von Ablago mitgeliefert (#1570): Stand der mitgelieferten Anbieter (Schalter, Tätigkeiten, Ersatz) und „Wer macht
 * das?“ – geladen, solange Werkbank → Pakete offen ist. Schalten und Wählen liefern den neuen Stand gleich mit.
 */
import { useCallback, useEffect, useState } from 'react';
import type { MitgelieferterAnbieter, MitgeliefertStand } from '../../../../shared/src/leistungen';
import { paketeApi } from '../../api/pakete';
import { t } from '../../sprache';

export function useMitgeliefert(offen: boolean) {
  const [stand, setStand] = useState<MitgeliefertStand | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => {
    try {
      setStand(await paketeApi.mitgeliefert());
      setFehler(undefined);
    } catch (e) {
      setFehler((e as Error).message);
    }
  }, []);
  useEffect(() => {
    if (offen) void laden();
  }, [offen, laden]);
  /** Ein- oder ausschalten; Fehler gehen an den Schalter (er zeigt sie an). */
  const schalten = useCallback(async (id: string, an: boolean) => setStand(await paketeApi.mitgeliefertSchalten(id, an)), []);
  const waehle = useCallback(
    async (leistung: string, anbieter: string | null) => setStand(await paketeApi.werMacht(leistung, anbieter)),
    [],
  );
  return { stand, fehler, laden, schalten, waehle };
}
export type MitgeliefertZustand = ReturnType<typeof useMitgeliefert>;

/** Ist das ein mitgelieferter Anbieter (Kennung `ablago.<name>`)? Dann zeigt die Paketseite ihn statt eines Pakets. */
export const istMitgeliefert = (id: string | undefined): boolean => !!id && /^ablago\.[a-z]+$/.test(id);

/** Tätigkeiten als kurze Zeile: „Text lesen, In PDF/A umwandeln“. */
export const taetigkeitenText = (a: MitgelieferterAnbieter) => a.taetigkeiten.map((x) => x.name).join(', ');

/**
 * Was das Ausschalten bedeutet (#1570, Qualität 14.4): die Folge in Worten, ob es Ersatz gibt, und der Weg in den
 * Katalog – ohne Ersatz zu der Tätigkeit, für die keiner da ist.
 */
export function folgeDesAusschaltens(a: MitgelieferterAnbieter): { folge: string; ersatz: string; katalog: string } {
  const ohne = a.taetigkeiten.filter((x) => !x.ersatz.length);
  const wer = [...new Set(a.taetigkeiten.flatMap((x) => x.ersatz.map((e) => e.name)))].join(', ');
  const ersatz = !ohne.length
    ? t('werkbank.pakete.mitgeliefert.ersatz.da', { wer })
    : ohne.length === a.taetigkeiten.length
      ? t('werkbank.pakete.mitgeliefert.ersatz.keiner')
      : t('werkbank.pakete.mitgeliefert.ersatz.teils', { taetigkeiten: ohne.map((x) => x.name).join(', ') });
  return {
    folge: t.frei(`werkbank.pakete.mitgeliefert.folge.${a.id}`),
    ersatz,
    katalog: (ohne[0] ?? a.taetigkeiten[0]).katalog,
  };
}

/** Dateitypen einer Tätigkeit lesbar: „alle“ oder die Liste (PDF, JPEG …). */
export function dateitypenText(typen: readonly string[]): string {
  if (!typen.length || typen.includes('*/*')) return t('werkbank.pakete.mitgeliefert.alle-typen');
  return typen.map((m) => (m.endsWith('/*') ? m : (m.split('/')[1] ?? m).toUpperCase())).join(', ');
}
