import { Feld, HakenFeld, Knopf } from '../../bausteine';
import { inMB, legtEtwasAn } from '../../../../shared/src/pakete';
import { istKernVorlage, kernVorlage } from '../../../../shared/src/ablaufvorlagen';
import type { PaketVorschau } from '../../api/pakete';
import { Hilfe } from '../../Hilfe';
import { t as tx, t, tn } from '../../sprache';
import { SichtZustandZeile } from './abschnitte';
import type { VorschauAntwort, VorschauZustand } from './zustand';

/**
 * Teile der Paket-Vorschau (#1279 aus VorschauBlock gezogen): Herkunft und Rechte bestätigen, Probleme und Hinweise,
 * Mappentypen und Ansichten mit Namen, Abhängigkeiten, Beispiele, Automatisierungsvorlagen und die Knöpfe.
 */

type Z = VorschauZustand;

/** Herkunft bestätigen (#189, #594): außerhalb des offiziellen Katalogs bzw. ohne gültige Signatur. */
export function HerkunftBestaetigen({ z }: { z: Z }) {
  if (!z.bestaetigen) return null;
  return (
    <div className="hinweis warn" role="alert">
      <p>
        {tn('werkbank.pakete.installiere-nur-pakete-deren', {
          b: <strong>{t('werkbank.pakete.nicht-vom-ablago-projekt-2')}</strong>,
          wert: z.pruefWarnung ? `${z.pruefWarnung.replace(/\.$/, '')}. ` : '',
        })}
      </p>
      <HakenFeld beschriftung={t('werkbank.pakete.ich-weiss-woher-das')}>
        <input type="checkbox" checked={z.ok} onChange={(e) => z.setOk(e.target.checked)} />
      </HakenFeld>
    </div>
  );
}

/** Paket mit Code (#449): erst lesen, dann bestätigen – Liste, darunter links der Haken, untereinander, auch am Handy. */
export function LaeuferHinweis({ v, z }: { v: PaketVorschau; z: Z }) {
  if (!v.laeufer) return null;
  return (
    <div className={`hinweis stapel ${v.laeufer.bestaetigen ? 'warn' : 'info'}`} role={v.laeufer.bestaetigen ? 'alert' : undefined}>
      <p>{tn('werkbank.pakete.er-laeuft-im-paket', { b: <strong>{t('werkbank.pakete.das-paket-enthaelt-code')}</strong> })}</p>
      <ul>
        {v.laeufer.rechte.map((r) => (
          <li key={r.text}>
            {r.text} <Hilfe ort={r.hilfe} />
            {r.unter && (
              <ul>
                {r.unter.map((u) => (
                  <li key={u.text}>
                    {u.text} <Hilfe ort={u.hilfe} />
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {v.laeufer.bestaetigen ? (
        <HakenFeld beschriftung={v.update ? t('werkbank.pakete.die-rechte-haben-sich') : t('werkbank.pakete.ich-erlaube-dem-paket')}>
          <input type="checkbox" checked={z.rechteOk} onChange={(e) => z.setRechteOk(e.target.checked)} />
        </HakenFeld>
      ) : (
        <p className="leise">{t('werkbank.pakete.die-rechte-sind-dieselben')}</p>
      )}
      {/* Dienst-Adresse (#444): Hinweis auf die Vertrauensbeziehung schon bei der Installation. */}
      {v.laeufer.rechte.some((r) => r.hilfe === 'pakete.recht.adresse') && <p>{tx('fragen.adresse.installation')}</p>}
    </div>
  );
}

/** Eine Liste als Hinweis (Probleme, Hinweise) – nichts, wenn sie leer ist. */
export function HinweisListe({ art, liste }: { art: 'schlecht' | 'info'; liste: string[] }) {
  if (!liste.length) return null;
  return (
    <div className={`hinweis ${art}`}>
      <ul>
        {liste.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </div>
  );
}

/** Einstellungen (#197): beim Update neue mit Vorgabe und wegfallende, sonst der Hinweis auf die Einstellungen. */
export function EinstellungenHinweis({ v }: { v: PaketVorschau }) {
  if (!v.einstellungen || (!v.einstellungen.neu.length && !v.einstellungen.weg.length)) return null;
  return (
    <div className="hinweis info">
      <p>
        {t('werkbank.pakete.einstellungen-2')}
        {v.update && v.einstellungen.neu.length > 0 && (
          <> {t('werkbank.pakete.neu-mit-vorgabe', { neu: v.einstellungen.neu.join(', ') })}</>
        )}
        {!v.update && <> {t('werkbank.pakete.das-paket-hat-einstellungen')}</>}
        {v.einstellungen.weg.length > 0 && (
          <>
            {' '}
            {tn('werkbank.pakete.ihre-werte-werden-entfernt', {
              b: <strong>{t('werkbank.pakete.fallen-weg')}</strong>,
              weg: v.einstellungen.weg.join(', '),
            })}
          </>
        )}
      </p>
    </div>
  );
}

/** Einleitung: beim Update, was es tut; sonst nur, wenn wirklich etwas angelegt wird (#643), oder die Beschreibung. */
export function Einleitung({ v, umbau }: { v: PaketVorschau; umbau: boolean }) {
  if (v.update) return <p className="leise">{umbau ? tx('pakete.umbau.vorschau.update') : tx('pakete.vorschau.update')}</p>;
  if (legtEtwasAn(v)) return <p className="leise">{tx('pakete.vorschau.anlegen')}</p>;
  return v.paket.beschreibung ? <p>{v.paket.beschreibung}</p> : null;
}

type Typ = PaketVorschau['typen'][number];
/** Eine Liste als „„a“, „b““ in einen Text – leer, wenn es keine gibt. */
const mitListe = (l: string[] | undefined, text: (map: string) => string) => (l?.length ? text(l.map((f) => `„${f}“`).join(', ')) : '');

/** Was ein Update an einem vorhandenen Mappentyp ändert, als eine Zeile. */
function typAenderung(eintrag: Typ): string {
  const neu = [
    ...eintrag.neueFelder.map((f) => t('werkbank.pakete.feld', { f })),
    ...eintrag.neueRegister.map((r) => t('werkbank.pakete.register', { r })),
  ];
  const teile = [
    neu.length ? t('werkbank.pakete.neu', { wert: neu.join(', ') }) : '',
    mitListe(eintrag.erkennung, (map) => t('werkbank.pakete.aus-dokument-fuellen', { map })),
    mitListe(eintrag.wiederfinden, (map) => t('werkbank.pakete.zum-wiederfinden', { map })),
    mitListe(eintrag.vorbelegen, (map) => t('werkbank.pakete.vorbelegen', { map })),
    eintrag.typAngaben ? t('werkbank.pakete.dokument-uebernehmen') : '',
    mitListe(eintrag.formate, (felder) => tx('felder.paket.formate', { felder })),
    eintrag.beschriftungen ? t('werkbank.pakete.beschriftungen', { anzahl: eintrag.beschriftungen }) : '',
    mitListe(eintrag.abschnitte, (map) => t('werkbank.pakete.abschnitte', { map })),
  ].filter(Boolean);
  return teile.length ? teile.join('; ') : t('werkbank.pakete.keine-aenderung');
}

/** Archivmodus aus dem Paket (#1051): nur für neue Typen, danach am Mappentyp änderbar. */
function ArchivZeile({ eintrag }: { eintrag: Typ }) {
  if (eintrag.vorhanden || eintrag.geloescht || eintrag.uebernimmt || !eintrag.archiv) return null;
  return (
    <p className="leise klein">
      {eintrag.archiv.stichtag && eintrag.archiv.leererStichtag === 'laeuftNicht'
        ? t('werkbank.pakete.archiv-laeuft-nicht', { anzahl: eintrag.archiv.jahre, ab: eintrag.archiv.stichtagName ?? '' })
        : t('werkbank.pakete.archiv', {
            anzahl: eintrag.archiv.jahre,
            ab: eintrag.archiv.stichtagName ? `„${eintrag.archiv.stichtagName}“` : t('werkbank.pakete.archiv-anlagedatum'),
          })}
    </p>
  );
}

/** Mappentypen: vorhandene mit ihren Änderungen, gelöschte, neue mit Namen (Konflikt direkt am Namen). */
export function TypenListe({ v, z }: { v: PaketVorschau; z: Z }) {
  return (
    <>
      {v.typen.length > 0 && <h3>{t('werkbank.pakete.mappentypen-2')}</h3>}
      <ul className="stapel">
        {v.typen.map((eintrag) => (
          <li key={eintrag.schluessel}>
            {eintrag.vorhanden ? (
              <span>
                <strong>{eintrag.name}</strong> – {typAenderung(eintrag)}
              </span>
            ) : eintrag.geloescht ? (
              <span className="leise">{t('werkbank.pakete.hast-du-geloescht-bleibt', { name: eintrag.name })}</span>
            ) : (
              <Feld
                beschriftung={t('werkbank.pakete.name-fuer', { name: eintrag.name })}
                hinweis={tn('werkbank.pakete.felder-kennung', { felder: eintrag.felder, code: <code>{eintrag.dmsSchluessel}</code> })}
                fehler={
                  eintrag.konflikt && (z.namen[eintrag.schluessel] ?? '').trim().toLowerCase() === eintrag.name.toLowerCase()
                    ? eintrag.konflikt
                    : undefined
                }>
                <input
                  value={z.namen[eintrag.schluessel] ?? eintrag.name}
                  onChange={(e) => z.setNamen({ ...z.namen, [eintrag.schluessel]: e.target.value })}
                />
              </Feld>
            )}
            {/* Umbau (#1041): Der Typ entsteht aus einem vorhandenen – gleiche Mappen, Rechte und Ansichten. */}
            {eintrag.uebernimmt && <p className="leise klein">{t('pakete.umbau.vorschau.typ-aus', { name: eintrag.uebernimmt })}</p>}
            <ArchivZeile eintrag={eintrag} />
            {/* Text → Verweis (#534): Das Update ändert vorhandene Angaben nicht; umgewandelt wird danach mit Vorschau. */}
            {eintrag.vorhanden &&
              eintrag.umwandeln
                ?.filter((u) => u.anzahl > 0)
                .map((u) => (
                  <p key={u.feld} className="leise klein">
                    {tx('pakete.update.umwandeln', { feld: u.feld, aus: u.aus, anzahl: u.anzahl })}
                  </p>
                ))}
          </li>
        ))}
      </ul>
    </>
  );
}

/** Ansichten: vorhandene mit Zustand (#1125), ausgelassene mit Grund, neue mit Namen. */
export function SichtenListe({ v, z }: { v: PaketVorschau; z: Z }) {
  return (
    <>
      {v.sichten.length > 0 && <h3>{t('werkbank.pakete.ansichten-2')}</h3>}
      <ul className="stapel">
        {v.sichten.map((s) => (
          <li key={s.schluessel}>
            {s.vorhanden ? (
              <SichtZustandZeile
                s={s}
                ersetzen={z.ersetzen.includes(s.schluessel)}
                setze={(an) => z.setErsetzen(an ? [...z.ersetzen, s.schluessel] : z.ersetzen.filter((k) => k !== s.schluessel))}
              />
            ) : s.ausgelassen ? (
              <span className="leise">{s.ausgelassen}</span>
            ) : (
              <Feld
                beschriftung={t('werkbank.pakete.name-fuer-ansicht', { name: s.name })}
                hinweis={
                  s.eltern
                    ? t('werkbank.pakete.unter', { wert: v.sichten.find((x) => x.schluessel === s.eltern)?.name ?? s.eltern })
                    : t('werkbank.pakete.oberste-ebene')
                }
                fehler={
                  s.konflikt && (z.sichtNamen[s.schluessel] ?? '').trim().toLowerCase() === s.name.toLowerCase() ? s.konflikt : undefined
                }>
                <input
                  value={z.sichtNamen[s.schluessel] ?? s.name}
                  onChange={(e) => z.setSichtNamen({ ...z.sichtNamen, [s.schluessel]: e.target.value })}
                />
              </Feld>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

/** Abhängigkeiten und – beim Installieren – „fehlende Pakete mitinstallieren“. */
export function Abhaengigkeiten({ v, z }: { v: PaketVorschau; z: Z }) {
  if (!v.abhaengigkeiten.length) return null;
  const fehlend = v.abhaengigkeiten.filter((a) => !a.installiert);
  return (
    <>
      <h3>{t('werkbank.pakete.abhaengigkeiten')}</h3>
      <ul className="klein">
        {v.abhaengigkeiten.map((a) => (
          <li key={a.id}>
            {a.id} {a.bereich}:{' '}
            {a.installiert
              ? t('werkbank.pakete.installiert-2', { installiert: a.installiert, wert: a.ok ? '' : t('werkbank.pakete.passt-nicht') })
              : a.verfuegbar
                ? t('werkbank.pakete.fehlt-im-katalog-gibt', { verfuegbar: a.verfuegbar })
                : t('werkbank.pakete.fehlt-und-ist-nicht')}
          </li>
        ))}
      </ul>
      {!v.update && fehlend.length > 0 && (
        <HakenFeld beschriftung={t('werkbank.pakete.fehlende-pakete-mitinstallieren')}>
          <input type="checkbox" checked={z.mit} onChange={(e) => z.setMit(e.target.checked)} />
        </HakenFeld>
      )}
    </>
  );
}

/** Beispiel-Mappen anlegen (nur beim Installieren), mit Zahl und Größe der Beispiel-Dokumente (#878). */
export function BeispieleHaken({ v, z }: { v: PaketVorschau; z: Z }) {
  if (v.update || v.beispiele <= 0) return null;
  return (
    <HakenFeld
      beschriftung={
        <>
          {t('werkbank.pakete.beispiel-mappen-anlegen', { beispiele: v.beispiele })}
          {v.beispielDokumente?.anzahl
            ? ` ${t('werkbank.pakete.mit-beispiel-dokumenten', { anzahl: v.beispielDokumente.anzahl, mb: inMB(v.beispielDokumente.bytes) })}`
            : ''}
        </>
      }>
      <input type="checkbox" checked={z.beispiele} onChange={(e) => z.setBeispiele(e.target.checked)} />
    </HakenFeld>
  );
}

/** Automatisierungsvorlagen (#1044, Rechte-Vorschau): jede mit ihren Karten – nur Aufgaben und Benachrichtigungen. */
export function Ablaufvorlagen({ v }: { v: PaketVorschau }) {
  if (!v.ablaufvorlagen?.length) return null;
  return (
    <div className="stapel" data-anker="pakete.ablaufvorlagen">
      <p>
        <strong>{tx('pakete.ablauf.vorlagen')}</strong>
      </p>
      <p className="leise klein">{tx('pakete.ablauf.vorlagen.text')}</p>
      <ul>
        {v.ablaufvorlagen.map((a) => (
          <li key={a.schluessel}>
            {a.name}: {a.karten.join(', ')}
            {istKernVorlage(a.ersetzt) && (
              <>
                {' '}
                <small className="leise">{tx('pakete.ablauf.vorlagen.ersetzt', { name: kernVorlage(a.ersetzt).name })}</small>
              </>
            )}
            {v.update && (a.neu || a.geaendert) && (
              <>
                {' '}
                <span className="chip warn klein">{a.neu ? tx('pakete.ablauf.vorlagen.neu') : tx('pakete.ablauf.vorlagen.geaendert')}</span>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Erstmals ein Herausgeber an einem Bestandspaket (#1084): eigener Haken. */
export function HerausgeberHaken({ v, z }: { v: PaketVorschau; z: Z }) {
  if (!v.herausgeberBestaetigen) return null;
  return (
    <div className="hinweis warn">
      <HakenFeld beschriftung={t('werkbank.pakete.herausgeber-bestaetigen', { herausgeber: v.herausgeberBestaetigen })}>
        <input type="checkbox" checked={z.herausgeberOk} onChange={(e) => z.setHerausgeberOk(e.target.checked)} />
      </HakenFeld>
    </div>
  );
}

/** Installieren bzw. Aktualisieren (mit „Vorher sichern“ beim Umbau, #702) und Abbrechen. */
export function VorschauKnoepfe({
  v,
  z,
  los,
  abbrechen,
  abbrechenText,
}: {
  v: PaketVorschau;
  z: Z;
  los(x: VorschauAntwort): Promise<void>;
  abbrechen?(): void;
  abbrechenText: string;
}) {
  return (
    <div className="knoepfe">
      <Knopf
        art="haupt"
        gesperrt={z.gesperrt}
        laeuft={z.laeuft}
        laeuftText={v.update ? t('werkbank.pakete.aktualisiere') : t('werkbank.pakete.installiere')}
        onClick={() => {
          z.setLaeuft(true);
          void (async () => {
            const { sichern, ...x } = z.antwort;
            if (sichern && !(await z.sichereVorher())) return;
            await los(x);
          })().finally(() => z.setLaeuft(false));
        }}>
        {v.update ? t('werkbank.pakete.aktualisieren') : t('werkbank.pakete.installieren-2')}
      </Knopf>
      {abbrechen && <Knopf onClick={abbrechen}>{abbrechenText}</Knopf>}
    </div>
  );
}
