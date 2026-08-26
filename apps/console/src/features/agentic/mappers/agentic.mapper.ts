// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { AgenticTaskDetail, AgenticTaskOverview, AgenticTaskPage } from "../types/agentic.types";
export const mapAgenticOverview = (value: AgenticTaskOverview): AgenticTaskOverview => ({ ...value, counts: { ...value.counts } });
export const mapAgenticTaskPage = (value: AgenticTaskPage): AgenticTaskPage => ({ ...value, items: value.items.map((item) => ({ ...item })) });
export const mapAgenticTaskDetail = (value: AgenticTaskDetail): AgenticTaskDetail => ({ ...value, task: { ...value.task }, subtasks: value.subtasks.map((item) => ({ ...item })), dependencies: value.dependencies.map((item) => ({ ...item })) });
