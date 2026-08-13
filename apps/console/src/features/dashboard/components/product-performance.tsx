// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { formatVnd } from "../../../shared/format/currency";
import type { ProductReportView } from "../types/dashboard.types";

export function ProductPerformance({products}:{readonly products:ProductReportView}){return <section className="detailCard dashboardProductPerformance"><h2>Product performance</h2>{products.items.length===0?<p>No paid products in this range.</p>:<div className="tableViewport"><table className="operationsTable" aria-label="Product performance"><thead><tr><th>Product</th><th>SKU</th><th>Quantity</th><th>Revenue</th></tr></thead><tbody>{products.items.map(item=><tr key={item.sku}><td>{item.productTitle}</td><td>{item.sku}</td><td>{item.quantitySold}</td><td>{formatVnd(item.paidRevenueVnd)}</td></tr>)}</tbody></table></div>}<p className="subtleText">Inventory: {products.inventory.available} available · {products.inventory.soldOutCount} sold out</p></section>;}
