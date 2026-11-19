import { Knopf, type KnopfErgebnis } from '../bausteine';
import { HilfeVerweis } from '../Hilfe';
import { t } from '../sprache';
import type { WerkzeugAbschirmung } from '../api/betrieb';
import { fehlendeProgramme, fehlendeWerkzeuge, type WerkzeugArt, type Werkzeuge } from '../../../shared/src/werkzeuge';

/**
 * Eingebaute Werkzeuge (#1189): Sind alle da, steht hier nichts – Lena hat dann nichts zu tun. Fehlt eins, sagt ein
 * Hinweis in Alltagssprache, was deshalb nicht geht und was hilft, mit „Erneut prüfen“ und „Mehr dazu“. Die Namen
 * der Programme stehen nur als Detail für Fachleute darunter. Steht oben auf Suche und Volltext und im Systemzustand.
 */
export function WerkzeugeHinweis({
  werkzeuge,
  pruefen,
}: {
  werkzeuge: Werkzeuge | null | undefined;
  pruefen: () => Promise<string | undefined>;
}) {
  const fehlt = fehlendeWerkzeuge(werkzeuge);
  if (!werkzeuge || !fehlt.length) return null;
  const programme = fehlt.map((art) => `${fehlendeProgramme(werkzeuge, art).join(', ')} (${PAKET[art]})`).join('; ');
  return (
    <div className="hinweis warn" role="status" id="werkzeuge">
      {fehlt.map((art) => (
        <p key={art}>
          <strong>{t.frei(`werkbank.werkzeuge.${art}.fehlt`)}</strong> {t.frei(`werkbank.werkzeuge.${art}.folge`)}
        </p>
      ))}
      <p>{t('werkbank.werkzeuge.abhilfe', { anzahl: fehlt.length })}</p>
      <p className="leise klein">{t('werkbank.werkzeuge.fachleute', { programme })}</p>
      <div className="knoepfe">
        <Knopf
          laeuftText={t('werkbank.werkzeuge.prueft')}
          onClick={async (): Promise<KnopfErgebnis> => {
            const f = await pruefen();
            return f ? { art: 'schlecht', text: f } : { art: 'gut', text: t('werkbank.werkzeuge.geprueft') };
          }}>
          {t('werkbank.werkzeuge.erneut-pruefen')}
        </Knopf>
        <HilfeVerweis ort="werkbank.werkzeuge">{t('werkbank.werkzeuge.mehr')}</HilfeVerweis>
      </div>
    </div>
  );
}

/** Name des Programmpakets für Fachleute (so heißt es in den Paketquellen der Linux-Distributionen). */
const PAKET: Record<WerkzeugArt, string> = { poppler: 'Poppler', qpdf: 'qpdf', schriften: 'Alpine' };

/** Zeilen für „Installiert“ unter Version und Updates: je Werkzeug „vorhanden“ oder „fehlt“. */
export function werkzeugZeilen(w: Werkzeuge | null | undefined): Array<[string, string]> {
  if (!w) return [];
  const fehlt = fehlendeWerkzeuge(w);
  return (['poppler', 'qpdf', 'schriften'] as const)
    .filter((art) => art !== 'schriften' || w.schriften !== undefined)
    .map((art) => [
      t.frei(`werkbank.werkzeuge.${art}.name`),
      fehlt.includes(art) ? t('werkbank.werkzeuge.fehlt') : t('werkbank.werkzeuge.vorhanden'),
    ]);
}

/** Zeile „Dokumentwerkzeuge“ im Systemzustand (#1449): getrennt oder ohne eigenen Benutzer, mit Speichergrenze. */
export function abschirmungZeile(a: WerkzeugAbschirmung | null | undefined): Array<[string, string]> {
  if (!a) return [];
  const art = a.getrennt ? t('systemzustand.werkzeuge.getrennt') : t('systemzustand.werkzeuge.gemeinsam');
  const grenze =
    a.speicherMb === null ? t('systemzustand.werkzeuge.ohne-grenze') : t('systemzustand.werkzeuge.grenze', { mb: a.speicherMb });
  return [[t('systemzustand.werkzeuge'), `${art}, ${grenze}`]];
}

/**
 * Dokumentwerkzeuge ohne eigenen Benutzer (#1449): nur im Container – dort trennt das Image sie sonst immer. Außerhalb
 * (Entwicklung) laufen sie ohnehin unter dem eigenen Benutzer.
 */
export function AbschirmungHinweis({ a, container }: { a: WerkzeugAbschirmung | null | undefined; container: boolean | undefined }) {
  if (!a || a.getrennt || !container) return null;
  return (
    <div className="hinweis warn" role="status" id="werkzeuge-getrennt">
      <p>
        <strong>{t('systemzustand.werkzeuge.gemeinsam.titel')}</strong> {t('systemzustand.werkzeuge.gemeinsam.text')}
      </p>
      <div className="knoepfe">
        <HilfeVerweis ort="werkbank.ohne-root">{t('systemzustand.werkzeuge.gemeinsam.mehr')}</HilfeVerweis>
      </div>
    </div>
  );
}
