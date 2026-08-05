// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CartResolutionDialog } from "../components/cart-resolution-dialog";
describe("cart resolution", () => { it("offers every explicit resolution action", async () => { const onResolve = vi.fn(); render(<CartResolutionDialog busy={false} onResolve={onResolve} />); for (const [label, action] of [["Giữ giỏ đã lưu","keep_saved"],["Giữ giỏ hiện tại","keep_guest"],["Gộp hai giỏ","merge"]] as const) { await userEvent.click(screen.getByRole("button", { name: label })); expect(onResolve).toHaveBeenLastCalledWith(action); } }); });
