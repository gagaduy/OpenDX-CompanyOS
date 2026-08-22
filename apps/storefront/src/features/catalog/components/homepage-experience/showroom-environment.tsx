// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type {} from "@react-three/fiber";
import type { ExperienceBudget } from "../../lib/homepage-quality";

export function ShowroomEnvironment({
  theme,
  budget,
}: {
  readonly theme: "dark" | "light";
  readonly budget: ExperienceBudget;
}) {
  const dark = theme === "dark";
  return (
    <>
      <color attach="background" args={[dark ? "#010102" : "#f4f5f6"]} />
      <ambientLight intensity={dark ? 0.55 : 1.15} />
      <directionalLight
        castShadow={budget.shadows}
        color={dark ? "#d9e8ff" : "#ffffff"}
        intensity={dark ? 2.1 : 2.6}
        position={[4, 6, 5]}
      />
      <pointLight
        color={dark ? "#5e6ad2" : "#b8c0ff"}
        intensity={dark ? 15 : 5}
        position={[-4, 1, 2]}
      />
      <pointLight
        color={dark ? "#58c7d9" : "#ffffff"}
        intensity={dark ? 8 : 3}
        position={[4, -2, 1]}
      />
    </>
  );
}
