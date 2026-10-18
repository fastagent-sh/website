/* Palette and font stack for the social cards. Kept beside the renderers so the
   site card and the per-post cards cannot drift apart. */
export const CARD = {
  ground: "#11151a",
  groundFar: "#080a0d",
  glow: "#15383d",
  glowFade: "#0d0f12",
  accent: "#45cbd3",
  headline: "#f1f4f7",
  sub: "#9ba3ae",
  paneBg: "#0b0e12",
  paneBar: "#141920",
  paneLine: "#2b323c",
  paneText: "#c3cad4",
  dim: "#6b7480",
  ok: "#8fdc8a",
  str: "#e6c68a",
};

export const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";

export const escapeXml = (value) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);
