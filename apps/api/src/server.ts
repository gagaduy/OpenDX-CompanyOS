// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { createApiApp } from "./app";

const port = Number.parseInt(process.env.PORT ?? "4000", 10);
const app = createApiApp();

app.listen(port, () => {
  console.log(`OpenDX API listening on http://localhost:${port}`);
});
