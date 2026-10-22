import { build } from "esbuild";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

mkdirSync(".ignored", { recursive: true });
const dir = mkdtempSync(".ignored/tests-");
try {
	const entries = ["tests/escape.test.ts", "tests/token-index.test.ts"];
	const outfiles = [];
	for (const entryPoint of entries) {
		const outfile = join(dir, entryPoint.replace(/[/\\]/g, "-").replace(/\.ts$/, ".cjs"));
		await build({
			entryPoints: [entryPoint],
			outfile,
			bundle: true,
			platform: "node",
			format: "cjs",
			external: ["jsdom"],
		});
		outfiles.push(outfile);
	}
	const result = spawnSync(process.execPath, ["--test", ...outfiles], { stdio: "inherit" });
	process.exitCode = result.status ?? 1;
} finally {
	rmSync(dir, { recursive: true, force: true });
}
