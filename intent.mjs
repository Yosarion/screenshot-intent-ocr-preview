const RULES = [
    {
        category: 'restaurant', intent: 'remember',
        patterns: [
            /ресторан|кафе|кофейня|столик|бронь стола|reserve a table|restaurant|coffee shop/iu,
            /меню|обед|ужин|доставка еды|dine.in|кухня заведения/iu,
        ],
    },
    {
        category: 'product', intent: 'buy',
        patterns: [
            /купить|в корзину|корзина|заказать товар|buy now|add to cart|checkout/iu,
            /размеры|артикул|доставка товара|наличие товара|скидка|sale price|характеристики/iu,
        ],
    },
    {
        category: 'event', intent: 'do',
        patterns: [
            /концерт|выставка|спектакль|фестиваль|мероприятие|афиша|concert|festival/iu,
            /билеты на концерт|купить билет на концерт|начало в \d{1,2}:\d{2}|дата проведения/iu,
        ],
    },
    {
        category: 'travel', intent: 'remember',
        patterns: [
            /отель|гостиница|авиабилеты|рейс|самол[её]т|hotel|flight|booking\.com/iu,
            /заезд|выезд|посадочный талон|аэропорт|регистрация на рейс|check.in/iu,
        ],
    },
    {
        category: 'article', intent: 'read',
        patterns: [
            /статья|читать далее|сохранить статью|публикация|read more|article|newsletter/iu,
            /время чтения|мин чтения|источник|подписаться на новости/iu,
        ],
    },
    {
        category: 'task', intent: 'do',
        patterns: [
            /задача|сделать до|не забудь|напомни|срок выполнения|deadline|to.do/iu,
            /отправить документ|заполнить форму|подготовить отчет|нужно сделать/iu,
        ],
    },
];
/** Data are exact textual matches; never assume a year, currency, or destination. */
function extractMatches(text, pattern, max) {
    return Array.from(new Set(Array.from(text.matchAll(pattern), (match) => match[0].trim())))
        .slice(0, max);
}
export function suggestIntentFromText(rawText) {
    const text = rawText.normalize('NFKC').slice(0, 12000);
    const urls = extractMatches(text, /https?:\/\/[^\s<>"'\u00a0]+/giu, 3)
        .map((url) => url.replace(/[.,;!?)}\]]+$/u, ''))
        .filter((url) => {
        try {
            const parsed = new URL(url);
            return (parsed.protocol === 'https:' || parsed.protocol === 'http:') && !!parsed.hostname;
        }
        catch {
            return false;
        }
    });
    const prices = extractMatches(text, /\b\d{1,3}(?:[ \u00a0]\d{3})*(?:[.,]\d{1,2})?\s*(?:₽|руб(?:лей|ля|\.)?|RUB|USD|EUR)(?=$|\s|[.,;!?])|\$\s*\d+(?:[.,]\d{2})?|€\s*\d+(?:[.,]\d{2})?/giu, 4);
    const dates = extractMatches(text, /\b(?:[0-3]?\d)[./](?:0?\d|1[012])(?:[./]20\d{2})?\b/gu, 4);
    const scored = RULES.map((rule) => {
        const matches = rule.patterns.flatMap((pattern, index) => {
            const match = text.match(pattern);
            return match ? [{ token: match[0], category: rule.category, weight: index === 0 ? 2 : 1 }] : [];
        });
        return { rule, matches, score: matches.reduce((sum, match) => sum + match.weight, 0) };
    }).sort((a, b) => b.score - a.score);
    const winner = scored[0];
    const runnerUp = scored[1];
    // A tie of weak signals is ambiguous, not a reason to invent a category.
    const hasWinner = winner.score > 0 && winner.score > runnerUp.score;
    const score = hasWinner ? winner.score : 0;
    const strength = score >= 3 ? 'strong' : score === 2 ? 'moderate' : score === 1 ? 'weak' : 'none';
    return {
        category: hasWinner ? winner.rule.category : 'unknown',
        intent: hasWinner ? winner.rule.intent : null,
        signalStrength: strength,
        evidence: hasWinner
            ? winner.matches.map(({ token, category }) => ({ token, category }))
            : [],
        extracted: { urls, prices, dates },
        requiresConfirmation: true,
        source: 'heuristic-v1',
    };
}
/** Only expose a suggested intent for explicit confirmation when evidence is sufficient. */
export function reviewableSuggestedIntent(suggestion) {
    if (suggestion.category === 'unknown' || suggestion.signalStrength === 'none' ||
        suggestion.signalStrength === 'weak')
        return null;
    return suggestion.intent;
}
export function suggestIntentFromOcr(result) {
    if (result.status !== 'recognized') {
        return suggestIntentFromText('');
    }
    return suggestIntentFromText(result.text);
}
