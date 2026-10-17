# Screenshot Intent — Public OCR Preview

Public **static** demo of Russian/English screenshot text recognition and a deterministic intent suggestion engine. This is **not** the full private mobile application.

- Choose a test image manually in the browser. OCR runs in the browser; no image upload API or analytics is implemented.
- OCR binaries and language models are vendored, with SHA-256 hashes in vendor/SHA256.json.
- The site uses same-origin Content Security Policy, and its service worker caches only static scripts and models, not photos or OCR results.
- Suggestions are heuristics, not actions; always review recognized text and proposed category.
- Device support and recognition accuracy on real screenshots remain under testing.
- Third-party attribution: vendor/NOTICE.md and vendor/LICENSE_TESSERACT.md.

**Do not use sensitive screenshots while this public test build is under evaluation.**
