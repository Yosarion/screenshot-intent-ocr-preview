# Third-party OCR assets — provenance

Assets are included **only** in the private OCR browser test build, not the SDK57 native application.

| Asset | Source package | Version | License |
| --- | --- | --- | --- |
| tesseract.min.js | tesseract.js | 7.0.0 | Apache-2.0 |
| worker.min.js | tesseract.js | 7.0.0 | Apache-2.0 |
| tesseract-core-lstm.wasm.js | tesseract.js-core | 7.0.0 | Apache-2.0 |
| lang/rus.traineddata.gz | @tesseract.js-data/rus, 4.0.0_best_int | 1.0.0 | MIT package; underlying tessdata license needs separate confirmation before production |
| lang/eng.traineddata.gz | @tesseract.js-data/eng, 4.0.0_best_int | 1.0.0 | MIT package; underlying tessdata license needs separate confirmation before production |

The upstream Apache-2.0 license text is reproduced in LICENSE_TESSERACT.md. The JavaScript distribution files retain the upstream license banner where present. Hashes are recorded in SHA256.json; verification runs in CI.

These are vendored from a temporary, isolated `npm install --no-package-lock` on Windows. The upstream npm packages were pinned by exact version and npm registry integrity, but **their entire supply chain has not undergone an independent code audit**. We therefore do not claim production-grade verification of the vendored binaries. The browser CSP and local-only network restrictions reduce exposure but cannot protect against malicious same-origin code or a compromised hosting provider.

No telemetry or external OCR API is integrated.
