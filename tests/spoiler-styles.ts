/** Native CSSOM and selector checks; fixtures never enter the note DOM. */
export function checkSpoilerStyles(styles: string, render: (source: string) => HTMLElement): number {
	const sheet = new CSSStyleSheet();
	sheet.replaceSync(styles);
	const hiddenSelectors: string[] = [];
	const collect = (rules: CSSRuleList, parent = ""): void => {
		for (const rule of rules) {
			if (!(rule instanceof CSSStyleRule)) continue;
			const selector = !parent ? rule.selectorText : rule.selectorText.includes("&")
				? rule.selectorText.replaceAll("&", `:is(${parent})`)
				: `:is(${parent}) ${rule.selectorText}`;
			if (rule.style.visibility == "hidden") hiddenSelectors.push(selector);
			collect(rule.cssRules, selector);
		}
	};
	collect(sheet.cssRules);
	const hidden = (element: Element) => hiddenSelectors.some(selector => element.matches(selector));
	let checks = 0;
	for (const theme of ["theme-light", "theme-dark"]) {
		for (const source of [
			"||[[Fixture]]|| [[Outside]]",
			"||[Fixture](https://example.invalid)|| [[Outside]]",
			"||[**Fixture**](https://example.invalid)|| [[Outside]]",
		]) {
			const root = render(source);
			root.classList.add(theme);
			const spoiler = root.querySelector<HTMLElement>(".spoiler");
			const link = spoiler?.querySelector<HTMLAnchorElement>("a");
			const outside = root.querySelector("p > a");
			if (!spoiler || !link || !outside) throw Error(`Missing spoiler fixture: ${source}`);
			// Explicit theme/link colors must not leak through the parent's transparent color.
			link.style.color = "rgb(20, 80, 160)";
			const href = link.getAttribute("href");
			if (!hidden(link) || Array.from(link.querySelectorAll("*")).some(child => !hidden(child)))
				throw Error(`Issue #21: hidden spoiler leaves a link visible (${theme}, ${source})`);
			if (hidden(spoiler) || hidden(outside)) throw Error("Spoiler mask or outside link was hidden");
			spoiler.click();
			if (!spoiler.classList.contains("spoiler-revealed") || hidden(link))
				throw Error("Revealed spoiler did not restore its link");
			if (link.getAttribute("href") != href || link.style.color != "rgb(20, 80, 160)")
				throw Error("Spoiler changed the link target or explicit color");
			spoiler.click();
			if (!hidden(link)) throw Error("Hiding a revealed spoiler leaked its link");
			checks++;
		}
	}
	return checks;
}
