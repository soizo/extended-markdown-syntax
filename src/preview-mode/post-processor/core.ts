import { MarkdownPostProcessor, MarkdownPostProcessorContext } from "obsidian";
import { MarkdownViewMode, Format } from "src/enums";
import { PluginSettings } from "src/types";
import { InlineRules, BlockRules } from "src/format-configs/rules";
import { PreviewModeParser } from "src/preview-mode/post-processor/parser";
import { protectEscapedDelimiters } from "src/preview-mode/post-processor/escapes";
import { CUSTOM_SPAN_TAG_RE, COLOR_TAG_RE, FENCED_DIV_RE } from "src/preview-mode/post-processor/configs";

function _trimTag(tagStr: string): string {
	return tagStr
		.trim()
		.replaceAll(/\s{2,}/g, " ");
}

function _isLeafBlock(el: HTMLElement): boolean {
	return (
		el instanceof HTMLParagraphElement ||
		el instanceof HTMLHeadingElement
	);
}

function _isTableCellWrapper(el: HTMLElement): boolean {
	return el.hasClass("table-cell-wrapper");
}

function _isCallout(el: HTMLElement): boolean {
	return el.hasClass("callout");
}

function _drawCustomSpan(settings: PluginSettings, targetEl: HTMLElement): void {
	let baseCls = InlineRules[Format.CUSTOM_SPAN].class,
		customSpanElements = targetEl.querySelectorAll<HTMLElement>("." + baseCls);

	customSpanElements.forEach((el) => {
		if (!(el.firstChild instanceof Text && el.firstChild.textContent)) return;
		let tag = CUSTOM_SPAN_TAG_RE.exec(el.firstChild.textContent)?.[1];
		if (tag) {
			let clsList = _trimTag(tag).split(" ");
			el.classList.add(...clsList);
			if (settings.showSpanTagInPreviewMode) { return }
			let from = 0, to = from + tag.length + 2;
			el.firstChild.replaceData(from, to - from, "");
		}
	});
}

function _drawCustomHighlight(settings: PluginSettings, targetEl: HTMLElement): void {
	let markElements = targetEl.querySelectorAll<HTMLElement>("mark"),
		baseCls = InlineRules[Format.HIGHLIGHT].class;

	markElements.forEach((el) => {
		if (!(el.firstChild instanceof Text && el.firstChild.textContent)) { return }
		let color = COLOR_TAG_RE.exec(el.firstChild.textContent)?.[1];
		if (color) {
			el.classList.add(baseCls, `${baseCls}-${color}`);
			if (settings.showHlTagInPreviewMode) { return }
			let from = 0, to = from + color.length + 2;
			el.firstChild.replaceData(from, to - from, "");
		}
	});
}

function _drawFencedDiv(settings: PluginSettings, targetEl: HTMLElement): void {
	if (!(targetEl.firstChild instanceof Text && targetEl.firstChild.textContent)) return;

	// A split/escaped tag is not a complete header. Only a line break or
	// the end of the paragraph may follow its initial text node.
	if (targetEl.firstChild.nextSibling && !(targetEl.firstChild.nextSibling instanceof HTMLBRElement)) return;
	FENCED_DIV_RE.lastIndex = 0;
	let baseCls = BlockRules[Format.FENCED_DIV].class,
		textNode = targetEl.firstChild,
		lineBreakEl = targetEl.querySelector("br"),
		match = FENCED_DIV_RE.exec(textNode.textContent ?? "");

	if (match) {
		let tag = match[1],
			clsList = _trimTag(tag).split(" ").filter(Boolean);
		targetEl.addClass(baseCls, ...clsList);
		if (settings.alwaysShowFencedDivTag & MarkdownViewMode.PREVIEW_MODE) return;
		targetEl.removeChild(textNode);
		if (lineBreakEl) { targetEl.removeChild(lineBreakEl) }
	}
}

export class ReadingModeSyntaxExtender {
	// Only a direct paragraph owns the list item's text; nested blocks are separate targets.
	private readonly _SELECTOR_QUERY = "p, h1, h2, h3, h4, h5, h6, td, th, li:not(:has(> p)), .callout-title-inner" as const;
	private readonly _settings: PluginSettings;
	private _sourceText: string | null = null;
	private _sourceLines: string[] = [];

	constructor(settings: PluginSettings) {
		this._settings = settings;
		this.postProcess.sortOrder = 0;
	}

	private _parseInline(targetEl: HTMLElement, capsulated = true, escapedElements?: WeakSet<Element>): void {
		let targetedEls = _isTableCellWrapper(targetEl) || !capsulated && _isLeafBlock(targetEl)
				? [targetEl]
				: targetEl.querySelectorAll<HTMLElement>(this._SELECTOR_QUERY),
			parsingQueue: PreviewModeParser[] = [];

		for (let i = 0; i < targetedEls.length; i++) {
			new PreviewModeParser(targetedEls[i], parsingQueue, escapedElements).streamParse();
			for (let i = 0; i < parsingQueue.length; i++) {
				parsingQueue[i].streamParse();
				if (i >= 100) { throw Error(`${parsingQueue}`) }
			}
			parsingQueue.splice(0);
		}
	}

	private _isTargeted(sectionEl: HTMLElement, capsulated = true): boolean {
		let contentEl = capsulated ? sectionEl.firstElementChild as HTMLElement : sectionEl;
		if (
			_isTableCellWrapper(sectionEl) || // Intended to draw over editor table cell
			contentEl && (
			_isLeafBlock(contentEl) ||
			_isCallout(contentEl) ||
			contentEl instanceof HTMLTableElement ||
			contentEl instanceof HTMLUListElement ||
			contentEl instanceof HTMLOListElement ||
			contentEl.tagName == "BLOCKQUOTE"
		)) { return true }
		return false;
	}

	private _draw(sectionEl: HTMLElement, capsulated: boolean, ctx: MarkdownPostProcessorContext): void {
		if (!this._isTargeted(sectionEl, capsulated)) return;

		const info = ctx.getSectionInfo(sectionEl);
		if (info && info.text !== this._sourceText) {
			this._sourceText = info.text;
			this._sourceLines = info.text.split("\n");
		}
		const source = info ? this._sourceLines.slice(info.lineStart, info.lineEnd + 1).join("\n") : undefined;
		const protection = source === undefined ? undefined : protectEscapedDelimiters(sectionEl, source);
		try {
			if (this._settings.customHighlight & MarkdownViewMode.PREVIEW_MODE)
				_drawCustomHighlight(this._settings, sectionEl);

			if (this._settings.fencedDiv & MarkdownViewMode.PREVIEW_MODE) {
				let targetEl = capsulated ? sectionEl.firstElementChild : sectionEl;
				if (targetEl instanceof HTMLParagraphElement)
					_drawFencedDiv(this._settings, targetEl);
			}

			this._parseInline(sectionEl, capsulated, protection?.elements);

			if (this._settings.customSpan & MarkdownViewMode.PREVIEW_MODE)
				_drawCustomSpan(this._settings, sectionEl);
		} finally {
			protection?.restore();
		}
	}

	public postProcess: MarkdownPostProcessor = (containerOrSection: HTMLElement, ctx: MarkdownPostProcessorContext) => {
		let isWholeDoc = containerOrSection == ctx.containerEl,
			isDefaultExported = containerOrSection.parentElement?.hasClass("print") ?? false,
			capsulated = !isWholeDoc || isDefaultExported;

		if (isWholeDoc) {
			if (!this._settings.decoratePDF) return;
			let sectionEls = containerOrSection.querySelectorAll<HTMLElement>(capsulated ? "&>div" : "&>*");
			for (let i = 0; i < sectionEls.length; i++) {
				this._draw(sectionEls[i], capsulated, ctx);
			}
		} else {
			this._draw(containerOrSection, true, ctx);
		}
	}
}