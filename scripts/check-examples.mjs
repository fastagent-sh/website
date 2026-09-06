import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const parse = (source) => ts.createSourceFile("example.ts", source, ts.ScriptTarget.Latest, true);
const pkg = JSON.parse(read("vendor/fastagent/package.json"));

// Read the pinned source without installing its runtime in the static website.
const entries = Object.entries(pkg.exports)
  .filter(([path]) => path !== "./package.json")
  .map(([path, entry]) => [
    `${pkg.name}${path === "." ? "" : path.slice(1)}`,
    new URL(`vendor/fastagent/${entry.default.replace("./dist/", "src/").replace(/\.js$/, ".ts")}`, root).pathname,
  ]);
const program = ts.createProgram(entries.map(([, file]) => file), { noEmit: true, allowImportingTsExtensions: true });
const checker = program.getTypeChecker();
const exports = new Map(entries.map(([name, file]) => {
  const symbol = checker.getSymbolAtLocation(program.getSourceFile(file));
  assert.ok(symbol, `Cannot read public entry ${name}`);
  return [name, new Set(checker.getExportsOfModule(symbol).map((item) => item.name))];
}));

const snippets = [
  ...[...read("src/pages/index.astro").matchAll(/code: `([\s\S]*?)`/g)]
    .map(([, code], i) => [`index.astro tab ${i + 1}`, code]),
  ...readdirSync(new URL("src/content/blog/", root))
    .filter((file) => file.endsWith(".md"))
    .flatMap((file) => [...read(`src/content/blog/${file}`).matchAll(/^```(?:ts|typescript|js|javascript)\n([\s\S]*?)^```/gm)]
      .map(([, code], i) => [`${file} block ${i + 1}`, code])),
];

let checked = 0;
for (const [location, code] of snippets) {
  for (const statement of parse(code).statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const source = statement.moduleSpecifier.text;
    if (source !== pkg.name && !source.startsWith(`${pkg.name}/`)) continue;
    assert.ok(exports.has(source), `${location}: ${source} is not a public entry`);
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const item of bindings.elements) {
      const name = (item.propertyName ?? item.name).text;
      assert.ok(exports.get(source).has(name), `${location}: ${source} does not export ${name} in ${pkg.version}`);
      checked += 1;
    }
  }
}
assert.ok(checked > 0, "No FastAgent example imports found");
console.log(`examples: ${checked} named imports match FastAgent ${pkg.version}'s public API`);
