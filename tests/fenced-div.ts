import { ChangeSet, Text, type EditorState, type Range } from "@codemirror/state";
import type { Decoration, DecorationSet, EditorView } from "@codemirror/view";
import type { Tree } from "@lezer/common";
import type { EditorParser } from "../src/editor-mode/preprocessor/parser";
import { TokenStatus } from "../src/enums";
import { createBlockDecorations, createBlockLineBreaks } from "../src/editor-mode/decorator/fenced-div";
import { fencedDivBlock as block, fencedDivSample as sample } from "./syntax-fixtures";

interface NativeEditor {
	state: EditorState & { constructor: typeof EditorState };
	constructor: typeof EditorView;
	docView: { decorations: readonly DecorationSet[] };
}
interface ParsedEditor {
	parser: EditorParser;
	state: EditorState;
	tree: Tree;
}

/** Exercise production decorations in a real, detached Obsidian CodeMirror view. */
export function checkFencedDivs(cm: NativeEditor, parse: (source: string) => ParsedEditor): number {
	let factory: typeof Decoration | undefined;
	for (const set of cm.docView.decorations) {
		const value = set.iter().value;
		if (value) { factory = value.constructor as typeof Decoration; break }
	}
	if (!factory || typeof factory.replace != "function") throw Error("Native CodeMirror decoration factory unavailable");
	const NativeDecoration = factory;
	const fixtures = [
		{ name: "issue sample", source: sample, blocks: 3 },
		{ name: "single blank separators", source: [block, block, block].join("\n\n"), blocks: 3 },
		{ name: "multiple blank separators", source: [block, block, block].join("\n\n\n\n"), blocks: 3 },
		{ name: "intervening paragraph", source: block + "\n\noutside\n\n" + block, blocks: 2 },
		{ name: "invalid middle tag", source: block + "\n\n::: invalid!\nIgnored\n\n" + block, blocks: 2 },
		{ name: "third continuation", source: block + "\nThird", blocks: 1 },
		{ name: "whitespace block boundary", source: block + "\n \t\noutside", blocks: 1 },
		{ name: "header only", source: "::: r1", blocks: 1 },
		{ name: "one content line", source: "::: r1\nFirst", blocks: 1 },
		{ name: "escaped header", source: "\\" + block, blocks: 0 },
		{ name: "CRLF", source: sample.replaceAll("\n", "\r\n"), blocks: 3 },
		{ name: "long prefix", source: "prefix\n".repeat(700) + "\n" + sample, blocks: 3 },
		{ name: "large gaps", source: block + "\n\n" + "outside\n".repeat(700) + "\n" + block, blocks: 2 },
	];
	let checks = 0;
	const verify = ({ parser, state }: ParsedEditor, name: string, expectedBlocks: number): void => {
		const doc = state.doc, source = doc.toString();
		const tokens = parser.blockTokens.filter(token => token.status == TokenStatus.ACTIVE);
		if (tokens.length != expectedBlocks) throw Error(`${name}: expected ${expectedBlocks} active blocks, got ${tokens.length}`);
		const expected = Array.from(source.matchAll(/^(?:Second|Third)$/gm), match => match.index)
			.filter(offset => tokens.some(token => token.from < offset && offset < token.to));
		const breaks = createBlockLineBreaks(doc, parser.blockTokens);
		if (JSON.stringify(breaks.map(range => range.to)) != JSON.stringify(expected))
			throw Error(`${name}: expected continuation breaks at ${expected}, got ${breaks.map(range => range.to)}`);
		const tail = parser.blockTokens.slice(1);
		const expectedTail = expected.filter(offset => tail.some(token => token.from < offset && offset < token.to));
		if (JSON.stringify(createBlockLineBreaks(doc, tail).map(range => range.to)) != JSON.stringify(expectedTail))
			throw Error(`${name}: reparsed token subset lost continuation breaks`);
		for (const range of breaks)
			if (range.value.spec.widget.lineBreaks != 1) throw Error(`${name}: BR widget must report one visual line break`);
		const full = [{ from: 0, to: doc.length }];
		const styles = createBlockDecorations(doc, parser.blockTokens, full, false);
		// A viewport below the header must retain that block's real tag and content decoration.
		for (const offset of expected) {
			const subset = createBlockDecorations(doc, parser.blockTokens, [{ from: offset, to: doc.lineAt(offset).to }], false);
			if (!subset.some(range => range.value.spec.class == "cm-fenced-div r1"))
				throw Error(`${name}: viewport below header lost the r1 style`);
		}
		if (createBlockDecorations(doc, parser.blockTokens, full, true).some(range => range.value.spec.class.includes(" r1")))
			throw Error(`${name}: source-mode no-style setting was ignored`);
		if (doc.length < 512) {
			// Recreate decoration values with Obsidian's native factory. Widget objects
			// are the production objects, not substitutes, and no plugin is installed.
			const nativeRanges: Range<Decoration>[] = [
				...styles.map(range => NativeDecoration.line(range.value.spec).range(range.from)),
				...breaks.map(range => NativeDecoration.replace(range.value.spec).range(range.from, range.to)),
			];
			const nativeState = cm.state.constructor.create({ doc: source, extensions: [
				cm.constructor.decorations.of(NativeDecoration.set(nativeRanges, true)),
			] });
			const parent = document.createElement("div");
			const editor = new cm.constructor({ state: nativeState, parent });
			try {
				const styled = editor.contentDOM.querySelectorAll(".cm-line.cm-fenced-div.r1");
				const bodies = tokens.filter(token => doc.lineAt(token.from).number < doc.lines);
				if (styled.length != bodies.length) throw Error(`${name}: missing native styled blocks`);
				if (expected.length && Array.from(styled).some(line => !line.textContent?.includes("Second")))
					throw Error(`${name}: native continuation line escaped its styled block`);
			} finally {
				editor.destroy();
				parent.replaceChildren();
			}
		}
		checks++;
	};
	for (const fixture of fixtures) verify(parse(fixture.source), fixture.name, fixture.blocks);
	// Keep the parser instance across edits, as the editor does during typing.
	let source = sample, parsed = parse(source), doc = Text.of(source.split("\n"));
	const from = source.indexOf("\n\n\n") + 1;
	for (const change of [{ from, insert: "\n" }, { from, to: from + 1 }]) {
		const changes = ChangeSet.of(change, doc.length);
		doc = changes.apply(doc);
		source = doc.toString();
		const next = parse(source);
		parsed.parser.storeChanges(changes);
		parsed.parser.applyChange(doc, next.tree);
		parsed = { ...next, parser: parsed.parser };
		verify(parsed, "blank-line edit", 3);
	}
	return checks;
}
