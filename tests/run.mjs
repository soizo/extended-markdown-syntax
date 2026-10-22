import { build } from "esbuild";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

mkdirSync(".ignored", { recursive: true });
const dir = mkdtempSync(".ignored/tests-");
try {
	const outfile = join(dir, "escape.test.cjs");
	await build({
		entryPoints: ["tests/escape.test.ts"],
		outfile,
		bundle: true,
		platform: "node",
		format: "cjs",
		external: ["jsdom"],
	});
	const result = spawnSync(process.execPath, ["--test", outfile], { stdio: "inherit" });
	process.exitCode = result.status ?? 1;
} finally {
	rmSync(dir, { recursive: true, force: true });
}
