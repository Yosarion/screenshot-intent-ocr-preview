# Screenshot Intent — Local OCR and image understanding preview

Release 2026.10.18.1. This public repository contains a reviewed static test artifact only; the main mobile repository remains private.

Select a test screenshot. Use "Распознать текст" for local Russian/English OCR and "Понять изображение" for coarse object classification. Both results contribute suggestions; you must explicitly choose the intent and explicitly save the reviewed action.

- Image analysis: pinned MobileNetV4 FP32, single-thread ONNX Runtime Web CPU/WASM in a dedicated worker. First image run loads about 30 MB of model/runtime assets from this same origin. Browser/device performance is not guaranteed.
- OCR: pinned local Russian/English Tesseract. No cloud inference, runtime CDN, analytics or image-upload endpoint.
- File pixels and raw OCR remain in transient memory; they are not automatically saved. IndexedDB receives only reviewed action ID, title, intent, due date, status and timestamps after explicit Save.
- The service worker caches allowlisted static assets/models only. Image model assets load and cache lazily. After successful caching, image and text recognition can work offline.
- This recognizes coarse classes, not brands, exact products, prices, addresses, identities or what the user wants. Weak or conflicting evidence needs manual review.
- Action history is local to this browser; clearing site data deletes actions. There is no calendar, native-app or cross-device synchronization.
- SHA-256 manifests and all required third-party notices are included under vendor/.
- Windows Chrome control tests are automated. Physical iPhone Safari image recognition, memory limits and installed-PWA behavior remain pending. The user has reported that the earlier OCR and intent-choice path works on their iPhone.
- Hosting receives ordinary static GET requests, IP address and user agent. App code does not send screenshots or OCR bodies.

Use non-sensitive test images while physical device acceptance and server header hardening remain open.
