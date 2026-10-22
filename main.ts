import { MarkdownView, Plugin, Command } from "obsidian";
import { PluginSettings } from "src/types";
import { DEFAULT_SETTINGS } from "src/settings/configs";
import { ExtendedSettingTab } from "src/settings/ui/setting-tab";
import { configureDelimLookup } from "src/format-configs/format-utils"
import { StyleSheetHandler } from "src/stylesheet";
import { Theme } from "src/enums";
import { editorCommands } from "src/editor-mode/formatting/commands";
import { extendEditorCtxMenu } from "src/editor-mode/ui-components";
import { TagManager } from "src/tag-manager";
import { ReadingModeSyntaxExtender } from "src/preview-mode/post-processor/core";
import { editorSyntaxExtender, refreshCall } from "src/editor-mode/cm-extensions";

export default class ExtendedMarkdownSyntax extends Plugin {
	declare settings: PluginSettings;
	opacityHandler: StyleSheetHandler;
	tagManager: TagManager;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new ExtendedSettingTab(this.app, this));

		configureDelimLookup(this.settings);
		this.registerEditorExtension(editorSyntaxExtender(this));
		this.registerMarkdownPostProcessor(new ReadingModeSyntaxExtender(this.settings).postProcess);

		this.tagManager = new TagManager(this);
		this.opacityHandler = new StyleSheetHandler(this);
		this.opacityHandler.insert(`body.theme-light{--hl-opacity:${this.settings.lightModeHlOpacity}}`);
		this.opacityHandler.insert(`body.theme-dark{--hl-opacity:${this.settings.darkModeHlOpacity}}`);

		this.registerCommands(editorCommands);
		this.extendEditorCtxMenu();

		console.log("Load Extended Markdown Syntax");
	}

	async loadSettings() {
		this.settings = Object.assign({}, structuredClone(DEFAULT_SETTINGS), await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	onunload(): void {
		this.tagManager.colorsHandler.destroy();
		this.opacityHandler.destroy();
		console.log("Unload Extended Markdown Syntax");
	}

	reconfigureDelimLookup() {
		configureDelimLookup(this.settings);
	}

	/** Get the settings change effect without reload the whole app. */
	refreshMarkdownView(deep = true) {
		this.app.workspace.getLeavesOfType("markdown").forEach(leaf => {
			if (leaf.view instanceof MarkdownView) {
				let cmView = leaf.view.editor.cm;
				cmView.dispatch({
					annotations: refreshCall.of({ deep }),
				});
				leaf.view.previewMode.rerender(true);
			}
		});
	}

	setHlOpacity(value: number, theme: Theme) {
		let selector = theme == Theme.LIGHT
				? "body.theme-light"
				: "body.theme-dark",
			property = "--hl-opacity",
			// The index of light mode opacity is 0, and dark mode opacity is 1.
			ruleIndex = theme;
		this.opacityHandler.replace(`${selector}{${property}:${value}}`, ruleIndex);
	}

	registerCommands(commands: Command[]) {
		commands.forEach(cmd => this.addCommand(cmd));
	}

	extendEditorCtxMenu() {
		this.registerEvent(this.app.workspace.on("editor-menu", (menu, editor, ctx) => {
			extendEditorCtxMenu(menu, editor, ctx);
		}));
	}
}