import { build } from "esbuild";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

mkdirSync(".ignored", { recursive: true });
const dir = mkdtempSync(".ignored/obsidian-tests-");
try {
	const outfile = resolve(join(dir, "smoke.js"));
	await build({
		entryPoints: ["tests/obsidian-smoke.ts"],
		outfile,
		bundle: true,
		format: "iife",
		globalName: "__emsSmoke",
	});
	const stylesPath = resolve("styles.css");
	const code = `new Function("styles", require("fs").readFileSync(${JSON.stringify(outfile)}, "utf8") + ";return __emsSmoke.run(styles);")(require("fs").readFileSync(${JSON.stringify(stylesPath)}, "utf8"))`;
	const result = spawnSync("obsidian", ["eval", `code=${code}`], { encoding: "utf8", timeout: 30_000 });
	process.stdout.write(result.stdout ?? "");
	process.stderr.write(result.stderr ?? "");
	if (result.error) console.error(result.error.message);
	process.exitCode = result.status === 0 && /"passed": true/.test(result.stdout) ? 0 : 1;
} finally {
	rmSync(dir, { recursive: true, force: true });
}
