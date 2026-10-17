# Screenshot Intent — Public OCR Preview

Public **static** demo of Russian/English screenshot text recognition and a deterministic intent suggestion engine. This is **not** the full private mobile application.

- Choose a test image manually in the browser. OCR runs in the browser; no image upload API or analytics is implemented.
- OCR binaries and language models are vendored, with SHA-256 hashes in vendor/SHA256.json.
- The site uses same-origin Content Security Policy, and its service worker caches only static scripts and models, not photos or OCR results.
- Suggestions are heuristics, not actions; always review recognized text and proposed category.
- Device support and recognition accuracy on real screenshots remain under testing.
- Third-party attribution: vendor/NOTICE.md and vendor/LICENSE_TESSERACT.md.

**Do not use sensitive screenshots while this public test build is under evaluation.**

## Local action preview — 2026.10.17.3

Confirm an intent, review or edit the generic action title, optionally choose a date, then explicitly save. Only action ID, intent, title, due date, status and timestamps enter this browser's IndexedDB. No screenshot, source filename, extracted URL or raw OCR text is automatically persisted. Clear resets the current OCR draft; saved actions remain until individually deleted or site data is cleared. Actions can be completed, cancelled, restored and deleted. There is no native app, calendar or cross-device synchronization. Storage failure is shown and never reported as success.

Changing OCR text or screenshots invalidates the previous confirmed choice. The full synthetic browser flow and offline restoration are tested on Windows Chrome; physical iPhone Safari acceptance remains open.
