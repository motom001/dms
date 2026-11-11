import { useEffect, useRef, useState } from 'react';
import type { Mappentyp } from '../../../shared/src/model';
import type { PlatzhalterStand, TextGesetzt, VorlageEintrag, VorlagenListe } from '../../../shared/src/textsatz';
import { api, type MappeDetails } from '../api';
import { Feld, Knopf, KnopfLink, fehlerText } from '../bausteine';
import { Symbol } from '../Symbol';
import { t } from '../sprache';

/**
 * Brief aus Vorlage (#1040, „Text setzen“): passende Text-Vorlagen der Mappe (an ihr selbst oder z. B. an der
 * Vertragsart), fehlende Angaben vorher nennen – mit Sprung zum Feld –, dann als Dokument ablegen oder als PDF
 * herunterladen. Die Lücke „[Vertragsnummer]“ im Brief bleibt das Sicherheitsnetz.
 */
/**
 * Aufgerufen als Paket-Aktion (#1039, z. B. „Vorlage hinzufügen“ aus Verträgen): derselbe Dialog, nur mit den Vorlagen
 * dieses Pakets, im Aussehen einer Paket-Aktion mit dem Paket im Kopf; Herunterladen nur, wenn die Aktion es ankündigt.
 */
export interface VorlagenAktion { lauf: string; paket: { id: string; name: string }; name: string; herunterladen: boolean }

export function BriefAusVorlage({ typ, details, neuLaden, zumFeld, schliessen, aktion }: {
  typ: Mappentyp; details: MappeDetails; neuLaden: () => Promise<void>; zumFeld(key: string): void; schliessen(): void; aktion?: VorlagenAktion;
}) {
  const mappe = details.mappe;
  const offen = useRef(aktion?.lauf ?? null);
  // Geschlossen ohne Ergebnis: Lauf beenden, damit die Bremse frei wird.
  useEffect(() => () => { if (offen.current) void api.paketAktionAbbrechen(offen.current).catch(() => {}); }, []);
  const [liste, setListe] = useState<VorlagenListe | null>(null);
  const [fehler, setFehler] = useState<string>();
  const [wahl, setWahl] = useState('');
  const [register, setRegister] = useState('');
  const [fertig, setFertig] = useState<TextGesetzt | null>(null);
  useEffect(() => {
    api.vorlagenFuer(mappe.id).then((roh) => {
      const l = aktion ? { ...roh, vorlagen: roh.vorlagen.filter((v) => v.paket?.id === aktion.paket.id), herunterladen: roh.herunterladen && aktion.herunterladen } : roh;
      setListe(l);
      setWahl(l.vorlagen[0]?.dokumentId ?? '');
      setRegister((l.register.find((r) => r.key === 'dokumente') ?? l.register[0])?.key ?? '');
    }, (e: unknown) => setFehler(fehlerText(e)));
  }, [mappe.id, aktion]);
  const v = liste?.vorlagen.find((x) => x.dokumentId === wahl);

  async function ablegen() {
    const r = await api.textSetzen(mappe.id, wahl, register, aktion?.lauf);
    offen.current = null;
    setFertig(r);
    await neuLaden();
  }
  async function herunterladen(name: string) {
    await api.textHerunterladen(mappe.id, wahl, name, aktion?.lauf);
    // Der Lauf einer Paket-Aktion ist damit zu Ende (Historie mit Paket); ohne Aktion bleibt der Dialog offen.
    if (aktion) { offen.current = null; schliessen(); }
  }

  return (
    <section className={aktion ? 'blatt paketdialog' : 'blatt'} aria-label={aktion ? t('ablage.paketaktion.von', { paket: aktion.paket.name }) : t('ablage.brief.titel')} data-anker="mappe.brief">
      <Kopf aktion={aktion} schliessen={schliessen} />
      {fehler && <p className="fehlertext" role="alert">{fehler}</p>}
      {!liste && !fehler && <p className="leise" role="status">{t('ablage.brief.laedt')}</p>}
      {liste && !liste.vorlagen.length && <p className="leise">{t('ablage.brief.keine')}</p>}
      {fertig && (
        <div className="hinweis gut" role="status">
          <p>{t('ablage.brief.abgelegt', { name: fertig.pdf.name, register: liste?.register.find((r) => r.key === fertig.pdf.registerKey)?.name ?? fertig.pdf.registerKey })}</p>
          {fertig.luecken.length > 0 && <p className="klein">{t('ablage.brief.mit-luecken', { anzahl: fertig.luecken.length })}</p>}
          {/* Nächster Schritt (Hinweise Qualität B2): das neue Dokument gleich öffnen. */}
          <div className="knoepfe"><KnopfLink art="haupt" to={`/ablage/${mappe.typId}/${mappe.id}?dokument=${encodeURIComponent(fertig.pdf.id)}`}>{t('ablage.paketaktion.dokument-oeffnen')}</KnopfLink></div>
        </div>
      )}
      {liste && v && !fertig && <Auswahl liste={liste} v={v} mappeId={mappe.id} typ={typ} wahl={wahl} setWahl={setWahl} register={register} setRegister={setRegister} ablegen={ablegen} herunterladen={herunterladen} zumFeld={zumFeld} />}
    </section>
  );
}

/** Kopf des Dialogs; als Paket-Aktion mit dem Paket („Aktion von Verträge“) und dem Namen der Aktion. */
function Kopf({ aktion, schliessen }: { aktion?: VorlagenAktion; schliessen(): void }) {
  return (
    <div className="blattkopf zeile-zwischen">
      <div>
        {aktion && <p className="paketdialog-kopf"><Symbol name="paket" /> {t('ablage.paketaktion.von', { paket: aktion.paket.name })}</p>}
        <h2 className="h3">{aktion?.name ?? t('ablage.brief.titel')}</h2>
      </div>
      <Knopf art="link" onClick={schliessen}>{t('ablage.aktionen.schliessen')}</Knopf>
    </div>
  );
}

/** Vorlage wählen, Briefkopf und Empfänger zeigen, fehlende Angaben nennen, ablegen oder herunterladen. */
function Auswahl({ liste, v, mappeId, typ, wahl, setWahl, register, setRegister, ablegen, herunterladen, zumFeld }: {
  liste: VorlagenListe; v: VorlageEintrag; mappeId: string; typ: Mappentyp; wahl: string; setWahl(x: string): void; register: string; setRegister(x: string): void;
  ablegen(): Promise<void>; herunterladen(name: string): Promise<void>; zumFeld(key: string): void;
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
        <Knopf onClick={() => herunterladen(`${v.name}.pdf`)} gesperrt={liste.herunterladen ? false : t('ablage.brief.herunterladen-nicht')}>
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
