import { useEffect, useState } from 'react';
import type { Mappentyp } from '../../../shared/src/model';
import type { PlatzhalterStand, TextGesetzt, VorlageEintrag, VorlagenListe } from '../../../shared/src/textsatz';
import { api, type MappeDetails } from '../api';
import { Feld, Knopf, fehlerText } from '../bausteine';
import { t } from '../sprache';

/**
 * Brief aus Vorlage (#1040, „Text setzen“): passende Text-Vorlagen der Mappe (an ihr selbst oder z. B. an der
 * Vertragsart), fehlende Angaben vorher nennen – mit Sprung zum Feld –, dann als Dokument ablegen oder als PDF
 * herunterladen. Die Lücke „[Vertragsnummer]“ im Brief bleibt das Sicherheitsnetz.
 */
export function BriefAusVorlage({ typ, details, neuLaden, zumFeld, schliessen }: {
  typ: Mappentyp; details: MappeDetails; neuLaden: () => Promise<void>; zumFeld(key: string): void; schliessen(): void;
}) {
  const mappe = details.mappe;
  const [liste, setListe] = useState<VorlagenListe | null>(null);
  const [fehler, setFehler] = useState<string>();
  const [wahl, setWahl] = useState('');
  const [register, setRegister] = useState('');
  const [fertig, setFertig] = useState<TextGesetzt | null>(null);
  useEffect(() => {
    api.vorlagenFuer(mappe.id).then((l) => {
      setListe(l);
      setWahl(l.vorlagen[0]?.dokumentId ?? '');
      setRegister((l.register.find((r) => r.key === 'dokumente') ?? l.register[0])?.key ?? '');
    }, (e: unknown) => setFehler(fehlerText(e)));
  }, [mappe.id]);
  const v = liste?.vorlagen.find((x) => x.dokumentId === wahl);

  async function ablegen() {
    const r = await api.textSetzen(mappe.id, wahl, register);
    setFertig(r);
    await neuLaden();
  }

  return (
    <section className="blatt" aria-label={t('ablage.brief.titel')} data-anker="mappe.brief">
      <div className="blattkopf zeile-zwischen">
        <h2 className="h3">{t('ablage.brief.titel')}</h2>
        <Knopf art="link" onClick={schliessen}>{t('ablage.aktionen.schliessen')}</Knopf>
      </div>
      {fehler && <p className="fehlertext" role="alert">{fehler}</p>}
      {!liste && !fehler && <p className="leise" role="status">{t('ablage.brief.laedt')}</p>}
      {liste && !liste.vorlagen.length && <p className="leise">{t('ablage.brief.keine')}</p>}
      {fertig && (
        <div className="hinweis gut" role="status">
          <p>{t('ablage.brief.abgelegt', { name: fertig.pdf.name, register: liste?.register.find((r) => r.key === fertig.pdf.registerKey)?.name ?? fertig.pdf.registerKey })}</p>
          {fertig.luecken.length > 0 && <p className="klein">{t('ablage.brief.mit-luecken', { anzahl: fertig.luecken.length })}</p>}
        </div>
      )}
      {liste && v && !fertig && <Auswahl liste={liste} v={v} mappeId={mappe.id} typ={typ} wahl={wahl} setWahl={setWahl} register={register} setRegister={setRegister} ablegen={ablegen} zumFeld={zumFeld} />}
    </section>
  );
}

/** Vorlage wählen, Briefkopf und Empfänger zeigen, fehlende Angaben nennen, ablegen oder herunterladen. */
function Auswahl({ liste, v, mappeId, typ, wahl, setWahl, register, setRegister, ablegen, zumFeld }: {
  liste: VorlagenListe; v: VorlageEintrag; mappeId: string; typ: Mappentyp; wahl: string; setWahl(x: string): void; register: string; setRegister(x: string): void;
  ablegen(): Promise<void>; zumFeld(key: string): void;
}) {
  const fehlend = v.platzhalter.filter((p) => p.fehlt);
  return (
    <>
      {liste.vorlagen.length > 1 ? (
        <Feld beschriftung={t('ablage.brief.vorlage')}>
          <select value={wahl} onChange={(e) => setWahl(e.target.value)}>
            {liste.vorlagen.map((x) => <option key={x.dokumentId} value={x.dokumentId}>{x.name}{x.quelle.mappeId !== mappeId ? ` – ${x.quelle.titel}` : ''}</option>)}
          </select>
        </Feld>
      ) : <p><strong>{v.name}</strong>{v.quelle.mappeId !== mappeId && <span className="leise"> – {t('ablage.brief.von-quelle', { titel: v.quelle.titel })}</span>}</p>}
      <dl className="index">
        <div><dt>{t('ablage.brief.absender')}</dt><dd>{v.absender ?? <span className="leise">{t('ablage.brief.ohne-absender')}</span>}</dd></div>
        <div><dt>{t('ablage.brief.empfaenger')}</dt><dd>{v.empfaenger ?? <span className="leise">{t('ablage.brief.ohne-empfaenger')}</span>}</dd></div>
        {v.paket && <div><dt>{t('ablage.brief.paket')}</dt><dd>{v.paket.name}</dd></div>}
      </dl>
      {fehlend.length > 0 && <Fehlend fehlend={fehlend} typ={typ} zumFeld={zumFeld} />}
      {liste.ablegen && liste.register.length > 1 && (
        <Feld beschriftung={t('ablage.brief.register')}>
          <select value={register} onChange={(e) => setRegister(e.target.value)}>
            {liste.register.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
          </select>
        </Feld>
      )}
      <div className="knoepfe">
        <Knopf art="haupt" onClick={ablegen} gesperrt={liste.ablegen ? false : t('ablage.brief.ablegen-nicht')}>
          {fehlend.length ? t('ablage.brief.trotzdem-ablegen') : t('ablage.brief.ablegen')}
        </Knopf>
        <Knopf onClick={() => api.textHerunterladen(mappeId, wahl, `${v.name}.pdf`)} gesperrt={liste.herunterladen ? false : t('ablage.brief.herunterladen-nicht')}>
          {t('ablage.brief.herunterladen')}
        </Knopf>
      </div>
      <p className="leise klein">{t('ablage.brief.hinweis')}</p>
    </>
  );
}

/** Fehlende Angaben vorher sagen (Hinweise Qualität) – mit Sprung zum Feld der Mappe. */
function Fehlend({ fehlend, typ, zumFeld }: { fehlend: PlatzhalterStand[]; typ: Mappentyp; zumFeld(key: string): void }) {
  const feldName = (key: string) => typ.felder.find((f) => f.key === key)?.label ?? key;
  const text = (p: PlatzhalterStand) => (!p.feld || p.feld === p.name || p.beschriftung === feldName(p.feld) ? p.beschriftung : `${feldName(p.feld)}: ${p.beschriftung}`);
  return (
    <div className="hinweis warn">
      <p>{t('ablage.brief.fehlen', { anzahl: fehlend.length })}</p>
      <ul>{fehlend.map((p) => <li key={p.name}>{p.feld ? <Knopf art="link" groesse="klein" onClick={() => zumFeld(p.feld!)}>{text(p)}</Knopf> : text(p)}</li>)}</ul>
      <p className="klein">{t('ablage.brief.luecke')}</p>
    </div>
  );
}
