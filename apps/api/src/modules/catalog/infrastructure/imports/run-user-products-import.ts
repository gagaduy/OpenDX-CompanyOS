// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { Client } from "minio";
import pg from "pg";

const { Pool } = pg;

const MINIO_BUCKET = "product-media";

const CATEGORIES = {
  laptops: "10000000-0000-4000-8000-000000000001",
  phones: "10000000-0000-4000-8000-000000000002",
  tablets: "10000000-0000-4000-8000-000000000003",
  smartWatches: "10000000-0000-4000-8000-000000000004",
  computerComponents: "10000000-0000-4000-8000-000000000005",
  accessories: "10000000-0000-4000-8000-000000000006",
};

interface ImportProductDef {
  readonly imagePath: string;
  readonly name: string;
  readonly slug: string;
  readonly categoryId: string;
  readonly brand: string;
  readonly description: string;
  readonly sku: string;
  readonly variantTitle: string;
  readonly optionValues: Record<string, string>;
  readonly price: number;
  readonly stock: number;
}

const productsToImport: readonly ImportProductDef[] = [
  // ==========================================
  // BATCH 1 (20 products previously imported)
  // ==========================================
  {
    imagePath: "1.png",
    name: "Laptop Gaming Nova Raider 16 RGB",
    slug: "laptop-gaming-nova-raider-16-rgb",
    categoryId: CATEGORIES.laptops,
    brand: "Nova Gaming",
    description: "Laptop gaming hiệu năng đỉnh cao với màn hình 16 inch 240Hz, bộ xử lý đa nhân mạnh mẽ và tản nhiệt buồng hơi tân tiến.",
    sku: "LAP-RAIDER16-01",
    variantTitle: "Core i7 / RTX 4070 / 16GB / 1TB",
    optionValues: { specs: "Core i7 / RTX 4070 / 16GB / 1TB" },
    price: 38_990_000,
    stock: 20,
  },
  {
    imagePath: "unnamed (2).png",
    name: "Nova SlimBook Air M3 Ultra",
    slug: "nova-slimbook-air-m3-ultra",
    categoryId: CATEGORIES.laptops,
    brand: "Nova",
    description: "Thiết kế siêu mỏng nhẹ thời thượng, thời lượng pin cả ngày dài và màn hình Liquid Retina sắc nét cho hiệu suất công việc di động.",
    sku: "LAP-SLIM-M3-01",
    variantTitle: "16GB / 512GB SSD",
    optionValues: { specs: "16GB / 512GB SSD" },
    price: 26_490_000,
    stock: 35,
  },
  {
    imagePath: "unnamed (37).png",
    name: "Nova CreatorBook Pro 16 4K OLED",
    slug: "nova-creatorbook-pro-16-4k-oled",
    categoryId: CATEGORIES.laptops,
    brand: "Nova",
    description: "Trạm làm việc di động chuyên dụng cho đồ họa và dựng phim với tấm nền chuẩn màu 4K OLED và card đồ họa chuyên nghiệp.",
    sku: "LAP-CREATOR16-01",
    variantTitle: "32GB / 1TB SSD / 4K OLED",
    optionValues: { specs: "32GB / 1TB SSD / 4K OLED" },
    price: 42_990_000,
    stock: 15,
  },
  {
    imagePath: "unnamed (1).png",
    name: "Nova Phone Ultra 5G Cyber Blue",
    slug: "nova-phone-ultra-5g-cyber-blue",
    categoryId: CATEGORIES.phones,
    brand: "Nova",
    description: "Điện thoại flagship với camera tiềm vọng 100x zoom, màn hình AMOLED cong 120Hz và chip xử lý thế hệ mới nhất.",
    sku: "PHO-ULTRA5G-256",
    variantTitle: "Cyber Blue / 256GB",
    optionValues: { color: "Cyber Blue", storage: "256GB" },
    price: 21_990_000,
    stock: 40,
  },
  {
    imagePath: "unnamed (25).png",
    name: "Nova Apex Gaming Phone 144Hz",
    slug: "nova-apex-gaming-phone-144hz",
    categoryId: CATEGORIES.phones,
    brand: "Nova Gaming",
    description: "Điện thoại chuyên game tích hợp nút cảm ứng siêu nhạy, tản nhiệt chất lỏng chủ động và pin khủng sạc siêu tốc 120W.",
    sku: "PHO-APEX-512",
    variantTitle: "Phantom Black / 512GB",
    optionValues: { color: "Phantom Black", storage: "512GB" },
    price: 18_500_000,
    stock: 25,
  },
  {
    imagePath: "unnamed (30).png",
    name: "Nova Horizon Pro 5G OLED",
    slug: "nova-horizon-pro-5g-oled",
    categoryId: CATEGORIES.phones,
    brand: "Nova",
    description: "Thiết kế viền siêu mỏng vô cực, cụm camera AI studio chụp đêm xuất sắc cùng khả năng quay video 8K HDR chân thực.",
    sku: "PHO-HORIZON-256",
    variantTitle: "Space Black / 256GB",
    optionValues: { color: "Space Black", storage: "256GB" },
    price: 16_990_000,
    stock: 30,
  },
  {
    imagePath: "unnamed.png",
    name: "Nova Phone Pro Max Gold Edition",
    slug: "nova-phone-pro-max-gold-edition",
    categoryId: CATEGORIES.phones,
    brand: "Nova",
    description: "Phiên bản mạ vàng sang trọng đẳng cấp với khung viền titan siêu bền và hệ thống 3 ống kính chuẩn rạp chiếu phim.",
    sku: "PHO-MAXGOLD-512",
    variantTitle: "Imperial Gold / 512GB",
    optionValues: { color: "Imperial Gold", storage: "512GB" },
    price: 31_990_000,
    stock: 20,
  },
  {
    imagePath: "unnamed (10).png",
    name: "Nova Pad Pro 11 inch Retina",
    slug: "nova-pad-pro-11-inch-retina",
    categoryId: CATEGORIES.tablets,
    brand: "Nova",
    description: "Máy tính bảng hiệu năng cao dành cho sáng tạo, vẽ kỹ thuật số và giải trí đa phương tiện với âm thanh vòm 4 loa.",
    sku: "TAB-PRO11-128",
    variantTitle: "Wi-Fi / 128GB",
    optionValues: { connectivity: "Wi-Fi", storage: "128GB" },
    price: 14_490_000,
    stock: 30,
  },
  {
    imagePath: "unnamed (35).png",
    name: "Nova Studio Pad 12.9 inch Folio & Stylus",
    slug: "nova-studio-pad-129-folio-stylus",
    categoryId: CATEGORIES.tablets,
    brand: "Nova",
    description: "Bộ sản phẩm máy tính bảng kèm bút cảm ứng lực và bao da bàn phím thông minh, thay thế hoàn toàn sổ tay và laptop nhẹ.",
    sku: "TAB-STUDIO129-256",
    variantTitle: "Wi-Fi + 5G / 256GB kèm Pen & Keyboard",
    optionValues: { bundle: "Full Kit", storage: "256GB" },
    price: 23_890_000,
    stock: 20,
  },
  {
    imagePath: "unnamed (3).png",
    name: "Bo Mạch Chủ Nova Z790 Gaming Carbon WiFi",
    slug: "bo-mach-chu-nova-z790-gaming-carbon-wifi",
    categoryId: CATEGORIES.computerComponents,
    brand: "Nova",
    description: "Bo mạch chủ Intel Z790 hỗ trợ socket LGA1700, DDR5 ép xung cao cấp, PCIe 5.0 và kết nối WiFi 7 tốc độ cao.",
    sku: "MB-Z790-CARBON",
    variantTitle: "ATX / DDR5 / PCIe 5.0",
    optionValues: { form_factor: "ATX" },
    price: 8_490_000,
    stock: 25,
  },
  {
    imagePath: "unnamed (12).png",
    name: "Card Đồ Họa Nova RTX 4080 Super OC 16GB",
    slug: "card-do-hoa-nova-rtx-4080-super-oc-16gb",
    categoryId: CATEGORIES.computerComponents,
    brand: "Nova",
    description: "Card màn hình đồ họa 16GB GDDR6X với 3 quạt làm mát bạc đạn kép, công nghệ dò tia Ray Tracing và DLSS 3.5 đỉnh cao.",
    sku: "GPU-RTX4080S-16G",
    variantTitle: "16GB GDDR6X Triple Fan",
    optionValues: { memory: "16GB" },
    price: 29_990_000,
    stock: 15,
  },
  {
    imagePath: "unnamed (13).png",
    name: "Bộ Vi Xử Lý Nova Core i9-14900K 24 Nhân",
    slug: "bo-vi-xu-ly-nova-core-i9-14900k-24-nhan",
    categoryId: CATEGORIES.computerComponents,
    brand: "Intel",
    description: "CPU hàng đầu dành cho máy trạm và game thủ với xung nhịp tối đa lên tới 6.0 GHz, 24 nhân 32 luồng xử lý mượt mà.",
    sku: "CPU-I9-14900K",
    variantTitle: "Box Chính Hãng 24 Cores",
    optionValues: { package: "Box Chính Hãng" },
    price: 14_990_000,
    stock: 30,
  },
  {
    imagePath: "unnamed (15).png",
    name: "RAM Nova Fury Beast RGB 32GB DDR5 6000MHz",
    slug: "ram-nova-fury-beast-rgb-32gb-ddr5-6000mhz",
    categoryId: CATEGORIES.computerComponents,
    brand: "Nova",
    description: "Bộ nhớ RAM DDR5 tốc độ cao 6000MHz với dải LED RGB đồng bộ rực rỡ và thanh tản nhiệt nhôm tản nhiệt tối ưu.",
    sku: "RAM-FURY-32G-DDR5",
    variantTitle: "Kit 32GB (2x16GB) 6000MHz",
    optionValues: { capacity: "32GB (2x16GB)" },
    price: 3_490_000,
    stock: 50,
  },
  {
    imagePath: "unnamed (16).png",
    name: "Nguồn Máy Tính Nova Thor 850W Platinum",
    slug: "nguon-may-tinh-nova-thor-850w-platinum",
    categoryId: CATEGORIES.computerComponents,
    brand: "Nova",
    description: "Nguồn máy tính full modular chuẩn 80 Plus Platinum, tích hợp màn hình OLED hiển thị điện năng tiêu thụ thời gian thực.",
    sku: "PSU-THOR-850W",
    variantTitle: "850W Full Modular Platinum",
    optionValues: { power: "850W" },
    price: 4_690_000,
    stock: 25,
  },
  {
    imagePath: "unnamed (34).png",
    name: "Thùng Case Nova Crystal Panoramic RGB",
    slug: "thung-case-nova-crystal-panoramic-rgb",
    categoryId: CATEGORIES.computerComponents,
    brand: "Nova",
    description: "Vỏ thùng máy tính bể cá kính cường lực góc cong không cột chắn, kèm 6 quạt ARGB cao cấp và luồng gió tản nhiệt đối lưu.",
    sku: "CASE-CRYSTAL-RGB",
    variantTitle: "Mid-Tower Black kèm 6 Fan RGB",
    optionValues: { color: "Black" },
    price: 2_790_000,
    stock: 30,
  },
  {
    imagePath: "unnamed (32).png",
    name: "Màn Hình Cong Nova Gaming 34 inch WQHD 165Hz",
    slug: "man-hinh-cong-nova-gaming-34-inch-wqhd-165hz",
    categoryId: CATEGORIES.accessories,
    brand: "Nova",
    description: "Màn hình cong tỷ lệ vàng 21:9 WQHD siêu rộng 34 inch tần số quét 165Hz và thời gian phản hồi 1ms cho trải nghiệm đắm chìm.",
    sku: "MON-CURVED-34",
    variantTitle: "34 inch / WQHD / 165Hz",
    optionValues: { size: "34 inch" },
    price: 11_990_000,
    stock: 20,
  },
  {
    imagePath: "unnamed (29).png",
    name: "Tai Nghe Gaming Nova SoundStream Pro RGB",
    slug: "tai-nghe-gaming-nova-soundstream-pro-rgb",
    categoryId: CATEGORIES.accessories,
    brand: "Nova",
    description: "Tai nghe không dây độ trễ cực thấp với công nghệ âm thanh vòm 7.1 không gian, mic đàm thoại chống ồn AI và đế sạc LED RGB.",
    sku: "EAR-SOUNDSTREAM-PRO",
    variantTitle: "Wireless 2.4GHz + Bluetooth",
    optionValues: { color: "Midnight Blue" },
    price: 2_990_000,
    stock: 40,
  },
  {
    imagePath: "unnamed (41).png",
    name: "Bàn Phím Cơ Không Dây Nova Strike Pro RGB TKL",
    slug: "ban-phim-co-khong-day-nova-strike-pro-rgb-tkl",
    categoryId: CATEGORIES.accessories,
    brand: "Nova",
    description: "Bàn phím cơ layout Tenkeyless gọn gàng, switch bôi trơn sẵn mượt mà, kết nối 3 chế độ (Type-C, 2.4G, Bluetooth 5.2).",
    sku: "KB-STRIKE-TKL-RED",
    variantTitle: "TKL 87 Phím / Red Linear Switch",
    optionValues: { switch: "Red Linear" },
    price: 2_190_000,
    stock: 35,
  },
  {
    imagePath: "unnamed (36).png",
    name: "Chuột Gaming Không Dây Nova HyperSpeed Ergonomic",
    slug: "chuot-gaming-khong-day-nova-hyperspeed-ergo",
    categoryId: CATEGORIES.accessories,
    brand: "Nova",
    description: "Chuột không dây công thái học chống mỏi tay, mắt đọc quang học 26.000 DPI siêu chuẩn xác và trọng lượng siêu nhẹ 59g.",
    sku: "MOU-HYPERSPEED-BLK",
    variantTitle: "Ergonomic Black / 26K DPI",
    optionValues: { color: "Matte Black" },
    price: 1_490_000,
    stock: 45,
  },
  {
    imagePath: "unnamed (22).png",
    name: "Củ Sạc Nhanh Nova GaN 100W Multi-Port 4 Cổng",
    slug: "cu-sac-nhanh-nova-gan-100w-multi-port-4-cong",
    categoryId: CATEGORIES.accessories,
    brand: "Nova",
    description: "Bộ sạc công nghệ GaN III thu nhỏ, công suất cực đại 100W với 3 cổng USB-C và 1 cổng USB-A sạc đồng thời laptop và điện thoại.",
    sku: "CHG-GAN100W-4P",
    variantTitle: "GaN 100W kèm cáp C to C 100W",
    optionValues: { color: "Carbon Black" },
    price: 890_000,
    stock: 60,
  },

  // ==========================================
  // BATCH 2 (30 new products requested)
  // ==========================================

  // 1. Laptops
  {
    imagePath: "unnamed (31).png",
    name: "Nova ProBook Ultra 14",
    slug: "nova-probook-ultra-14",
    categoryId: CATEGORIES.laptops,
    brand: "Nova",
    description: "Ultrabook mỏng nhẹ hiệu năng cao với màn hình IPS chống lóa 2.8K, thời lượng pin 18 giờ và sạc nhanh Type-C.",
    sku: "LAP-PROBOOK-14",
    variantTitle: "16GB / 512GB NVMe / Core Ultra 7",
    optionValues: { cpu: "Core Ultra 7", ram: "16GB", ssd: "512GB" },
    price: 22_490_000,
    stock: 30,
  },

  // 2. Phones (4 items)
  {
    imagePath: "unnamed (8).png",
    name: "Nova Leather Edition Camera Phone",
    slug: "nova-leather-edition-camera-phone",
    categoryId: CATEGORIES.phones,
    brand: "Nova",
    description: "Flagship mặt lưng da thuần chay cao cấp cùng cụm 4 camera quang học Leica hỗ trợ zoom 100x và quay phim 4K 120fps.",
    sku: "PHO-LEATHER-512",
    variantTitle: "Midnight Vegan Leather / 512GB",
    optionValues: { color: "Midnight Leather", storage: "512GB" },
    price: 25_990_000,
    stock: 25,
  },
  {
    imagePath: "unnamed (24).png",
    name: "Nova Neo 14 Flagship Dual-Tone",
    slug: "nova-neo-14-flagship-dual-tone",
    categoryId: CATEGORIES.phones,
    brand: "Nova",
    description: "Điện thoại thông minh viền titan siêu mỏng, trang bị tấm nền OLED 144Hz sắc nét và sạc không dây nam châm.",
    sku: "PHO-NEO14-256",
    variantTitle: "Graphite Silver / 256GB",
    optionValues: { color: "Graphite Silver", storage: "256GB" },
    price: 19_490_000,
    stock: 35,
  },
  {
    imagePath: "unnamed (26).png",
    name: "Nova Pure Pixel 5G Obsidian",
    slug: "nova-pure-pixel-5g-obsidian",
    categoryId: CATEGORIES.phones,
    brand: "Google",
    description: "Trải nghiệm Android thuần khiết với chip bảo mật Titan M2, thuật toán chụp đêm thiên văn và màn hình OLED siêu sáng.",
    sku: "PHO-PIXEL-128",
    variantTitle: "Obsidian Black / 128GB",
    optionValues: { color: "Obsidian Black", storage: "128GB" },
    price: 17_990_000,
    stock: 30,
  },
  {
    imagePath: "unnamed .png",
    name: "Nova Phone Pro Max Space Gray",
    slug: "nova-phone-pro-max-space-gray",
    categoryId: CATEGORIES.phones,
    brand: "Nova",
    description: "Phiên bản màu xám không gian cao cấp với hệ thống 3 camera chụp macro siêu cận và chip 3nm đỉnh cao sức mạnh.",
    sku: "PHO-MAXGRAY-256",
    variantTitle: "Space Gray / 256GB",
    optionValues: { color: "Space Gray", storage: "256GB" },
    price: 29_990_000,
    stock: 20,
  },

  // 3. Smart Watches (1 item)
  {
    imagePath: "apps/api/src/modules/catalog/infrastructure/seeds/assets/smart-watch.png",
    name: "Đồng Hồ Thông Minh Nova Watch Ultra LTE",
    slug: "dong-ho-thong-minh-nova-watch-ultra-lte",
    categoryId: CATEGORIES.smartWatches,
    brand: "Nova",
    description: "Đồng hồ thông minh vỏ titan siêu bền, hỗ trợ e-SIM gọi thoại độc lập, đo nhịp tim, oxy trong máu và GPS băng tần kép.",
    sku: "WAT-ULTRA-LTE-45",
    variantTitle: "Titanium Black / 45mm LTE",
    optionValues: { size: "45mm", connectivity: "e-SIM LTE" },
    price: 9_990_000,
    stock: 40,
  },

  // 4. Computer Components (8 items)
  {
    imagePath: "unnamed (14).png",
    name: "Bo Mạch Chủ Nova X670E Taichi AM5",
    slug: "bo-mach-chu-nova-x670e-taichi-am5",
    categoryId: CATEGORIES.computerComponents,
    brand: "Nova",
    description: "Bo mạch chủ cao cấp socket AM5 dành cho vi xử lý Ryzen 7000/9000 series, tích hợp 24+2+1 phase nguồn và Wi-Fi 6E.",
    sku: "MB-X670E-TAICHI",
    variantTitle: "E-ATX / DDR5 / PCIe 5.0",
    optionValues: { form_factor: "E-ATX" },
    price: 11_490_000,
    stock: 20,
  },
  {
    imagePath: "unnamed (17).png",
    name: "Bộ Vi Xử Lý Nova Ryzen 9 7950X 16 Nhân 32 Luồng",
    slug: "bo-vi-xu-ly-nova-ryzen-9-7950x",
    categoryId: CATEGORIES.computerComponents,
    brand: "AMD",
    description: "CPU xử lý đa nhiệm cực mạnh trên tiến trình 5nm, xung boost tới 5.7GHz, chuyên trị đồ họa nặng và render 3D tốc độ cao.",
    sku: "CPU-RYZEN9-7950X",
    variantTitle: "Box Chính Hãng 16 Cores 32 Threads",
    optionValues: { package: "Box Chính Hãng" },
    price: 13_890_000,
    stock: 25,
  },
  {
    imagePath: "unnamed (28).png",
    name: "Bộ Nhớ RAM Nova Dominator DDR5 64GB 6400MHz",
    slug: "ram-nova-dominator-ddr5-64gb-6400mhz",
    categoryId: CATEGORIES.computerComponents,
    brand: "Nova",
    description: "Kit 2 thanh RAM 32GB DDR5 tốc độ khủng 6400MHz bọc giáp tản nhiệt nhôm đen mờ nguyên khối cùng chip nhớ tuyển chọn.",
    sku: "RAM-DOMINATOR-64G",
    variantTitle: "Kit 64GB (2x32GB) 6400MHz",
    optionValues: { capacity: "64GB (2x32GB)" },
    price: 6_890_000,
    stock: 35,
  },
  {
    imagePath: "unnamed (33).png",
    name: "Card Đồ Họa Nova RTX 4090 Monster 24GB",
    slug: "card-do-hoa-nova-rtx-4090-monster-24gb",
    categoryId: CATEGORIES.computerComponents,
    brand: "Nova Gaming",
    description: "Quái vật đồ họa 24GB GDDR6X với 3 quạt tản nhiệt khí động học, sẵn sàng cho mọi tựa game 4K Ray Tracing mượt mà nhất.",
    sku: "GPU-RTX4090-24G",
    variantTitle: "24GB GDDR6X Triple Fan Monster",
    optionValues: { memory: "24GB" },
    price: 49_990_000,
    stock: 10,
  },
  {
    imagePath: "unnamed (38).png",
    name: "Card Đồ Họa Nova RTX 4070 Ti Super IceBlue 16GB",
    slug: "card-do-hoa-nova-rtx-4070-ti-super-iceblue",
    categoryId: CATEGORIES.computerComponents,
    brand: "Nova Gaming",
    description: "Card màn hình hiệu năng cao với viền LED IceBlue thể thao, xung nhịp OC sẵn và hệ thống lá nhôm tản nhiệt dày đặc.",
    sku: "GPU-RTX4070TIS-16G",
    variantTitle: "16GB GDDR6X IceBlue OC",
    optionValues: { memory: "16GB" },
    price: 23_490_000,
    stock: 20,
  },
  {
    imagePath: "unnamed (40).png",
    name: "Vỏ Case Máy Tính Nova Crystal Tower White ARGB",
    slug: "vo-case-nova-crystal-tower-white-argb",
    categoryId: CATEGORIES.computerComponents,
    brand: "Nova",
    description: "Vỏ máy tính tông màu trắng tuyết sang trọng, mặt trước và hông kính cường lực trong suốt tối đa hóa vẻ đẹp linh kiện.",
    sku: "CASE-TOWER-WHT",
    variantTitle: "Full Tower Snow White kèm Hub ARGB",
    optionValues: { color: "Snow White" },
    price: 2_490_000,
    stock: 30,
  },
  {
    imagePath: "unnamed (9).png",
    name: "Vỏ Case Máy Tính Nova DarkMesh Airflow Pro",
    slug: "vo-case-nova-darkmesh-airflow-pro",
    categoryId: CATEGORIES.computerComponents,
    brand: "Nova",
    description: "Thiết kế mặt lưới thép tổ ong mặt trước tối ưu luồng gió mát mẻ, tặng kèm 4 quạt 140mm PWM siêu êm ái.",
    sku: "CASE-DARKMESH-PRO",
    variantTitle: "Mid-Tower Mesh Black kèm 4 Fan",
    optionValues: { color: "Matte Black" },
    price: 1_890_000,
    stock: 40,
  },
  {
    imagePath: "apps/api/src/modules/catalog/infrastructure/seeds/assets/solid-state-drive.png",
    name: "Ổ Cứng SSD Nova NVMe Gen5 2TB 14000MB/s",
    slug: "o-cung-ssd-nova-nvme-gen5-2tb",
    categoryId: CATEGORIES.computerComponents,
    brand: "Nova",
    description: "Ổ cứng thể rắn chuẩn PCIe 5.0 x4 tốc độ đọc ghi kỷ lục 14.000 MB/s, kèm tản nhiệt kim loại nguyên khối chống nghẽn nhiệt.",
    sku: "SSD-GEN5-2TB",
    variantTitle: "2TB M.2 2280 PCIe 5.0",
    optionValues: { capacity: "2TB" },
    price: 5_490_000,
    stock: 40,
  },

  // 5. Accessories (16 items)
  {
    imagePath: "unnamed (11).png",
    name: "Tai Nghe Nova Audio Master Stand Edition",
    slug: "tai-nghe-nova-audio-master-stand-edition",
    categoryId: CATEGORIES.accessories,
    brand: "Nova",
    description: "Tai nghe Hi-Res chụp tai màng loa Beryllium 50mm, tặng kèm giá treo tai nghe tích hợp sạc LED Neon cao cấp.",
    sku: "EAR-MASTER-STAND",
    variantTitle: "Hi-Res Black Edition kèm Stand",
    optionValues: { bundle: "Headphone + Stand" },
    price: 4_490_000,
    stock: 25,
  },
  {
    imagePath: "unnamed (19).png",
    name: "Tai Nghe Chuyên Nghiệp Nova Studio One & Stand",
    slug: "tai-nghe-chuyen-nghiep-nova-studio-one-stand",
    categoryId: CATEGORIES.accessories,
    brand: "Nova",
    description: "Tai nghe kiểm âm cao cấp cho phòng thu âm và livestream, đệm tai da êm ái cách âm thụ động hoàn hảo.",
    sku: "EAR-STUDIO-ONE",
    variantTitle: "Studio Monitoring Black",
    optionValues: { color: "Studio Black" },
    price: 3_890_000,
    stock: 30,
  },
  {
    imagePath: "unnamed (18).png",
    name: "Chuột Công Thái Học Nova ErgoMaster Wireless White",
    slug: "chuot-cong-thai-hoc-nova-ergomaster-white",
    categoryId: CATEGORIES.accessories,
    brand: "Nova",
    description: "Chuột văn phòng cao cấp màu trắng bạc công thái học ôm sát lòng bàn tay, cuộn vô cực MagSpeed cuộn 1000 dòng/giây.",
    sku: "MOU-ERGOMASTER-WHT",
    variantTitle: "Platinum Silver White",
    optionValues: { color: "Platinum White" },
    price: 1_890_000,
    stock: 45,
  },
  {
    imagePath: "unnamed (20).png",
    name: "Bàn Phím Cơ Custom Nova Compact 75 RGB",
    slug: "ban-phim-co-custom-nova-compact-75-rgb",
    categoryId: CATEGORIES.accessories,
    brand: "Nova",
    description: "Bàn phím cơ layout 75% cấu trúc Gasket Mount êm ái, hỗ trợ hotswap 5 pin và keycap PBT doubleshot cao cấp.",
    sku: "KB-COMPACT75-RGB",
    variantTitle: "75% Gasket Mount / Brown Switch",
    optionValues: { switch: "Brown Tactile" },
    price: 2_490_000,
    stock: 35,
  },
  {
    imagePath: "unnamed (21).png",
    name: "Chuột Cảm Ứng Không Dây Nova Touch Ultra Silver",
    slug: "chuot-cam-ung-nova-touch-ultra-silver",
    categoryId: CATEGORIES.accessories,
    brand: "Nova",
    description: "Chuột không dây bề mặt cảm ứng đa điểm nguyên khối, cử chỉ vuốt chuyển trang mượt mà cùng pin sạc cổng Type-C.",
    sku: "MOU-TOUCH-SLV",
    variantTitle: "Multi-Touch Ultra Slim Silver",
    optionValues: { color: "Silver" },
    price: 1_990_000,
    stock: 50,
  },
  {
    imagePath: "unnamed (23).png",
    name: "Lót Chuột RGB Nova Topo Deskmat XXL",
    slug: "lot-chuot-rgb-nova-topo-deskmat-xxl",
    categoryId: CATEGORIES.accessories,
    brand: "Nova Gaming",
    description: "Bàn di chuột khổ lớn 900x400mm bề mặt Speed dệt mật độ cao, đáy cao su chống trượt và viền phát quang RGB đổi màu.",
    sku: "PAD-TOPO-XXL",
    variantTitle: "XXL 900x400x4mm / Topo Texture",
    optionValues: { size: "900x400mm" },
    price: 590_000,
    stock: 80,
  },
  {
    imagePath: "unnamed (27).png",
    name: "Bộ Trạm Làm Việc Kép Nova Dual Monitor Station",
    slug: "bo-tram-lam-viec-kep-nova-dual-station",
    categoryId: CATEGORIES.accessories,
    brand: "Nova",
    description: "Trạm đế nâng màn hình thông minh tích hợp đèn LED RGB ambient, cổng sạc Type-C và giá đỡ hỗ trợ 2 màn hình cùng lúc.",
    sku: "ACC-DUAL-STATION",
    variantTitle: "Dual Monitor Riser kèm Ambient Light",
    optionValues: { type: "Dual Riser" },
    price: 4_990_000,
    stock: 20,
  },
  {
    imagePath: "unnamed (39).png",
    name: "Hệ Thống Trạm Âm Thanh Đồ Họa Nova Sound & Screen Hub",
    slug: "loa-may-tinh-nova-sound-screen-hub-60w",
    categoryId: CATEGORIES.accessories,
    brand: "Nova",
    description: "Bộ loa máy tính Bluetooth kép công suất 60W tích hợp đèn RGB đồng bộ nhịp điệu bài hát và cổng kết nối optical/AUX.",
    sku: "SPK-SOUND-HUB60W",
    variantTitle: "Stereo 2.0 60W Hi-Res Audio",
    optionValues: { power: "60W" },
    price: 2_790_000,
    stock: 30,
  },
  {
    imagePath: "unnamed (4).png",
    name: "Bộ Phụ Kiện Du Lịch Nova Tech Travel Kit 4 Món",
    slug: "bo-phu-kien-du-lich-nova-tech-travel-kit",
    categoryId: CATEGORIES.accessories,
    brand: "Nova",
    description: "Bộ quà tặng công nghệ gồm pin dự phòng 20.000mAh, tai nghe chống ồn, loa di động mini và cáp sạc đa năng tiện lợi.",
    sku: "KIT-TRAVEL-4IN1",
    variantTitle: "Combo 4 món công nghệ cao cấp",
    optionValues: { bundle: "Travel 4-in-1" },
    price: 3_490_000,
    stock: 40,
  },
  {
    imagePath: "unnamed (42).png",
    name: "Bàn Trạm Gaming Nova Master BattleStation",
    slug: "ke-nang-ban-gaming-nova-master-battlestation",
    categoryId: CATEGORIES.accessories,
    brand: "Nova Gaming",
    description: "Kệ nâng bàn máy tính hợp kim nhôm chịu lực 50kg có dải LED Neon điều khiển qua app và khe cắm phụ kiện công nghệ.",
    sku: "ACC-BATTLE-SHELF",
    variantTitle: "BattleStation Riser 120cm RGB",
    optionValues: { length: "120cm" },
    price: 3_190_000,
    stock: 25,
  },
  {
    imagePath: "unnamed (5).png",
    name: "Chuột Chuyên Game Nova SpeedLight Wireless 8000Hz",
    slug: "chuot-chuyen-game-nova-speedlight-wireless-8k",
    categoryId: CATEGORIES.accessories,
    brand: "Nova Gaming",
    description: "Chuột thi đấu eSports cảm biến PixArt PAW3395 polling rate 8000Hz, switch quang học 100 triệu lần nhấn không đúp click.",
    sku: "MOU-SPEEDLIGHT-8K",
    variantTitle: "Ultralight 54g / 8000Hz Polling",
    optionValues: { pollingRate: "8000Hz" },
    price: 1_790_000,
    stock: 50,
  },
  {
    imagePath: "unnamed (6).png",
    name: "Màn Hình Gaming Nova UltraGear 27 inch 240Hz Fast-IPS",
    slug: "man-hinh-gaming-nova-ultragear-27-inch-240hz",
    categoryId: CATEGORIES.accessories,
    brand: "Nova",
    description: "Màn hình eSports 27 inch QHD (2560x1440) tần số quét cực đại 240Hz, phản hồi 0.5ms và hỗ trợ NVIDIA G-Sync Compatible.",
    sku: "MON-GEAR27-240",
    variantTitle: "27 inch / QHD / 240Hz Fast-IPS",
    optionValues: { size: "27 inch", refreshRate: "240Hz" },
    price: 8_990_000,
    stock: 25,
  },
  {
    imagePath: "unnamed (7).png",
    name: "Tai Nghe Không Dây Nova SoundPod Over-Ear ANC",
    slug: "tai-nghe-khong-day-nova-soundpod-overear-anc",
    categoryId: CATEGORIES.accessories,
    brand: "Nova",
    description: "Tai nghe chống ồn chủ động Hybrid ANC 45dB, codec LDAC chất lượng phòng thu và thời lượng nghe nhạc liên tục 50 giờ.",
    sku: "EAR-SOUNDPOD-ANC",
    variantTitle: "Space Black / Active Noise Canceling",
    optionValues: { color: "Space Black" },
    price: 3_290_000,
    stock: 40,
  },
  {
    imagePath: "apps/api/src/modules/catalog/infrastructure/seeds/assets/usb-c-hub.png",
    name: "Hub Chuyển Đổi Đa Năng Nova 8-in-1 Type-C 4K 100W",
    slug: "hub-chuyen-doi-da-nang-nova-8-in-1-type-c",
    categoryId: CATEGORIES.accessories,
    brand: "Nova",
    description: "Bộ chuyển đổi vỏ nhôm tản nhiệt nguyên khối gồm HDMI 4K 60Hz, 3 cổng USB 3.2, khe thẻ SD/TF và sạc xuyên dòng PD 100W.",
    sku: "HUB-8IN1-100W",
    variantTitle: "8-in-1 Aluminum Space Gray",
    optionValues: { ports: "8-in-1" },
    price: 1_190_000,
    stock: 60,
  },
  {
    imagePath: "apps/api/src/modules/catalog/infrastructure/seeds/assets/mechanical-keyboard.png",
    name: "Bàn Phím Cơ Custom Nova Pure Classic 65 Navy",
    slug: "ban-phim-co-custom-nova-pure-classic-65-navy",
    categoryId: CATEGORIES.accessories,
    brand: "Nova",
    description: "Bàn phím cơ nhỏ gọn 68 phím phối màu xanh Navy sang trọng, switch Gateron Pro Yellow mượt mà đã lube sẵn từ nhà máy.",
    sku: "KB-CLASSIC65-NAVY",
    variantTitle: "65% Compact / Gateron Yellow Pre-lubed",
    optionValues: { layout: "65%" },
    price: 2_190_000,
    stock: 40,
  },
  {
    imagePath: "apps/api/src/modules/catalog/infrastructure/seeds/assets/over-ear-headphones.png",
    name: "Tai Nghe Chống Ồn Nova Studio Sound Beige Gold",
    slug: "tai-nghe-chong-on-nova-studio-sound-beige",
    categoryId: CATEGORIES.accessories,
    brand: "Nova",
    description: "Tai nghe màu be vàng trang nhã, công nghệ xử lý âm thanh không gian Spatial Audio và đệm tai memory foam siêu êm.",
    sku: "EAR-STUDIO-BEIGE",
    variantTitle: "Champagne Beige / Spatial Audio",
    optionValues: { color: "Champagne Beige" },
    price: 3_590_000,
    stock: 35,
  },
];

async function main(): Promise<void> {
  console.log(`Starting import of ${productsToImport.length} total products (20 batch 1 + 30 batch 2)...`);

  const productImageDirectory = process.env.PRODUCT_IMAGE_DIR?.trim();

  const minio = new Client({
    endPoint: process.env.MINIO_HOST || "localhost",
    port: Number(process.env.MINIO_PORT || 9000),
    useSSL: false,
    accessKey: process.env.MINIO_ACCESS_KEY || "opendx_minio",
    secretKey: process.env.MINIO_SECRET_KEY || "opendx_minio_password",
  });

  const bucketExists = await minio.bucketExists(MINIO_BUCKET);
  if (!bucketExists) {
    console.log(`Creating bucket ${MINIO_BUCKET}...`);
    await minio.makeBucket(MINIO_BUCKET, "us-east-1");
  }

  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ||
      "postgres://opendx_local:opendx_local_password@localhost:55432/opendx",
  });

  let importedCount = 0;
  let skippedCount = 0;

  try {
    for (const [index, item] of productsToImport.entries()) {
      const num = index + 1;

      const existing = await pool.query<{ id: string }>(
        "SELECT id FROM products WHERE slug = $1",
        [item.slug],
      );

      let productId: string;
      let isNew = false;

      if (existing.rows.length > 0 && existing.rows[0]) {
        productId = existing.rows[0].id;
        skippedCount++;
        // Product already exists, ensure it is published
        await pool.query("UPDATE products SET status = 'published' WHERE id = $1", [productId]);
        console.log(`[${num}/${productsToImport.length}] Already exists: ${item.name} (id: ${productId})`);
        continue;
      } else {
        productId = randomUUID();
        isNew = true;
      }

      console.log(`[${num}/${productsToImport.length}] Importing NEW: ${item.name}`);

      const isRepositoryImage = item.imagePath.includes("/");
      if (!isRepositoryImage && !productImageDirectory) {
        throw new Error(
          "PRODUCT_IMAGE_DIR must point to the directory containing the local product images.",
        );
      }
      const resolvedImagePath = isRepositoryImage
        ? path.resolve(process.cwd(), "../..", item.imagePath)
        : path.resolve(productImageDirectory!, item.imagePath);

      const imageBuffer = await readFile(resolvedImagePath);
      const objectKey = `products/${productId}/${item.slug}.png`;

      console.log(
        `   Uploading image (${imageBuffer.length} bytes) to MinIO: ${objectKey}`,
      );
      await minio.putObject(MINIO_BUCKET, objectKey, imageBuffer, imageBuffer.length, {
        "Content-Type": "image/png",
      });

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // Insert Product
        await client.query(
          `INSERT INTO products
            (id, category_id, name, slug, brand, description, attributes, status, created_at, updated_at, version)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 'published', NOW(), NOW(), 1)`,
          [
            productId,
            item.categoryId,
            item.name,
            item.slug,
            item.brand,
            item.description,
            JSON.stringify({ imported: true, featured: true }),
          ],
        );

        // Insert Variant
        const variantId = randomUUID();
        await client.query(
          `INSERT INTO product_variants
            (id, product_id, sku, title, option_values, status, created_at, updated_at, version)
           VALUES ($1, $2, $3, $4, $5::jsonb, 'active', NOW(), NOW(), 1)`,
          [
            variantId,
            productId,
            item.sku,
            item.variantTitle,
            JSON.stringify(item.optionValues),
          ],
        );

        // Insert Price
        const priceId = randomUUID();
        await client.query(
          `INSERT INTO product_prices
            (id, variant_id, amount_minor, currency, tax_inclusive, valid_from, valid_to, created_by)
           VALUES ($1, $2, $3, 'VND', true, '2026-08-01T00:00:00.000Z', NULL, 'system:user-import')`,
          [priceId, variantId, item.price],
        );

        // Insert Primary Media
        const mediaId = randomUUID();
        await client.query(
          `INSERT INTO product_media
            (id, product_id, object_key, content_type, byte_size, alt_text, sort_order, is_primary, created_at)
           VALUES ($1, $2, $3, 'image/png', $4, $5, 0, true, NOW())`,
          [mediaId, productId, objectKey, imageBuffer.length, `${item.name} hình ảnh chính`],
        );

        // Insert Inventory Item
        const inventoryItemId = randomUUID();
        await client.query(
          `INSERT INTO inventory_items
            (id, variant_id, on_hand, reserved, version, created_at, updated_at)
           VALUES ($1, $2, $3, 0, 1, NOW(), NOW())`,
          [inventoryItemId, variantId, item.stock],
        );

        // Insert Stock Movement
        const movementId = randomUUID();
        await client.query(
          `INSERT INTO stock_movements
            (id, inventory_item_id, movement_type, on_hand_delta, reserved_delta,
             reason_code, reason_note, actor_type, actor_id, correlation_id, idempotency_key, occurred_at)
           VALUES ($1, $2, 'receive', $3, 0, 'INITIAL_STOCK', 'Import user products',
                   'system', 'system:user-import', $4, $5, NOW())`,
          [
            movementId,
            inventoryItemId,
            item.stock,
            `import:products:${productId}`,
            `import:inventory:${variantId}`,
          ],
        );

        await client.query("COMMIT");
        importedCount++;
        console.log(`   ✓ Successfully imported: ${item.name}`);
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`   ✗ Error importing ${item.name}:`, err);
        throw err;
      } finally {
        client.release();
      }
    }

    console.log(`\n=============================================`);
    console.log(`Finished! Successfully imported ${importedCount} new products, verified ${skippedCount} existing products.`);
    console.log(`=============================================\n`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
