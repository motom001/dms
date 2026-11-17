/** „Über dieses Dokument“ (#1211, #1279): Text, Archivfassung, Archivnummer, Eingang, Versionen. */
import { OCR_STAENDE, type Dokument, type OcrStand } from '../../../../shared/src/model';
import { spracheAusInfo } from '../../../../shared/src/textsprache';
import { volltextHerkunft } from '../../../../shared/src/volltext';
import { fassungAusInfo } from '../../../../shared/src/dateiumwandlung';
import { pdfaName } from '../../../../shared/src/archivfassung';
import { herkunftText } from '../../volltext';
import { t } from '../../sprache';
import { fassungUrl } from '../../api/dokumente';
import { Person } from '../../Person';
import { Knopf } from '../../bausteine';
import { herkunftVon, sprachenAnzeige, zeit } from './hilfen';

/** „Wartet auf Paket“ statt Texterkennung (#614), sonst der Stand der Texterkennung. */
function standText(s?: OcrStand) {
  const art = s ? volltextHerkunft(s)?.art : undefined;
  return s?.stand === 'paket' && (art === 'umwandlung' || art === 'volltext') ? t('volltext.stand.paket') : s ? OCR_STAENDE[s.stand] : '';
}

/** Text in einer Zeile: Herkunft und Sprachen, wenn fertig; sonst Stand, Herkunft und Fortschritt des Pakets (#458). */
function textAngabe(x: Dokument, s?: OcrStand) {
  const herkunft = s ? herkunftText(s) : '';
  const sprache = s?.stand === 'fertig' ? (x.sprache ? { sprache: x.sprache } : spracheAusInfo(s.info)) : null;
  const fortschritt = s?.stand === 'paket' ? /\(Paket .+?\) – (.+)$/.exec(s.info ?? '')?.[1] : undefined;
  return s?.stand === 'fertig'
    ? [herkunft, sprache ? sprachenAnzeige(sprache.sprache, x.weitereSprachen) : ''].filter(Boolean).join(' · ') ||
        t('ablage.dokumente.text-anzeigen')
    : s && s.stand !== 'keiner'
      ? [standText(s), herkunft, fortschritt].filter(Boolean).join(' · ')
      : t('ablage.dokumente.ueber.kein-text');
}

/** Text des Dokuments: was erkannt ist, die umgewandelte Fassung mit Link (#577); Text zeigen und neu erkennen. */
function TextWert({ x, s, textOffen, text, neu }: { x: Dokument; s?: OcrStand; textOffen: boolean; text(): void; neu?: () => void }) {
  const fassung = s?.stand === 'fertig' ? fassungAusInfo(s.info) : null;
  return (
    <dd>
      {textAngabe(x, s)}
      {fassung && (
        <>
          {' '}
          · {t('volltext.herkunft.fassung', { paket: fassung })}{' '}
          <a className="verweis" href={fassungUrl(x.id)} target="_blank" rel="noreferrer" title={t('volltext.herkunft.fassung.titel')}>
            {t('volltext.herkunft.fassung.ansehen')}
          </a>
        </>
      )}
      {s?.stand === 'fertig' && (
        <Knopf art="link" groesse="klein" onClick={text}>
          {textOffen ? t('ablage.dokumente.text-ausblenden') : t('ablage.dokumente.ueber.zeigen')}
        </Knopf>
      )}
      {neu && (s?.stand === 'fertig' || s?.stand === 'paket') && (
        <Knopf art="link" groesse="klein" title={t('volltext.dokument.neu.titel')} onClick={neu}>
          {t('volltext.dokument.neu')}
        </Knopf>
      )}
    </dd>
  );
}

/** Archivfassung (#631): Stufe, im Original, wartet auf Paket, Hinweise. */
function ArchivWert({ x }: { x: Dokument }) {
  const a = x.archivfassung;
  const f = a?.stand === 'fertig' ? a.fassung : undefined;
  return (
    <dd>
      {f
        ? t('volltext.archiv.chip.fertig', { pdfa: pdfaName(f.pdfa) })
        : a
          ? t.frei(`volltext.archiv.chip.${a.stand}`)
          : t('ablage.dokumente.ueber.keine')}
      {f?.imOriginal && <> · {t('volltext.archiv.im-original')}</>}
      {a?.stand === 'wartet' && a.paket && <> · {t('volltext.archiv.wartet', { paket: a.paket.name })}</>}
      {a && a.stand !== 'wartet' && a.info && <> · {a.info}</>}
      {f?.signiert && <> · {t('volltext.archiv.signiert')}</>}
      {f?.weggelassen && <> · {t('volltext.archiv.weggelassen')}</>}
      {f?.erechnung && <> · {t('volltext.archiv.erechnung')}</>}
    </dd>
  );
}

/**
 * „Über dieses Dokument“ (#1211) unter der geöffneten Anzeige: Text, Archivnummer, Eingang, Versionen, Archivfassung –
 * je nur Wert und Knopf. Hier steht die Technik, die früher in der Zeile stand (Herkunft des Texts, PDF/A-Stufe).
 */
export function UeberDokument({
  x,
  s,
  versioniert,
  textOffen,
  text,
  neu,
  archivnummer,
  versionen,
}: {
  x: Dokument;
  s?: OcrStand;
  versioniert: boolean;
  textOffen: boolean;
  text(): void;
  neu?: () => void;
  archivnummer?: () => void;
  versionen(): void;
}) {
  return (
    <dl className="dok-ueber klein" aria-label={t('ablage.dokumente.ueber.titel')}>
      <div>
        <dt>{t('ablage.dokumente.ueber.text')}</dt>
        <TextWert x={x} s={s} textOffen={textOffen} text={text} neu={neu} />
      </div>
      <div>
        <dt>{t('ablage.dokumente.ueber.archivfassung')}</dt>
        <ArchivWert x={x} />
      </div>
      <div>
        <dt>{t('ablage.dokumente.ueber.archivnummer')}</dt>
        <dd>
          {x.archivnummer ? <strong className="mono">{x.archivnummer}</strong> : t('ablage.dokumente.ueber.keine')}
          {archivnummer && (
            <Knopf art="link" groesse="klein" title={t('ablage.dokumente.nummer-vom-aufkleber-auf')} onClick={archivnummer}>
              {x.archivnummer ? t('ablage.dokumente.ueber.aendern') : t('ablage.dokumente.ueber.vergeben')}
            </Knopf>
          )}
        </dd>
      </div>
      <div>
        <dt>{t('ablage.dokumente.ueber.eingang')}</dt>
        <dd>
          {zeit(x.erstellt)} · {herkunftVon(x.herkunft)} · <Person id={x.erstelltVon} />
        </dd>
      </div>
      {(versioniert || (x.version ?? 1) > 1) && (
        <div>
          <dt>{t('ablage.dokumente.ueber.versionen')}</dt>
          <dd>
            {t('ablage.dokumente.ueber.version', { wert: x.version ?? 1 })}
            <Knopf art="link" groesse="klein" onClick={versionen}>
              {t('ablage.dokumente.menue.versionen')}
            </Knopf>
          </dd>
        </div>
      )}
    </dl>
  );
}
