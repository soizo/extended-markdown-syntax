import { ReadingModeSyntaxExtender } from "src/preview-mode/post-processor/core";
import { configureDelimLookup } from "src/format-configs/format-utils";
import { DEFAULT_SETTINGS } from "src/settings/configs";

/** Run only against detached fixture DOM. Never edit a vault or install a plugin. */
export function run() {
	// This private seam is test-only: use Obsidian's actual Markdown parser but
	// supply our own receiver and source, not the open note's text or renderer.
	const renderer = app.workspace.getLeavesOfType("markdown")[0]?.view?.previewMode?.renderer;
	if (typeof renderer?.parseSync != "function")
		throw Error("Open a Markdown note in Obsidian before running this smoke test.");
	const settings = { ...DEFAULT_SETTINGS };
	configureDelimLookup(settings);
	const extender = new ReadingModeSyntaxExtender(settings);
	const fixtures = [
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
	const checks = fixtures.map(({ source, selector, count, content }) => {
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
		if (source == String.raw`\^w\^` && root.textContent != "^w^")
			throw Error(`Issue #27 must render exactly as plain ^w^, got ${root.textContent}`);
		if (root.querySelector("span:not([class])"))
			throw Error("Escape protection left a temporary span behind.");
		const matches = root.querySelectorAll(selector);
		if (matches.length != count || content !== undefined && matches[0]?.textContent != content)
			throw Error(`Fixture ${JSON.stringify(source)}: expected ${count} ${selector} (${content ?? ""}), got ${root.innerHTML}`);
		return source;
	});
	return { passed: true, checks: checks.length };
}
