import { ReadingModeSyntaxExtender } from "src/preview-mode/post-processor/core";
import { configureDelimLookup } from "src/format-configs/format-utils";
import { DEFAULT_SETTINGS } from "src/settings/configs";
import { syntaxFixtures, editorFixtures, fencedDivSample, type SyntaxFixture } from "./syntax-fixtures";
import { EditorParser } from "src/editor-mode/preprocessor/parser";
import { Text } from "@codemirror/state";
import { TokenStatus } from "src/enums";
import { checkSpoilerStyles } from "./spoiler-styles";
import { checkFencedDivs } from "./fenced-div";
import type { MarkdownView, WorkspaceLeaf } from "obsidian";

/** Run only against detached fixture DOM. Never edit a vault or install a plugin. */
export function run(styles: string) {
	// This private seam is test-only: use Obsidian's actual Markdown parser but
	// supply our own receiver and source, not the open note's text or renderer.
	const views: MarkdownView[] = app.workspace.getLeavesOfType("markdown")
		.map((leaf: WorkspaceLeaf) => leaf.view as MarkdownView);
	const view = views.find(view => view.editor?.cm && typeof view.previewMode?.renderer?.parseSync == "function");
	const renderer = view?.previewMode?.renderer;
	if (!view || typeof renderer?.parseSync != "function")
		throw Error("Open a Markdown note in Obsidian before running this smoke test.");
	const settings = { ...DEFAULT_SETTINGS };
	configureDelimLookup(settings);
	const extender = new ReadingModeSyntaxExtender(settings);
	const fixtures: SyntaxFixture[] = [
		...syntaxFixtures,
		// Multi-paragraph blocks need Obsidian's real section boundaries.
		{ source: fencedDivSample, selector: ".fenced-div.r1", count: 3 },
		{ source: String.raw`\^w\^`, selector: "sup", count: 0 },
		{ source: String.raw`\^w\^ ^yes^`, selector: "sup", count: 1, content: "yes" },
		{ source: String.raw`\~w\~ ~yes~`, selector: "sub", count: 1, content: "yes" },
		{ source: String.raw`\++w\++ ++yes++`, selector: "ins", count: 1, content: "yes" },
		{ source: String.raw`\||w\|| ||yes||`, selector: ".spoiler", count: 1, content: "yes" },
		{ source: String.raw`\!!w\!! !!yes!!`, selector: ".custom-span", count: 1, content: "yes" },
		{ source: String.raw`\\^w^`, selector: "sup", count: 1, content: "w" },
		{ source: String.raw`\\\^w\^`, selector: "sup", count: 0 },
		{ source: String.raw`^a\^b^`, selector: "sup", count: 1, content: "a^b" },
		{ source: String.raw`\+++w++`, selector: "ins", count: 1, content: "w" },
		{ source: String.raw`+\+w++`, selector: "ins", count: 0 },
		{ source: String.raw`[[note|label]] \^w\^ ^yes^`, selector: "sup", count: 1, content: "yes" },
		{ source: String.raw`[[first]] \^w\^ ^yes^ [[last]]`, selector: "sup", count: 1, content: "yes" },
		{ source: String.raw`[first](https://example.com/first) \^w\^ ^yes^ [last](https://example.com/last)`, selector: "sup", count: 1, content: "yes" },
		{ source: String.raw`<code>\^code\^</code > <img src="image.png"> \^w\^ ^yes^`, selector: "sup", count: 1, content: "yes" },
		{ source: "> [!note]\n> \\^w\\^ ^yes^", selector: "sup", count: 1, content: "yes" },
		{ source: "> [!note] Title\n> \\^w\\^ ^yes^", selector: "sup", count: 1, content: "yes" },
		{ source: String.raw`==highlight== \^w\^ ^yes^`, selector: "sup", count: 1, content: "yes" },
		{ source: String.raw`!!{my-class}^a\^b^!!`, selector: ".custom-span.my-class sup", count: 1, content: "a^b" },
		{ source: "| A | B |\n| --- | --- |\n| \\^w\\^ | ^yes^ |", selector: "sup", count: 1, content: "yes" },
		{ source: "| A | B |\n| --- | --- |\n| \\|\\|w\\|\\| | yes |", selector: ".spoiler", count: 0 },
		{ source: "- \\^w\\^\n- ^yes^", selector: "sup", count: 1, content: "yes" },
		{ source: "😀 \\^w\\^ ^yes^", selector: "sup", count: 1, content: "yes" },
	];
	const render = (source: string): HTMLElement => {
		let sections: { html: string, pos: { start: { line: number }, end: { line: number } } }[] = [];
		renderer.parseSync.call({
			text: source,
			parseFinish: (_: string, parsed: { sections: typeof sections }) => { sections = parsed.sections; }
		});
		const root = document.createElement("div");
		for (const section of sections) {
			const el = document.createElement("div");
			const parsed = new DOMParser().parseFromString(section.html, "text/html");
			el.append(...Array.from(parsed.body.childNodes));
			extender.postProcess(el, {
				containerEl: root,
				getSectionInfo: () => ({ text: source, lineStart: section.pos.start.line, lineEnd: section.pos.end.line }),
			} as never);
			root.append(el);
		}
		return root;
	};
	const checks = fixtures.map(({ source, selector, count, content, text }) => {
		const root = render(source);
		if (source == String.raw`\^w\^` && root.textContent != "^w^")
			throw Error(`Issue #27 must render exactly as plain ^w^, got ${root.textContent}`);
		if (root.querySelector("span:not([class])"))
			throw Error("Escape protection left a temporary span behind.");
		const matches = root.querySelectorAll(selector);
		if (matches.length != count || content !== undefined && matches[0]?.textContent?.trim() != content ||
			text !== undefined && root.textContent?.trim() != text)
			throw Error(`Fixture ${JSON.stringify(source)}: expected ${count} ${selector} (${content ?? text ?? ""}), got ${root.innerHTML}`);
		return source;
	});
	const cm = view.editor.cm;
	const context = cm?.state.values.find(value => value?.context?.parser)?.context;
	if (!context) throw Error("Open a Markdown editor before running native editor checks.");
	const parseNative = (source: string) => {
		// New native state/context, not a transaction on any open note.
		const state = cm.state.constructor.create({ doc: source });
		const normalized = state.doc.toString();
		const isolated = context.constructor.create(context.parser, state, { from: 0, to: normalized.length });
		const tree = isolated.withContext(() => context.parser.parse(normalized));
		return { state, tree };
	};
	const parseEditor = (source: string) => {
		const { state, tree } = parseNative(source);
		const parser = new EditorParser(settings);
		parser.initParse(Text.of(state.doc.toString().split("\n")), tree);
		return { state, tree, parser };
	};
	for (const { source, format, count, validTag } of editorFixtures) {
		const { parser } = parseEditor(source);
		const tokens = [...parser.inlineTokens, ...parser.blockTokens]
			.filter(token => token.type == format && token.status == TokenStatus.ACTIVE);
		if (tokens.length != count || validTag !== undefined && tokens.some(token => token.validTag != validTag))
			throw Error(`Editor fixture ${JSON.stringify(source)}: expected ${count} active tokens, got ${JSON.stringify(tokens)}`);
	}
	// Regression for #20: editing after more than 512 custom styles must not
	// throw while resolving the token index.
	const manyStyles = Array.from({ length: 513 }, () => "^w^").join(" ");
	const manyStylesParser = parseEditor(`${manyStyles}\n`).parser;
	const editedSource = `${manyStyles} x\n`;
	const { tree: editedTree } = parseNative(editedSource);
	manyStylesParser.applyChange(Text.of(editedSource.split("\n")), editedTree);
	if (manyStylesParser.inlineTokens.length != 513)
		throw Error(`Editor regression #20: expected 513 tokens after edit, got ${manyStylesParser.inlineTokens.length}`);
	return { passed: true, checks: checks.length, editorChecks: editorFixtures.length + 1,
		spoilerChecks: checkSpoilerStyles(styles, render), fencedDivChecks: checkFencedDivs(cm, parseEditor) };
}
