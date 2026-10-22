import { Format } from "../src/enums";

export interface SyntaxFixture {
	source: string;
	selector: string;
	count: number;
	content?: string;
	text?: string;
	/** Native HTML for features not provided by the unit-test Markdown parser. */
	html?: string;
}

export const inlineFormats = [
	["++", "ins", Format.INSERTION],
	["||", ".spoiler", Format.SPOILER],
	["^", "sup", Format.SUPERSCRIPT],
	["~", "sub", Format.SUBSCRIPT],
	["!!", ".custom-span", Format.CUSTOM_SPAN],
] as const;

export const syntaxFixtures: SyntaxFixture[] = inlineFormats.flatMap(([delimiter, selector]) => {
	const escape = (value: string) => Array.from(value, char => "\\" + char).join("");
	const lastEscaped = delimiter.slice(0, -1) + "\\" + delimiter.slice(-1);
	return [
		{ source: `${escape(delimiter)}w${escape(delimiter)}`, selector, count: 0, text: `${delimiter}w${delimiter}` },
		{ source: `${lastEscaped}w${lastEscaped}`, selector, count: 0, text: `${delimiter}w${delimiter}` },
		{ source: `${delimiter}a\\${delimiter[0]}b${delimiter}`, selector, count: 1, content: `a${delimiter[0]}b` },
	];
});

for (const tag of [String.raw`\{my-class}`, String.raw`{my-class\}`, String.raw`{my\-class}`]) {
	syntaxFixtures.push({ source: `!!${tag}w!!`, selector: ".custom-span.my-class", count: 0, text: "{my-class}w" });
}

// == delimiters belong to Obsidian; the extension adds only the color tag.
for (const tag of [String.raw`\{my-color}`, String.raw`{my-color\}`, String.raw`{my\-color}`]) {
	syntaxFixtures.push({
		source: `==${tag}w==`, selector: ".custom-highlight", count: 0, text: "{my-color}w",
		html: "<p><mark>{my-color}w</mark></p>",
	});
}
syntaxFixtures.push(
	{ source: "!!{my-class}w!!", selector: ".custom-span.my-class", count: 1, content: "w" },
	{ source: "=={my-color}w==", selector: ".custom-highlight-my-color", count: 1, content: "w", html: "<p><mark>{my-color}w</mark></p>" },
	{ source: String.raw`\=={my-color}w==`, selector: ".custom-highlight", count: 0, text: "=={my-color}w==" },
);

for (const header of [String.raw`\:::my-class`, String.raw`:\::my-class`, String.raw`::\:my-class`, String.raw`:::\:my-class`, String.raw`:::my\-class`]) {
	syntaxFixtures.push({
		source: header + "\nbody", selector: ".fenced-div", count: 0,
		html: `<p>${header.replaceAll("\\", "")}<br>\nbody</p>`,
	});
}
syntaxFixtures.push(
	{ source: ":::my-class\nbody", selector: ".fenced-div.my-class", count: 1, content: "body", html: "<p>:::my-class<br>\nbody</p>" },
	{ source: ":::\nbody", selector: ".fenced-div", count: 1, content: "body", html: "<p>:::<br>\nbody</p>" },
	{ source: String.raw`\\:::my-class` + "\nbody", selector: ".fenced-div", count: 0, html: "<p>\\:::my-class<br>\nbody</p>" },
);

export interface EditorFixture {
	source: string;
	format: Format;
	count: number;
	validTag?: boolean;
}

export const editorFixtures: EditorFixture[] = inlineFormats.flatMap(([delimiter, , format]) => [
	{ source: `\\${delimiter}w\\${delimiter}`, format, count: 0 },
	{ source: `${delimiter}a\\${delimiter[0]}b${delimiter}`, format, count: 1 },
	{ source: `\\\\${delimiter}w${delimiter}`, format, count: 1 },
	{ source: `\\\\\\${delimiter}w\\${delimiter}`, format, count: 0 },
]);
for (const format of [Format.CUSTOM_SPAN, Format.HIGHLIGHT]) {
	const delimiter = format == Format.CUSTOM_SPAN ? "!!" : "==";
	for (const tag of [String.raw`\{my-class}`, String.raw`{my-class\}`, String.raw`{my\-class}`])
		editorFixtures.push({ source: `${delimiter}${tag}w${delimiter}`, format, count: 1, validTag: false });
	editorFixtures.push({ source: `${delimiter}{my-class}w${delimiter}`, format, count: 1, validTag: true });
}
for (const header of [String.raw`\:::my-class`, String.raw`:::\:my-class`, String.raw`:::my\-class`])
	editorFixtures.push({ source: header + "\nbody", format: Format.FENCED_DIV, count: 0 });
for (const header of [":::my-class", ":::"])
	editorFixtures.push({ source: header + "\nbody", format: Format.FENCED_DIV, count: 1, validTag: true });
for (const [delimiter, , format] of inlineFormats) {
	if (format == Format.SPOILER) continue; // Unescaped pipes are table separators.
	editorFixtures.push({
		source: `| A |\n| --- |\n| \\${delimiter}w\\${delimiter} ${delimiter}yes${delimiter} |`, format, count: 1,
	});
}
editorFixtures.push({ source: "| A |\n| --- |\n| \\|\\|w\\|\\| |", format: Format.SPOILER, count: 0 });

// #24: nested blocks must not suppress the list item's own inline content.
for (const bullet of ["-", "1."]) {
	for (const [delimiter, selector, format] of inlineFormats) {
		const source = `> [!note]\n> ${bullet} dsd ${delimiter}dsd${delimiter} sdsd\n> > nested ${delimiter}inner${delimiter}`;
		syntaxFixtures.push({ source, selector, count: 2, content: "dsd" });
		editorFixtures.push({ source, format, count: 2 });
	}
}
syntaxFixtures.push(
	{ source: "> [!note]\n> - dsd ++dsd++ sdsd", selector: "ins", count: 1, content: "dsd" },
	{ source: "> [!note]\n> - dsd ++dsd++ sdsd\n> > dsdfsda", selector: "ins", count: 1, content: "dsd" },
	{ source: "> [!note]\n> - dsd ++dsd++ sdsd\n>\n> > dsdfsda", selector: "ins", count: 1, content: "dsd" },
	{ source: "> [!note]\n> - ++first++\n>\n>   > ++inner++", selector: "ins", count: 2, content: "first" },
	{ source: "> [!note]\n> - ++first++\n> > [!tip]\n> > ++inner++", selector: "ins", count: 2, content: "first" },
	{ source: "- ++first++\n  > ++inner++", selector: "ins", count: 2, content: "first" },
	{ source: "> [!note]\n> - \\++literal\\++\n> > ++inner++", selector: "ins", count: 1, content: "inner" },
	{ source: "> [!note]\n> - ++unclosed\n> > ending++", selector: "ins", count: 0 },
	{ source: "> [!note]\n> - !!{my-class}dsd!!\n> > quoted", selector: ".custom-span.my-class", count: 1, content: "dsd" },
);
