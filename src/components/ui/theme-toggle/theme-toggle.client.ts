/**
 * theme-toggle.client.ts — light/dark toggle. Writes pref to localStorage
 * ("ui-mode"); BaseLayout's pre-paint script owns DOM application so view
 * transitions, OS changes, and cross-tab edits stay in sync.
 */

import { mount } from "@cloudflare/nimbus-docs/client";

declare global {
  interface Window {
    __nbApplyTheme?: () => void;
  }
}

function initThemeToggle(button: HTMLElement): () => void {
  function handleClick() {
    // Absent means dark: that is what base.css paints when no pre-paint
    // script ran, so `=== "dark"` would make the first click a no-op.
    const isDark = document.documentElement.getAttribute("data-mode") !== "light";
    try {
      localStorage.setItem("ui-mode", isDark ? "light" : "dark");
    } catch {
      // Ignore storage errors (private mode / restricted contexts).
    }
    window.__nbApplyTheme?.();
  }

  window.__nbApplyTheme?.();
  button.addEventListener("click", handleClick);
  return () => button.removeEventListener("click", handleClick);
}

mount("[data-nb-theme-toggle]", initThemeToggle);
