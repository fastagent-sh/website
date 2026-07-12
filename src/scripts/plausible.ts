/* Plausible Analytics — shared by the custom layout (Site.astro) and the
   Starlight Head override. Localhost is ignored by default. */
import { init } from "@plausible-analytics/tracker";

init({
  domain: "fastagent.sh",
  outboundLinks: true, // the site's main conversions (GitHub, npm) are outbound
});
