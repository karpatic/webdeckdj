# Frozen browser dependency sources

Downloaded 2026-09-05 from the exact URLs used by the pre-integration DJ page, except the unversioned Bootstrap Icons URL was recorded by jsDelivr as version 1.13.1. Files are runtime-local and are not loaded from a CDN.

- React 17.0.2: `https://esm.sh/react@17.0.2/es2022/react.mjs`
- ReactDOM 17.0.2: `https://esm.sh/react-dom@17.0.2/es2022/react-dom.mjs`
- Scheduler 0.20.2, required by the frozen ReactDOM module: `https://esm.sh/scheduler@0.20.2/es2022/scheduler.mjs`
- Marked 2.0.1 wrapper/full module: `https://esm.sh/marked@2.0.1` and `https://esm.sh/marked@2.0.1/es2022/marked.mjs` (retained because the original import map declared it, though the DJ graph does not import it)
- Bootstrap 5.0.0-beta1 CSS: `https://cdn.jsdelivr.net/npm/bootstrap@5.0.0-beta1/dist/css/bootstrap.min.css`
- Bootstrap Icons 1.13.1 CSS/fonts: `https://cdn.jsdelivr.net/npm/bootstrap-icons@1.13.1/font/`
- Butterchurn 2.6.7: `https://cdn.jsdelivr.net/npm/butterchurn@2.6.7/lib/butterchurn.min.js`
- Butterchurn Presets 2.4.7 standard/extra: `https://cdn.jsdelivr.net/npm/butterchurn-presets@2.4.7/lib/`

ReactDOM and the Marked wrapper retain their upstream absolute ESM imports byte-for-byte. The archive import map redirects those exact specifiers to the local frozen modules. Bootstrap Icons CSS retains its original relative `./fonts/` paths, matched by the local font directory.

`../MANIFEST.sha256` records every archive payload file except itself. License files downloaded from the corresponding pinned jsDelivr npm packages are retained under `licenses/`. The Cloudflare Insights script was operational telemetry, not needed for DJ functionality, and is intentionally absent from the runnable archive; the exact original tag remains in `source/dj.html` and `source/index.html`.
