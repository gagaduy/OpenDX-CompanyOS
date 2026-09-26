// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  DatabaseSession,
  TransactionRunner,
} from "../../../../shared/database/transaction";

const DAY_MS = 86_400_000;
const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1_000;
const SUCCESSFUL_ORDER_STATUSES = new Set([
  "paid",
  "processing",
  "ready_for_fulfillment",
  "completed",
]);
const OUTCOMES = [
  ["completed", "paid"],
  ["paid", "paid"],
  ["processing", "paid"],
  ["ready_for_fulfillment", "paid"],
  ["paid", "paid"],
  ["completed", "paid"],
  ["processing", "paid"],
  ["pending_payment", "pending_provider"],
  ["canceled", "canceled"],
  ["expired", "expired"],
] as const;

export const DASHBOARD_DEMO_COUNTS = {
  customers: 40,
  currentOrders: 120,
  previousOrders: 80,
} as const;

interface PublishedVariant {
  readonly id: string;
  readonly sku: string;
  readonly productTitle: string;
  readonly variantLabel: string;
  readonly unitPriceVnd: number;
}

interface DemoWindows {
  readonly currentStart: Date;
  readonly currentEnd: Date;
  readonly previousStart: Date;
}

export async function seedDashboardDemo(
  transactions: TransactionRunner,
  now: () => Date = () => new Date(),
): Promise<void> {
  const windows = resolveVietnamDemoWindows(now());
  await transactions.run(async (session) => {
    const variants = await loadPublishedVariants(session, windows.currentEnd);
    if (variants.length === 0) {
      throw new Error("Dashboard demo seed requires a published priced Catalog variant");
    }
    await upsertCustomers(session, windows);
    await upsertOrders(session, variants, windows);
  });
}

async function loadPublishedVariants(
  session: DatabaseSession,
  at: Date,
): Promise<readonly PublishedVariant[]> {
  const result = await session.query<{
    id: string;
    sku: string;
    product_title: string;
    variant_label: string;
    unit_price_vnd: string;
  }>(
    `SELECT v.id::text, v.sku, p.name AS product_title,
            v.title AS variant_label, price.amount_minor::text AS unit_price_vnd
     FROM product_variants v
     JOIN products p ON p.id = v.product_id
     JOIN LATERAL (
       SELECT amount_minor
       FROM product_prices
       WHERE variant_id = v.id AND currency = 'VND'
         AND valid_from <= $1 AND (valid_to IS NULL OR valid_to > $1)
       ORDER BY valid_from DESC, id DESC
       LIMIT 1
     ) price ON true
     WHERE p.status = 'published' AND v.status = 'active'
       AND price.amount_minor BETWEEN 1 AND 9007199254740991
     ORDER BY v.sku`,
    [at.toISOString()],
  );
  return result.rows.map((row) => ({
    id: row.id,
    sku: row.sku,
    productTitle: row.product_title,
    variantLabel: row.variant_label,
    unitPriceVnd: parseSafePositiveInteger(row.unit_price_vnd),
  }));
}

interface DemoCustomerProfile {
  readonly fullName: string;
  readonly email: string;
  readonly phoneNumber: string;
  readonly addressLine: string;
  readonly ward: string;
  readonly provinceOrCity: string;
}

const VIETNAM_CUSTOMERS: readonly DemoCustomerProfile[] = [
  { fullName: "Nguyễn Văn An", email: "an.nguyen92@gmail.com", phoneNumber: "0912345678", addressLine: "28 Phố Huế", ward: "Hàng Bài", provinceOrCity: "Hà Nội" },
  { fullName: "Trần Thị Mai", email: "mai.tran.hcm@gmail.com", phoneNumber: "0987654321", addressLine: "142 Nguyễn Thị Minh Khai", ward: "Võ Thị Sáu", provinceOrCity: "TP. Hồ Chí Minh" },
  { fullName: "Lê Hoàng Nam", email: "nam.le.dn@gmail.com", phoneNumber: "0903112233", addressLine: "76 Bạch Đằng", ward: "Hải Châu 1", provinceOrCity: "Đà Nẵng" },
  { fullName: "Phạm Thuỳ Dương", email: "duong.pham.art@gmail.com", phoneNumber: "0938445566", addressLine: "89 Hai Bà Trưng", ward: "Bến Nghé", provinceOrCity: "TP. Hồ Chí Minh" },
  { fullName: "Vũ Đình Trọng", email: "trong.vu.tech@gmail.com", phoneNumber: "0976554433", addressLine: "54 Lý Thường Kiệt", ward: "Trần Hưng Đạo", provinceOrCity: "Hà Nội" },
  { fullName: "Hoàng Kim Ngân", email: "ngan.hoang.mkt@gmail.com", phoneNumber: "0988776655", addressLine: "123 Điện Biên Phủ", ward: "Đa Kao", provinceOrCity: "TP. Hồ Chí Minh" },
  { fullName: "Đỗ Minh Tuấn", email: "tuan.do.hn@gmail.com", phoneNumber: "0918223344", addressLine: "35 Tràng Thi", ward: "Hàng Trống", provinceOrCity: "Hà Nội" },
  { fullName: "Bùi Thị Bích", email: "bich.bui.bd@gmail.com", phoneNumber: "0945112233", addressLine: "21 Đại lộ Bình Dương", ward: "Phú Hòa", provinceOrCity: "Bình Dương" },
  { fullName: "Ngô Quang Huy", email: "huy.ngo.design@gmail.com", phoneNumber: "0932889900", addressLine: "168 Nguyễn Văn Linh", ward: "Nam Dương", provinceOrCity: "Đà Nẵng" },
  { fullName: "Đặng Thuỳ Linh", email: "linh.dang.sales@gmail.com", phoneNumber: "0909334455", addressLine: "45 Lê Lợi", ward: "Bến Nghé", provinceOrCity: "TP. Hồ Chí Minh" },
  { fullName: "Trịnh Xuân Bách", email: "bach.trinh.dev@gmail.com", phoneNumber: "0963221100", addressLine: "18 Hoàng Diệu", ward: "Quán Thánh", provinceOrCity: "Hà Nội" },
  { fullName: "Mai Phương Thảo", email: "thao.mai.hr@gmail.com", phoneNumber: "0977665544", addressLine: "67 Pasteur", ward: "Bến Nghé", provinceOrCity: "TP. Hồ Chí Minh" },
  { fullName: "Lương Quốc Bảo", email: "bao.luong.fin@gmail.com", phoneNumber: "0915443322", addressLine: "92 Trần Phú", ward: "Hải Châu 1", provinceOrCity: "Đà Nẵng" },
  { fullName: "Đinh Hoài Phương", email: "phuong.dinh.pr@gmail.com", phoneNumber: "0934112299", addressLine: "15 Cầu Giấy", ward: "Quan Hoa", provinceOrCity: "Hà Nội" },
  { fullName: "Hồ Minh Quân", email: "quan.ho.media@gmail.com", phoneNumber: "0982556677", addressLine: "205 Nam Kỳ Khởi Nghĩa", ward: "Võ Thị Sáu", provinceOrCity: "TP. Hồ Chí Minh" },
  { fullName: "Dương Ngọc Ánh", email: "anh.duong.ops@gmail.com", phoneNumber: "0906778899", addressLine: "33 Hùng Vương", ward: "Hải Châu 2", provinceOrCity: "Đà Nẵng" },
  { fullName: "Lý Gia Kiệt", email: "kiet.ly.tech@gmail.com", phoneNumber: "0944113355", addressLine: "88 Trần Duy Hưng", ward: "Trung Hoà", provinceOrCity: "Hà Nội" },
  { fullName: "Võ Thanh Hà", email: "ha.vo.cskh@gmail.com", phoneNumber: "0979224466", addressLine: "12 Võ Văn Kiệt", ward: "Nguyễn Thái Bình", provinceOrCity: "TP. Hồ Chí Minh" },
  { fullName: "Tạ Đức Cường", email: "cuong.ta.auto@gmail.com", phoneNumber: "0917335577", addressLine: "105 Bà Triệu", ward: "Hàng Bài", provinceOrCity: "Hà Nội" },
  { fullName: "Nguyễn Hải Yến", email: "yen.nguyen.law@gmail.com", phoneNumber: "0936447788", addressLine: "59 Lê Duẩn", ward: "Bến Nghé", provinceOrCity: "TP. Hồ Chí Minh" },
  { fullName: "Phan Quốc Tuấn", email: "tuan.phan.eng@gmail.com", phoneNumber: "0989332211", addressLine: "40 Quang Trung", ward: "Thạch Thang", provinceOrCity: "Đà Nẵng" },
  { fullName: "Cao Bích Ngọc", email: "ngoc.cao.edu@gmail.com", phoneNumber: "0902883344", addressLine: "74 Phố Vọng", ward: "Phương Liệt", provinceOrCity: "Hà Nội" },
  { fullName: "Đào Văn Thịnh", email: "thinh.dao.cons@gmail.com", phoneNumber: "0968114422", addressLine: "135 CMT8", ward: "Bến Thành", provinceOrCity: "TP. Hồ Chí Minh" },
  { fullName: "Châu Tuyết Mai", email: "mai.chau.retail@gmail.com", phoneNumber: "0942776611", addressLine: "27 Nguyễn Trãi", ward: "Hùng Vương", provinceOrCity: "Cần Thơ" },
  { fullName: "Hà Quang Thắng", email: "thang.ha.arch@gmail.com", phoneNumber: "0973558800", addressLine: "63 Trần Hưng Đạo", ward: "Phan Chu Trinh", provinceOrCity: "Hà Nội" },
  { fullName: "Lâm Thị Diễm", email: "diem.lam.fnb@gmail.com", phoneNumber: "0916449922", addressLine: "110 Đồng Khởi", ward: "Bến Nghé", provinceOrCity: "TP. Hồ Chí Minh" },
  { fullName: "Quách Vĩnh Khang", email: "khang.quach.ai@gmail.com", phoneNumber: "0935226688", addressLine: "50 Ngô Quyền", ward: "An Hải Bắc", provinceOrCity: "Đà Nẵng" },
  { fullName: "Thái Văn Long", email: "long.thai.log@gmail.com", phoneNumber: "0984119933", addressLine: "82 Xã Đàn", ward: "Nam Đồng", provinceOrCity: "Hà Nội" },
  { fullName: "Trương Khánh Vy", email: "vy.truong.brand@gmail.com", phoneNumber: "0908337755", addressLine: "155 Hai Bà Trưng", ward: "Võ Thị Sáu", provinceOrCity: "TP. Hồ Chí Minh" },
  { fullName: "Nghiêm Bá Đạt", email: "dat.nghiem.sec@gmail.com", phoneNumber: "0966442299", addressLine: "39 Lạch Tray", ward: "Cầu Đất", provinceOrCity: "Hải Phòng" },
  { fullName: "Lê Nhật Huy", email: "huy.le.data@gmail.com", phoneNumber: "0971885533", addressLine: "96 Kim Mã", ward: "Kim Mã", provinceOrCity: "Hà Nội" },
  { fullName: "Nguyễn Phương Uyên", email: "uyen.nguyen.mkt@gmail.com", phoneNumber: "0949336622", addressLine: "220 Lê Văn Sỹ", ward: "Huỳnh Văn Bánh", provinceOrCity: "TP. Hồ Chí Minh" },
  { fullName: "Trần Quốc Hùng", email: "hung.tran.supply@gmail.com", phoneNumber: "0919228844", addressLine: "14 Hoàng Văn Thụ", ward: "Hải Châu 1", provinceOrCity: "Đà Nẵng" },
  { fullName: "Vũ Bảo Châu", email: "chau.vu.media@gmail.com", phoneNumber: "0931557799", addressLine: "188 Thái Hà", ward: "Trung Liệt", provinceOrCity: "Hà Nội" },
  { fullName: "Phạm Minh Đức", email: "duc.pham.cloud@gmail.com", phoneNumber: "0986774411", addressLine: "300 Võ Văn Tần", ward: "Võ Thị Sáu", provinceOrCity: "TP. Hồ Chí Minh" },
  { fullName: "Đoàn Thu Hà", email: "ha.doan.health@gmail.com", phoneNumber: "0904229966", addressLine: "42 Trần Hưng Đạo", ward: "An Nghiệp", provinceOrCity: "Cần Thơ" },
  { fullName: "Lê Văn Hùng", email: "hung.le.auto@gmail.com", phoneNumber: "0962338855", addressLine: "71 Giải Phóng", ward: "Đồng Tâm", provinceOrCity: "Hà Nội" },
  { fullName: "Nguyễn Thảo My", email: "my.nguyen.fashion@gmail.com", phoneNumber: "0978116644", addressLine: "178 Huỳnh Thúc Kháng", ward: "Bến Nghé", provinceOrCity: "TP. Hồ Chí Minh" },
  { fullName: "Hoàng Gia Bảo", email: "bao.hoang.fin@gmail.com", phoneNumber: "0941882277", addressLine: "85 Lê Duẩn", ward: "Chính Gián", provinceOrCity: "Đà Nẵng" },
  { fullName: "Tạ Thị Kiều", email: "kieu.ta.hr@gmail.com", phoneNumber: "0913994488", addressLine: "55 Phố Huế", ward: "Hàng Bài", provinceOrCity: "Hà Nội" },
];

async function upsertCustomers(
  session: DatabaseSession,
  windows: DemoWindows,
): Promise<void> {
  for (let index = 0; index < DASHBOARD_DEMO_COUNTS.customers; index += 1) {
    const inCurrentPeriod = index < 24;
    const base = inCurrentPeriod ? windows.currentStart : windows.previousStart;
    const date = addMilliseconds(base, ((index * 7) % 30) * DAY_MS + 10 * 60 * 60 * 1_000);
    const sequence = index + 1;
    const profile = VIETNAM_CUSTOMERS[index % VIETNAM_CUSTOMERS.length]!;
    await session.query(
      `INSERT INTO customers
        (id,email,email_verified_at,full_name,phone_number,status,version,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,'active',1,$3,$3)
       ON CONFLICT (id) DO UPDATE SET
         email = EXCLUDED.email,
         email_verified_at = EXCLUDED.email_verified_at,
         full_name = EXCLUDED.full_name,
         phone_number = EXCLUDED.phone_number,
         status = 'active',
         version = 1,
         created_at = EXCLUDED.created_at,
         updated_at = EXCLUDED.updated_at`,
      [
        demoId("da100000", sequence),
        profile.email,
        date.toISOString(),
        profile.fullName,
        profile.phoneNumber,
      ],
    );
  }
}

async function upsertOrders(
  session: DatabaseSession,
  variants: readonly PublishedVariant[],
  windows: DemoWindows,
): Promise<void> {
  const orderCount = DASHBOARD_DEMO_COUNTS.currentOrders + DASHBOARD_DEMO_COUNTS.previousOrders;
  for (let index = 0; index < orderCount; index += 1) {
    const sequence = index + 1;
    const isCurrent = index < DASHBOARD_DEMO_COUNTS.currentOrders;
    const periodIndex = isCurrent ? index : index - DASHBOARD_DEMO_COUNTS.currentOrders;
    const periodStart = isCurrent ? windows.currentStart : windows.previousStart;
    const createdAt = addMilliseconds(
      periodStart,
      (periodIndex % 30) * DAY_MS + 12 * 60 * 60 * 1_000 + (periodIndex % 240) * 60 * 1_000,
    );
    const day = periodIndex % 30;
    const batch = Math.floor(periodIndex / 30);
    const outcomeIndex = (day + batch * 3) % OUTCOMES.length;
    const [orderStatus, paymentStatus] = OUTCOMES[outcomeIndex]!;
    const paid = SUCCESSFUL_ORDER_STATUSES.has(orderStatus);
    const paidAt = paid ? addMilliseconds(createdAt, 15 * 60 * 1_000) : undefined;
    const customerId = demoId("da100000", (index % DASHBOARD_DEMO_COUNTS.customers) + 1);
    const cartId = demoId("da200000", sequence);
    const checkoutId = demoId("da300000", sequence);
    const checkoutLineId = demoId("da310000", sequence);
    const orderId = demoId("da400000", sequence);
    const orderLineId = demoId("da500000", sequence);
    const paymentId = demoId("da600000", sequence);
    const variant = variants[index % variants.length]!;
    const quantity = (index % 3) + 1;
    const totalVnd = variant.unitPriceVnd * quantity;
    assertSafePositiveInteger(totalVnd);
    const expiresAt = addMilliseconds(createdAt, 30 * 60 * 1_000);
    const checkoutStatus = paid
      ? "completed"
      : orderStatus === "pending_payment"
        ? "order_created"
        : orderStatus;
    const customerProfile = VIETNAM_CUSTOMERS[(index % DASHBOARD_DEMO_COUNTS.customers) % VIETNAM_CUSTOMERS.length]!;
    const address = JSON.stringify({
      recipientName: customerProfile.fullName,
      phoneNumber: customerProfile.phoneNumber,
      addressLine: customerProfile.addressLine,
      ward: customerProfile.ward,
      provinceOrCity: customerProfile.provinceOrCity,
    });
    const contact = JSON.stringify({ email: customerProfile.email });

    await session.query(
      `INSERT INTO carts(id,customer_id,status,version,expires_at,created_at,updated_at)
       VALUES ($1,$2,'checkout_ready',1,$3,$4,$4)
       ON CONFLICT (id) DO UPDATE SET customer_id=EXCLUDED.customer_id,
         status='checkout_ready',version=1,expires_at=EXCLUDED.expires_at,
         created_at=EXCLUDED.created_at,updated_at=EXCLUDED.updated_at`,
      [cartId, customerId, expiresAt.toISOString(), createdAt.toISOString()],
    );
    await session.query(
      `INSERT INTO checkout_sessions
        (id,customer_id,source_cart_id,source_cart_version,address_snapshot,
         contact_snapshot,subtotal_vnd,discount_vnd,total_vnd,currency,tax_mode,
         status,idempotency_key,request_fingerprint,order_id,expires_at,
         completed_at,created_at,updated_at)
       VALUES ($1,$2,$3,1,$4::jsonb,$5::jsonb,$6,0,$6,'VND',
         'included_not_separated',$7,$8,$9,NULL,$10,$11,$12,$13)
       ON CONFLICT (id) DO UPDATE SET
         customer_id=EXCLUDED.customer_id,source_cart_id=EXCLUDED.source_cart_id,
         source_cart_version=1,address_snapshot=EXCLUDED.address_snapshot,
         contact_snapshot=EXCLUDED.contact_snapshot,subtotal_vnd=EXCLUDED.subtotal_vnd,
         discount_vnd=0,total_vnd=EXCLUDED.total_vnd,currency='VND',
         tax_mode='included_not_separated',status=EXCLUDED.status,
         idempotency_key=EXCLUDED.idempotency_key,
         request_fingerprint=EXCLUDED.request_fingerprint,order_id=NULL,
         expires_at=EXCLUDED.expires_at,completed_at=EXCLUDED.completed_at,
         created_at=EXCLUDED.created_at,updated_at=EXCLUDED.updated_at`,
      [
        checkoutId,
        customerId,
        cartId,
        address,
        contact,
        totalVnd,
        checkoutStatus,
        `dashboard-demo-checkout-${sequence}`,
        sequence.toString(16).padStart(64, "0"),
        expiresAt.toISOString(),
        paidAt?.toISOString() ?? null,
        createdAt.toISOString(),
        (paidAt ?? createdAt).toISOString(),
      ],
    );
    await session.query(
      `INSERT INTO checkout_session_lines
        (id,checkout_id,variant_id,sku,product_title,variant_label,quantity,
         unit_price_vnd,line_subtotal_vnd,line_position)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0)
       ON CONFLICT (id) DO UPDATE SET checkout_id=EXCLUDED.checkout_id,
         variant_id=EXCLUDED.variant_id,sku=EXCLUDED.sku,
         product_title=EXCLUDED.product_title,variant_label=EXCLUDED.variant_label,
         quantity=EXCLUDED.quantity,unit_price_vnd=EXCLUDED.unit_price_vnd,
         line_subtotal_vnd=EXCLUDED.line_subtotal_vnd,line_position=0`,
      [checkoutLineId, checkoutId, variant.id, variant.sku, variant.productTitle,
        variant.variantLabel, quantity, variant.unitPriceVnd, totalVnd],
    );
    await session.query(
      `INSERT INTO orders
        (id,public_number,customer_id,checkout_id,address_snapshot,contact_snapshot,
         subtotal_vnd,discount_vnd,total_vnd,currency,tax_mode,status,
         reservation_expires_at,paid_at,completed_at,version,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,0,$7,'VND',
         'included_not_separated',$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (id) DO UPDATE SET public_number=EXCLUDED.public_number,
         customer_id=EXCLUDED.customer_id,checkout_id=EXCLUDED.checkout_id,
         address_snapshot=EXCLUDED.address_snapshot,contact_snapshot=EXCLUDED.contact_snapshot,
         subtotal_vnd=EXCLUDED.subtotal_vnd,discount_vnd=0,total_vnd=EXCLUDED.total_vnd,
         currency='VND',tax_mode='included_not_separated',status=EXCLUDED.status,
         reservation_expires_at=EXCLUDED.reservation_expires_at,paid_at=EXCLUDED.paid_at,
         completed_at=EXCLUDED.completed_at,version=EXCLUDED.version,
         created_at=EXCLUDED.created_at,updated_at=EXCLUDED.updated_at`,
      [
        orderId,
        publicOrderNumber(createdAt, sequence),
        customerId,
        checkoutId,
        address,
        contact,
        totalVnd,
        orderStatus,
        expiresAt.toISOString(),
        paidAt?.toISOString() ?? null,
        orderStatus === "completed" ? paidAt?.toISOString() : null,
        paid ? 2 : 1,
        createdAt.toISOString(),
        (paidAt ?? createdAt).toISOString(),
      ],
    );
    await session.query(
      "UPDATE checkout_sessions SET order_id=$2 WHERE id=$1",
      [checkoutId, orderId],
    );
    await session.query(
      `INSERT INTO order_lines
        (id,order_id,variant_id,sku,product_title,variant_label,quantity,
         unit_price_vnd,discount_allocation_vnd,line_total_vnd,line_position)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,$9,0)
       ON CONFLICT (id) DO UPDATE SET order_id=EXCLUDED.order_id,
         variant_id=EXCLUDED.variant_id,sku=EXCLUDED.sku,
         product_title=EXCLUDED.product_title,variant_label=EXCLUDED.variant_label,
         quantity=EXCLUDED.quantity,unit_price_vnd=EXCLUDED.unit_price_vnd,
         discount_allocation_vnd=0,line_total_vnd=EXCLUDED.line_total_vnd,
         line_position=0`,
      [orderLineId, orderId, variant.id, variant.sku, variant.productTitle,
        variant.variantLabel, quantity, variant.unitPriceVnd, totalVnd],
    );
    await session.query(
      `INSERT INTO payments
        (id,order_id,provider,expected_amount_vnd,currency,status,paid_at,version,
         created_at,updated_at)
       VALUES ($1,$2,'sepay',$3,'VND',$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET order_id=EXCLUDED.order_id,provider='sepay',
         expected_amount_vnd=EXCLUDED.expected_amount_vnd,currency='VND',
         status=EXCLUDED.status,paid_at=EXCLUDED.paid_at,version=EXCLUDED.version,
         created_at=EXCLUDED.created_at,updated_at=EXCLUDED.updated_at`,
      [paymentId, orderId, totalVnd, paymentStatus, paidAt?.toISOString() ?? null,
        paid ? 2 : 1, createdAt.toISOString(), (paidAt ?? createdAt).toISOString()],
    );
  }
}

function resolveVietnamDemoWindows(now: Date): DemoWindows {
  if (Number.isNaN(now.getTime())) throw new Error("Dashboard demo seed requires a valid clock");
  const localDate = new Date(now.getTime() + VIETNAM_OFFSET_MS).toISOString().slice(0, 10);
  const currentEnd = new Date(Date.parse(`${localDate}T00:00:00.000Z`) - VIETNAM_OFFSET_MS + DAY_MS);
  return {
    currentEnd,
    currentStart: addMilliseconds(currentEnd, -30 * DAY_MS),
    previousStart: addMilliseconds(currentEnd, -60 * DAY_MS),
  };
}

function demoId(prefix: string, sequence: number): string {
  return `${prefix}-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
}

function publicOrderNumber(createdAt: Date, sequence: number): string {
  const localDate = new Date(createdAt.getTime() + VIETNAM_OFFSET_MS)
    .toISOString()
    .slice(0, 10)
    .replaceAll("-", "");
  return `NVC-${localDate}-${sequence.toString(16).toUpperCase().padStart(8, "0")}`;
}

function addMilliseconds(date: Date, milliseconds: number): Date {
  return new Date(date.getTime() + milliseconds);
}

function parseSafePositiveInteger(value: string): number {
  const parsed = Number(value);
  assertSafePositiveInteger(parsed);
  return parsed;
}

function assertSafePositiveInteger(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Unsafe dashboard demo amount: ${value}`);
  }
}
