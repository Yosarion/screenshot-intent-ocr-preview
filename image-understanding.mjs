const copy = {
    food: ['Еда', 'restaurant', 'remember'],
    clothing: ['Одежда или обувь', 'product', 'buy'],
    electronics: ['Техника или электроника', 'product', 'buy'],
    furniture: ['Мебель или предмет интерьера', 'product', 'buy'],
    dishware: ['Посуда', 'product', 'remember'],
    accessory: ['Часы или аксессуар', 'product', 'remember'],
    document: ['Текстовый материал', 'article', 'read'],
    vehicle: ['Транспорт', 'unknown', 'remember'],
    building: ['Здание', 'unknown', 'remember'],
    landscape: ['Пейзаж или природный объект', 'travel', 'remember'],
    animal: ['Животное', 'unknown', 'remember'],
    unknown: ['Не удалось определить уверенно', 'unknown', null],
};
const rules = [
    ['clothing', /^(running shoe|sandal|clog|loafer|shoe shop|sock|sweatshirt|cardigan|fur coat|suit|jersey|jean|kimono|pajama|trench coat|lab coat|miniskirt|overskirt|sarong|swimming trunks|bikini|maillot|gown|abaya|poncho|mitten|stole|cowboy boot|cowboy hat|sombrero|bonnet|bow tie|Windsor tie|brassiere|diaper|purse|backpack|handbag|wallet)(,|$)/i],
    ['electronics', /^(laptop|notebook|desktop computer|computer keyboard|screen|monitor|mouse|cellular telephone|dial telephone|television|remote control|modem|printer|projector|joystick|iPod|loudspeaker|microphone|cassette player|CD player|reflex camera|digital watch|radio|espresso maker|refrigerator|microwave|dishwasher|vacuum|washer|electric fan|iron)(,|$)/i],
    ['furniture', /^(studio couch|rocking chair|folding chair|barber chair|throne|dining table|desk|bookcase|wardrobe|china cabinet|chiffonier|four-poster|cradle|crib|bassinet|bed|table lamp|lampshade|pillow|quilt|rug)(,|$)/i],
    ['dishware', /^(coffee mug|cup|teapot|coffeepot|plate|soup bowl|mixing bowl|goblet|wine bottle|water bottle|beer glass|beer bottle|pitcher|vase|water jug|whiskey jug)(,|$)/i],
    ['accessory', /^(analog clock|wall clock|digital clock|stopwatch|magnetic compass|sunglass|sunglasses|necklace|bracelet|buckle)(,|$)/i],
    ['document', /^(book jacket|comic book|menu|web site|crossword puzzle|newspaper|binder|notebook paper)(,|$)/i],
    ['building', /^(church|castle|palace|monastery|mosque|bell cote|barn|lighthouse|library|boathouse|cinema|restaurant|greenhouse|home theater)(,|$)/i],
    ['landscape', /^(seashore|sandbar|volcano|valley|cliff|lakeside|alp|promontory|coral reef|geyser)(,|$)/i],
    ['vehicle', /^(pickup|limousine|beach wagon|sports car|convertible|minivan|cab|jeep|car wheel|racer|school bus|minibus|trolleybus|recreational vehicle|bicycle-built-for-two|mountain bike|motor scooter|moped|airliner|warplane|aircraft carrier|speedboat|canoe|yawl|trimaran|catamaran)(,|$)/i],
];
function visualGroup(label, index) {
    if (index >= 0 && index <= 397)
        return 'animal'; // ImageNet-1k taxonomy, pinned model config.
    if (index >= 924 && index <= 969 && index !== 958 && index !== 968)
        return 'food';
    return rules.find(([, pattern]) => pattern.test(label))?.[0] ?? 'unknown';
}
export function unknownImage() {
    return { accepted: false, group: 'unknown', label: copy.unknown[0], category: 'unknown',
        proposedIntent: null, weight: 0, margin: 0 };
}
export function summarizeImageLogits(logits, labels) {
    if (logits.length !== 1000 || labels.length !== 1000)
        return unknownImage();
    let max = -Infinity;
    for (let i = 0; i < logits.length; i++) {
        if (!Number.isFinite(logits[i]))
            return unknownImage();
        max = Math.max(max, logits[i]);
    }
    const weights = Array.from(logits, (value) => Math.exp(value - max));
    const sum = weights.reduce((a, b) => a + b, 0);
    const groups = new Map();
    for (let i = 0; i < weights.length; i++) {
        const group = visualGroup(labels[i], i);
        groups.set(group, (groups.get(group) ?? 0) + weights[i] / sum);
    }
    const ranked = [...groups.entries()].sort((a, b) => b[1] - a[1]);
    const [group, weight] = ranked[0];
    const margin = weight - (ranked[1]?.[1] ?? 0);
    const topClass = Math.max(...weights) / sum;
    if (group === 'unknown' || weight < 0.55 || margin < 0.15 || topClass < 0.20)
        return unknownImage();
    const [label, category, proposedIntent] = copy[group];
    return { accepted: true, group, label, category, proposedIntent, weight, margin };
}
export function combineUnderstanding(text, image) {
    const conflict = Boolean(text.proposedIntent && image?.accepted && text.category !== 'unknown' &&
        image.category !== 'unknown' && text.category !== image.category);
    if (text.proposedIntent)
        return { ...text, source: 'text', conflict };
    if (image?.accepted)
        return { category: image.category, proposedIntent: image.proposedIntent, source: 'image', conflict: false };
    return { ...text, source: 'none', conflict: false };
}
