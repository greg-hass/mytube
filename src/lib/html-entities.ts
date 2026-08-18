const NAMED_ENTITIES: Record<string, string> = {
	amp: "&",
	apos: "'",
	gt: ">",
	lt: "<",
	nbsp: " ",
	quot: '"',
};

const ENTITY_PATTERN = /&(?:#x([\da-f]+)|#(\d+)|([a-z][\da-z]+));/gi;

export function decodeHtmlEntities(value: string): string {
	return String(value || "").replace(
		ENTITY_PATTERN,
		(match, hexadecimal, decimal, named: string) => {
			if (named) return NAMED_ENTITIES[named.toLowerCase()] ?? match;

			const codePoint = Number.parseInt(
				hexadecimal || decimal,
				hexadecimal ? 16 : 10,
			);
			if (
				!Number.isInteger(codePoint) ||
				codePoint <= 0 ||
				codePoint > 0x10ffff ||
				(codePoint >= 0xd800 && codePoint <= 0xdfff)
			) {
				return match;
			}

			return String.fromCodePoint(codePoint);
		},
	);
}
