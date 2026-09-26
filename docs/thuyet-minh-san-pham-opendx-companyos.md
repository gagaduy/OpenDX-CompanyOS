<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# BẢN THUYẾT MINH DỰ ÁN: OPENDX COMPANYOS
### Hệ Điều Hành Doanh Nghiệp Tự Trị (Autonomous Enterprise Operating System)

---

## 1. GIỚI THIỆU TỔNG QUAN

* **Tên hệ thống:** OpenDX CompanyOS
* **Mô hình hoạt động:** Hệ điều hành hợp nhất giữa Nền tảng Thương mại (Commerce Engine), Lực lượng Nhân sự Số đa tác tử (Agentic Workforce) và Bộ điều phối quy trình thị giác (Visual Workflow Studio / iPaaS).
* **Mục tiêu dự án:** Xây dựng một nền tảng vận hành doanh nghiệp mã nguồn mở, cho phép tích hợp AI vào sâu trong quy trình nghiệp vụ thực tế có tổ chức, có phân quyền, có kiểm soát rủi ro bằng con người (Human-in-the-loop) thay vì các chatbot hỗ trợ đơn lẻ.
* **Tiêu chuẩn công nghệ:** Kiến trúc sạch (Clean Architecture), Domain-Driven Design (DDD), Temporal Durable Execution, Keycloak RBAC Security, PostgreSQL Authoritative Store, Vite & React Staff Console.
* **Bản quyền:** Mã nguồn mở chuẩn Apache-2.0, đáp ứng các tiêu chí đánh giá phần mềm nguồn mở OLP 2026.

---

## 2. CÁC BÀI TOÁN THỰC TẾ (PAIN POINTS) & GIẢI PHÁP KỸ THUẬT

---

### PAIN POINT 1: AI trong doanh nghiệp phần lớn chỉ là các chatbot độc lập, không có khả năng phân rã mục tiêu chiến lược và không thể phối hợp liên phòng ban.

* **Vấn đề thực tế:** 
  Hầu hết các giải pháp hiện nay chỉ dừng lại ở việc cung cấp một ô chat để nhân viên tự đặt câu hỏi. Khi Ban Giám đốc đưa ra một mục tiêu kinh doanh cấp cao (ví dụ: *"Chuẩn bị chiến dịch ra mắt dòng sản phẩm mới"* hoặc *"Rà soát và xử lý dứt điểm các khiếu nại khách hàng tồn đọng"*), con người vẫn phải tự bóc tách việc thành từng phần nhỏ rồi copy-paste thủ công sang từng công cụ riêng lẻ. Các phòng ban (Marketing, Kho, Chăm sóc khách hàng, Kế toán) hoạt động rời rạc, gây chậm trễ và đứt gãy mạch thông tin.

* **Giải pháp trong OpenDX CompanyOS:**
  * **Cơ chế điều phối thông qua AI CEO:** Hệ thống thiết kế một tác tử chỉ huy trung tâm (AI CEO). Khi nhận chỉ thị chiến lược bằng ngôn ngữ tự nhiên từ Ban Quản trị, AI CEO tự động phân tích ngữ cảnh, phân rã mục tiêu (Goal Decomposition) thành các gói công việc cụ thể và phân công trực tiếp xuống các nhân sự số chuyên trách.
  * **Tổ hợp 10 Nhân sự Số chuyên môn hóa:**
    * *Chuyên viên Marketing:* Lên kế hoạch nội dung, tạo hình ảnh quảng bá và kết nối xuất bản lên kênh mạng xã hội.
    * *Chuyên viên CSKH:* Phân tích mức độ bức xúc của khách hàng từ phiếu hỗ trợ, soạn thảo nội dung phản hồi và đề xuất mức bồi thường phù hợp.
    * *Chuyên viên Quản lý Kho:* Giám sát ngưỡng an toàn hàng tồn, tự động kích hoạt cảnh báo bổ sung hàng khi chạm mốc tối thiểu.
    * *Chuyên viên Catalog & Định giá:* Quản lý cấu trúc sản phẩm, tối ưu mô tả và bảo đảm tính nhất quán của bảng giá.
    * *Chuyên viên Tài chính - Kế toán:* Tổng hợp dòng tiền, doanh thu và tính toán giá trị vòng đời khách hàng.
  * **Bảo mật phân quyền độc lập (Keycloak RBAC):** Mỗi nhân sự AI được cấp một Service Account và Access Token riêng biệt. Không có tác tử nào được dùng chung quyền hoặc tự ý can thiệp vào dữ liệu ngoài phạm vi được chỉ định.

> **HÌNH ẢNH MINH CHỨNG:**
> * **[Hình 1 - Command Center]** *(File: `docs/screenshots/04_command_center.png`)*: Giao diện Trung tâm Chỉ huy Tác nghiệp — Nơi người quản trị ra lệnh chiến lược cấp cao cho AI CEO, theo dõi việc phân bổ công việc tự động về từng phòng ban và giám sát luồng hoạt động thời gian thực (Live Activity Feed).
> * **[Hình 2 - Digital Employees]** *(File: `docs/screenshots/06_digital_employees.png`)*: Bảng danh bạ quản lý 10 Nhân sự Số — Thể hiện rõ vai trò nghiệp vụ, phạm vi quyền hạn và mô hình ngôn ngữ (LLM) được cấu hình độc lập cho từng nhân sự số.

---

### PAIN POINT 2: Quy trình tự động hóa nghiệp vụ thường bị "code cứng", khó tùy biến theo chính sách thay đổi và dễ đứt gãy khi hệ thống gặp sự cố.

* **Vấn đề thực tế:** 
  Trong các hệ sinh thái doanh nghiệp truyền thống, logic nghiệp vụ thường bị cài cắm trực tiếp vào mã nguồn backend. Mỗi khi doanh nghiệp thay đổi chính sách (ví dụ: thay đổi hạn mức bồi thường từ 100.000đ lên 200.000đ, hoặc bổ sung một bước gửi email thông báo nội bộ), lập trình viên phải sửa code và deploy lại từ đầu. Ngược lại, nếu sử dụng các công cụ automation kịch bản thông thường thì thiếu cơ chế duy trì trạng thái bền bỉ (stateful); khi máy chủ khởi động lại hoặc mạng gián đoạn, quy trình đang chạy dở sẽ bị hủy bỏ hoàn toàn.

* **Giải pháp trong OpenDX CompanyOS:**
  * **Visual Business Workflow Studio (iPaaS trực quan):** Cung cấp giao diện đồ họa Canvas tương tác hoàn chỉnh cho phép người vận hành nghiệp vụ tự tay kéo - thả, cấu hình và nối dây các khối chức năng mà không cần can thiệp vào mã nguồn.
  * **Thư viện khối đa dạng:** Phân định rõ 5 nhóm khối màu trực quan gồm: Sự kiện kích hoạt (Trigger), Khối Nhân sự AI (Agent Worker), Khối Phân luồng điều kiện (Decision Router), Cổng phê duyệt (Approval Gate) và Khối Hành động (Action).
  * **Phân luồng chính sách thông minh (Conditional Branching):** Hỗ trợ rẽ nhánh logic tự động dựa trên giá trị dữ liệu chạy qua luồng. Ví dụ trong quy trình xử lý khiếu nại (WF-CSKH-RECOVERY):
    * Nếu giá trị bồi thường $\le$ 200.000đ: Hệ thống tự động đi theo nhánh xanh (tự động 100%), sinh mã voucher và gửi thư xin lỗi khách hàng ngay lập tức.
    * Nếu giá trị bồi thường > 200.000đ: Hệ thống tự động chuyển hướng sang nhánh vàng (Cổng kiểm soát), tạm dừng tiến trình và chờ quyết định từ cấp quản lý.
  * **Vận hành bền bỉ trên Temporal Durable Execution:** Tiến trình quy trình được lưu vết trạng thái từng bước vào cơ sở dữ liệu. Ngay cả khi máy chủ sập nguồn, mạng ngắt kết nối hoặc thời gian chờ duyệt kéo dài nhiều ngày, quy trình vẫn tự động khôi phục chính xác tại điểm dừng mà không bị mất dữ liệu hay chạy lặp lại các bước đã hoàn tất.

> **HÌNH ẢNH MINH CHỨNG:**
> * **[Hình 3 - Workflow Studio]** *(File: `docs/screenshots/03_workflow_studio.png`)*: Bàn làm việc Visual Workflow Studio — Thể hiện quy trình cứu khách khiếu nại và bồi thường nhanh (WF-CSKH-RECOVERY) gồm 6 bước nghiệp vụ, đường dây kết nối trực quan, nhánh điều kiện phân luồng tự động vs duyệt thủ công, và bộ thư viện khối nghiệp vụ.

---

### PAIN POINT 3: Doanh nghiệp e ngại rủi ro khi AI tự ý ra quyết định gây thiệt hại tài chính hoặc sai lệch phát ngôn.

* **Vấn đề thực tế:** 
  Ảo giác (Hallucination) và việc thiếu cơ chế rào chắn là rào cản lớn nhất ngăn doanh nghiệp áp dụng AI vào vận hành thực tế. Nếu trao quyền tự động hoàn toàn cho AI, doanh nghiệp có nguy cơ đối mặt với việc AI tự ý cấp phát ngân sách sai, cấp mã giảm giá vượt hạn mức cho phép, hoặc đăng tải các thông điệp truyền thông chưa được kiểm chứng lên mạng xã hội.

* **Giải pháp trong OpenDX CompanyOS:**
  * **Mô hình Cổng Phê Duyệt Rủi Ro (Human-in-the-Loop):** Hệ thống thiết lập ranh giới an toàn nghiêm ngặt. AI chỉ đóng vai trò phân tích dữ liệu, tổng hợp tình huống và xây dựng đề xuất phương án tối ưu. Đối với các hành động vượt ngưỡng rủi ro, hệ thống bắt buộc phải dừng lại tại Cổng phê duyệt (Approval Gate) để người có thẩm quyền ký xác nhận.
  * **Approval Inbox tập trung:** Cung cấp giao diện trực quan cho người duyệt kiểm tra đầy đủ ngữ cảnh: Nguyên nhân phát sinh, mức độ thiệt hại của khách hàng, lý do AI đề xuất giải pháp, và nội dung dự thảo phản hồi. Người duyệt có toàn quyền chấp thuận, từ chối hoặc chỉnh sửa phương án trực tiếp.
  * **Thông báo tự động theo chức vụ qua Email thực tế:** Tích hợp giao thức SMTP/Gmail để gửi thông báo tức thời đến đích danh hòm thư của từng vị trí phụ trách (Trưởng phòng Marketing, Trưởng phòng CSKH, Giám đốc Điều hành) kèm đường dẫn xử lý nhanh.
  * **Nhật ký kiểm toán bất biến (Audit Trail):** Mọi thao tác phê duyệt, từ chối, danh tính người xử lý, thời gian thực hiện và lý do đều được ghi nhận vào nhật ký kiểm toán phục vụ hậu kiểm.

> **HÌNH ẢNH MINH CHỨNG:**
> * **[Hình 4 - Approval Inbox]** *(File: `docs/screenshots/05_approval_inbox.png`)*: Hòm thư Phê Duyệt Kiểm Soát Rủi Ro — Nơi hiển thị danh sách các đề xuất chờ duyệt (bồi thường khiếu nại, phát hành nội dung chiến dịch), cho phép thẩm định chi tiết và ra quyết định an toàn trước khi kích hoạt hành động ra bên ngoài.

---

### PAIN POINT 4: Dữ liệu vận hành bị phân mảnh và chi phí tiêu thụ tài nguyên AI là một "hộp đen" khó đo lường.

* **Vấn đề thực tế:** 
  1. Dữ liệu giữa các khâu bán hàng, tồn kho, thanh toán và hỗ trợ sau bán hàng thường nằm ở các hệ thống riêng lẻ, khiến người quản trị không nắm được bức tranh tổng thể về hoạt động kinh doanh và dịch vụ khách hàng.
  2. Việc sử dụng các mô hình ngôn ngữ lớn (LLM API) thường phát sinh chi phí khó kiểm soát. Doanh nghiệp không có công cụ theo dõi lượng token tiêu thụ theo thời gian thực và không biết được chi phí đó quy đổi ra tiền thực tế là bao nhiêu để cân đối hiệu quả chi phí (ROI).

* **Giải pháp trong OpenDX CompanyOS:**
  * **Backend Authoritative Truth (Chân lý dữ liệu từ Backend):** Tuân thủ Clean Architecture nghiêm ngặt. Mọi dữ liệu về giá bán, chiết khấu, tồn kho khả dụng và trạng thái thanh toán đều được tính toán và kiểm chứng ở tầng nghiệp vụ lõi (Domain/Application layer). Phía giao diện (Storefront/Console) chỉ hiển thị dữ liệu phản ánh từ backend, loại bỏ hoàn toàn nguy cơ gian lận từ phía client.
  * **Hồ sơ khách hàng hợp nhất (Customer 360 CRM):** Liên kết đồng bộ danh tính khách hàng với toàn bộ lịch sử đơn hàng, phiếu hỗ trợ kỹ thuật, ghi chú chăm sóc và giá trị đóng góp vòng đời (LTV).
  * **Giám sát chi phí AI minh bạch (AI Cost & Token Observability):**
    * Hệ thống tự động ghi nhận số lượng input token, output token, mã định danh mô hình và chi phí vi mô (micros) của từng lần gọi AI vào bảng lưu vết `agentic_model_runs`.
    * Trên Dashboard điều hành, hệ thống tổng hợp và quy đổi trực tiếp lượng token tiêu thụ ra tiền tệ (VNĐ và USD) theo thời gian thực (hiển thị rõ lượng tiêu thụ trong kỳ báo cáo và tổng tích lũy), giúp người quản trị nắm bắt chính xác mức tiêu hao ngân sách của hệ thống AI.

> **HÌNH ẢNH MINH CHỨNG:**
> * **[Hình 5 - Commerce Dashboard]** *(File: `docs/screenshots/01_dashboard.png`)*: Bảng Điều Hành Doanh Nghiệp — Hiển thị các chỉ số thương mại mô phỏng thực tế (doanh thu, đơn hàng, giá trị đơn, tỷ lệ chuyển đổi, biểu đồ sparkline) và cụm thẻ đo lường tài nguyên AI: **AI Tokens Consumed** và **Chi phí AI quy đổi ra tiền (VND / USD)**.
> * **[Hình 6 - Company Overview]** *(File: `docs/screenshots/02_company_overview.png`)*: Bảng Tổng Quan Vận Hành Công Ty — Trình bày trực quan trạng thái vận hành của 4 trụ cột cốt lõi (Mission Control, Digital Workforce, Workflow Studio, Approval Inbox) và lộ trình kiến trúc đã hoàn thiện.
> * **[Hình 7 - Customer CRM]** *(File: `docs/screenshots/07_customers_crm.png`)*: Phân hệ Quản Trị Khách Hàng CRM 360 — Quản lý danh sách khách hàng, thông tin liên hệ và theo dõi tiến trình giao dịch, hỗ trợ khách hàng.

---

## 3. CHẤT LƯỢNG KỸ THUẬT & TÍNH SẴN SÀNG NGUỒN MỞ

1. **Kiến trúc phân tầng chuẩn mực (Clean Architecture):**
   * Tách biệt hoàn toàn giữa tầng Domain, Application, Infrastructure và Presentation.
   * Logic nghiệp vụ độc lập với framework, cơ sở dữ liệu và giao diện người dùng, giúp hệ thống dễ dàng bảo trì, mở rộng và kiểm thử độc lập.
2. **Độ tin cậy mã nguồn và tự động hóa kiểm thử:**
   * Toàn bộ mã nguồn vượt qua 100% các bài kiểm tra tự động: Lệnh kiểm thử `pnpm check` chạy qua 23 tệp kiểm thử với 119/119 unit & integration tests đều đạt kết quả Pass.
   * Lệnh `pnpm audit:repo` đạt chuẩn toàn vẹn cấu trúc mã nguồn mở.
   * Hệ thống kiểm tra kiểu dữ liệu tĩnh TypeScript đạt mức tuyệt đối không có lỗi (`0 errors`).
3. **Tuân thủ tiêu chí OLP 2026:**
   * Đầy đủ tiêu đề bản quyền SPDX Apache-2.0 trên từng tệp tin nguồn.
   * Triển khai hoàn chỉnh qua Docker Compose, cho phép dựng toàn bộ hệ thống từ mã nguồn gốc mà không phụ thuộc vào các gói cài đặt đóng kín ngoài repo.
   * Bảo đảm nguyên tắc bảo vệ quyền riêng tư dữ liệu (PII-free) trong các tầng báo cáo điều hành.

---

## 4. KẾT LUẬN

**OpenDX CompanyOS** giải quyết bài toán cốt lõi của doanh nghiệp khi ứng dụng trí tuệ nhân tạo: **Đưa AI vào khuôn khổ vận hành có tổ chức**. Bằng việc kết hợp chặt chẽ giữa khả năng lập luận của AI, tính bền bỉ của quy trình thị giác và cơ chế kiểm soát rủi ro của con người, sản phẩm cung cấp một kiến trúc hoàn chỉnh, thực tế và sẵn sàng cho việc mở rộng trong tương lai.
