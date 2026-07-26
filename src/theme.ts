/* The palette, and the only copy of these hex values.
   Everything that paints reads from here: scripts/build-tokens.mjs generates
   the CSS custom properties, and the surfaces that cannot read a CSS variable
   (the shiki frame background, the theme-color meta, the OG card) import the
   swatches directly.

   Catppuccin — Mocha for the dark shell and for the terminal panes, which stay
   dark in both modes; Latte for the light shell. Roles are ordered
   [light, dark] to match the CSS light-dark() function.
   Style guide: https://github.com/catppuccin/catppuccin/blob/main/docs/style-guide.md */

export const mocha = {
  crust: "#11111b",
  mantle: "#181825",
  base: "#1e1e2e",
  surface0: "#313244",
  surface1: "#45475a",
  surface2: "#585b70",
  overlay0: "#6c7086",
  overlay1: "#7f849c",
  overlay2: "#9399b2",
  subtext0: "#a6adc8",
  subtext1: "#bac2de",
  text: "#cdd6f4",
  rosewater: "#f5e0dc",
  maroon: "#eba0ac",
  teal: "#94e2d5",
  sapphire: "#74c7ec",
  blue: "#89b4fa",
  mauve: "#cba6f7",
  red: "#f38ba8",
  peach: "#fab387",
  yellow: "#f9e2af",
  green: "#a6e3a1",
} as const;

/* Latte's accents are tuned for large type; this site sets small mono labels
   and semibold links in most of them. The style guide's own rule is
   "legibility always comes first", so the ones below keep the stock hue with
   the lightness pulled down until they clear their floor on the page.
   scripts/check-site.mjs holds a floor for every role it paints as text, and
   a 3:1 UI floor for the hues that only draw borders and icons. */
export const latte = {
  crust: "#dce0e8",
  mantle: "#e6e9ef",
  base: "#eff1f5",
  surface0: "#ccd0da",
  surface1: "#bcc0cc",
  surface2: "#acb0be",
  overlay0: "#9ca0b0",
  overlay2: "#7c7f93",
  subtext0: "#6c6f85",
  subtext1: "#5c5f77",
  text: "#4c4f69",
  textStrong: "#3c3f57", // text, darkened
  teal: "#10767c",
  sapphire: "#0e6d80",
  blue: "#1a5ce0",
  red: "#cd0e37",    // Latte red, a shade down: it labels a failed turn as text
  yellow: "#8a6a17",
  greenInk: "#2c6f1b", // the accent itself, 5.1:1 on the page
} as const;

/* Page roles: [light, dark].
   Mantle, not base, is Latte's page — Latte on pure base reads as a marketing
   white page, and this is a terminal product. Panes sit on base above it,
   wells go down to crust: the same three-layer stack Mocha uses, one notch
   grayer, which costs ~7% contrast that the darkened accents absorb.
   Latte's text ladder is likewise shifted one step darker than Mocha's. */
export const roles = {
  bg: [latte.mantle, mocha.base],
  "bg-elevated": [latte.base, mocha.surface0],
  panel: [latte.crust, mocha.mantle],
  line: [latte.surface0, mocha.surface1],
  "line-strong": [latte.surface1, mocha.surface2],
  text: [latte.textStrong, mocha.text],
  "text-soft": [latte.text, mocha.subtext1],
  muted: [latte.subtext1, mocha.subtext0],
  "muted-2": [latte.subtext0, mocha.overlay2],
  selection: [latte.overlay2, mocha.overlay2],

  /* Deliberate deviation from the style guide's "links are Blue": no blue and
     no purple in the chrome. Green carries it — terminal phosphor, and the
     same hue the panes already use for a served request. Text on an accent
     fill is Base, per the guide. Blue and mauve survive only inside code,
     where they are syntax roles rather than brand. */
  accent: [latte.greenInk, mocha.green],
  "accent-ink": [latte.base, mocha.base],
  yellow: [latte.yellow, mocha.yellow],
  red: [latte.red, mocha.red],
  blue: [latte.blue, mocha.blue],
  sapphire: [latte.sapphire, mocha.sapphire],
  teal: [latte.teal, mocha.teal],
} as const;

/* The terminal panes are Mocha in both modes — the site's one fixed surface.
   Syntax roles follow the style guide's language defaults; --term-muted is
   chrome and dimmed payload (Overlay 1, still legible on crust) while
   --term-comment is a code comment, which the guide puts a step brighter. */
export const term = {
  bg: mocha.crust,
  bar: mocha.mantle,
  border: mocha.surface0,
  text: mocha.text,
  muted: mocha.overlay1,
  comment: mocha.overlay2,
  fn: mocha.blue,
  keyword: mocha.mauve,
  green: mocha.green,
  blue: mocha.blue,
  yellow: mocha.yellow,
  red: mocha.red,
  peach: mocha.peach,
  sapphire: mocha.sapphire,
  teal: mocha.teal,
  maroon: mocha.maroon,
  cursor: mocha.rosewater,
} as const;

/* The docs shell's tokens, [light, dark]. Nimbus paints every surface from
   a --nb-* property; this is where each one is told which role it is. Not
   dead code: the docs read all of it, and nothing else in this repo does.

   Two names are false friends. Nimbus' `accent` is a hover *surface*, not the
   brand — the brand is `primary`, which is where the green goes. And Nimbus'
   `muted` is a surface too; the de-emphasised ink is `muted-foreground`.

   The tokens left out are derived rather than picked: the *-foreground pairs
   alias their surface's ink, and the hover/ring/tint steps are color-mix()es
   of the values here. Both live in src/styles/globals.css. */
export const nimbus = {
  background: roles.bg,
  foreground: roles.text,
  card: roles.panel,
  muted: roles["bg-elevated"],
  "muted-foreground": roles.muted,
  accent: roles["bg-elevated"],
  primary: roles.accent,
  "primary-foreground": roles["accent-ink"],
  border: roles.line,
  "border-strong": roles["line-strong"],
  info: roles.blue,
  success: roles.accent,
  warning: roles.yellow,
  danger: roles.red,
} as const;

/* The colour a browser paints its chrome with, per mode. */
export const themeColor = { light: latte.mantle, dark: mocha.base } as const;

/* Shiki themes, for both shells: the docs fences go through Nimbus, the blog's
   through Astro's own markdown pipeline, and astro.config hands them this. */
export const CODE_THEME_DARK = "catppuccin-mocha";
export const CODE_THEME_LIGHT = "catppuccin-latte";
