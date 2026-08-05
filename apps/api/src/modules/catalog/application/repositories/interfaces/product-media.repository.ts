// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../../shared/database/transaction";
import type { ProductMedia } from "../../../domain/entities/product-media";

export interface ProductMediaRepository {
  listByProduct(session: DatabaseSession, productId: string): Promise<readonly ProductMedia[]>;
  findById(session: DatabaseSession, id: string): Promise<ProductMedia | undefined>;
  create(session: DatabaseSession, media: ProductMedia): Promise<void>;
  update(session: DatabaseSession, media: ProductMedia): Promise<boolean>;
  delete(session: DatabaseSession, id: string): Promise<boolean>;
}
