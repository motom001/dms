# Aufbau aus Bestandteilen { #aufbau-aus-bestandteilen }

!!! note ""
    Diese Seite entsteht aus den Lockfiles und `.github/werkzeuge/bestandteile-wozu.json` mit `node .github/werkzeuge/bestandteile.mjs --handbuch` – bitte dort ändern, nicht hier. Der Job `stil` schlägt fehl, wenn sich die direkt eingebundenen Pakete, ihr Zweck oder ihr Einsatz geändert haben, und weist nur darauf hin, wenn sich bloß Mitgebrachtes geändert hat.

Ablago bindet nur wenige Pakete **direkt** ein (**Ebene 1**). Was diese brauchen, kommt **mit** (**Ebene 2** und tiefer). Jedes Paket der Ebene 1 hat einen Zweck; ohne ihn schlägt die CI fehl. Welche Version mit welcher Lizenz in einem Release steckt, steht in den Anhängen am Release (Spalten *Ebene*, *Eingebracht durch*, *Einsatz*, *Zweck*), siehe [Bestandteile und Lizenzen](https://help.ablago.app/admin/aktuell/bestandteile/) im Administratorhandbuch. Warum wir neue Abhängigkeiten nur mit Begründung aufnehmen: [Abhängigkeiten](abhaengigkeiten.md).

## Im Betrieb (im Image) { #im-betrieb-im-image }

### Server { #server }

| Paket | Wozu | Lizenz | Bringt mit |
| --- | --- | --- | ---: |
| `@fastify/static` | Liefert die Weboberfläche und das Offline-Handbuch als Dateien aus. | MIT | 25 |
| `@pdf-lib/fontkit` | Eigene Schriften (Noto Sans) als Teilmenge in PDFs einbetten. | MIT | 1 |
| `@simplewebauthn/server` | Passkeys prüfen (WebAuthn: CBOR, COSE-Schlüssel, Signaturen, Zähler). | MIT | 23 |
| `fastify` | HTTP-Server: Routen, Prüfung der Anfragen, Antworten. | MIT | 46 |
| `imapflow` | Post aus Postfächern über IMAP abholen. | MIT | 23 |
| `mailparser` | Abgeholte E-Mails in Text und Anhänge zerlegen. | MIT | 25 |
| `nodemailer` | E-Mails über SMTP senden (Einladungen, Hinweise, Mappen versenden). | MIT-0 | 0 |
| `pdf-lib` | PDFs zusammenstellen, verkleinern, schwärzen und stempeln (nur über die PDF-Stelle). | MIT | 4 |
| `postgres` | Zugriff auf PostgreSQL (postgres.js). | Unlicense | 0 |
| `yaml` | Pakete, Rundgänge und Einrichtungsdateien im YAML-Format lesen und schreiben. | ISC | 0 |

<!-- mitgebracht:anfang -->

??? note "@fastify/static bringt 25 Pakete mit"
    @fastify/accept-negotiator, @fastify/error, @fastify/send, @isaacs/nonrecursive-glob-match, @lukeed/ms, balanced-match, brace-expansion, content-disposition, depd, escape-html, fast-decode-uri-component, fastify-plugin, fastq, glob, http-errors, inherits, lru-cache, mime, minimatch, minipass, path-scurry, reusify, setprototypeof, statuses, toidentifier

??? note "@pdf-lib/fontkit bringt 1 Paket mit"
    pako

??? note "@simplewebauthn/server bringt 23 Pakete mit"
    @hexagon/base64, @levischuck/tiny-cbor, @peculiar/asn1-android, @peculiar/asn1-asym-key, @peculiar/asn1-cms, @peculiar/asn1-csr, @peculiar/asn1-ecc, @peculiar/asn1-pfx, @peculiar/asn1-pkcs8, @peculiar/asn1-pkcs9, @peculiar/asn1-rsa, @peculiar/asn1-schema, @peculiar/asn1-x509, @peculiar/asn1-x509-attr, @peculiar/asn1-x509-post-quantum, @peculiar/utils, @peculiar/x509, asn1js, pvtsutils, pvutils, reflect-metadata, tslib, tsyringe

??? note "fastify bringt 46 Pakete mit"
    @fastify/ajv-compiler, @fastify/deepmerge, @fastify/error, @fastify/fast-json-stringify-compiler, @fastify/forwarded, @fastify/merge-json-schemas, @fastify/proxy-addr, @pinojs/redact, abstract-logging, ajv, ajv-formats, atomic-sleep, avvio, cookie, dequal, fast-decode-uri-component, fast-deep-equal, fast-json-stringify, fast-querystring, fast-uri, fastq, find-my-way, ipaddr.js, json-schema-ref-resolver, json-schema-traverse, light-my-request, on-exit-leak-free, pino, pino-abstract-transport, pino-std-serializers, process-warning, quick-format-unescaped, real-require, require-from-string, ret, reusify, rfdc, safe-regex2, safe-stable-stringify, secure-json-parse, semver, set-cookie-parser, sonic-boom, split2, thread-stream, toad-cache

??? note "imapflow bringt 23 Pakete mit"
    @pinojs/redact, @zone-eu/mailsplit, atomic-sleep, encoding-japanese, iconv-lite, ip-address, libbase64, libmime, libqp, on-exit-leak-free, pino, pino-abstract-transport, pino-std-serializers, process-warning, quick-format-unescaped, real-require, safe-stable-stringify, safer-buffer, smart-buffer, socks, sonic-boom, split2, thread-stream

??? note "mailparser bringt 25 Pakete mit"
    @selderee/plugin-htmlparser2, @zone-eu/mailsplit, deepmerge-ts, dom-serializer, domelementtype, domhandler, domutils, encoding-japanese, entities, he, html-to-text, htmlparser2, iconv-lite, leac, libbase64, libmime, libqp, linkify-it, parseley, peberminta, punycode.js, safer-buffer, selderee, tlds, uc.micro

??? note "pdf-lib bringt 4 Pakete mit"
    @pdf-lib/standard-fonts, @pdf-lib/upng, pako, tslib

<!-- mitgebracht:ende -->

### Weboberfläche { #weboberflaeche }

Die Bibliotheken der Oberfläche bündelt Vite beim Bauen in eine Datei; im Image stehen sie nicht als eigene Pakete. Diese Seite zeigt den Baum aus `package-lock.json` und kann deshalb mehr enthalten, als im Bündel landet (z. B. die Kommandozeile von `qrcode`). Die Liste am Release nimmt nur, was wirklich im Bündel steckt.

| Paket | Wozu | Lizenz | Bringt mit |
| --- | --- | --- | ---: |
| `qrcode` | QR-Codes, z. B. für die Zwei-Faktor-Anmeldung und das Notfallblatt. | MIT | 28 |
| `react` | Grundlage der Weboberfläche. | MIT | 0 |
| `react-dom` | Zeichnet die React-Oberfläche im Browser. | MIT | 1 |

<!-- mitgebracht:anfang -->

??? note "qrcode bringt 28 Pakete mit"
    ansi-regex, ansi-styles, camelcase, cliui, color-convert, color-name, decamelize, dijkstrajs, emoji-regex, find-up, get-caller-file, is-fullwidth-code-point, locate-path, p-limit, p-locate, p-try, path-exists, pngjs, require-directory, require-main-filename, set-blocking, string-width, strip-ansi, which-module, wrap-ansi, y18n, yargs, yargs-parser

??? note "react-dom bringt 1 Paket mit"
    scheduler

<!-- mitgebracht:ende -->

### Systemprogramme (Alpine) { #systemprogramme-alpine }

| Programm | Wozu | Variante |
| --- | --- | --- |
| `node` | Laufzeit für Server und Werkzeuge von Ablago; aus dem offiziellen Image „node“ für Alpine (npm, Yarn und Corepack werden entfernt). | `dms`, `dms-komplett` |
| `busybox` | Grundprogramme von Alpine (Shell, wget für die Gesundheitsprüfung des Containers); kommt mit dem Basis-Image. | `dms`, `dms-komplett` |
| `poppler-utils` | Textebene von PDFs (pdftotext), Vorschau- und Seitenbilder, Schwärzen, Verkleinern (pdftoppm). | `dms`, `dms-komplett` |
| `qpdf` | PDF verkleinern: optimiert die Struktur der Datei (bewusst kein Ghostscript). | `dms`, `dms-komplett` |
| `fontconfig` | Findet die Ersatzschriften für PDFs, die ihre Schriften nicht einbetten. | `dms`, `dms-komplett` |
| `font-liberation` | Ersatzschriften, metrisch passend für Helvetica/Arial, Times und Courier (Seiten- und Vorschaubilder, Archivfassung). | `dms`, `dms-komplett` |
| `font-dejavu` | Ersatzschrift für weitere Zeichen. | `dms`, `dms-komplett` |
| `postgresql18` | Datenbank im Container, nur in dms-komplett (nur innerhalb des Containers erreichbar). | `dms-komplett` |
| `postgresql18-contrib` | Erweiterungen pg_trgm und unaccent für die unscharfe Suche und die Suche in Wortteilen. | `dms-komplett` |
| `tini` | Erster Prozess im Container: gibt Signale weiter und beendet Ablago (und in dms-komplett PostgreSQL) sauber. | `dms`, `dms-komplett` |
| `su-exec` | Startet PostgreSQL unter einem eigenen Benutzer statt als root (dms-komplett). | `dms`, `dms-komplett` |
| `setpriv` | Startet Ablago und die Dokumentwerkzeuge als eigene Benutzer statt als root, mit „no new privileges“ (aus util-linux). | `dms`, `dms-komplett` |

Was die Systemprogramme ihrerseits mitbringen, zeigt erst das fertige Image: in der CSV am Release die Spalten *Ebene* und *Eingebracht durch*; Pakete, die keins dieser Programme braucht, kommen mit dem Basis-Image (`node` für Alpine).

### Weitere Bestandteile { #weitere-bestandteile }

- **Node.js** als Laufzeit, aus dem offiziellen Image `node` für Alpine (Basis-Image).
- **Noto Sans** und **Noto Sans Mono** (OFL-1.1) für Ablagos eigene PDFs, unter `server/schriften/`.
- **Lucide** (ISC): Symbole der Oberfläche, als Quelltext übernommen.
- **Offline-Handbuch** mit **Material for MkDocs** (MIT).

## Entwicklung und Test (nicht im Image) { #entwicklung-und-test-nicht-im-image }

Diese Pakete braucht nur, wer Ablago baut oder prüft (`devDependencies` und das eigene Lockfile der Rauchtests in `web/rauchtest/`). Sie stecken **nicht im Image** und zählen in den Lizenzen des Release-Texts nicht mit.

| Paket | Einsatz | Wozu | Lizenz | Bringt mit |
| --- | --- | --- | --- | ---: |
| `@eslint-community/eslint-plugin-eslint-comments` | Entwicklung | Regeln für Ausnahmen per Kommentar (mit Begründung). | MIT | 76 |
| `@eslint/js` | Entwicklung | Grundregeln für ESLint. | MIT | 76 |
| `@types/node` | Entwicklung | Typen für Node.js. | MIT | 1 |
| `@types/nodemailer` | Entwicklung | Typen für nodemailer. | MIT | 1 |
| `@types/qrcode` | Entwicklung | Typen für qrcode. | MIT | 1 |
| `@types/react` | Entwicklung | Typen für React. | MIT | 1 |
| `@types/react-dom` | Entwicklung | Typen für react-dom. | MIT | 1 |
| `@vitejs/plugin-react` | Entwicklung | React-Unterstützung für Vite. | MIT | 75 |
| `axe-core` | Test | Prüft die Barrierefreiheit in den Rauchtests. | MPL-2.0 | 0 |
| `dependency-cruiser` | Entwicklung | Prüft Grenzen und Kreise zwischen den Ordnern; Abhängigkeitsbild. | MIT | 42 |
| `esbuild` | Entwicklung | Bündelt den Server für das Image. | MIT | 26 |
| `eslint` | Entwicklung | Prüft Stil und Regeln im Code. | MIT | 76 |
| `eslint-plugin-react-hooks` | Entwicklung | Regeln für React-Hooks. | MIT | 117 |
| `globals` | Entwicklung | Bekannte globale Namen für ESLint (Browser, Node). | MIT | 0 |
| `knip` | Entwicklung | Findet ungenutzte Dateien, Exporte und Abhängigkeiten. | ISC | 61 |
| `playwright` | Test | Steuert den Browser in den Rauchtests (eigenes Lockfile in web/rauchtest). | Apache-2.0 | 1 |
| `prettier` | Entwicklung | Formatiert den Code einheitlich. | MIT | 0 |
| `tsx` | Entwicklung | TypeScript direkt ausführen: Entwicklungsserver, Tests, Werkzeuge. | MIT | 27 |
| `typescript` | Entwicklung | Typprüfung für Server, Oberfläche und shared. | Apache-2.0 | 0 |
| `typescript-eslint` | Entwicklung | ESLint für TypeScript. | MIT | 91 |
| `vite` | Entwicklung | Baut und bündelt die Weboberfläche; Entwicklungsserver. | MIT | 75 |

<!-- mitgebracht:anfang -->

Zusammen 305 Pakete, die nur für Entwicklung und Test installiert werden.

<!-- mitgebracht:ende -->

<!-- mitgebracht:anfang -->

??? note "@eslint-community/eslint-plugin-eslint-comments bringt 76 Pakete mit"
    @cacheable/memory, @cacheable/utils, @eslint-community/eslint-utils, @eslint-community/regexpp, @eslint/config-array, @eslint/config-helpers, @eslint/core, @eslint/object-schema, @eslint/plugin-kit, @humanfs/core, @humanfs/node, @humanfs/types, @humanwhocodes/module-importer, @humanwhocodes/retry, @isaacs/nonrecursive-glob-match, @keyv/bigmap, @keyv/serialize, @types/esrecurse, @types/estree, @types/json-schema, acorn, acorn-jsx, ajv, balanced-match, brace-expansion, cacheable, cross-spawn, debug, deep-is, escape-string-regexp, eslint-scope, eslint-visitor-keys, espree, esquery, esrecurse, estraverse, esutils, fast-deep-equal, fast-json-stable-stringify, fast-levenshtein, file-entry-cache, find-up, flat-cache, flatted, glob-parent, hashery, hookified, ignore, imurmurhash, is-extglob, is-glob, isexe, jiti, json-schema-traverse, json-stable-stringify-without-jsonify, keyv, levn, locate-path, minimatch, ms, natural-compare, optionator, p-limit, p-locate, path-exists, path-key, prelude-ls, punycode, qified, shebang-command, shebang-regex, type-check, uri-js, which, word-wrap, yocto-queue

??? note "@eslint/js bringt 76 Pakete mit"
    @cacheable/memory, @cacheable/utils, @eslint-community/eslint-utils, @eslint-community/regexpp, @eslint/config-array, @eslint/config-helpers, @eslint/core, @eslint/object-schema, @eslint/plugin-kit, @humanfs/core, @humanfs/node, @humanfs/types, @humanwhocodes/module-importer, @humanwhocodes/retry, @isaacs/nonrecursive-glob-match, @keyv/bigmap, @keyv/serialize, @types/esrecurse, @types/estree, @types/json-schema, acorn, acorn-jsx, ajv, balanced-match, brace-expansion, cacheable, cross-spawn, debug, deep-is, escape-string-regexp, eslint-scope, eslint-visitor-keys, espree, esquery, esrecurse, estraverse, esutils, fast-deep-equal, fast-json-stable-stringify, fast-levenshtein, file-entry-cache, find-up, flat-cache, flatted, glob-parent, hashery, hookified, ignore, imurmurhash, is-extglob, is-glob, isexe, jiti, json-schema-traverse, json-stable-stringify-without-jsonify, keyv, levn, locate-path, minimatch, ms, natural-compare, optionator, p-limit, p-locate, path-exists, path-key, prelude-ls, punycode, qified, shebang-command, shebang-regex, type-check, uri-js, which, word-wrap, yocto-queue

??? note "@types/node bringt 1 Paket mit"
    undici-types

??? note "@types/nodemailer bringt 1 Paket mit"
    undici-types

??? note "@types/qrcode bringt 1 Paket mit"
    undici-types

??? note "@types/react bringt 1 Paket mit"
    csstype

??? note "@types/react-dom bringt 1 Paket mit"
    csstype

??? note "@vitejs/plugin-react bringt 75 Pakete mit"
    @emnapi/core, @emnapi/runtime, @emnapi/wasi-threads, @esbuild/aix-ppc64, @esbuild/android-arm, @esbuild/android-arm64, @esbuild/android-x64, @esbuild/darwin-arm64, @esbuild/darwin-x64, @esbuild/freebsd-arm64, @esbuild/freebsd-x64, @esbuild/linux-arm, @esbuild/linux-arm64, @esbuild/linux-ia32, @esbuild/linux-loong64, @esbuild/linux-mips64el, @esbuild/linux-ppc64, @esbuild/linux-riscv64, @esbuild/linux-s390x, @esbuild/linux-x64, @esbuild/netbsd-arm64, @esbuild/netbsd-x64, @esbuild/openbsd-arm64, @esbuild/openbsd-x64, @esbuild/openharmony-arm64, @esbuild/sunos-x64, @esbuild/win32-arm64, @esbuild/win32-ia32, @esbuild/win32-x64, @napi-rs/wasm-runtime, @oxc-project/types, @rolldown/binding-android-arm-eabi, @rolldown/binding-android-arm64, @rolldown/binding-darwin-arm64, @rolldown/binding-darwin-x64, @rolldown/binding-freebsd-x64, @rolldown/binding-linux-arm-gnueabihf, @rolldown/binding-linux-arm64-gnu, @rolldown/binding-linux-arm64-musl, @rolldown/binding-linux-ppc64-gnu, @rolldown/binding-linux-s390x-gnu, @rolldown/binding-linux-x64-gnu, @rolldown/binding-linux-x64-musl, @rolldown/binding-openharmony-arm64, @rolldown/binding-wasm32-wasi, @rolldown/binding-win32-arm64-msvc, @rolldown/binding-win32-x64-msvc, @rolldown/pluginutils, @tybys/wasm-util, detect-libc, fdir, fsevents, jiti, lightningcss, lightningcss-android-arm64, lightningcss-darwin-arm64, lightningcss-darwin-x64, lightningcss-freebsd-x64, lightningcss-linux-arm-gnueabihf, lightningcss-linux-arm64-gnu, lightningcss-linux-arm64-musl, lightningcss-linux-x64-gnu, lightningcss-linux-x64-musl, lightningcss-win32-arm64-msvc, lightningcss-win32-x64-msvc, nanoid, picocolors, picomatch, postcss, rolldown, source-map-js, tinyglobby, tslib, undici-types, yaml

??? note "dependency-cruiser bringt 42 Pakete mit"
    acorn, acorn-jsx, acorn-jsx-walk, acorn-loose, acorn-walk, ansi-styles, chalk, color-convert, color-name, commander, enhanced-resolve, es-errors, function-bind, global-directory, graceful-fs, has-flag, hasown, ignore, ini, interpret, is-core-module, is-installed-globally, is-path-inside, json5, kleur, minimist, path-parse, picomatch, prompts, rechoir, regexp-tree, resolve, safe-regex, semver, sisteransi, strip-bom, supports-color, supports-preserve-symlinks-flag, tapable, tsconfig-paths, tsconfig-paths-webpack-plugin, watskeburt

??? note "esbuild bringt 26 Pakete mit"
    @esbuild/aix-ppc64, @esbuild/android-arm, @esbuild/android-arm64, @esbuild/android-x64, @esbuild/darwin-arm64, @esbuild/darwin-x64, @esbuild/freebsd-arm64, @esbuild/freebsd-x64, @esbuild/linux-arm, @esbuild/linux-arm64, @esbuild/linux-ia32, @esbuild/linux-loong64, @esbuild/linux-mips64el, @esbuild/linux-ppc64, @esbuild/linux-riscv64, @esbuild/linux-s390x, @esbuild/linux-x64, @esbuild/netbsd-arm64, @esbuild/netbsd-x64, @esbuild/openbsd-arm64, @esbuild/openbsd-x64, @esbuild/openharmony-arm64, @esbuild/sunos-x64, @esbuild/win32-arm64, @esbuild/win32-ia32, @esbuild/win32-x64

??? note "eslint bringt 76 Pakete mit"
    @cacheable/memory, @cacheable/utils, @eslint-community/eslint-utils, @eslint-community/regexpp, @eslint/config-array, @eslint/config-helpers, @eslint/core, @eslint/object-schema, @eslint/plugin-kit, @humanfs/core, @humanfs/node, @humanfs/types, @humanwhocodes/module-importer, @humanwhocodes/retry, @isaacs/nonrecursive-glob-match, @keyv/bigmap, @keyv/serialize, @types/esrecurse, @types/estree, @types/json-schema, acorn, acorn-jsx, ajv, balanced-match, brace-expansion, cacheable, cross-spawn, debug, deep-is, escape-string-regexp, eslint-scope, eslint-visitor-keys, espree, esquery, esrecurse, estraverse, esutils, fast-deep-equal, fast-json-stable-stringify, fast-levenshtein, file-entry-cache, find-up, flat-cache, flatted, glob-parent, hashery, hookified, ignore, imurmurhash, is-extglob, is-glob, isexe, jiti, json-schema-traverse, json-stable-stringify-without-jsonify, keyv, levn, locate-path, minimatch, ms, natural-compare, optionator, p-limit, p-locate, path-exists, path-key, prelude-ls, punycode, qified, shebang-command, shebang-regex, type-check, uri-js, which, word-wrap, yocto-queue

??? note "eslint-plugin-react-hooks bringt 117 Pakete mit"
    @babel/code-frame, @babel/compat-data, @babel/core, @babel/generator, @babel/helper-compilation-targets, @babel/helper-globals, @babel/helper-module-imports, @babel/helper-module-transforms, @babel/helper-string-parser, @babel/helper-validator-identifier, @babel/helper-validator-option, @babel/helpers, @babel/parser, @babel/template, @babel/traverse, @babel/types, @cacheable/memory, @cacheable/utils, @eslint-community/eslint-utils, @eslint-community/regexpp, @eslint/config-array, @eslint/config-helpers, @eslint/core, @eslint/object-schema, @eslint/plugin-kit, @humanfs/core, @humanfs/node, @humanfs/types, @humanwhocodes/module-importer, @humanwhocodes/retry, @isaacs/nonrecursive-glob-match, @jridgewell/gen-mapping, @jridgewell/remapping, @jridgewell/resolve-uri, @jridgewell/sourcemap-codec, @jridgewell/trace-mapping, @keyv/bigmap, @keyv/serialize, @types/esrecurse, @types/estree, @types/json-schema, acorn, acorn-jsx, ajv, balanced-match, baseline-browser-mapping, brace-expansion, browserslist, cacheable, caniuse-lite, convert-source-map, cross-spawn, debug, deep-is, electron-to-chromium, escalade, escape-string-regexp, eslint-scope, eslint-visitor-keys, espree, esquery, esrecurse, estraverse, esutils, fast-deep-equal, fast-json-stable-stringify, fast-levenshtein, file-entry-cache, find-up, flat-cache, flatted, gensync, glob-parent, hashery, hermes-estree, hermes-parser, hookified, ignore, imurmurhash, is-extglob, is-glob, isexe, jiti, js-tokens, jsesc, json-schema-traverse, json-stable-stringify-without-jsonify, json5, keyv, levn, locate-path, lru-cache, minimatch, ms, natural-compare, node-releases, optionator, p-limit, p-locate, path-exists, path-key, picocolors, prelude-ls, punycode, qified, semver, shebang-command, shebang-regex, type-check, update-browserslist-db, uri-js, which, word-wrap, yallist, yocto-queue, zod, zod-validation-error

??? note "knip bringt 61 Pakete mit"
    @emnapi/core, @emnapi/runtime, @emnapi/wasi-threads, @napi-rs/wasm-runtime, @oxc-parser/binding-android-arm-eabi, @oxc-parser/binding-android-arm64, @oxc-parser/binding-darwin-arm64, @oxc-parser/binding-darwin-x64, @oxc-parser/binding-freebsd-x64, @oxc-parser/binding-linux-arm-gnueabihf, @oxc-parser/binding-linux-arm-musleabihf, @oxc-parser/binding-linux-arm64-gnu, @oxc-parser/binding-linux-arm64-musl, @oxc-parser/binding-linux-ppc64-gnu, @oxc-parser/binding-linux-riscv64-gnu, @oxc-parser/binding-linux-riscv64-musl, @oxc-parser/binding-linux-s390x-gnu, @oxc-parser/binding-linux-x64-gnu, @oxc-parser/binding-linux-x64-musl, @oxc-parser/binding-openharmony-arm64, @oxc-parser/binding-win32-arm64-msvc, @oxc-parser/binding-win32-ia32-msvc, @oxc-parser/binding-win32-x64-msvc, @oxc-project/types, @oxc-resolver/binding-android-arm-eabi, @oxc-resolver/binding-android-arm64, @oxc-resolver/binding-darwin-arm64, @oxc-resolver/binding-darwin-x64, @oxc-resolver/binding-freebsd-x64, @oxc-resolver/binding-linux-arm-gnueabihf, @oxc-resolver/binding-linux-arm-musleabihf, @oxc-resolver/binding-linux-arm64-gnu, @oxc-resolver/binding-linux-arm64-musl, @oxc-resolver/binding-linux-ppc64-gnu, @oxc-resolver/binding-linux-riscv64-gnu, @oxc-resolver/binding-linux-riscv64-musl, @oxc-resolver/binding-linux-s390x-gnu, @oxc-resolver/binding-linux-x64-gnu, @oxc-resolver/binding-linux-x64-musl, @oxc-resolver/binding-openharmony-arm64, @oxc-resolver/binding-wasm32-wasi, @oxc-resolver/binding-win32-arm64-msvc, @oxc-resolver/binding-win32-x64-msvc, @tybys/wasm-util, fd-package-json, fdir, formatly, get-tsconfig, jiti, oxc-parser, oxc-resolver, package-manager-detector, picomatch, resolve-pkg-maps, smol-toml, strip-json-comments, tinyglobby, tslib, unbash, walk-up-path, yaml

??? note "playwright bringt 1 Paket mit"
    playwright-core

??? note "tsx bringt 27 Pakete mit"
    @esbuild/aix-ppc64, @esbuild/android-arm, @esbuild/android-arm64, @esbuild/android-x64, @esbuild/darwin-arm64, @esbuild/darwin-x64, @esbuild/freebsd-arm64, @esbuild/freebsd-x64, @esbuild/linux-arm, @esbuild/linux-arm64, @esbuild/linux-ia32, @esbuild/linux-loong64, @esbuild/linux-mips64el, @esbuild/linux-ppc64, @esbuild/linux-riscv64, @esbuild/linux-s390x, @esbuild/linux-x64, @esbuild/netbsd-arm64, @esbuild/netbsd-x64, @esbuild/openbsd-arm64, @esbuild/openbsd-x64, @esbuild/openharmony-arm64, @esbuild/sunos-x64, @esbuild/win32-arm64, @esbuild/win32-ia32, @esbuild/win32-x64, fsevents

??? note "typescript-eslint bringt 91 Pakete mit"
    @cacheable/memory, @cacheable/utils, @eslint-community/eslint-utils, @eslint-community/regexpp, @eslint/config-array, @eslint/config-helpers, @eslint/core, @eslint/object-schema, @eslint/plugin-kit, @humanfs/core, @humanfs/node, @humanfs/types, @humanwhocodes/module-importer, @humanwhocodes/retry, @isaacs/nonrecursive-glob-match, @keyv/bigmap, @keyv/serialize, @types/esrecurse, @types/estree, @types/json-schema, @typescript-eslint/eslint-plugin, @typescript-eslint/parser, @typescript-eslint/project-service, @typescript-eslint/scope-manager, @typescript-eslint/tsconfig-utils, @typescript-eslint/type-utils, @typescript-eslint/types, @typescript-eslint/typescript-estree, @typescript-eslint/utils, @typescript-eslint/visitor-keys, acorn, acorn-jsx, ajv, balanced-match, brace-expansion, cacheable, cross-spawn, debug, deep-is, escape-string-regexp, eslint-scope, eslint-visitor-keys, espree, esquery, esrecurse, estraverse, esutils, fast-deep-equal, fast-json-stable-stringify, fast-levenshtein, fdir, file-entry-cache, find-up, flat-cache, flatted, glob-parent, hashery, hookified, ignore, imurmurhash, is-extglob, is-glob, isexe, jiti, json-schema-traverse, json-stable-stringify-without-jsonify, keyv, levn, locate-path, minimatch, ms, natural-compare, optionator, p-limit, p-locate, path-exists, path-key, picomatch, prelude-ls, punycode, qified, semver, shebang-command, shebang-regex, tinyglobby, ts-api-utils, type-check, uri-js, which, word-wrap, yocto-queue

??? note "vite bringt 75 Pakete mit"
    @emnapi/core, @emnapi/runtime, @emnapi/wasi-threads, @esbuild/aix-ppc64, @esbuild/android-arm, @esbuild/android-arm64, @esbuild/android-x64, @esbuild/darwin-arm64, @esbuild/darwin-x64, @esbuild/freebsd-arm64, @esbuild/freebsd-x64, @esbuild/linux-arm, @esbuild/linux-arm64, @esbuild/linux-ia32, @esbuild/linux-loong64, @esbuild/linux-mips64el, @esbuild/linux-ppc64, @esbuild/linux-riscv64, @esbuild/linux-s390x, @esbuild/linux-x64, @esbuild/netbsd-arm64, @esbuild/netbsd-x64, @esbuild/openbsd-arm64, @esbuild/openbsd-x64, @esbuild/openharmony-arm64, @esbuild/sunos-x64, @esbuild/win32-arm64, @esbuild/win32-ia32, @esbuild/win32-x64, @napi-rs/wasm-runtime, @oxc-project/types, @rolldown/binding-android-arm-eabi, @rolldown/binding-android-arm64, @rolldown/binding-darwin-arm64, @rolldown/binding-darwin-x64, @rolldown/binding-freebsd-x64, @rolldown/binding-linux-arm-gnueabihf, @rolldown/binding-linux-arm64-gnu, @rolldown/binding-linux-arm64-musl, @rolldown/binding-linux-ppc64-gnu, @rolldown/binding-linux-s390x-gnu, @rolldown/binding-linux-x64-gnu, @rolldown/binding-linux-x64-musl, @rolldown/binding-openharmony-arm64, @rolldown/binding-wasm32-wasi, @rolldown/binding-win32-arm64-msvc, @rolldown/binding-win32-x64-msvc, @rolldown/pluginutils, @tybys/wasm-util, detect-libc, fdir, fsevents, jiti, lightningcss, lightningcss-android-arm64, lightningcss-darwin-arm64, lightningcss-darwin-x64, lightningcss-freebsd-x64, lightningcss-linux-arm-gnueabihf, lightningcss-linux-arm64-gnu, lightningcss-linux-arm64-musl, lightningcss-linux-x64-gnu, lightningcss-linux-x64-musl, lightningcss-win32-arm64-msvc, lightningcss-win32-x64-msvc, nanoid, picocolors, picomatch, postcss, rolldown, source-map-js, tinyglobby, tslib, undici-types, yaml

<!-- mitgebracht:ende -->
