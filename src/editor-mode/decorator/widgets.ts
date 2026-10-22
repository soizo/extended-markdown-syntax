import { Range } from "@codemirror/state";
import { WidgetType, EditorView, Decoration } from "@codemirror/view"
import { Format } from "src/enums";
import { Token } from "src/types";
import { TagMenu } from "src/editor-mode/ui-components";

/**
 * These code snippets are taken from 
 * https://github.com/Superschnizel/obisdian-fast-text-color/blob/master/src/widgets/ColorWidget.ts
 * with some modifications.
 */
export class ColorButton extends WidgetType {
	private _btnPos: number;
	private _colorMenu: TagMenu;

	private constructor(token: Token) {
		super();
		this._btnPos = token.from + token.openLen;
	}

	public eq(other: ColorButton): boolean {
		return this._btnPos == other._btnPos;
	}

	public toDOM(view: EditorView): HTMLElement {
		let btn = document.createElement("span");
		btn.setAttribute("aria-hidden", "true");
		btn.className = "cm-highlight-color-btn";
		btn.onclick = () => {
			view.dispatch({
				selection: { anchor: this._btnPos }
			});
			this._colorMenu ||= TagMenu.create(view, Format.HIGHLIGHT);
			this._colorMenu.showMenu();
		}
		return btn;
	}

	public ignoreEvent() {
		return false;
	}

	public static of(hlToken: Token): Range<Decoration> {
		let btnOffset = hlToken.from + hlToken.openLen;
		return Decoration
			.widget({ widget: new ColorButton(hlToken), side: 1 })
			.range(btnOffset);
	}
}

export class HiddenWidget extends WidgetType {
	private _token: Token;
	private constructor(replaced: Token) {
		super();
		this._token = replaced;
	}

	public eq(other: HiddenWidget): boolean {
		return other._token == this._token;
	}

	public toDOM(): HTMLElement {
		return document.createElement("span");
	}

	public static of(from: number, to: number, token: Token, isBlock = false): Range<Decoration> {
		return Decoration.replace({
			widget: new HiddenWidget(token),
			block: isBlock,
			inclusiveEnd: false
		}).range(from, to);
	}
}

export { LineBreak } from "src/editor-mode/decorator/fenced-div";