/**
 * MDX globals registry — components available inside MDX without `import`.
 * Wired via `<Content components={components} />` in `[...slug].astro`.
 * Add new components here as you build (or install) them.
 *
 * <Render> and the `partials` collection it reads are not installed: the docs
 * under /docs/ are copied verbatim from vendor/fastagent, which has no
 * partials to include. `nimbus-docs add` brings it back if that changes.
 */

import { Aside } from "./components/ui/aside";
import { Card } from "./components/ui/card";
import { CardGrid } from "./components/ui/card-grid";
import { PackageManagers } from "./components/ui/package-managers";
import { Step, Steps } from "./components/ui/steps";
import { Tabs, TabItem } from "./components/ui/tabs";

export const components = {
  Aside,
  Card,
  CardGrid,
  PackageManagers,
  Step,
  Steps,
  TabItem,
  Tabs,
};
