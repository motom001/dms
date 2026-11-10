/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Testbau mit Musterseite (#967): `VITE_MUSTER=1 npm run build -w web`. Im Produktivbau nie gesetzt. */
  readonly VITE_MUSTER?: string;
}
