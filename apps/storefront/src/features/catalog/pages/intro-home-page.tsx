// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { StaticHomepageExperience } from "../components/homepage-experience/static-homepage-experience";
import {
  useHomepageCatalog,
  type HomepageCatalogReader,
} from "../hooks/use-homepage-catalog";

export function IntroHomePage({
  api,
  apiBaseUrl,
}: {
  readonly api: HomepageCatalogReader;
  readonly apiBaseUrl: string;
}) {
  const catalog = useHomepageCatalog(api);
  return (
    <main id="main-content" className="intro-home-page">
      <StaticHomepageExperience catalog={catalog} apiBaseUrl={apiBaseUrl} />
    </main>
  );
}
