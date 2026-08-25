// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Component, type ErrorInfo, type ReactNode } from "react";

export class ExperienceErrorBoundary extends Component<
  {
    readonly children: ReactNode;
    readonly onFatalError: () => void;
  },
  { readonly failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    this.props.onFatalError();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
