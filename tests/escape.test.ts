import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import MarkdownIt from "markdown-it";
import { Text } from "@codemirror/state";
import { NodeType, Tree } from "@lezer/common";
import { EditorParser } from "src/editor-mode/preprocessor/parser";
import { ReadingModeSyntaxExtender } from "src/preview-mode/post-processor/core";
import { configureDelimLookup } from "src/format-configs/format-utils";
import { DEFAULT_SETTINGS } from "src/settings/configs";
import { TokenStatus } from "src/enums";
import { syntaxFixtures, editorFixtures, inlineFormats } from "./syntax-fixtures";

const dom = new JSDOM();
for (const name of ["document", "Node", "NodeFilter", "Text", "Element", "HTMLElement", "HTMLParagraphElement", "HTMLBRElement", "HTMLHeadingElement", "HTMLTableElement", "HTMLUListElement", "HTMLOListElement", "Range", "DOMParser"]) {
	globalThis[name] = dom.window[name];
}
const elementPrototype = dom.window.Element.prototype;
elementPrototype.addClass = function (...classes: string[]) { this.classList.add(...classes); };
elementPrototype.hasClass = function (cls: string) { return this.classList.contains(cls); };
elementPrototype.toggleClass = function (cls: string, value: boolean) { this.classList.toggle(cls, value); };
document.body.computedStyleMap = () => new Map();
const settings = { ...DEFAULT_SETTINGS };
configureDelimLookup(settings);
const md = new MarkdownIt({ html: true });

function preview(source: string, html = md.render(source), fullSource = source, lineStart = 0): HTMLElement {
	const el = document.createElement("div");
	for (const node of new JSDOM(html).window.document.body.childNodes)
		el.appendChild(document.importNode(node, true));
	// Obsidian marks Markdown links as opaque to extension formatting.
	for (const link of el.querySelectorAll("a[href]")) link.classList.add("external-link");
	new ReadingModeSyntaxExtender(settings).postProcess(el, {
		containerEl: document.createElement("div"),
		getSectionInfo: () => ({ text: fullSource, lineStart, lineEnd: lineStart + source.split("\n").length - 1 }),
	} as never);
	return el;
}

for (const { source, html, selector, count, content, text } of syntaxFixtures) {
	test(`preview syntax: ${JSON.stringify(source)}`, () => {
		const el = preview(source, html);
		const matches = el.querySelectorAll(selector);
		assert.equal(matches.length, count);
		if (content !== undefined) assert.equal(matches[0]?.textContent?.trim(), content);
		if (text !== undefined) assert.equal(el.textContent?.trim(), text);
	});
}

for (const [d, selector] of inlineFormats) {
	test(`preview: escaped ${d} delimiters stay literal next to normal formatting`, () => {
		const el = preview(`\\${d}w\\${d} ${d}yes${d}`);
		assert.equal(el.querySelectorAll(selector).length, 1);
		assert.equal(el.querySelector(selector)?.textContent, "yes");
		assert.equal(el.textContent?.trim(), `${d}w${d} yes`);
	});
	for (const source of [`\\${d}w${d}`, `${d}w\\${d}`, `\\${d}w\\${d}`]) {
		test(`preview: unmatched/escaped delimiters in ${JSON.stringify(source)}`, () => {
			const el = preview(source);
			assert.equal(el.querySelector(selector), null);
			assert.equal(el.textContent, new JSDOM(md.render(source)).window.document.body.textContent);
		});
	}
	test(`preview: even backslashes do not escape ${d}`, () => {
		const el = preview(`\\\\${d}w${d}`);
		assert.equal(el.querySelector(selector)?.textContent, "w");
		assert.equal(el.textContent?.trim(), "\\w");
	});
	test(`preview: odd backslashes escape ${d}`, () => {
		const el = preview(`\\\\\\${d}w\\${d}`);
		assert.equal(el.querySelector(selector), null);
		assert.equal(el.textContent?.trim(), `\\${d}w${d}`);
	});
}

test("preview: escaped caret inside superscript is literal content", () => {
	const el = preview(String.raw`^a\^b^`);
	assert.equal(el.querySelector("sup")?.textContent, "a^b");
});

test("preview: escaped characters split delimiter runs", () => {
	assert.equal(preview(String.raw`+\+w++`).querySelector("ins"), null);
	const el = preview(String.raw`\+++w++`);
	assert.equal(el.querySelector("ins")?.textContent, "w");
	assert.equal(el.textContent?.trim(), "+w");
});

test("preview: source alignment handles code, links, entities and nested emphasis", () => {
	const el = preview(String.raw`[link](https://example.com/^hidden^) \^w\^ **\^bold\^** \^&amp;\^ \^*em*\^ ^yes^`);
	assert.equal(el.querySelectorAll("sup").length, 1);
	assert.equal(el.querySelector("sup")?.textContent, "yes");
	assert.equal(el.querySelector("strong")?.textContent, "^bold^");
	assert.equal(el.querySelector("em")?.textContent, "em");
});

test("preview: escapes in code and image alt text do not affect prose", () => {
	const el = preview("`\\^code\\^` ![\\^alt\\^](image.png) \\^w\\^ ^yes^");
	assert.equal(el.querySelectorAll("sup").length, 1);
	assert.equal(el.querySelector("sup")?.textContent, "yes");
	assert.equal(el.querySelector("code")?.textContent, "\\^code\\^");
});

test("preview: table cells and list items retain their own escaped delimiters", () => {
	const el = preview("| A | B |\n| --- | --- |\n| \\^w\\^ | ^yes^ |\n\n- \\~w\\~\n- ~yes~");
	assert.equal(el.querySelectorAll("sup").length, 1);
	assert.equal(el.querySelectorAll("sub").length, 1);
	assert.equal(el.querySelector("td")?.textContent, "^w^");
});

test("preview: section line offsets are respected", () => {
	const el = preview(String.raw`\^w\^ ^yes^`, undefined, "^other^\n\n\\^w\\^ ^yes^", 2);
	assert.equal(el.querySelectorAll("sup").length, 1);
	assert.equal(el.querySelector("sup")?.textContent, "yes");
});

test("preview: protection leaves no wrapper elements behind", () => {
	assert.equal(preview(String.raw`\^w\^`).querySelector("span"), null);
	assert.equal(preview(String.raw`^a\^b^`).querySelector("sup")?.innerHTML, "a^b");
});

test("preview: Unicode does not shift escape positions", () => {
	const el = preview("😀 \\^w\\^ ^yes^");
	assert.equal(el.querySelectorAll("sup").length, 1);
	assert.equal(el.querySelector("sup")?.textContent, "yes");
});

test("preview: native wikilink changes do not affect the unchanged suffix", () => {
	const el = preview(String.raw`[[note|label]] \^w\^ ^yes^`, '<p><a class="internal-link">label</a> ^w^ ^yes^</p>');
	assert.equal(el.querySelectorAll("sup").length, 1);
	assert.equal(el.querySelector("sup")?.textContent, "yes");
});

test("preview: multiple opaque links do not suppress formatting between them", () => {
	const source = String.raw`[[first]] \^w\^ ^yes^ [[last]]`;
	const el = preview(source, '<p><a class="internal-link">first</a> ^w^ ^yes^ <a class="internal-link">last</a></p>');
	assert.equal(el.querySelectorAll("sup").length, 1);
	assert.equal(el.querySelector("sup")?.textContent, "yes");
});

test("preview: raw HTML code and void elements do not consume following prose", () => {
	const el = preview(String.raw`<code>\^code\^</code > <img src="image.png"> \^w\^ ^yes^`);
	assert.equal(el.querySelectorAll("sup").length, 1);
	assert.equal(el.querySelector("sup")?.textContent, "yes");
	assert.equal(el.querySelector("code")?.textContent, "^code^");
});

test("preview: ambiguous text is left literal, not guessed", () => {
	const el = preview(String.raw`before \^w\^ after`, "<p>changed ^w^ text</p>");
	assert.equal(el.querySelector("sup"), null);
	assert.equal(el.textContent, "changed ^w^ text");
});

// Model the escape nodes emitted by Obsidian's editor syntax tree. This keeps
// the regression at EditorParser's public boundary rather than testing a regex.
function editor(source: string, editorEscape = settings.editorEscape, escapeNodes = true): EditorParser {
	const documentType = NodeType.define({ id: 0, name: "Document", top: true });
	const escapeType = NodeType.define({ id: 1, name: "escape" });
	const highlightType = NodeType.define({ id: 2, name: "formatting-highlight" });
	const children: Tree[] = [], positions: number[] = [];
	for (let i = 0; i < source.length; i++) {
		if (source[i] == "\\" && i + 1 < source.length) {
			if (escapeNodes) {
				positions.push(i);
				children.push(new Tree(escapeType, [], [], 2));
			}
			i++;
		} else if (source.startsWith("==", i)) {
			positions.push(i);
			children.push(new Tree(highlightType, [], [], 2));
			i++;
		}
	}
	const tree = new Tree(documentType, children, positions, source.length);
	const parser = new EditorParser({ ...settings, editorEscape });
	parser.initParse(Text.of(source.split("\n")), tree);
	return parser;
}

for (const [d, , type] of inlineFormats) {
	test(`editor: default settings honor escaped ${d} delimiters`, () => {
		const parser = editor(`\\${d}w\\${d} ${d}yes${d}`);
		const active = parser.inlineTokens.filter(token => token.type == type && token.status == TokenStatus.ACTIVE);
		assert.equal(active.length, 1);
		assert.equal(parser.settings.editorEscape, true);
	});
	test(`editor: escaping ${d} does not depend on escape syntax nodes`, () => {
		const parser = editor(`\\${d}w\\${d} ${d}yes${d}`, true, false);
		assert.equal(parser.inlineTokens.filter(token => token.type == type && token.status == TokenStatus.ACTIVE).length, 1);
	});
	test(`editor: even backslashes allow ${d} formatting`, () => {
		const parser = editor(`\\\\${d}w${d}`);
		assert.equal(parser.inlineTokens.filter(token => token.type == type && token.status == TokenStatus.ACTIVE).length, 1);
	});
}

for (const { source, format, count, validTag } of editorFixtures) {
	test(`editor syntax: ${JSON.stringify(source)}`, () => {
		const parser = editor(source);
		const tokens = [...parser.inlineTokens, ...parser.blockTokens]
			.filter(token => token.type == format && token.status == TokenStatus.ACTIVE);
		assert.equal(tokens.length, count);
		if (validTag !== undefined) assert.ok(tokens.every(token => token.validTag == validTag));
	});
}

test("editor: explicit legacy escape setting remains supported", () => {
	assert.equal(editor(String.raw`\^w\^`, false).inlineTokens[0]?.status, TokenStatus.ACTIVE);
});
