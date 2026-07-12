/* Plausible Analytics — shared by the custom layout (Site.astro) and the
   Starlight Head override. Localhost is ignored by default. */
import { init, track } from "@plausible-analytics/tracker";

init({
  domain: "fastagent.sh",
  outboundLinks: true, // the site's main conversions (GitHub, npm) are outbound
});

// Broken-link radar: the 404 page (marked by StarlightHead) reports the missed path.
if (document.querySelector('meta[name="fastagent-404"]')) {
  track("404", { props: { path: location.pathname }, interactive: false });
}
