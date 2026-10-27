export interface Mailer { sende(an: string, betreff: string, text: string): Promise<void> }

export const mailtexte = {
  emailGeaendert: (name: string, alt: string, neu: string) => ({
    betreff: 'Deine E-Mail-Adresse im DMS wurde geändert',
    text: `Hallo ${name || alt},

die E-Mail-Adresse deines Zugangs zum DMS wurde von ${alt} auf ${neu} geändert. Anmelden kannst du dich ab jetzt nur noch mit der neuen Adresse.

Falls du das nicht warst, wende dich bitte sofort an deinen Administrator.
`,
  }),
  passwortGeaendert: (name: string, email: string) => ({
    betreff: 'Dein Passwort für das DMS wurde geändert',
    text: `Hallo ${name || email},

das Passwort deines Zugangs zum DMS wurde soeben geändert. Alle anderen Anmeldungen wurden dabei beendet.

Falls du das nicht warst, wende dich bitte sofort an deinen Administrator.
`,
  }),
  einladung: (name: string, email: string, link: string, tage: number) => ({
    betreff: 'Dein Zugang zum DMS',
    text: `Hallo ${name || email},

für dich wurde ein Zugang zum DMS angelegt.

Anmeldung mit: ${email}

Lege hier dein Passwort fest (der Link ist ${tage} Tage gültig und funktioniert nur einmal):
${link}
`,
  }),
  zuruecksetzen: (name: string, email: string, link: string, stunden: number) => ({
    betreff: 'Passwort für das DMS zurücksetzen',
    text: `Hallo ${name || email},

für deinen Zugang zum DMS wurde ein neues Passwort angefordert.

Lege hier ein neues Passwort fest (der Link ist ${stunden} Stunde${stunden === 1 ? '' : 'n'} gültig und funktioniert nur einmal):
${link}

Falls du das nicht warst, kannst du diese Nachricht ignorieren. Dein bisheriges Passwort bleibt dann gültig.
`,
  }),
};
