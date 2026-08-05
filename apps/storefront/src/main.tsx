// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/app";
import { parseStorefrontEnvironment } from "./app/environment";
import "./shared/styles/globals.css";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("Unable to start the storefront: root element is missing.");
}

createRoot(rootElement).render(
  <StrictMode>
    <App environment={parseStorefrontEnvironment(import.meta.env)} />
  </StrictMode>,
);
