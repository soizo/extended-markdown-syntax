/** Native CSSOM and selector checks; fixtures never enter the note DOM. */
export function checkSpoilerStyles(styles: string, render: (source: string) => HTMLElement): number {
	const sheet = new CSSStyleSheet();
	sheet.replaceSync(styles);
	const declarations: { selector: string, style: CSSStyleDeclaration }[] = [];
	const collect = (rules: CSSRuleList, parent = ""): void => {
		for (const rule of rules) {
			if (!(rule instanceof CSSStyleRule)) continue;
			const selector = !parent ? rule.selectorText : rule.selectorText.includes("&")
				? rule.selectorText.replaceAll("&", `:is(${parent})`)
				: `:is(${parent}) ${rule.selectorText}`;
			declarations.push({ selector, style: rule.style });
			collect(rule.cssRules, selector);
		}
	};
	collect(sheet.cssRules);
	const has = (el: Element, property: string, value: string, important = false) => declarations.some(rule =>
		el.matches(rule.selector) && rule.style.getPropertyValue(property) == value &&
		(!important || rule.style.getPropertyPriority(property) == "important"));
	const linkSelector = "a, .cm-hmd-internal-link, .cm-underline";
	const assertState = (spoiler: HTMLElement, hidden: boolean): void => {
		if (!has(spoiler, "transition-property", "color") || !has(spoiler, "transition-duration", "0.1s"))
			throw Error("Ordinary spoiler color transition changed");
		for (const el of [spoiler, ...spoiler.querySelectorAll("*")]) {
			if (has(el, "color", "transparent", el != spoiler || el.matches(linkSelector)) != hidden)
				throw Error(`Spoiler color does not follow ordinary text (${spoiler.className}, hidden=${hidden})`);
			if (has(el, "visibility", "hidden")) throw Error("Spoiler bypasses the ordinary color transition");
			if (el != spoiler && !has(el, "transition", "inherit"))
				throw Error("Spoiler descendants do not share its color transition");
		}
		for (const link of spoiler.querySelectorAll(linkSelector))
			if (has(link, "pointer-events", "none") != hidden) throw Error("Hidden/revealed link interaction mismatch");
	};
	let checks = 0;
	for (const theme of ["theme-light", "theme-dark"]) {
		for (const content of ["Fixture", "[[Fixture]]", "[Fixture](https://example.invalid)", "[**Fixture**](https://example.invalid)"]) {
			const root = render(`||${content}|| [[Outside]]`);
			root.classList.add(theme);
			const spoiler = root.querySelector<HTMLElement>(".spoiler");
			const outside = root.querySelector("p > a");
			if (!spoiler || !outside) throw Error("Missing reading-mode spoiler fixture");
			const links = Array.from(spoiler.querySelectorAll<HTMLAnchorElement>("a"));
			for (const link of links) link.style.color = "rgb(20, 80, 160)";
			const hrefs = links.map(link => link.getAttribute("href"));
			assertState(spoiler, true);
			spoiler.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
			assertState(spoiler, true); // Reading mode is click-to-reveal, not hover-to-reveal.
			spoiler.click();
			assertState(spoiler, false);
			for (let i = 0; i < links.length; i++)
				if (links[i].getAttribute("href") != hrefs[i] || links[i].style.color != "rgb(20, 80, 160)")
					throw Error("Revealing a spoiler changed the original link");
			spoiler.click();
			assertState(spoiler, true);
			if (has(outside, "color", "transparent", true) || has(outside, "pointer-events", "none"))
				throw Error("Spoiler rules affected an outside link");
			checks++;
		}
		for (const kind of ["plain", "internal", "external", "merged"]) {
			const root = document.createElement("div");
			root.className = `${theme} is-live-preview`;
			const spoiler = root.appendChild(document.createElement("span"));
			spoiler.className = "cm-spoiler";
			const text = document.createElement("span");
			text.textContent = "Fixture";
			if (kind == "merged") spoiler.classList.add("cm-hmd-internal-link");
			if (kind == "internal") {
				const link = spoiler.appendChild(document.createElement("span"));
				link.className = "cm-hmd-internal-link";
				text.className = "cm-underline";
				link.append(text);
			} else if (kind == "external") {
				text.className = "cm-underline";
				spoiler.append(text);
			} else spoiler.append(text);
			assertState(spoiler, true);
			const selection = spoiler.appendChild(document.createElement("span"));
			selection.className = "cm-spoiler-revealed";
			assertState(spoiler, false);
			selection.remove();
			assertState(spoiler, true);
			spoiler.classList.add("cm-delim");
			assertState(spoiler, false);
			spoiler.classList.remove("cm-delim");
			root.classList.remove("is-live-preview");
			assertState(spoiler, false); // Source mode must stay readable.
			checks++;
		}
	}
	return checks;
}
