/* Plausible Analytics — shared by both shells: Site.astro (landing, blog) and
   BaseLayout.astro (docs). Localhost is ignored by default. */
import { init, track } from "@plausible-analytics/tracker";

init({
  domain: "fastagent.sh",
  outboundLinks: true, // the site's main conversions (GitHub, npm) are outbound
});

// Broken-link radar: the 404 page (which marks itself) reports the missed path.
if (document.querySelector('meta[name="fastagent-404"]')) {
  track("404", { props: { path: location.pathname }, interactive: false });
}
