import MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";
import { SKIPPED_CLASSES } from "src/preview-mode/post-processor/configs";

const sourceParser = new MarkdownIt({ html: true, linkify: true });
const WIKILINK_RE = /!?\[\[[^[\]\r\n]+\]\]/y;
// Wikilinks and embeds are opaque to the existing DOM parser. Recognize their
// source boundaries too, without trying to reproduce alias/path rendering.
sourceParser.inline.ruler.before("link", "ems_wikilink", (state, silent) => {
	WIKILINK_RE.lastIndex = state.pos;
	const match = WIKILINK_RE.exec(state.src);
	if (!match) return false;
	if (!silent) state.push("ems_wikilink", "", 0);
	state.pos += match[0].length;
	return true;
});
const DELIMITERS = "+|^~!";
const SKIPPED_SELECTOR = ["code", "img", "script", "style", ...SKIPPED_CLASSES.map(cls => "." + cls)].join(",");

export interface EscapeProtection {
	elements: WeakSet<Element>;
	restore(): void;
}

/**
 * Obsidian removes backslash escapes before running post-processors. Recover
 * their provenance from the section source, without re-rendering its DOM or
 * running other plugins a second time.
 */
export function protectEscapedDelimiters(root: HTMLElement, source: string): EscapeProtection {
	const elements = new WeakSet<Element>();
	const wrappers: HTMLElement[] = [];
	const protection: EscapeProtection = {
		elements,
		restore() {
			for (const wrapper of wrappers)
				wrapper.replaceWith(...Array.from(wrapper.childNodes));
		}
	};
	if (!/\\[+|^~!]/.test(source)) return protection;

	// Keep escape provenance through block parsing too: Markdown table parsing
	// otherwise consumes escaped pipes before the inline tokenizer sees them.
	let prefix = "\uE000ems";
	while (source.includes(prefix)) prefix += "\uE000";
	const markers = Array.from(DELIMITERS, (_, i) => `${prefix}${i}\uE001`);
	const markedSource = source.replace(/\\([\\+|^~!])/g, (match, char: string) => {
		return char == "\\" ? match : markers[DELIMITERS.indexOf(char)];
	});
	const chars: string[] = [];
	const escapedOffsets = new Set<number>();
	const escapedChars = new Set<string>();

	const append = (text: string, literal = false): void => {
		for (let i = 0; i < text.length;) {
			const marker = text.startsWith(prefix, i)
				? markers.findIndex(value => text.startsWith(value, i))
				: -1;
			if (marker != -1) {
				const char = DELIMITERS[marker];
				if (literal) chars.push("\\");
				else {
					escapedOffsets.add(chars.length);
					escapedChars.add(char);
				}
				chars.push(char);
				i += markers[marker].length;
			} else {
				const char = text[i++];
				// Block/soft-break whitespace differs between Obsidian and
				// CommonMark. Native highlight markers are also absent in the DOM.
				if (!/\s/.test(char) && char != "=") chars.push(char);
			}
		}
	};
	const collect = (tokens: Token[]): void => {
		let inLink = false, skippedHtmlTag: string | null = null;
		for (const token of tokens) {
			if (token.type == "link_open") { inLink = true; continue }
			if (token.type == "link_close") { inLink = false; continue }
			if (inLink || token.type == "image" || token.type == "ems_wikilink" ||
				token.type == "code_inline" || token.type == "code_block" || token.type == "fence") continue;
			if (skippedHtmlTag) {
				const closingTag = token.type == "html_inline" && /^<\/([\w-]+)\s*>$/.exec(token.content);
				if (closingTag && closingTag[1].toLowerCase() == skippedHtmlTag) skippedHtmlTag = null;
				continue;
			}
			if (token.children) collect(token.children);
			else if (token.type == "html_inline" || token.type == "html_block") {
				let html = token.content;
				for (let i = 0; i < markers.length; i++)
					html = html.replaceAll(markers[i], "\\" + DELIMITERS[i]);
				const parsed = new DOMParser().parseFromString(html, "text/html");
				const first = parsed.body.firstElementChild;
				if (token.type == "html_inline" && first?.matches(SKIPPED_SELECTOR)) {
					if (first.tagName != "IMG") skippedHtmlTag = first.tagName.toLowerCase();
					continue;
				}
				const walker = document.createTreeWalker(parsed.body, NodeFilter.SHOW_TEXT);
				while (walker.nextNode()) {
					const node = walker.currentNode as Text;
					if (!node.parentElement?.closest(SKIPPED_SELECTOR)) append(node.data, true);
				}
			} else if (token.type == "text" || token.type == "text_special") {
				append(token.content);
			}
		}
	};
	collect(sourceParser.parse(markedSource, {}));
	if (!escapedChars.size) return protection;

	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	const nodes: Text[] = [];
	const rendered: string[] = [];
	while (walker.nextNode()) {
		const node = walker.currentNode as Text;
		if (node.parentElement?.closest(SKIPPED_SELECTOR)) continue;
		nodes.push(node);
		for (let i = 0; i < node.length; i++) {
			const char = node.data[i];
			if (!/\s/.test(char) && char != "=") rendered.push(char);
		}
	}
	// Native syntax (e.g. a generated callout title) may change
	// one part of the text. Still recover exact positions in unchanged prefixes
	// and suffixes, without guessing inside the unmatched region.
	let prefixLength = 0, suffixLength = 0;
	while (prefixLength < chars.length && prefixLength < rendered.length &&
		chars[prefixLength] == rendered[prefixLength]) prefixLength++;
	while (suffixLength < chars.length - prefixLength && suffixLength < rendered.length - prefixLength &&
		chars[chars.length - suffixLength - 1] == rendered[rendered.length - suffixLength - 1]) suffixLength++;
	let offset = 0;
	for (const node of nodes) {
		const fragment = document.createDocumentFragment();
		let start = 0;
		for (let i = 0; i < node.length; i++) {
			const char = node.data[i];
			if (/\s/.test(char) || char == "=") continue;
			const sourceOffset = offset < prefixLength ? offset
				: offset >= rendered.length - suffixLength ? chars.length - rendered.length + offset
				: null;
			// When provenance is ambiguous, keep this delimiter type literal
			// rather than accidentally formatting an escaped character.
			const escaped = sourceOffset === null ? escapedChars.has(char) : escapedOffsets.has(sourceOffset);
			offset++;
			if (!escaped) continue;
			fragment.append(document.createTextNode(node.data.slice(start, i)));
			const wrapper = document.createElement("span");
			wrapper.textContent = char;
			elements.add(wrapper);
			wrappers.push(wrapper);
			fragment.append(wrapper);
			start = i + 1;
		}
		if (start) {
			fragment.append(document.createTextNode(node.data.slice(start)));
			node.replaceWith(fragment);
		}
	}
	return protection;
}
