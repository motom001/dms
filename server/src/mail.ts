export interface Mailer { sende(an: string, betreff: string, text: string): Promise<void> }

export const mailtexte = {
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
