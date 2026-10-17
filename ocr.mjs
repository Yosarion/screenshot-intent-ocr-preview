export function normaliseOcrText(text, limit = 12000) {
    if (!Number.isInteger(limit) || limit < 1)
        throw new Error('Invalid OCR limit');
    return text.normalize('NFKC').replace(/\u0000/g, '').replace(/\r\n?/g, '\n').trim().slice(0, limit);
}
export function makeOcrResult(engine, rawText, engineConfidence = null, languages = []) {
    const text = normaliseOcrText(rawText);
    return {
        status: text ? 'recognized' : 'empty',
        engine,
        text,
        engineConfidence: Number.isFinite(engineConfidence) ? Math.min(100, Math.max(0, engineConfidence)) : null,
        languages,
    };
}
