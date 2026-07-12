/* The landing's terminal palette as a shiki theme. Two consumers:
   - astro.config.mjs registers it with Expressive Code for blog pages
     (selected via data-theme="fastagent" on their <html>);
   - the homepage embed tabs render their snippets with it via <Code>.
   Docs keep Starlight's stock github-dark/github-light pair.
   Colors mirror the --term-* custom properties in styles/custom.css. */
export const fastagentCode = {
  name: "fastagent-dark",
  type: "dark",
  colors: {
    "editor.background": "#080a09",
    "editor.foreground": "#d5dcd9",
  },
  tokenColors: [
    { scope: ["comment", "punctuation.definition.comment"], settings: { foreground: "#5f6c68", fontStyle: "italic" } },
    { scope: ["string", "string.quoted", "string.template"], settings: { foreground: "#e0bd68" } },
    { scope: ["constant.numeric", "constant.language", "constant.character", "support.constant"], settings: { foreground: "#7ecf8a" } },
    { scope: ["keyword", "storage.type", "storage.modifier", "keyword.control"], settings: { foreground: "#b795f5" } },
    { scope: ["keyword.operator"], settings: { foreground: "#d5dcd9" } },
    { scope: ["entity.name.function", "support.function"], settings: { foreground: "#2dd4bf" } },
    { scope: ["entity.name.type", "entity.name.class", "support.type", "support.class"], settings: { foreground: "#6aa5f8" } },
    { scope: ["entity.name.tag"], settings: { foreground: "#b795f5" } },
    { scope: ["entity.other.attribute-name"], settings: { foreground: "#6aa5f8" } },
    { scope: ["variable", "variable.parameter", "variable.other"], settings: { foreground: "#d5dcd9" } },
  ],
};
