/** Consume backslash pairs together, preserving odd/even escape semantics. */
export const ESCAPE_RE = /\\([\s\S])/g;

export function isEscaped(text: string, offset: number): boolean {
	let start = offset;
	while (text[start - 1] == "\\") start--;
	return (offset - start) % 2 == 1;
}
