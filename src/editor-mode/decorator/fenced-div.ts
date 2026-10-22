import type { Range, Text } from "@codemirror/state";
import { Decoration, WidgetType } from "@codemirror/view";
import { TokenStatus } from "src/enums";
import type { BlockFormat, PlainRange, TokenDecoration, TokenGroup } from "src/types";
import { BlockRules } from "src/format-configs/rules";
import { trimTag } from "src/format-configs/format-utils";
import { iterTokenGroup, provideTokenPartsRanges } from "src/editor-mode/utils/token-utils";

export class LineBreak extends WidgetType {
	private readonly _offset: number;

	private constructor(offset: number) {
		super();
		this._offset = offset;
	}

	public eq(other: LineBreak): boolean {
		return other._offset === this._offset;
	}

	public toDOM(): HTMLElement {
		return document.createElement("br");
	}

	public get lineBreaks(): number {
		return 1;
	}

	public static of(offset: number): Range<Decoration> {
		return Decoration.replace({ widget: new LineBreak(offset) }).range(offset - 1, offset);
	}
}

/** Keep the first content line native, joining its continuation lines with BR widgets. */
export function createBlockLineBreaks(doc: Text, tokens: TokenGroup): Range<Decoration>[] {
	const ranges: Range<Decoration>[] = [];
	for (const token of tokens) {
		if (token.status != TokenStatus.ACTIVE) continue;
		// Visit each block independently; blank lines or unrelated text between
		// blocks must not advance past a later token.
		for (let number = doc.lineAt(token.from).number + 2; number <= doc.lines; number++) {
			const line = doc.line(number);
			if (line.from >= token.to || token.closedByBlankLine && line.to == token.to) break;
			ranges.push(LineBreak.of(line.from));
		}
	}
	return ranges;
}

export function createBlockDecorations(doc: Text, tokens: TokenGroup, visibleRanges: readonly PlainRange[], noStyle: boolean): Range<TokenDecoration>[] {
	const ranges: Range<TokenDecoration>[] = [];
	iterTokenGroup({ tokens, ranges: visibleRanges, callback: token => {
		if (token.status != TokenStatus.ACTIVE) return;
		const base = "cm-" + BlockRules[token.type as BlockFormat].class;
		const { contentRange, tagRange } = provideTokenPartsRanges(token);
		// The opening tag can be above the viewport; read absolute token ranges.
		const tag = trimTag(doc.sliceString(tagRange.from, tagRange.to));
		const hasContent = !!doc.sliceString(contentRange.from, contentRange.to).trimEnd();
		ranges.push((Decoration.line({ class: base + " cm-fenced-div-start", token }) as TokenDecoration).range(token.from));
		if (hasContent)
			ranges.push((Decoration.line({ class: base + (noStyle ? "" : " " + tag), token }) as TokenDecoration).range(contentRange.from + 1));
	} });
	return ranges;
}
