# Composition from components { #aufbau-aus-bestandteilen }

!!! note ""
    This page is generated from the lockfiles and `.github/werkzeuge/bestandteile-wozu.json` with `node .github/werkzeuge/bestandteile.mjs --handbuch` – please change it there, not here. The `stil` job fails if the directly included packages, their purpose or their use have changed, and only points it out if just the transitive packages have changed.

Ablago includes only a few packages **directly** (**level 1**). What they need comes **along** (**level 2** and deeper). Every level-1 package has a purpose; without one, CI fails. Which version with which licence is in a release is listed in the release attachments (columns *Ebene* (level), *Eingebracht durch* (brought in by), *Einsatz* (use), *Zweck* (purpose)), see [Components and licences](https://help.ablago.app/admin/aktuell/en/bestandteile/) in the administrator manual. Why we only add new dependencies with a reason: [Dependencies](abhaengigkeiten.md).

## In operation (in the image) { #im-betrieb-im-image }

### Server { #server }

| Package | Purpose | Licence | Brings along |
| --- | --- | --- | ---: |
| `@fastify/static` | Serves the web interface and the offline manual as files. | MIT | 25 |
| `@pdf-lib/fontkit` | Embedding own fonts (Noto Sans) as a subset in PDFs. | MIT | 1 |
| `@simplewebauthn/server` | Verifying passkeys (WebAuthn: CBOR, COSE keys, signatures, counters). | MIT | 23 |
| `fastify` | HTTP server: routes, request validation, responses. | MIT | 46 |
| `imapflow` | Fetching mail from mailboxes via IMAP. | MIT | 23 |
| `mailparser` | Splitting fetched e-mails into text and attachments. | MIT | 25 |
| `nodemailer` | Sending e-mails via SMTP (invitations, notices, sending folders). | MIT-0 | 0 |
| `pdf-lib` | Assembling, shrinking, redacting and stamping PDFs (only via the PDF module). | MIT | 4 |
| `postgres` | Access to PostgreSQL (postgres.js). | Unlicense | 0 |
| `yaml` | Reading and writing packages, tours and setup files in YAML. | ISC | 0 |

<!-- mitgebracht:anfang -->

??? note "@fastify/static brings along 25 packages"
    @fastify/accept-negotiator, @fastify/error, @fastify/send, @isaacs/nonrecursive-glob-match, @lukeed/ms, balanced-match, brace-expansion, content-disposition, depd, escape-html, fast-decode-uri-component, fastify-plugin, fastq, glob, http-errors, inherits, lru-cache, mime, minimatch, minipass, path-scurry, reusify, setprototypeof, statuses, toidentifier

??? note "@pdf-lib/fontkit brings along 1 package"
    pako

??? note "@simplewebauthn/server brings along 23 packages"
    @hexagon/base64, @levischuck/tiny-cbor, @peculiar/asn1-android, @peculiar/asn1-asym-key, @peculiar/asn1-cms, @peculiar/asn1-csr, @peculiar/asn1-ecc, @peculiar/asn1-pfx, @peculiar/asn1-pkcs8, @peculiar/asn1-pkcs9, @peculiar/asn1-rsa, @peculiar/asn1-schema, @peculiar/asn1-x509, @peculiar/asn1-x509-attr, @peculiar/asn1-x509-post-quantum, @peculiar/utils, @peculiar/x509, asn1js, pvtsutils, pvutils, reflect-metadata, tslib, tsyringe

??? note "fastify brings along 46 packages"
    @fastify/ajv-compiler, @fastify/deepmerge, @fastify/error, @fastify/fast-json-stringify-compiler, @fastify/forwarded, @fastify/merge-json-schemas, @fastify/proxy-addr, @pinojs/redact, abstract-logging, ajv, ajv-formats, atomic-sleep, avvio, cookie, dequal, fast-decode-uri-component, fast-deep-equal, fast-json-stringify, fast-querystring, fast-uri, fastq, find-my-way, ipaddr.js, json-schema-ref-resolver, json-schema-traverse, light-my-request, on-exit-leak-free, pino, pino-abstract-transport, pino-std-serializers, process-warning, quick-format-unescaped, real-require, require-from-string, ret, reusify, rfdc, safe-regex2, safe-stable-stringify, secure-json-parse, semver, set-cookie-parser, sonic-boom, split2, thread-stream, toad-cache

??? note "imapflow brings along 23 packages"
    @pinojs/redact, @zone-eu/mailsplit, atomic-sleep, encoding-japanese, iconv-lite, ip-address, libbase64, libmime, libqp, on-exit-leak-free, pino, pino-abstract-transport, pino-std-serializers, process-warning, quick-format-unescaped, real-require, safe-stable-stringify, safer-buffer, smart-buffer, socks, sonic-boom, split2, thread-stream

??? note "mailparser brings along 25 packages"
    @selderee/plugin-htmlparser2, @zone-eu/mailsplit, deepmerge-ts, dom-serializer, domelementtype, domhandler, domutils, encoding-japanese, entities, he, html-to-text, htmlparser2, iconv-lite, leac, libbase64, libmime, libqp, linkify-it, parseley, peberminta, punycode.js, safer-buffer, selderee, tlds, uc.micro

??? note "pdf-lib brings along 4 packages"
    @pdf-lib/standard-fonts, @pdf-lib/upng, pako, tslib

<!-- mitgebracht:ende -->

### Web interface { #weboberflaeche }

Vite bundles the web interface libraries into one file at build time; they are not separate packages in the image. This page shows the tree from `package-lock.json` and may therefore contain more than ends up in the bundle (e.g. the command line of `qrcode`). The list attached to a release only takes what is actually in the bundle.

| Package | Purpose | Licence | Brings along |
| --- | --- | --- | ---: |
| `qrcode` | QR codes, e.g. for two-factor sign-in and the emergency sheet. | MIT | 28 |
| `react` | Foundation of the web interface. | MIT | 0 |
| `react-dom` | Renders the React interface in the browser. | MIT | 1 |

<!-- mitgebracht:anfang -->

??? note "qrcode brings along 28 packages"
    ansi-regex, ansi-styles, camelcase, cliui, color-convert, color-name, decamelize, dijkstrajs, emoji-regex, find-up, get-caller-file, is-fullwidth-code-point, locate-path, p-limit, p-locate, p-try, path-exists, pngjs, require-directory, require-main-filename, set-blocking, string-width, strip-ansi, which-module, wrap-ansi, y18n, yargs, yargs-parser

??? note "react-dom brings along 1 package"
    scheduler

<!-- mitgebracht:ende -->

### System programs (Alpine) { #systemprogramme-alpine }

| Program | Purpose | Variant |
| --- | --- | --- |
| `node` | Runtime for the Ablago server and tools; from the official “node” image for Alpine (npm, Yarn and Corepack are removed). | `dms`, `dms-komplett` |
| `busybox` | Alpine base programs (shell, wget for the container health check); comes with the base image. | `dms`, `dms-komplett` |
| `poppler-utils` | Text layer of PDFs (pdftotext), preview and page images, redaction, shrinking (pdftoppm). | `dms`, `dms-komplett` |
| `qpdf` | Shrinking PDFs: optimises the file structure (deliberately no Ghostscript). | `dms`, `dms-komplett` |
| `fontconfig` | Finds the substitute fonts for PDFs that do not embed their fonts. | `dms`, `dms-komplett` |
| `font-liberation` | Substitute fonts, metrically matching Helvetica/Arial, Times and Courier (page and preview images, archive version). | `dms`, `dms-komplett` |
| `font-dejavu` | Substitute font for further characters. | `dms`, `dms-komplett` |
| `postgresql17` | Database inside the container, only in dms-komplett (reachable only within the container). | `dms-komplett` |
| `postgresql17-contrib` | Extensions pg_trgm and unaccent for fuzzy search and searching within words. | `dms-komplett` |
| `tini` | First process in the container: passes on signals and shuts down Ablago (and PostgreSQL in dms-komplett) cleanly. | `dms`, `dms-komplett` |
| `su-exec` | Starts PostgreSQL as its own user instead of root (dms-komplett). | `dms`, `dms-komplett` |
| `setpriv` | Starts Ablago and the document tools as their own users instead of root, with “no new privileges” (from util-linux). | `dms`, `dms-komplett` |

What the system programs bring along in turn is only visible in the finished image: in the CSV attached to the release, columns *Ebene* and *Eingebracht durch*; packages that none of these programs needs come with the base image (`node` for Alpine).

### Further components { #weitere-bestandteile }

- **Node.js** as the runtime, from the official `node` image for Alpine (base image).
- **Noto Sans** and **Noto Sans Mono** (OFL-1.1) for Ablago's own PDFs, in `server/schriften/`.
- **Lucide** (ISC): icons of the interface, adopted as source code.
- **Offline manual** with **Material for MkDocs** (MIT).

## Development and test (not in the image) { #entwicklung-und-test-nicht-im-image }

These packages are only needed by whoever builds or checks Ablago (`devDependencies` and the smoke tests’ own lockfile in `web/rauchtest/`). They are **not in the image** and are not counted in the licences of the release text.

| Package | Use | Purpose | Licence | Brings along |
| --- | --- | --- | --- | ---: |
| `@eslint-community/eslint-plugin-eslint-comments` | Development | Rules for exceptions via comment (with a reason). | MIT | 76 |
| `@eslint/js` | Development | Base rules for ESLint. | MIT | 76 |
| `@types/node` | Development | Types for Node.js. | MIT | 1 |
| `@types/nodemailer` | Development | Types for nodemailer. | MIT | 1 |
| `@types/qrcode` | Development | Types for qrcode. | MIT | 1 |
| `@types/react` | Development | Types for React. | MIT | 1 |
| `@types/react-dom` | Development | Types for react-dom. | MIT | 1 |
| `@vitejs/plugin-react` | Development | React support for Vite. | MIT | 75 |
| `axe-core` | Test | Checks accessibility in the smoke tests. | MPL-2.0 | 0 |
| `dependency-cruiser` | Development | Checks boundaries and cycles between folders; dependency diagram. | MIT | 42 |
| `esbuild` | Development | Bundles the server for the image. | MIT | 26 |
| `eslint` | Development | Checks style and rules in the code. | MIT | 76 |
| `eslint-plugin-react-hooks` | Development | Rules for React hooks. | MIT | 117 |
| `globals` | Development | Known global names for ESLint (browser, Node). | MIT | 0 |
| `knip` | Development | Finds unused files, exports and dependencies. | ISC | 61 |
| `playwright` | Test | Drives the browser in the smoke tests (own lockfile in web/rauchtest). | Apache-2.0 | 1 |
| `prettier` | Development | Formats the code consistently. | MIT | 0 |
| `tsx` | Development | Running TypeScript directly: development server, tests, tools. | MIT | 27 |
| `typescript` | Development | Type checking for server, web interface and shared. | Apache-2.0 | 0 |
| `typescript-eslint` | Development | ESLint for TypeScript. | MIT | 91 |
| `vite` | Development | Builds and bundles the web interface; development server. | MIT | 75 |

<!-- mitgebracht:anfang -->

Together 305 packages that are installed only for development and test.

<!-- mitgebracht:ende -->

<!-- mitgebracht:anfang -->

??? note "@eslint-community/eslint-plugin-eslint-comments brings along 76 packages"
    @cacheable/memory, @cacheable/utils, @eslint-community/eslint-utils, @eslint-community/regexpp, @eslint/config-array, @eslint/config-helpers, @eslint/core, @eslint/object-schema, @eslint/plugin-kit, @humanfs/core, @humanfs/node, @humanfs/types, @humanwhocodes/module-importer, @humanwhocodes/retry, @isaacs/nonrecursive-glob-match, @keyv/bigmap, @keyv/serialize, @types/esrecurse, @types/estree, @types/json-schema, acorn, acorn-jsx, ajv, balanced-match, brace-expansion, cacheable, cross-spawn, debug, deep-is, escape-string-regexp, eslint-scope, eslint-visitor-keys, espree, esquery, esrecurse, estraverse, esutils, fast-deep-equal, fast-json-stable-stringify, fast-levenshtein, file-entry-cache, find-up, flat-cache, flatted, glob-parent, hashery, hookified, ignore, imurmurhash, is-extglob, is-glob, isexe, jiti, json-schema-traverse, json-stable-stringify-without-jsonify, keyv, levn, locate-path, minimatch, ms, natural-compare, optionator, p-limit, p-locate, path-exists, path-key, prelude-ls, punycode, qified, shebang-command, shebang-regex, type-check, uri-js, which, word-wrap, yocto-queue

??? note "@eslint/js brings along 76 packages"
    @cacheable/memory, @cacheable/utils, @eslint-community/eslint-utils, @eslint-community/regexpp, @eslint/config-array, @eslint/config-helpers, @eslint/core, @eslint/object-schema, @eslint/plugin-kit, @humanfs/core, @humanfs/node, @humanfs/types, @humanwhocodes/module-importer, @humanwhocodes/retry, @isaacs/nonrecursive-glob-match, @keyv/bigmap, @keyv/serialize, @types/esrecurse, @types/estree, @types/json-schema, acorn, acorn-jsx, ajv, balanced-match, brace-expansion, cacheable, cross-spawn, debug, deep-is, escape-string-regexp, eslint-scope, eslint-visitor-keys, espree, esquery, esrecurse, estraverse, esutils, fast-deep-equal, fast-json-stable-stringify, fast-levenshtein, file-entry-cache, find-up, flat-cache, flatted, glob-parent, hashery, hookified, ignore, imurmurhash, is-extglob, is-glob, isexe, jiti, json-schema-traverse, json-stable-stringify-without-jsonify, keyv, levn, locate-path, minimatch, ms, natural-compare, optionator, p-limit, p-locate, path-exists, path-key, prelude-ls, punycode, qified, shebang-command, shebang-regex, type-check, uri-js, which, word-wrap, yocto-queue

??? note "@types/node brings along 1 package"
    undici-types

??? note "@types/nodemailer brings along 1 package"
    undici-types

??? note "@types/qrcode brings along 1 package"
    undici-types

??? note "@types/react brings along 1 package"
    csstype

??? note "@types/react-dom brings along 1 package"
    csstype

??? note "@vitejs/plugin-react brings along 75 packages"
    @emnapi/core, @emnapi/runtime, @emnapi/wasi-threads, @esbuild/aix-ppc64, @esbuild/android-arm, @esbuild/android-arm64, @esbuild/android-x64, @esbuild/darwin-arm64, @esbuild/darwin-x64, @esbuild/freebsd-arm64, @esbuild/freebsd-x64, @esbuild/linux-arm, @esbuild/linux-arm64, @esbuild/linux-ia32, @esbuild/linux-loong64, @esbuild/linux-mips64el, @esbuild/linux-ppc64, @esbuild/linux-riscv64, @esbuild/linux-s390x, @esbuild/linux-x64, @esbuild/netbsd-arm64, @esbuild/netbsd-x64, @esbuild/openbsd-arm64, @esbuild/openbsd-x64, @esbuild/openharmony-arm64, @esbuild/sunos-x64, @esbuild/win32-arm64, @esbuild/win32-ia32, @esbuild/win32-x64, @napi-rs/wasm-runtime, @oxc-project/types, @rolldown/binding-android-arm-eabi, @rolldown/binding-android-arm64, @rolldown/binding-darwin-arm64, @rolldown/binding-darwin-x64, @rolldown/binding-freebsd-x64, @rolldown/binding-linux-arm-gnueabihf, @rolldown/binding-linux-arm64-gnu, @rolldown/binding-linux-arm64-musl, @rolldown/binding-linux-ppc64-gnu, @rolldown/binding-linux-s390x-gnu, @rolldown/binding-linux-x64-gnu, @rolldown/binding-linux-x64-musl, @rolldown/binding-openharmony-arm64, @rolldown/binding-wasm32-wasi, @rolldown/binding-win32-arm64-msvc, @rolldown/binding-win32-x64-msvc, @rolldown/pluginutils, @tybys/wasm-util, detect-libc, fdir, fsevents, jiti, lightningcss, lightningcss-android-arm64, lightningcss-darwin-arm64, lightningcss-darwin-x64, lightningcss-freebsd-x64, lightningcss-linux-arm-gnueabihf, lightningcss-linux-arm64-gnu, lightningcss-linux-arm64-musl, lightningcss-linux-x64-gnu, lightningcss-linux-x64-musl, lightningcss-win32-arm64-msvc, lightningcss-win32-x64-msvc, nanoid, picocolors, picomatch, postcss, rolldown, source-map-js, tinyglobby, tslib, undici-types, yaml

??? note "dependency-cruiser brings along 42 packages"
    acorn, acorn-jsx, acorn-jsx-walk, acorn-loose, acorn-walk, ansi-styles, chalk, color-convert, color-name, commander, enhanced-resolve, es-errors, function-bind, global-directory, graceful-fs, has-flag, hasown, ignore, ini, interpret, is-core-module, is-installed-globally, is-path-inside, json5, kleur, minimist, path-parse, picomatch, prompts, rechoir, regexp-tree, resolve, safe-regex, semver, sisteransi, strip-bom, supports-color, supports-preserve-symlinks-flag, tapable, tsconfig-paths, tsconfig-paths-webpack-plugin, watskeburt

??? note "esbuild brings along 26 packages"
    @esbuild/aix-ppc64, @esbuild/android-arm, @esbuild/android-arm64, @esbuild/android-x64, @esbuild/darwin-arm64, @esbuild/darwin-x64, @esbuild/freebsd-arm64, @esbuild/freebsd-x64, @esbuild/linux-arm, @esbuild/linux-arm64, @esbuild/linux-ia32, @esbuild/linux-loong64, @esbuild/linux-mips64el, @esbuild/linux-ppc64, @esbuild/linux-riscv64, @esbuild/linux-s390x, @esbuild/linux-x64, @esbuild/netbsd-arm64, @esbuild/netbsd-x64, @esbuild/openbsd-arm64, @esbuild/openbsd-x64, @esbuild/openharmony-arm64, @esbuild/sunos-x64, @esbuild/win32-arm64, @esbuild/win32-ia32, @esbuild/win32-x64

??? note "eslint brings along 76 packages"
    @cacheable/memory, @cacheable/utils, @eslint-community/eslint-utils, @eslint-community/regexpp, @eslint/config-array, @eslint/config-helpers, @eslint/core, @eslint/object-schema, @eslint/plugin-kit, @humanfs/core, @humanfs/node, @humanfs/types, @humanwhocodes/module-importer, @humanwhocodes/retry, @isaacs/nonrecursive-glob-match, @keyv/bigmap, @keyv/serialize, @types/esrecurse, @types/estree, @types/json-schema, acorn, acorn-jsx, ajv, balanced-match, brace-expansion, cacheable, cross-spawn, debug, deep-is, escape-string-regexp, eslint-scope, eslint-visitor-keys, espree, esquery, esrecurse, estraverse, esutils, fast-deep-equal, fast-json-stable-stringify, fast-levenshtein, file-entry-cache, find-up, flat-cache, flatted, glob-parent, hashery, hookified, ignore, imurmurhash, is-extglob, is-glob, isexe, jiti, json-schema-traverse, json-stable-stringify-without-jsonify, keyv, levn, locate-path, minimatch, ms, natural-compare, optionator, p-limit, p-locate, path-exists, path-key, prelude-ls, punycode, qified, shebang-command, shebang-regex, type-check, uri-js, which, word-wrap, yocto-queue

??? note "eslint-plugin-react-hooks brings along 117 packages"
    @babel/code-frame, @babel/compat-data, @babel/core, @babel/generator, @babel/helper-compilation-targets, @babel/helper-globals, @babel/helper-module-imports, @babel/helper-module-transforms, @babel/helper-string-parser, @babel/helper-validator-identifier, @babel/helper-validator-option, @babel/helpers, @babel/parser, @babel/template, @babel/traverse, @babel/types, @cacheable/memory, @cacheable/utils, @eslint-community/eslint-utils, @eslint-community/regexpp, @eslint/config-array, @eslint/config-helpers, @eslint/core, @eslint/object-schema, @eslint/plugin-kit, @humanfs/core, @humanfs/node, @humanfs/types, @humanwhocodes/module-importer, @humanwhocodes/retry, @isaacs/nonrecursive-glob-match, @jridgewell/gen-mapping, @jridgewell/remapping, @jridgewell/resolve-uri, @jridgewell/sourcemap-codec, @jridgewell/trace-mapping, @keyv/bigmap, @keyv/serialize, @types/esrecurse, @types/estree, @types/json-schema, acorn, acorn-jsx, ajv, balanced-match, baseline-browser-mapping, brace-expansion, browserslist, cacheable, caniuse-lite, convert-source-map, cross-spawn, debug, deep-is, electron-to-chromium, escalade, escape-string-regexp, eslint-scope, eslint-visitor-keys, espree, esquery, esrecurse, estraverse, esutils, fast-deep-equal, fast-json-stable-stringify, fast-levenshtein, file-entry-cache, find-up, flat-cache, flatted, gensync, glob-parent, hashery, hermes-estree, hermes-parser, hookified, ignore, imurmurhash, is-extglob, is-glob, isexe, jiti, js-tokens, jsesc, json-schema-traverse, json-stable-stringify-without-jsonify, json5, keyv, levn, locate-path, lru-cache, minimatch, ms, natural-compare, node-releases, optionator, p-limit, p-locate, path-exists, path-key, picocolors, prelude-ls, punycode, qified, semver, shebang-command, shebang-regex, type-check, update-browserslist-db, uri-js, which, word-wrap, yallist, yocto-queue, zod, zod-validation-error

??? note "knip brings along 61 packages"
    @emnapi/core, @emnapi/runtime, @emnapi/wasi-threads, @napi-rs/wasm-runtime, @oxc-parser/binding-android-arm-eabi, @oxc-parser/binding-android-arm64, @oxc-parser/binding-darwin-arm64, @oxc-parser/binding-darwin-x64, @oxc-parser/binding-freebsd-x64, @oxc-parser/binding-linux-arm-gnueabihf, @oxc-parser/binding-linux-arm-musleabihf, @oxc-parser/binding-linux-arm64-gnu, @oxc-parser/binding-linux-arm64-musl, @oxc-parser/binding-linux-ppc64-gnu, @oxc-parser/binding-linux-riscv64-gnu, @oxc-parser/binding-linux-riscv64-musl, @oxc-parser/binding-linux-s390x-gnu, @oxc-parser/binding-linux-x64-gnu, @oxc-parser/binding-linux-x64-musl, @oxc-parser/binding-openharmony-arm64, @oxc-parser/binding-win32-arm64-msvc, @oxc-parser/binding-win32-ia32-msvc, @oxc-parser/binding-win32-x64-msvc, @oxc-project/types, @oxc-resolver/binding-android-arm-eabi, @oxc-resolver/binding-android-arm64, @oxc-resolver/binding-darwin-arm64, @oxc-resolver/binding-darwin-x64, @oxc-resolver/binding-freebsd-x64, @oxc-resolver/binding-linux-arm-gnueabihf, @oxc-resolver/binding-linux-arm-musleabihf, @oxc-resolver/binding-linux-arm64-gnu, @oxc-resolver/binding-linux-arm64-musl, @oxc-resolver/binding-linux-ppc64-gnu, @oxc-resolver/binding-linux-riscv64-gnu, @oxc-resolver/binding-linux-riscv64-musl, @oxc-resolver/binding-linux-s390x-gnu, @oxc-resolver/binding-linux-x64-gnu, @oxc-resolver/binding-linux-x64-musl, @oxc-resolver/binding-openharmony-arm64, @oxc-resolver/binding-wasm32-wasi, @oxc-resolver/binding-win32-arm64-msvc, @oxc-resolver/binding-win32-x64-msvc, @tybys/wasm-util, fd-package-json, fdir, formatly, get-tsconfig, jiti, oxc-parser, oxc-resolver, package-manager-detector, picomatch, resolve-pkg-maps, smol-toml, strip-json-comments, tinyglobby, tslib, unbash, walk-up-path, yaml

??? note "playwright brings along 1 package"
    playwright-core

??? note "tsx brings along 27 packages"
    @esbuild/aix-ppc64, @esbuild/android-arm, @esbuild/android-arm64, @esbuild/android-x64, @esbuild/darwin-arm64, @esbuild/darwin-x64, @esbuild/freebsd-arm64, @esbuild/freebsd-x64, @esbuild/linux-arm, @esbuild/linux-arm64, @esbuild/linux-ia32, @esbuild/linux-loong64, @esbuild/linux-mips64el, @esbuild/linux-ppc64, @esbuild/linux-riscv64, @esbuild/linux-s390x, @esbuild/linux-x64, @esbuild/netbsd-arm64, @esbuild/netbsd-x64, @esbuild/openbsd-arm64, @esbuild/openbsd-x64, @esbuild/openharmony-arm64, @esbuild/sunos-x64, @esbuild/win32-arm64, @esbuild/win32-ia32, @esbuild/win32-x64, fsevents

??? note "typescript-eslint brings along 91 packages"
    @cacheable/memory, @cacheable/utils, @eslint-community/eslint-utils, @eslint-community/regexpp, @eslint/config-array, @eslint/config-helpers, @eslint/core, @eslint/object-schema, @eslint/plugin-kit, @humanfs/core, @humanfs/node, @humanfs/types, @humanwhocodes/module-importer, @humanwhocodes/retry, @isaacs/nonrecursive-glob-match, @keyv/bigmap, @keyv/serialize, @types/esrecurse, @types/estree, @types/json-schema, @typescript-eslint/eslint-plugin, @typescript-eslint/parser, @typescript-eslint/project-service, @typescript-eslint/scope-manager, @typescript-eslint/tsconfig-utils, @typescript-eslint/type-utils, @typescript-eslint/types, @typescript-eslint/typescript-estree, @typescript-eslint/utils, @typescript-eslint/visitor-keys, acorn, acorn-jsx, ajv, balanced-match, brace-expansion, cacheable, cross-spawn, debug, deep-is, escape-string-regexp, eslint-scope, eslint-visitor-keys, espree, esquery, esrecurse, estraverse, esutils, fast-deep-equal, fast-json-stable-stringify, fast-levenshtein, fdir, file-entry-cache, find-up, flat-cache, flatted, glob-parent, hashery, hookified, ignore, imurmurhash, is-extglob, is-glob, isexe, jiti, json-schema-traverse, json-stable-stringify-without-jsonify, keyv, levn, locate-path, minimatch, ms, natural-compare, optionator, p-limit, p-locate, path-exists, path-key, picomatch, prelude-ls, punycode, qified, semver, shebang-command, shebang-regex, tinyglobby, ts-api-utils, type-check, uri-js, which, word-wrap, yocto-queue

??? note "vite brings along 75 packages"
    @emnapi/core, @emnapi/runtime, @emnapi/wasi-threads, @esbuild/aix-ppc64, @esbuild/android-arm, @esbuild/android-arm64, @esbuild/android-x64, @esbuild/darwin-arm64, @esbuild/darwin-x64, @esbuild/freebsd-arm64, @esbuild/freebsd-x64, @esbuild/linux-arm, @esbuild/linux-arm64, @esbuild/linux-ia32, @esbuild/linux-loong64, @esbuild/linux-mips64el, @esbuild/linux-ppc64, @esbuild/linux-riscv64, @esbuild/linux-s390x, @esbuild/linux-x64, @esbuild/netbsd-arm64, @esbuild/netbsd-x64, @esbuild/openbsd-arm64, @esbuild/openbsd-x64, @esbuild/openharmony-arm64, @esbuild/sunos-x64, @esbuild/win32-arm64, @esbuild/win32-ia32, @esbuild/win32-x64, @napi-rs/wasm-runtime, @oxc-project/types, @rolldown/binding-android-arm-eabi, @rolldown/binding-android-arm64, @rolldown/binding-darwin-arm64, @rolldown/binding-darwin-x64, @rolldown/binding-freebsd-x64, @rolldown/binding-linux-arm-gnueabihf, @rolldown/binding-linux-arm64-gnu, @rolldown/binding-linux-arm64-musl, @rolldown/binding-linux-ppc64-gnu, @rolldown/binding-linux-s390x-gnu, @rolldown/binding-linux-x64-gnu, @rolldown/binding-linux-x64-musl, @rolldown/binding-openharmony-arm64, @rolldown/binding-wasm32-wasi, @rolldown/binding-win32-arm64-msvc, @rolldown/binding-win32-x64-msvc, @rolldown/pluginutils, @tybys/wasm-util, detect-libc, fdir, fsevents, jiti, lightningcss, lightningcss-android-arm64, lightningcss-darwin-arm64, lightningcss-darwin-x64, lightningcss-freebsd-x64, lightningcss-linux-arm-gnueabihf, lightningcss-linux-arm64-gnu, lightningcss-linux-arm64-musl, lightningcss-linux-x64-gnu, lightningcss-linux-x64-musl, lightningcss-win32-arm64-msvc, lightningcss-win32-x64-msvc, nanoid, picocolors, picomatch, postcss, rolldown, source-map-js, tinyglobby, tslib, undici-types, yaml

<!-- mitgebracht:ende -->
