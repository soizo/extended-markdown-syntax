import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { Text } from "@codemirror/state";
import { NodeType, Tree } from "@lezer/common";
import { EditorParser } from "src/editor-mode/preprocessor/parser";
import { findTokenIndexAt } from "src/editor-mode/utils/token-utils";
import { configureDelimLookup } from "src/format-configs/format-utils";
import { DEFAULT_SETTINGS } from "src/settings/configs";

const dom = new JSDOM();
for (const name of ["document", "Node", "NodeFilter", "Text", "Element", "HTMLElement"]) {
	globalThis[name] = dom.window[name];
}
document.body.computedStyleMap = () => new Map();
const settings = { ...DEFAULT_SETTINGS };
configureDelimLookup(settings);

function tokenGroup(count: number) {
	return Array.from({ length: count }, (_, i) => ({
		type: "SUPERSCRIPT",
		status: 2,
		from: i * 10,
		to: i * 10 + 5,
		openLen: 1,
		tagLen: 0,
		closeLen: 1,
	})) as never[];
}

function makeTree(source: string) {
	const documentType = NodeType.define({ id: 0, name: "Document", top: true });
	return new Tree(documentType, [], [], source.length);
}

test("findTokenIndexAt: empty token group", () => {
	assert.equal(findTokenIndexAt([], 100), null);
});

test("findTokenIndexAt: offset before the first token", () => {
	assert.equal(findTokenIndexAt(tokenGroup(513), 0), 0);
});

test("findTokenIndexAt: offset beyond every token returns null", () => {
	for (const count of [32, 33, 300, 512, 513, 1025]) {
		assert.equal(findTokenIndexAt(tokenGroup(count), 1_000_000), null, `count ${count}`);
	}
});

test("findTokenIndexAt: offset inside a token resolves to that token", () => {
	const tokens = tokenGroup(513);
	for (const index of [0, 31, 32, 63, 64, 300, 511, 512]) {
		const offset = index * 10 + 3;
		assert.equal(findTokenIndexAt(tokens, offset), index, `token ${index}`);
	}
});

test("editor: typing after 513 superscript styles does not crash", () => {
	const line = Array.from({ length: 513 }, () => "^w^").join(" ");
	const source = `${line}\n`;
	const parser = new EditorParser({ ...settings });
	parser.initParse(Text.of(source.split("\n")), makeTree(source));

	const next = `${line} x\n`;
	parser.applyChange(Text.of(next.split("\n")), makeTree(next));

	assert.equal(parser.inlineTokens.length, 513);
	assert.ok(parser.inlineTokens.every(token => token.to <= next.length));
});
