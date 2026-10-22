import MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";
import { SKIPPED_CLASSES } from "src/preview-mode/post-processor/configs";
import { InlineRules, BlockRules } from "src/format-configs/rules";
import { ESCAPE_RE } from "src/utils/escape-utils";

const sourceParser = new MarkdownIt({ html: true, linkify: true });
const WIKILINK_RE = /!?\[\[[^[\]\r\n]+\]\]/y;
sourceParser.inline.ruler.before("link", "ems_wikilink", (state, silent) => {
	WIKILINK_RE.lastIndex = state.pos;
	const match = WIKILINK_RE.exec(state.src);
	if (!match) return false;
	if (!silent) state.push("ems_wikilink", "", 0);
	state.pos += match[0].length;
	return true;
});
// Obsidian owns built-in delimiters; protect the extension's delimiters and tags.
const SYNTAX_CHARS = new Set([
	...Object.values(InlineRules).filter(rule => !rule.builtin).map(rule => rule.char),
	...Object.values(BlockRules).map(rule => rule.char),
	"{", "}", "-",
]);
const SKIPPED_SELECTOR = ["code", "img", "script", "style", ...SKIPPED_CLASSES.map(cls => "." + cls)].join(",");
const normalize = (text: string): string => text.replace(/[\s=]/g, "");

function textNodes(root: Node): Text[] {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	const nodes: Text[] = [];
	while (walker.nextNode()) {
		const node = walker.currentNode as Text;
		if (!node.parentElement?.closest(SKIPPED_SELECTOR)) nodes.push(node);
	}
	return nodes;
}

/** Recover escape provenance before Markdown consumes backslashes and table pipes. */
function sourceEscapes(source: string) {
	if (!source.includes("\\")) return null;
	let prefix = "\uE000ems";
	while (source.includes(prefix)) prefix += "\uE000";
	const marked = source.replace(ESCAPE_RE, (match, char: string) =>
		SYNTAX_CHARS.has(char) ? `${prefix}${char.charCodeAt(0)}\uE001` : match);
	if (marked == source) return null;
	const markers = new RegExp(`${prefix}(\\d+)\uE001`, "g");
	let text = "";
	const offsets = new Set<number>(), characters = new Set<string>();
	const append = (content: string, literal = false): void => {
		let from = 0;
		for (const match of content.matchAll(markers)) {
			text += normalize(content.slice(from, match.index));
			const char = String.fromCharCode(Number(match[1]));
			if (literal) text += "\\";
			else { offsets.add(text.length); characters.add(char) }
			text += char;
			from = match.index + match[0].length;
		}
		text += normalize(content.slice(from));
	};
	const collect = (tokens: Token[]): void => {
		let inLink = false, skippedHtmlTag: string | null = null;
		for (const token of tokens) {
			if (token.type == "link_open") { inLink = true; continue }
			if (token.type == "link_close") { inLink = false; continue }
			if (inLink || token.type == "image" || token.type == "ems_wikilink" ||
				token.type == "code_inline" || token.type == "code_block" || token.type == "fence") continue;
			if (skippedHtmlTag) {
				const close = token.type == "html_inline" && /^<\/([\w-]+)\s*>$/.exec(token.content);
				if (close && close[1].toLowerCase() == skippedHtmlTag) skippedHtmlTag = null;
				continue;
			}
			if (token.children) collect(token.children);
			else if (token.type == "html_inline" || token.type == "html_block") {
				const html = token.content.replace(markers, (_, code: string) => "\\" + String.fromCharCode(Number(code)));
				const parsed = new DOMParser().parseFromString(html, "text/html");
				const first = parsed.body.firstElementChild;
				if (token.type == "html_inline" && first?.matches(SKIPPED_SELECTOR)) {
					if (first.tagName != "IMG") skippedHtmlTag = first.tagName.toLowerCase();
				} else for (const node of textNodes(parsed.body)) append(node.data, true);
			} else if (token.type == "text" || token.type == "text_special") append(token.content);
		}
	};
	collect(sourceParser.parse(marked, {}));
	return characters.size ? { text, offsets, characters } : null;
}

export interface EscapeProtection {
	elements: WeakSet<Element>;
	restore(): void;
}

/** Shield literal punctuation from all formatters, then remove the temporary spans. */
export function protectEscapedDelimiters(root: HTMLElement, source: string): EscapeProtection {
	const elements = new WeakSet<Element>(), wrappers: HTMLElement[] = [];
	const protection: EscapeProtection = {
		elements,
		restore() {
			for (const wrapper of wrappers) wrapper.replaceWith(...Array.from(wrapper.childNodes));
		}
	};
	const trace = sourceEscapes(source);
	if (!trace) return protection;
	const nodes = textNodes(root);
	const rendered = nodes.map(node => normalize(node.data)).join("");
	// Native/generated text can differ. Match unchanged ends, and keep the
	// escaped character types literal where provenance remains ambiguous.
	let prefix = 0, suffix = 0;
	while (prefix < trace.text.length && prefix < rendered.length && trace.text[prefix] == rendered[prefix]) prefix++;
	while (suffix < trace.text.length - prefix && suffix < rendered.length - prefix &&
		trace.text[trace.text.length - suffix - 1] == rendered[rendered.length - suffix - 1]) suffix++;
	let offset = 0;
	for (const node of nodes) {
		const fragment = document.createDocumentFragment();
		let start = 0;
		for (let i = 0; i < node.length; i++) {
			const char = node.data[i];
			if (!normalize(char)) continue;
			const sourceOffset = offset < prefix ? offset
				: offset >= rendered.length - suffix ? trace.text.length - rendered.length + offset : null;
			const escaped = sourceOffset === null ? trace.characters.has(char) : trace.offsets.has(sourceOffset);
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
