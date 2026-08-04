// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { ShieldCheck } from "lucide-react";

interface GuardrailListProps {
  readonly guardrails: readonly string[];
}

export function GuardrailList({ guardrails }: GuardrailListProps) {
  return (
    <article className="widePanel">
      <div className="sectionTitle">
        <ShieldCheck aria-hidden="true" size={18} />
        Guardrail gates
      </div>
      <ul>
        {guardrails.map((guardrail) => (
          <li key={guardrail}>{guardrail}</li>
        ))}
      </ul>
    </article>
  );
}
