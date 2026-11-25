import { useEffect, useState } from 'react';
import { paketeApi } from '../api/pakete';
import { t } from '../sprache';

/** So oft fragt der Hinweis nach, solange übertragen wird. */
const TAKT_MS = 3000;

/**
 * Paket-Update (#1658): Solange die Werte entfallener Felder im Hintergrund in die Notizen gehen, sagt der Mappentyp es
 * – „Update von „Finanzen“ wird übernommen (412 von 735)“. Danach verschwindet der Hinweis.
 */
export function UpdateUebernahme({ typId }: { typId: string }) {
  const [stand, setStand] = useState<{ paket: string; fertig: number; gesamt: number | null } | null>(null);
  useEffect(() => {
    let aus = false;
    let zeit: ReturnType<typeof setTimeout> | undefined;
    const frage = () =>
      paketeApi.paketUebernahme().then(
        (l) => {
          if (aus) return;
          const x = l.find((y) => y.typId === typId) ?? null;
          setStand(x);
          if (x) zeit = setTimeout(() => void frage(), TAKT_MS);
        },
        () => {},
      );
    void frage();
    return () => {
      aus = true;
      clearTimeout(zeit);
    };
  }, [typId]);
  if (!stand) return null;
  return (
    <div className="hinweis info" role="status">
      <p>
        {stand.gesamt === null
          ? t('werkbank.pakete.update.uebernahme-start', { paket: stand.paket })
          : t('werkbank.pakete.update.uebernahme', { paket: stand.paket, fertig: stand.fertig, gesamt: stand.gesamt })}
      </p>
    </div>
  );
}
