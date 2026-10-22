import { PlainRange, Token, TokenGroup } from "src/types";

type TokenPartsRanges = Record<"openRange" | "closeRange" | "tagRange" | "contentRange", PlainRange>;
interface IterTokenGroupSpec {
	tokens: TokenGroup,
	ranges: PlainRange[] | readonly PlainRange[]
	callback: (token: Token) => unknown,
}

export function getTagRange(token: Token): PlainRange {
	let from = token.from + token.openLen,
		to = from + token.tagLen;
	return { from, to };
}

export function provideTokenPartsRanges(token: Token): TokenPartsRanges {
	let openRange = { from: token.from, to: token.from + token.openLen },
		closeRange = { from: token.to - token.closeLen, to: token.to },
		tagRange = { from: openRange.to, to: openRange.to + token.tagLen },
		contentRange = { from: (token.tagAsContent ? tagRange.from : tagRange.to), to: closeRange.from };
	return { openRange, closeRange, tagRange, contentRange }
}

export function isToken(range: PlainRange): range is Token {
	let { type, openLen, tagLen, closeLen } = range as Token;
	return type !== undefined && openLen !== undefined && tagLen !== undefined && closeLen !== undefined;
}

export function iterTokenGroup(spec: IterTokenGroupSpec): void {
	let { tokens, ranges, callback } = spec,
		tokenI = findTokenIndexAt(tokens, ranges[0]?.from ?? 0),
		rangeI = 0;

	if (tokenI === null) return;

	while (
		tokenI < tokens.length &&
		rangeI < ranges.length
	) {
		if (ranges[rangeI].to <= tokens[tokenI].from) { rangeI++; continue }
		if (
			tokens[tokenI].from < ranges[rangeI].to &&
			tokens[tokenI].to > ranges[rangeI].from
		) {
			callback(tokens[tokenI]);
		}
		tokenI++;
	}
}

export function findTokenIndexAt(tokens: TokenGroup, offset: number): number | null {
	if (!tokens.length) return null;

	// Find the last token that starts at or before the offset. Tokens are
	// stored in document order, so their start offsets are sorted.
	let low = 0,
		high = tokens.length - 1,
		index = 0;

	while (low <= high) {
		let mid = (low + high) >> 1;
		if (tokens[mid].from <= offset) {
			index = mid;
			low = mid + 1;
		} else {
			high = mid - 1;
		}
	}

	// Skip tokens that end before the offset, e.g. when it falls in a gap
	// between two tokens. This must be bounded so it can never read past the
	// end of the group (see #20).
	while (index < tokens.length && tokens[index].to < offset) index++;

	return index < tokens.length ? index : null;
}