import { Ansage, useZiehen, umgestellt, Ziehgriff } from '../ziehen';
import { einzigesZiel, schluesselAus, type Feld as FeldDef, type Mappentyp } from '../../../shared/src/model';
import { regelwerkVon } from '../../../shared/src/rechte';
import { KiAmTyp, PaketeAmTyp, RegelwerkAbschnitt, TestlaufBlatt } from '../werkbank/Berechtigungen';
import { Link } from '../ort';
import { Speicherleiste } from '../Speicherleiste';
import { Hilfe } from '../Hilfe';
import { t, tn } from '../sprache';
import { gebietsschema } from '../../../shared/src/sprache';
import { Bereich, Fassungen, Knopf, KnopfLink } from '../bausteine';
import { feldKurz, ohneAnker, type Entwurf, type EntwurfFeld } from './entwurf';
import { useFeldAktionen, useTypSpeichern, useTypZustand, type FeldAktionen, type TypZustand } from './useTypEditor';
import { FeldZeile } from './FeldZeile';
import { GrunddatenBereich } from './Grunddaten';
import { TitelEditor, TrefferlisteEditor } from './TitelUndListen';
import { RegisterEditor } from './RegisterEditor';
import { ArchivBereich, ErkennungBereich, StempelBereich } from './TypEinstellungen';

/**
 * Mappentyp-Editor (Werkbank → Mappentypen). Seit #1279 in Teilen: Entwurf (entwurf.ts), Zustand und Handlungen
 * (useTypEditor.ts), Grunddaten, Felder (FeldZeile.tsx), Titel und Trefferlisten, Register, Archiv/Stempel/Erkennung.
 */
export function TypEditor({ typ, vorlage }: { typ?: Mappentyp; vorlage?: Mappentyp }) {
  const z = useTypZustand(typ, vorlage);
  const { d, neu, system, e, setE, bereiche, gespeichert, ent, klappe } = z;
  const a = useFeldAktionen(z);
  const { speichern, loeschen } = useTypSpeichern(z);
  // Drag & Drop (#74): Felder umsortieren oder auf ein Feldregister ziehen; ändert nur den Entwurf.
  const zf = useZiehen({
    erlaubt: (_q, ziel, ort) => ort !== 'in' || ziel.startsWith('reg:'),
    fertig: (quelle, ziel, ort) => {
      if (ziel.startsWith('reg:')) {
        const key = ziel.slice(4);
        setE((x) => {
          const y = x.felder.find((f) => f._uid === quelle)?._register === key ? x : ohneAnker(x, quelle);
          return { ...y, felder: y.felder.map((f) => (f._uid === quelle ? { ...f, _register: key } : f)) };
        });
        const f = e.felder.find((x) => x._uid === quelle);
        z.setAnsage(
          t('mappentypen.editor.liegt-jetzt-auf-register', {
            wert: f?.label || t('mappentypen.editor.feld'),
            wert2: e.register.find((r) => r.key === key)?.name ?? key,
          }),
        );
        return;
      }
      setE((x) => {
        const von = x.felder.findIndex((f) => f._uid === quelle),
          zu = x.felder.findIndex((f) => f._uid === ziel);
        return { ...x, felder: umgestellt(x.felder, von, zu, ort === 'vor' ? 'vor' : 'nach') };
      });
      z.setOffen(null);
      z.setFehler(null);
    },
  });

  return (
    <form
      className="editorform"
      onSubmit={(ev) => {
        ev.preventDefault();
        void speichern();
      }}
      onKeyDown={ent.tasten}
      noValidate>
      <TypKopf z={z} vorlage={vorlage} />

      {bereiche.leiste(z.hatFehler, t('mappentypen.editor.bereiche-des-mappentyps'))}

      <TypHinweise z={z} />

      <GrunddatenBereich z={z} />

      <FelderBereich z={z} a={a} zf={zf} />

      <TitelEditor e={e} setze={(titelVorlage) => setE((x) => ({ ...x, titelVorlage }))} klappe={klappe('titel')} />

      <TrefferlisteEditor e={e} setE={setE} klappe={klappe('trefferlisten')} />

      <RegisterEditor
        e={e}
        setE={setE}
        feldAblage={(key) => zf.ablage(`reg:${key}`)}
        klappe={klappe('register')}
        ausblendenFragen={a.ausblendenFragen}
      />
      <ArchivBereich e={e} setE={setE} klappe={klappe('archiv')} typId={gespeichert?.id} />

      <StempelBereich e={e} setE={setE} klappe={klappe('stempel')} />

      {!system && <ErkennungBereich e={e} setE={setE} klappe={klappe('erkennung')} />}

      <RegelwerkAbschnitt
        rw={e.berechtigungen}
        setRw={(f) => setE((x) => ({ ...x, berechtigungen: f(x.berechtigungen) }))}
        neu={neu}
        gespeichert={gespeichert ? regelwerkVon(gespeichert) : null}
        typ={z.entwurfTyp}
        klappe={klappe('berechtigungen')}
      />
      <TestlaufBlatt typId={gespeichert?.id ?? ''} entwurf={e.berechtigungen} klappe={klappe('testlauf')} />
      {typ?.system !== 'benutzer' && <PaketeAmTyp typId={gespeichert?.id ?? ''} klappe={klappe('pakete')} />}
      {typ?.system !== 'benutzer' && <KiAmTyp typId={gespeichert?.id ?? ''} klappe={klappe('ki')} />}
      {gespeichert && (
        <Fassungen
          art="typ"
          eintrag={gespeichert.id}
          stand={gespeichert.geaendert}
          nachher={() => d.neuLaden()}
          klappe={klappe('fassungen')}
        />
      )}

      <Speicherleiste
        ent={ent}
        gegenstand={t('mappentypen.editor.mappentyp')}
        sendet={z.sendet}
        meldung={z.meldung ? { art: z.fehler ? 'schlecht' : 'gut', text: z.meldung } : undefined}
        loeschen={
          neu || system
            ? undefined
            : {
                text: t('mappentypen.editor.mappentyp-loeschen'),
                rueckfrage: {
                  titel: t('mappentypen.editor.mappentyp-endgueltig-loeschen', { name: e.name }),
                  text: t('mappentypen.editor.das-laesst-sich-nicht'),
                  ja: t('mappentypen.editor.endgueltig-loeschen'),
                },
                onClick: loeschen,
              }
        }
      />
    </form>
  );
}

/** Kopf: Name, Systemtyp, Zahl der Mappen, Kopie und „Mappentyp kopieren“. */
function TypKopf({ z, vorlage }: { z: TypZustand; vorlage?: Mappentyp }) {
  const { d, e, neu, system, gespeichert } = z;
  return (
    <div className="seitenkopf">
      <div>
        <p className="ueber">{t('mappentypen.editor.mappentyp')}</p>
        <h1>
          {e.name || (neu ? t('mappentypen.editor.neuer-mappentyp') : t('mappentypen.editor.ohne-namen'))}
          {system && <span className="chip">{t('mappentypen.editor.system')}</span>}
        </h1>
        {gespeichert && d.zahlenDa && (
          <p className="leise">
            <Link to={`/ablage/${gespeichert.id}`} className="verweis tippziel">
              {t('mappentypen.editor.mappen-in-der-ablage', {
                anzahl: d.anzahl(gespeichert.id),
                zahl: d.anzahl(gespeichert.id).toLocaleString(gebietsschema()),
              })}
            </Link>
          </p>
        )}
        {vorlage && neu && <p className="leise">{t('mappentypen.editor.kopie-von-noch-nicht', { name: vorlage.name })}</p>}
      </div>
      {gespeichert && !system && (
        <div className="knoepfe">
          <KnopfLink to={`/werkbank/typen/neu?kopie=${gespeichert.id}`} title={t('mappentypen.editor.neuen-mappentyp-mit-feldern')}>
            {t('mappentypen.editor.mappentyp-kopieren')}
          </KnopfLink>
        </div>
      )}
    </div>
  );
}

/** Hinweise unter der Sprungleiste: Systemtyp, unpassende Mappen, allgemeine Fehler, Gründe gegen das Löschen. */
function TypHinweise({ z }: { z: TypZustand }) {
  const { d, system, gespeichert, fehler, gruende } = z;
  const unpassend = gespeichert ? (d.zaehler.typen[gespeichert.id]?.unpassend ?? 0) : 0;
  return (
    <>
      {system && (
        <div className="hinweis info">
          <p>
            {system === 'benutzer'
              ? t('mappentypen.editor.systemmappentyp-jeder-benutzer-hat')
              : t('mappentypen.editor.systemmappentyp-rollen-die-benutzer')}
          </p>
        </div>
      )}
      {unpassend > 0 && (
        <div className="hinweis warn">
          <p>{t('mappentypen.editor.mappen-passen-nicht-zur', { anzahl: unpassend })}</p>
        </div>
      )}
      {fehler?.allgemein.length ? (
        <div className="hinweis schlecht">
          <p>{fehler.allgemein.join(' ')}</p>
        </div>
      ) : null}
      {gruende.length > 0 && (
        <div className="hinweis warn">
          <ul>
            {gruende.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

/** Bereich „Felder“: Liste der Felder (aufklappbar, ziehbar) und „+ Feld hinzufügen“. */
function FelderBereich({ z, a, zf }: { z: TypZustand; a: FeldAktionen; zf: ReturnType<typeof useZiehen> }) {
  const { e } = z;
  return (
    <Bereich
      id="felder"
      titel={t('mappentypen.editor.felder')}
      hilfe={<Hilfe ort="mappentyp.felder" />}
      klappe={z.klappe('felder')}
      kurz={feldKurz(e.felder)}
      beschreibung={<>{tn('mappentypen.editor.feld-anklicken-um-feldart', { hilfe: <Hilfe ort="mappentyp.ziehen" /> })}</>}>
      <div className="feldliste">
        {e.felder.length === 0 && (
          <div className="leer">
            <p>{t('mappentypen.editor.noch-keine-felder-fuege')}</p>
          </div>
        )}
        {e.felder.map((f, i) => (
          <FeldZeileImEditor key={f._uid} z={z} a={a} zf={zf} f={f} i={i} />
        ))}
      </div>
      <div>
        <Knopf onClick={a.feldHinzufuegen}>{t('mappentypen.editor.feld-hinzufuegen')}</Knopf>
      </div>
      <Ansage text={z.ansage} />
    </Bereich>
  );
}

/** Eine Zeile der Feldliste mit allem, was sie vom Editor braucht. */
function FeldZeileImEditor({
  z,
  a,
  zf,
  f,
  i,
}: {
  z: TypZustand;
  a: FeldAktionen;
  zf: ReturnType<typeof useZiehen>;
  f: EntwurfFeld;
  i: number;
}) {
  const { d, e, setE, offen, setAnsage } = z;
  return (
    <FeldZeile
      f={f}
      i={i}
      anzahl={e.felder.length}
      offen={offen === i}
      fehler={z.fehler?.felder[String(i)]}
      zieh={zf.eintrag(f._uid)}
      griff={<FeldGriff zf={zf} f={f} i={i} anzahl={e.felder.length} verschiebe={a.verschiebe} setAnsage={setAnsage} />}
      eigeneId={e.id}
      eigenerName={e.name}
      typen={d.typen}
      feldregister={e.register.filter((r) => r.art === 'felder')}
      alleFelder={alleFelderVon(e)}
      benutzerFelder={e.felder
        .filter(
          (x) =>
            x.typ === 'referenz' &&
            !x.mehrfach &&
            !!einzigesZiel(x) &&
            einzigesZiel(x) === d.typen.find((mappentyp) => mappentyp.system === 'benutzer')?.id,
        )
        .map((x) => ({ key: x.key, label: x.label || x.key }))}
      umschalten={() => z.setOffen(offen === i ? null : i)}
      verschiebe={(r) => a.verschiebe(i, r)}
      entferne={() => void a.entferne(i)}
      ausblenden={(an) =>
        an
          ? void a.ausblendenFragen([f._uid], t('mappentypen.darstellung.feld-ausblenden', { label: f.label || f.key }), (x) => ({
              ...x,
              felder: x.felder.map((g) => (g._uid === f._uid ? { ...g, ausgeblendet: true } : g)),
            }))
          : setE((x) => ({
              ...x,
              felder: x.felder.map((g) => (g._uid === f._uid ? { ...g, ausgeblendet: undefined, _pflichtWeg: undefined } : g)),
            }))
      }
      registerAusgeblendet={!!e.register.find((r) => r.key === f._register)?.ausgeblendet}
      berechnung={z.typ?.berechnung}
      setze={(patch) => {
        const p = { ...patch };
        if ('label' in p && f._neu && !f._schluesselGetippt) p.key = a.eindeutigerSchluessel(schluesselAus(p.label ?? ''), i);
        if ('key' in p) p._schluesselGetippt = true;
        if ('typ' in p) p.standard = p.typ === 'janein' ? false : '';
        // Ein Abschnitt, der mit dem FeldDef begann, bleibt im alten Register (#890).
        if ('_register' in p && p._register !== f._register) setE((x) => ohneAnker(x, f._uid));
        a.setzeFeld(i, p);
      }}
    />
  );
}

/** Die Felder dieses Typs für Filter, Bedingungen und Platzhalter (nur, was die Teile brauchen). */
const alleFelderVon = (e: Entwurf) =>
  e.felder.map(
    (x) =>
      ({
        key: x.key,
        label: x.label || x.key,
        typ: x.typ,
        optionen: x.optionen,
        zielTypen: x.zielTypen,
        mehrfach: x.mehrfach,
      }) as FeldDef,
  );

/** Griff zum Ziehen; Alt+Pfeiltasten verschieben und sagen die neue Stelle an. */
function FeldGriff({
  zf,
  f,
  i,
  anzahl,
  verschiebe,
  setAnsage,
}: {
  zf: ReturnType<typeof useZiehen>;
  f: EntwurfFeld;
  i: number;
  anzahl: number;
  verschiebe: (i: number, r: number) => void;
  setAnsage: (s: string) => void;
}) {
  return (
    <Ziehgriff
      griff={zf.griff(f._uid, f.label || t('mappentypen.editor.feld'))}
      tasten={{
        hoch:
          i > 0
            ? () => {
                verschiebe(i, -1);
                setAnsage(t('mappentypen.editor.steht-jetzt-an-stelle', { wert: f.label || t('mappentypen.editor.feld'), i }));
              }
            : undefined,
        runter:
          i < anzahl - 1
            ? () => {
                verschiebe(i, 1);
                setAnsage(
                  t('mappentypen.editor.steht-jetzt-an-stelle-2', {
                    wert: f.label || t('mappentypen.editor.feld'),
                    wert2: i + 2,
                  }),
                );
              }
            : undefined,
      }}
    />
  );
}
