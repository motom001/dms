/**
 * Dokumentenregister: hochladen (übernommen mit „Mappe speichern“), ansehen direkt unter der
 * Zeile (#85), sortieren (#86), mehrere auswählen und gemeinsam herunterladen oder löschen (#87).
 */
import { t } from '../../sprache';
import { Ablagezone, Dokleiste, LeerText, NeueZeile, Zusammenfuegen } from './Leiste';
import { useDokumente, type DokumenteProps, type Kern } from './kern';
import { Eintrag } from './Zeile';

/** Hinweise über der Liste: zu große Dateien, Fehler beim Ersetzen. */
function Fehler({ k }: { k: Kern }) {
  return (
    <>
      {k.h.zuGross.length > 0 && (
        <div className="hinweis schlecht">
          <p>{t('ablage.dokumente.zu-gross-ueber-100', { zuGross: k.h.zuGross.join(', ') })}</p>
        </div>
      )}
      <input
        ref={k.sofort.ersetzFeld}
        type="file"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void k.sofort.ersetze(f);
          else k.sofort.setErsetzeId(undefined);
        }}
      />
      {k.sofort.versionFehler && (
        <div className="hinweis schlecht">
          <p>{k.sofort.versionFehler}</p>
        </div>
      )}
    </>
  );
}

/** Leiste, Meldungen und die Liste mit neuen Dateien, Dokumenten und Anlagen. */
function Liste({ k }: { k: Kern }) {
  const { o, w, p } = k;
  return (
    <>
      {k.r.dokumente.length > 0 && <Dokleiste k={k} />}
      {w.hinweis && (
        <div className="hinweis info">
          <p>{w.hinweis}</p>
        </div>
      )}
      {o.zusammen && w.pdfAuswahl.length >= 2 && <Zusammenfuegen k={k} />}
      {o.pdfMeldung && (
        <div className="hinweis gut">
          <p>{o.pdfMeldung}</p>
        </div>
      )}
      <ul className="dokumentliste">
        {p.neue.map((n) => (
          <NeueZeile key={n.uid} k={k} n={n} />
        ))}
        {k.r.reihe.map((roh) => (
          <Eintrag key={roh.id} k={k} roh={roh} />
        ))}
      </ul>
    </>
  );
}

export function Dokumente(p: DokumenteProps) {
  const k = useDokumente(p);
  return (
    <div className="dokumente">
      {!p.nurLesen && <Ablagezone k={k} />}
      <Fehler k={k} />
      {k.r.dokumente.length + p.neue.length === 0 ? <LeerText k={k} /> : <Liste k={k} />}
    </div>
  );
}
