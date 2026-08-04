// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { RequestHandler } from "express";
import type { ICompanyOperatingCoreService } from "../../application/services/interfaces/company-operating-core.service";

export class CompanyOperatingCoreController {
  constructor(private readonly service: ICompanyOperatingCoreService) {}

  readonly getSnapshot: RequestHandler = async (_request, response) => {
    response.json(await this.service.getSnapshot());
  };

  readonly listDepartments: RequestHandler = async (_request, response) => {
    response.json({ data: await this.service.listDepartments() });
  };

  readonly listTasks: RequestHandler = async (_request, response) => {
    response.json({ data: await this.service.listTasks() });
  };

  readonly listEvents: RequestHandler = async (_request, response) => {
    response.json({ data: await this.service.listEvents() });
  };

  readonly listApprovals: RequestHandler = async (_request, response) => {
    response.json({ data: await this.service.listApprovals() });
  };
}
