// Page-wide behavior for every [data-copy-prompt] button (hero install cards,
// CopyPrompt instances). Imported by each consumer; Astro dedupes the module.
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-copy-prompt]")) {
  button.addEventListener("click", async () => {
    const text = button.dataset.copyPrompt;
    if (!text) return;
    // The status line, when present, is the button's sibling inside its action wrapper.
    const status = button.parentElement?.querySelector<HTMLElement>("[data-copy-status]") ?? null;

    let copied = true;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      copied = false;
      // Recovery path: select the adjacent code text so the user can just ⌘C.
      const code = button.parentElement?.parentElement?.querySelector("code") ?? null;
      if (code) {
        const range = document.createRange();
        range.selectNodeContents(code);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    }

    if (status) {
      status.textContent = copied ? "Copied" : "Copy failed — text selected, press ⌘C";
      window.setTimeout(() => {
        status.textContent = "";
      }, 2500);
    } else {
      const original = button.textContent;
      button.textContent = copied ? "Copied" : "Selected — press ⌘C";
      window.setTimeout(() => {
        button.textContent = original;
      }, 2500);
    }
  });
}
