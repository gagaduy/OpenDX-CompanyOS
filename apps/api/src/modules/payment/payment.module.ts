// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { TransactionRunner } from "../../shared/database/transaction";
import { PaymentService } from "./application/services/implementations/payment.service";
import type { PaymentGateway } from "./application/providers/payment-gateway";
import { PostgresqlPaymentRepository } from "./infrastructure/repositories/implementations/postgresql-payment.repository";

export interface PaymentModuleDependencies {
  readonly transactions: TransactionRunner;
  readonly gateway: PaymentGateway;
  readonly generateId: () => string;
  readonly now: () => string;
}

export function createPaymentModule(dependencies: PaymentModuleDependencies) {
  const service = new PaymentService(
    new PostgresqlPaymentRepository(),
    dependencies.transactions,
    dependencies.gateway,
    dependencies.generateId,
    dependencies.now,
  );
  return { checkout: service };
}
