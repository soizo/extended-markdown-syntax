import { DisplayBehaviour, MarkdownViewMode, Field, Format, Theme } from "src/enums";
import { PluginSettings, SettingRoot, TagSettingsSpec, ColorConfig } from "src/types";
import { convertColorConfigToCSSRule } from "src/utils/color-utils";

const DISPLAY_BEHAVIOUR_DROPDOWN: Record<DisplayBehaviour, string> = {
	[DisplayBehaviour.ALWAYS]: "Always visible",
	[DisplayBehaviour.TAG_TOUCHED]: "When touching the tag itself",
	[DisplayBehaviour.SYNTAX_TOUCHED]: "When touching its syntax"
}

const ALWAYS_SHOW_DROPDOWN: Record<MarkdownViewMode, string> = {
	[MarkdownViewMode.NONE]: "Default",
	[MarkdownViewMode.EDITOR_MODE]: "Editor only",
	[MarkdownViewMode.PREVIEW_MODE]: "Preview only",
	[MarkdownViewMode.ALL]: "Both editor and preview"
}

const MARKDOWN_VIEW_MODE_DROPDOWN: Record<MarkdownViewMode, string> = {
	[MarkdownViewMode.NONE]: "Disable all",
	[MarkdownViewMode.EDITOR_MODE]: "Editor only",
	[MarkdownViewMode.PREVIEW_MODE]: "Preview only",
	[MarkdownViewMode.ALL]: "Enable all"
}

export const COLOR_SETTINGS_SPEC: TagSettingsSpec = {
	type: Format.HIGHLIGHT,
	addBtnPlaceholder: "Add color",
	nameFieldPlaceholder: "Color name",
	tagFieldPlaceholder: "Tag string",
	tagFilter: /[^a-z0-9-]/gi,
	onAdd: (settingTab, settingItem, config: ColorConfig) => {
		settingItem.addColorPicker(picker => {
			let plugin = settingTab.plugin,
				configs = plugin.settings.colorConfigs,
				tagManager = plugin.tagManager;
			picker.setValue(config.color);
			picker.colorPickerEl.addClasses(["ems-field", "ems-field-color-picker"]);
			picker.onChange(color => {
				config.color = color;
				let ruleStr = convertColorConfigToCSSRule(config),
					index = configs.findIndex(target => target == config);
				tagManager.colorsHandler.replace(ruleStr, index);
				settingTab.saveSettings();
			});
		});
	},
	onTagChange: (settingTab, config: ColorConfig, index) => {
		let ruleStr = convertColorConfigToCSSRule(config);
		settingTab.plugin.tagManager.colorsHandler.replace(ruleStr, index);
	}
}

export const SPAN_TAG_SETTINGS_SPEC: TagSettingsSpec = {
	type: Format.CUSTOM_SPAN,
	addBtnPlaceholder: "Add tag",
	nameFieldPlaceholder: "Tag name",
	tagFieldPlaceholder: "Tag string",
	tagFilter: /[^ a-z0-9-]/gi
}

export const DIV_TAG_SETTINGS_SPEC: TagSettingsSpec = {
	type: Format.FENCED_DIV,
	addBtnPlaceholder: "Add tag",
	nameFieldPlaceholder: "Tag name",
	tagFieldPlaceholder: "Tag string",
	tagFilter: /[^ a-z0-9-]/gi
}

/**
 * Main configuration of the setting interface.
 */
export const settingTabConfigs = (settings: PluginSettings): SettingRoot<PluginSettings> => {
	return [{
		id: "syntax-switch",
		heading: "Syntax switch",
		collapsible: true,
		items: [{
			name: "Insertion (underline)",
			desc: "Use double plus (\"++\") as a delimiter.",
			fields: [{
				type: Field.DROPDOWN,
				record: settings,
				key: "insertion",
				spec: {
					options: MARKDOWN_VIEW_MODE_DROPDOWN
				},
				update: { internal: true, deep: true },
				callback: (_, plugin) => plugin.reconfigureDelimLookup()
			}]
		}, {
			name: "Discord-flavored spoiler",
			desc: "Use double bars (\"||\") as a delimiter.",
			fields: [{
				type: Field.DROPDOWN,
				record: settings,
				key: "spoiler",
				spec: {
					options: MARKDOWN_VIEW_MODE_DROPDOWN
				},
				update: { internal: true, deep: true },
				callback: (_, plugin) => plugin.reconfigureDelimLookup()
			}]
		}, {
			name: "Pandoc-style superscript",
			desc: "Use a single caret (\"^\") as a delimiter.",
			fields: [{
				type: Field.DROPDOWN,
				record: settings,
				key: "superscript",
				spec: {
					options: MARKDOWN_VIEW_MODE_DROPDOWN
				},
				update: { internal: true, deep: true },
				callback: (_, plugin) => plugin.reconfigureDelimLookup()
			}]
		}, {
			name: "Pandoc-style subscript",
			desc: "Use a single tilde (\"~\") as a delimiter.",
			fields: [{
				type: Field.DROPDOWN,
				record: settings,
				key: "subscript",
				spec: {
					options: MARKDOWN_VIEW_MODE_DROPDOWN
				},
				update: { internal: true, deep: true },
				callback: (_, plugin) => plugin.reconfigureDelimLookup()
			}]
		}, {
			name: "Highlight color tag",
			desc: "Use alphanumeric and hyphen characters (\"A-Za-z0-9-\") after the opening delimiter covered by curly brackets (\"{}\").",
			fields: [{
				type: Field.DROPDOWN,
				record: settings,
				key: "customHighlight",
				spec: {
					options: MARKDOWN_VIEW_MODE_DROPDOWN
				},
				update: { internal: true, deep: true },
				callback: (_, plugin) => plugin.reconfigureDelimLookup()
			}]
		}, {
			name: "Custom span",
			desc: "Use double exclamation marks (\"!!\") as a delimiter. Can be inserted after the " +
				"opening delimiter by a tag with the same way as highlight tag. " +
				"Additionally, you can use multiple classes inside it, separated by space(s).",
			fields: [{
				type: Field.DROPDOWN,
				record: settings,
				key: "customSpan",
				spec: {
					options: MARKDOWN_VIEW_MODE_DROPDOWN
				},
				update: { internal: true, deep: true },
				callback: (_, plugin) => plugin.reconfigureDelimLookup()
			}]
		}, {
			name: "Pandoc-style fenced div (custom block)",
			desc: "Use three colons (\":::\") or more at the beginning of a paragraph, " +
				"followed by alphanumeric and hyphen character (\"A-Za-z0-9\") after them. Use space to separate each class.",
			fields: [{
				type: Field.DROPDOWN,
				record: settings,
				key: "fencedDiv",
				spec: {
					options: MARKDOWN_VIEW_MODE_DROPDOWN
				},
				update: { internal: true, deep: true },
				callback: (_, plugin) => plugin.reconfigureDelimLookup()
			}]
		}]
	}, {
		id: "formatting",
		heading: "Formatting",
		collapsible: true,
		items: [{
			name: "Make it tidier",
			desc: "If turned on, formatting will run in refined way by detecting context the cursor or selection was placed within, " +
				"e.g. you just place a cursor to specific word and run the command to format the whole word or vice-versa. " +
				"If turned off, formatting is more like a normal auto-wrap toggle and doesn't care about the context.",
			fields: [{
				type: Field.TOGGLE,
				record: settings,
				key: "tidyFormatting",
				spec: null
			}]
		}, {
			name: "Open tag menu after formatting",
			desc: "Will automatically open tag menu after doing formatting via command palattes or context menu. " +
				"Only applied to the custom highlight, custom span, and fenced div.",
			fields: [{
				type: Field.TOGGLE,
				record: settings,
				key: "openTagMenuAfterFormat",
				spec: null
			}]
		}, {
			name: "No styled fenced div in source mode",
			desc: "Prevent any fenced divs being styled in source mode.",
			fields: [{
				type: Field.TOGGLE,
				record: settings,
				key: "noStyledDivInSourceMode",
				spec: null,
				update: { internal: true }
			}]
		}]
	}, {
		id: "tag-display",
		heading: "Tag display behavior",
		collapsible: true,
		items: [{
			name: "Highlight tag in live-preview mode",
			desc: "Tags can either always be visible, or when they meet particular condition.",
			fields: [{
				type: Field.DROPDOWN,
				record: settings,
				key: "hlTagDisplayBehaviour",
				spec: {
					options: DISPLAY_BEHAVIOUR_DROPDOWN
				},
				update: { internal: true }
			}]
		}, {
			name: "Custom span tag in live-preview mode",
			desc: "Tags can either always be visible, or when they meet particular condition.",
			fields: [{
				type: Field.DROPDOWN,
				record: settings,
				key: "spanTagDisplayBehaviour",
				spec: {
					options: DISPLAY_BEHAVIOUR_DROPDOWN
				},
				update: { internal: true }
			}]
		}, {
			name: "Highlight tag in preview mode",
			desc: "Show or hide highlight color tag in the preview mode.",
			fields: [{
				type: Field.TOGGLE,
				record: settings,
				key: "showHlTagInPreviewMode",
				spec: null,
				update: { internal: true }
			}]
		}, {
			name: "Custom span tag in preview mode",
			desc: "Show or hide custom span tag in the preview mode.",
			fields: [{
				type: Field.TOGGLE,
				record: settings,
				key: "showSpanTagInPreviewMode",
				spec: null,
				update: { internal: true }
			}]
		}, {
			name: "Always show fenced div tag",
			desc: "By default, the tag is always hidden in the preview mode, " +
				"and only displayed when touching the cursor or selection in the live preview mode.",
			fields: [{
				type: Field.DROPDOWN,
				record: settings,
				key: "alwaysShowFencedDivTag",
				spec: {
					options: ALWAYS_SHOW_DROPDOWN
				},
				update: { internal: true, deep: true }
			}]
		}]
	}, {
		id: "custom-highlight",
		heading: "Custom highlight",
		collapsible: true,
		items: [{
			name: "Color button",
			desc: "Display a button after highlight opening delimiter, used to open the color menu.",
			fields: [{
				type: Field.TOGGLE,
				record: settings,
				key: "colorButton",
				spec: null,
				update: { internal: true }
			}]
		}, {
			name: "Show accent option",
			desc: "Show accent option in the color menu.",
			fields: [{
				type: Field.TOGGLE,
				record: settings,
				key: "showAccentColor",
				spec: null
			}]
		}, {
			name: "Show default option",
			desc: "Show default option in the color menu. Default means non-tagged highlight.",
			fields: [{
				type: Field.TOGGLE,
				record: settings,
				key: "showDefaultColor",
				spec: null
			}]
		}, {
			name: "Show remove option",
			desc: "Show remove option in the color menu.",
			fields: [{
				type: Field.TOGGLE,
				record: settings,
				key: "showRemoveColor",
				spec: null
			}]
		}, {
			name: "Color opacity in light mode",
			desc: "Adjust highlight opacity in light mode. Zero means that will be fully transparent.",
			fields: [{
				type: Field.SLIDER,
				record: settings,
				key: "lightModeHlOpacity",
				spec: {
					min: 0,
					max: 1,
					step: 0.01
				},
				callback: (slider, plugin) => {
					plugin.setHlOpacity(slider.getValue(), Theme.LIGHT);
				}
			}]
		}, {
			name: "Color opacity in dark mode",
			desc: "Adjust highlight opacity in dark mode. Zero means that will be fully transparent.",
			fields: [{
				type: Field.SLIDER,
				record: settings,
				key: "darkModeHlOpacity",
				spec: {
					min: 0,
					max: 1,
					step: 0.01
				},
				callback: (slider, plugin) => {
					plugin.setHlOpacity(slider.getValue(), Theme.DARK);
				}
			}]
		}, {
			name: "Color palettes",
			desc: "The first text field gives the name of the item in the color menu, " +
				"and the second one sets the tag string to be used in highlight syntax.",
			preservedForTagSettings: Format.HIGHLIGHT
		}]
	}, {
		id: "custom-span",
		heading: "Custom span",
		collapsible: true,
		items: [{
			name: "Show default option",
			desc: "Show default option in the tag menu. Default means non-tagged span.",
			fields: [{
				type: Field.TOGGLE,
				record: settings,
				key: "showDefaultSpanTag",
				spec: null
			}]
		}, {
			name: "Show remove option",
			desc: "Show remove option in the tag menu.",
			fields: [{
				type: Field.TOGGLE,
				record: settings,
				key: "showRemoveSpanTag",
				spec: null
			}]
		}, {
			name: "Predefined tags",
			desc: "Predefined tags to be displayed in the tag menu. The first field gives the name of the item, " +
				"the second one sets the tag string to be used in custom span syntax.",
			preservedForTagSettings: Format.CUSTOM_SPAN
		}]
	}, {
		id: "fenced-div",
		heading: "Fenced div",
		collapsible: true,
		items: [{
			name: "Show default option",
			desc: "Show default option in the tag menu. Default means non-tagged div.",
			fields: [{
				type: Field.TOGGLE,
				record: settings,
				key: "showDefaultDivTag",
				spec: null
			}]
		}, {
			name: "Show remove option",
			desc: "Show remove option in the tag menu.",
			fields: [{
				type: Field.TOGGLE,
				record: settings,
				key: "showRemoveDivTag",
				spec: null
			}]
		}, {
			name: "Predefined tags",
			desc: "Predefined tags to be displayed in the tag menu. The first field gives the name of the item, " +
				"the second one sets the tag string to be used in fenced div syntax.",
			preservedForTagSettings: Format.FENCED_DIV
		}]
	}, {
		id: "others",
		heading: "Others",
		collapsible: true,
		items: [{
			name: "Delimiter escaping",
			desc: "Use backslash as a delimiter escaper in the editor (enabled by default). Reading mode always respects escapes when the Markdown source is available.",
			fields: [{
				type: Field.TOGGLE,
				record: settings,
				key: "editorEscape",
				spec: null,
				update: { internal: true, deep: true }
			}]
		}, {
			name: "Parse exported PDF",
			desc: "Parse syntax on an exported PDF.",
			fields: [{
				type: Field.TOGGLE,
				record: settings,
				key: "decoratePDF",
				spec: null
			}]
		}]
	}];
}