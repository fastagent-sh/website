// Page-wide behavior for every [data-copy-prompt] button (hero install cards,
// CopyPrompt instances). Imported by each consumer; Astro dedupes the module.
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-copy-prompt]")) {
  button.addEventListener("click", async () => {
    const text = button.dataset.copyPrompt;
    if (!text) return;
    // The status line, when present, is the button's sibling inside its action wrapper.
    const status = button.parentElement?.querySelector<HTMLElement>("[data-copy-status]") ?? null;

    let message = "Copied";
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      message = "Copy failed — select it manually";
    }

    if (status) {
      status.textContent = message;
      window.setTimeout(() => {
        status.textContent = "";
      }, 2500);
    } else {
      const original = button.textContent;
      button.textContent = message === "Copied" ? "Copied" : "Failed";
      window.setTimeout(() => {
        button.textContent = original;
      }, 1500);
    }
  });
}
