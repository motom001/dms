/** Kopf des Dokumentenregisters (#1279): Ablagezone, Leiste der Auswahl, Zusammenfügen und neue Dateien. */
import type { DragEvent } from 'react';
import { registerName } from '../../../../shared/src/beschriftung';
import { t } from '../../sprache';
import { Hilfe } from '../../Hilfe';
import { Feld, HakenFeld, Knopf, Wahlhaken } from '../../bausteine';
import { Fundstellen } from '../Doppelt';
import { alleHerunterladen, auswahlLoeschen, fuegeZusammen } from './aktionen';
import { DOKUMENT_SORTIERUNGEN, groesse, mitZaehler, type NeueDatei } from './hilfen';
import type { Kern } from './kern';
import { NichtHerunterladen } from './teile';

/** Dateien hierher ziehen oder auswählen; zu große nennt der Hinweis darunter. */
export function Ablagezone({ k }: { k: Kern }) {
  const { h } = k;
  const fallen = (e: DragEvent) => {
    e.preventDefault();
    h.setZiehen(false);
    h.nimm(e.dataTransfer.files);
  };
  return (
    <div
      className={`ablagezone ${h.ziehen ? 'zieht' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        h.setZiehen(true);
      }}
      onDragLeave={() => h.setZiehen(false)}
      onDrop={fallen}>
      <p>
        {t('ablage.dokumente.dateien-hierher-ziehen-oder')}{' '}
        <Knopf onClick={() => h.auswahlFeld.current?.click()}>{t('ablage.dokumente.auswaehlen')}</Knopf>
      </p>
      <p className="leise klein">{t('ablage.dokumente.bis-100-mb-je')}</p>
      <input
        ref={h.auswahlFeld}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) h.nimm(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}

/** Leiste über der Liste (#87): alle auswählen, herunterladen, zusammenfügen, entfernen, sortieren. */
export function Dokleiste({ k }: { k: Kern }) {
  const { w, o, p, d } = k;
  const alleAuswahl = w.waehlbar.length > 0 && w.auswahl.length === w.waehlbar.length;
  return (
    <div className="dokleiste">
      <span className="dokleiste-alle">
        <Wahlhaken
          an={alleAuswahl}
          teilweise={w.auswahl.length > 0 && !alleAuswahl}
          gesperrt={!w.waehlbar.length}
          beschriftung={t('ablage.dokumente.alle-auswaehlen')}
          setze={() => w.setGewaehlt(alleAuswahl ? new Set() : new Set(w.waehlbar.map((x) => x.id)))}
        />
        <span className="klein" aria-live="polite">
          {w.auswahl.length
            ? t('ablage.dokumente.von-ausgewaehlt', { auswahl: w.auswahl.length, waehlbar: w.waehlbar.length })
            : t('ablage.dokumente.alle-auswaehlen')}
        </span>
      </span>
      <Hilfe ort="dokumente.mehrere" />
      {/* Nichts gewählt: blass (nichts zu tun); ohne Exportrecht oder mit Pflicht-Stempel: gesperrt aus einem Grund (Leitsatz 6). */}
      {p.mitnehmen === false ? (
        <NichtHerunterladen />
      ) : (
        <Knopf
          groesse="klein"
          symbol="herunterladen"
          onClick={() => alleHerunterladen(k)}
          gesperrt={k.stempelPflicht ? t('ablage.dokumente.dieser-mappentyp-verlangt-beim') : !w.auswahl.length}>
          {t('ablage.dokumente.herunterladen')}
        </Knopf>
      )}
      {k.bearbeitbar && w.pdfAuswahl.length >= 2 && (
        <Knopf
          groesse="klein"
          aria-expanded={!!o.zusammen}
          onClick={() => o.setZusammen(o.zusammen ? null : { name: w.pdfAuswahl[0].name, entfernen: false })}>
          {t('ablage.dokumente.zusammenfuegen')}
        </Knopf>
      )}
      {/* Entfernen der Auswahl (#87): erst beim Speichern, bis dahin „Behalten“ – nicht rot (Leitsatz 5). */}
      {!p.nurLesen && w.auswahl.length > 0 && (
        <Knopf groesse="klein" symbol="geloescht" title={t('ablage.dokumente.entfernen.titel')} onClick={() => auswahlLoeschen(k)}>
          {t('ablage.dokumente.entfernen')}
        </Knopf>
      )}
      {p.post ? (
        <span className="sortwahl klein leise">{t('ablage.dokumente.eingangsreihenfolge')}</span>
      ) : (
        <Feld beschriftung={t('ablage.dokumente.sortieren-feld')} beschriftungVerbergen className="sortwahl">
          <select
            value={k.sortierung}
            onChange={(e) => d.setzeEinstellung('dokumente_sortierung', e.target.value === 'name' ? null : e.target.value)}>
            {Object.entries(DOKUMENT_SORTIERUNGEN).map(([schluessel, v]) => (
              <option key={schluessel} value={schluessel}>
                {v}
              </option>
            ))}
          </select>
        </Feld>
      )}
      <Hilfe ort="dokumente.sortieren" />
    </div>
  );
}

/** PDFs der Auswahl zusammenfügen (#335). */
export function Zusammenfuegen({ k }: { k: Kern }) {
  const { zusammen, setZusammen } = k.o;
  const { pdfAuswahl } = k.w;
  if (!zusammen) return null;
  return (
    <div className="zusammenfuegen" role="group" aria-label={t('ablage.dokumente.pdfs-zusammenfuegen')}>
      <span className="klein">{t('ablage.dokumente.pdfs-in-der-reihenfolge', { pdfAuswahl: pdfAuswahl.length })}</span>
      <Feld beschriftung={t('ablage.dokumente.name')}>
        <input value={zusammen.name} onChange={(e) => setZusammen({ ...zusammen, name: e.target.value })} />
      </Feld>
      <HakenFeld
        beschriftung={t('ablage.dokumente.ausgangsdokumente', {
          wert: k.d.zaehler.papierkorbTage ? t('ablage.dokumente.in-den-papierkorb-legen') : t('ablage.dokumente.loeschen-endgueltig'),
        })}>
        <input type="checkbox" checked={zusammen.entfernen} onChange={(e) => setZusammen({ ...zusammen, entfernen: e.target.checked })} />
      </HakenFeld>
      <Knopf
        art="haupt"
        groesse="klein"
        laeuft={zusammen.laeuft}
        laeuftText={t('ablage.dokumente.wird-zusammengefuegt')}
        onClick={() => fuegeZusammen(k)}>
        {t('ablage.dokumente.zusammenfuegen')}
      </Knopf>
      <Knopf groesse="klein" gesperrt={zusammen.laeuft} onClick={() => setZusammen(null)}>
        {t('ablage.dokumente.abbrechen')}
      </Knopf>
      <Hilfe ort="dokumente.seiten" />
      {zusammen.fehler && (
        <div className="hinweis schlecht">
          <p>{zusammen.fehler}</p>
        </div>
      )}
    </div>
  );
}

/** Eine Datei, die erst beim Speichern hochgeladen wird – mit Hinweis auf Doppelte (#333) und gleichen Namen (#194). */
export function NeueZeile({ k, n }: { k: Kern; n: NeueDatei }) {
  const { doppelt, p, versioniert } = k;
  return (
    <li className="neu">
      <div className="dokzeile">
        <div className="dokname">
          <span>
            {n.datei.name} <span className="chip gut">{t('ablage.dokumente.neu')}</span>
          </span>
          <span className="leise klein">{t('ablage.dokumente.wird-beim-speichern-hochgeladen', { groesse: groesse(n.datei.size) })}</span>
          {doppelt[n.uid] && (
            <span className="hinweis warn doppelthinweis">
              <Fundstellen f={doppelt[n.uid]} /> {t('ablage.dokumente.beim-speichern-wird-sie')}
            </span>
          )}
          {/* Gleicher Name wie ein vorhandenes Dokument (#194): nachfragen. */}
          {(() => {
            const gleich = k.r.dokumente.find((x) => !p.entfernt.includes(x.id) && x.name.toLowerCase() === n.datei.name.toLowerCase());
            if (!gleich || !p.setzeNeue) return null;
            const setzeNeue = p.setzeNeue;
            const wahl = n.gleicherName ?? (versioniert ? 'version' : 'zaehler');
            return (
              <Feld beschriftung={t('ablage.dokumente.es-gibt-schon', { name: gleich.name })} className="gleichername">
                <select value={wahl} onChange={(e) => setzeNeue(n.uid, { gleicherName: e.target.value as NeueDatei['gleicherName'] })}>
                  {versioniert && <option value="version">{t('ablage.dokumente.als-neue-version-von', { name: gleich.name })}</option>}
                  <option value="zaehler">
                    {t('ablage.dokumente.als-eigenes-dokument-mit', { mitZaehler: mitZaehler(n.datei.name) })}
                  </option>
                  {!versioniert && <option value="ersetzen">{t('ablage.dokumente.altes-dokument-loeschen-und')}</option>}
                </select>
              </Feld>
            );
          })()}
        </div>
        <div className="zeilenaktionen">
          <Knopf groesse="klein" onClick={() => p.vergiss(n.uid)}>
            {t('ablage.dokumente.nicht-hochladen')}
          </Knopf>
        </div>
      </div>
    </li>
  );
}

/** Leer: „Noch keine Dokumente in …“. */
export const LeerText = ({ k }: { k: Kern }) => (
  <p className="leise">{t('ablage.dokumente.noch-keine-dokumente-in', { name: registerName(k.p.register) })}</p>
);
