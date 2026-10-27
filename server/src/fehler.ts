/** Fachlicher Fehler mit HTTP-Status und optionalen Details für die Oberfläche. */
export class Fachfehler extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}
