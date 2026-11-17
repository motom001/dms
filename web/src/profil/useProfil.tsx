import { useState, type FormEvent, type ReactNode } from 'react';
import { kontoApi } from '../api/konto';
import { useKonto } from '../konto';
import { t } from '../sprache';
import { abfangen } from '../bausteine';

/** Formulare der Profilseite (#1279 aus Profil.tsx gezogen): Zustand bleibt beim Wechsel der Bereiche erhalten. */

function useFormular(fn: () => Promise<string>) {
  const [sendet, setSendet] = useState(false);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  // abfangen (#1011): React bekommt kein Promise; ein Fehler steht wie bisher als Meldung am Formular.
  const absenden = abfangen(
    async (e: FormEvent) => {
      e.preventDefault();
      setSendet(true);
      setMeldung(undefined);
      try {
        setMeldung({ art: 'gut', text: await fn() });
      } finally {
        setSendet(false);
      }
    },
    (text) => setMeldung({ art: 'schlecht', text }),
  );
  const anzeige: ReactNode = meldung ? (
    <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">
      {meldung.text}
    </p>
  ) : null;
  return { sendet, absenden, anzeige };
}

/** Eingaben und Formulare aller Bereiche – in `ProfilBereich`, damit sie den Wechsel zwischen den Bereichen überstehen. */
export function useProfilZustand() {
  const { ich, mail, aktualisieren } = useKonto();
  const [name, setName] = useState(ich.name);
  const [email, setEmail] = useState(ich.email);
  const [pwEmail, setPwEmail] = useState('');
  const [alt, setAlt] = useState('');
  const [neu, setNeu] = useState('');
  const [neu2, setNeu2] = useState('');
  const [entwickler, setEntwickler] = useState(!!ich.entwicklermodus);
  const [ansicht, setAnsicht] = useState(false);
  // #1352: nach dem neuen Passwort die eigenen API-Schlüssel zeigen und das Löschen anbieten.
  const [schluesselPruefen, setSchluesselPruefen] = useState(false);

  const fName = useFormular(async () => {
    await kontoApi.profil(name);
    await aktualisieren();
    return t('profil.profil.name-gespeichert');
  });
  const fEmail = useFormular(async () => {
    await kontoApi.emailAendern(email, pwEmail);
    setPwEmail('');
    await aktualisieren();
    return mail ? t('profil.profil.e-mail-adresse-geaendert') : t('profil.profil.e-mail-adresse-geaendert-2');
  });
  const fPw = useFormular(async () => {
    if (neu !== neu2) throw new Error(t('profil.profil.die-beiden-neuen-passwoerter'));
    await kontoApi.passwortAendern(alt, neu);
    setAlt('');
    setNeu('');
    setNeu2('');
    setSchluesselPruefen(true);
    return t('profil.profil.passwort-geaendert-alle-anderen');
  });
  return {
    name,
    setName,
    email,
    setEmail,
    pwEmail,
    setPwEmail,
    alt,
    setAlt,
    neu,
    setNeu,
    neu2,
    setNeu2,
    entwickler,
    setEntwickler,
    ansicht,
    setAnsicht,
    fName,
    fEmail,
    fPw,
    schluesselPruefen,
    setSchluesselPruefen,
  };
}
export type ProfilZustand = ReturnType<typeof useProfilZustand>;
