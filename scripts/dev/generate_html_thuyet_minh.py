# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

import base64
import os
import shutil

def generate_html():
    base_dir = os.path.abspath("docs/screenshots")
    
    def b64(filename):
        p = os.path.join(base_dir, filename)
        if os.path.exists(p):
            with open(p, "rb") as f:
                return f"data:image/png;base64,{base64.b64encode(f.read()).decode('utf-8')}"
        return ""

    img1 = b64("04_command_center.png")
    img2 = b64("06_digital_employees.png")
    img3 = b64("03_workflow_studio.png")
    img4 = b64("05_approval_inbox.png")
    img5 = b64("01_dashboard.png")
    img6 = b64("02_company_overview.png")
    img7 = b64("07_customers_crm.png")

    html = f"""<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<title>Bản Thuyết Minh Dự Án: OpenDX CompanyOS</title>
<style>
  body {{
    font-family: Arial, Helvetica, sans-serif;
    color: #1e293b;
    line-height: 1.6;
    max-width: 860px;
    margin: 30px auto;
    padding: 0 25px;
    background: #ffffff;
  }}
  h1 {{
    color: #0f172a;
    text-align: center;
    font-size: 24px;
    margin-bottom: 4px;
    text-transform: uppercase;
  }}
  .subtitle {{
    color: #0e7490;
    text-align: center;
    font-style: italic;
    font-size: 15px;
    margin-top: 0;
    margin-bottom: 20px;
  }}
  hr {{
    border: 0;
    height: 1px;
    background: #cbd5e1;
    margin: 25px 0;
  }}
  h2 {{
    color: #0f172a;
    font-size: 17px;
    border-bottom: 2px solid #0284c7;
    padding-bottom: 4px;
    margin-top: 35px;
    text-transform: uppercase;
  }}
  h3 {{
    color: #0369a1;
    font-size: 15px;
    margin-top: 25px;
    margin-bottom: 8px;
  }}
  ul, ol {{
    padding-left: 22px;
    margin-top: 6px;
    margin-bottom: 12px;
  }}
  li {{
    margin-bottom: 6px;
  }}
  strong {{
    color: #0f172a;
  }}
  .img-container {{
    text-align: center;
    margin: 20px 0;
    page-break-inside: avoid;
  }}
  .img-container img {{
    max-width: 100%;
    height: auto;
    border-radius: 6px;
    border: 1px solid #cbd5e1;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.08);
  }}
  .caption {{
    font-size: 12.5px;
    color: #64748b;
    font-style: italic;
    margin-top: 6px;
  }}
  .intro-box {{
    background: #f8fafc;
    border-left: 4px solid #0284c7;
    padding: 12px 18px;
    margin-bottom: 20px;
    border-radius: 4px;
  }}
</style>
</head>
<body>

<h1>BẢN THUYẾT MINH DỰ ÁN: OPENDX COMPANYOS</h1>
<p class="subtitle">Hệ Điều Hành Doanh Nghiệp Tự Trị (Autonomous Enterprise Operating System)</p>

<hr>

<h2>1. GIỚI THIỆU TỔNG QUAN</h2>
<div class="intro-box">
  <ul>
    <li><strong>Tên hệ thống:</strong> OpenDX CompanyOS</li>
    <li><strong>Mô hình hoạt động:</strong> Hệ điều hành hợp nhất giữa Nền tảng Thương mại (Commerce Engine), Lực lượng Nhân sự Số đa tác tử (Agentic Workforce) và Bộ điều phối quy trình thị giác (Visual Workflow Studio / iPaaS).</li>
    <li><strong>Mục tiêu dự án:</strong> Xây dựng nền tảng vận hành doanh nghiệp mã nguồn mở, đưa AI vào sâu trong quy trình nghiệp vụ có tổ chức, có phân quyền và kiểm soát rủi ro bằng con người (Human-in-the-loop).</li>
    <li><strong>Tiêu chuẩn công nghệ:</strong> Clean Architecture, Domain-Driven Design (DDD), Temporal Durable Execution, Keycloak RBAC Security, PostgreSQL Authoritative Store, Vite &amp; React Staff Console.</li>
    <li><strong>Bản quyền:</strong> Mã nguồn mở chuẩn Apache-2.0, đáp ứng tiêu chuẩn phần mềm nguồn mở OLP 2026.</li>
  </ul>
</div>

<h2>2. CÁC BÀI TOÁN THỰC TẾ (PAIN POINTS) &amp; GIẢI PHÁP KỸ THUẬT</h2>

<h3>PAIN POINT 1: AI trong doanh nghiệp phần lớn chỉ là các chatbot độc lập, không có khả năng phân rã mục tiêu chiến lược và không thể phối hợp liên phòng ban.</h3>
<p><strong>• Vấn đề thực tế:</strong> Hầu hết các giải pháp hiện nay chỉ dừng lại ở việc cung cấp một ô chat để nhân viên tự đặt câu hỏi. Khi Ban Giám đốc đưa ra một mục tiêu kinh doanh cấp cao (ví dụ: <em>"Chuẩn bị chiến dịch ra mắt dòng sản phẩm mới"</em> hoặc <em>"Rà soát và xử lý dứt điểm các khiếu nại khách hàng tồn đọng"</em>), con người vẫn phải tự bóc tách việc thành từng phần nhỏ rồi copy-paste thủ công sang từng công cụ riêng lẻ. Các phòng ban (Marketing, Kho, Chăm sóc khách hàng, Kế toán) hoạt động rời rạc, gây chậm trễ và đứt gãy mạch thông tin.</p>
<p><strong>• Giải pháp trong OpenDX CompanyOS:</strong></p>
<ol>
  <li><strong>Cơ chế điều phối thông qua AI CEO:</strong> Hệ thống thiết kế một tác tử chỉ huy trung tâm (AI CEO). Khi nhận chỉ thị chiến lược bằng ngôn ngữ tự nhiên từ Ban Quản trị, AI CEO tự động phân tích ngữ cảnh, phân rã mục tiêu (Goal Decomposition) thành các gói công việc cụ thể và phân công trực tiếp xuống các nhân sự số chuyên trách.</li>
  <li><strong>Tổ hợp 10 Nhân sự Số chuyên môn hóa:</strong>
    <ul>
      <li><em>Chuyên viên Marketing:</em> Lên kế hoạch nội dung, tạo hình ảnh quảng bá và kết nối xuất bản lên kênh mạng xã hội.</li>
      <li><em>Chuyên viên CSKH:</em> Phân tích mức độ bức xúc của khách hàng từ phiếu hỗ trợ, soạn thảo nội dung phản hồi và đề xuất mức bồi thường phù hợp.</li>
      <li><em>Chuyên viên Quản lý Kho:</em> Giám sát ngưỡng an toàn hàng tồn, tự động kích hoạt cảnh báo bổ sung hàng khi chạm mốc tối thiểu.</li>
      <li><em>Chuyên viên Catalog &amp; Định giá:</em> Quản lý cấu trúc sản phẩm, tối ưu mô tả và bảo đảm tính nhất quán của bảng giá.</li>
      <li><em>Chuyên viên Tài chính - Kế toán:</em> Tổng hợp dòng tiền, doanh thu và tính toán giá trị vòng đời khách hàng.</li>
    </ul>
  </li>
  <li><strong>Bảo mật phân quyền độc lập (Keycloak RBAC):</strong> Mỗi nhân sự AI được cấp một Service Account và Access Token riêng biệt. Không có tác tử nào được dùng chung quyền hoặc tự ý can thiệp vào dữ liệu ngoài phạm vi được chỉ định.</li>
</ol>

<div class="img-container">
  <img src="{img1}" alt="Command Center" />
  <p class="caption">[Hình 1] Trung tâm Chỉ huy Tác nghiệp (Command Center) - Giao việc chiến lược cho AI CEO &amp; Live Activity Feed</p>
</div>

<div class="img-container">
  <img src="{img2}" alt="Digital Employees" />
  <p class="caption">[Hình 2] Bảng danh bạ quản lý 10 Nhân sự Số (Digital Employees) với RBAC &amp; phân bổ LLM độc lập</p>
</div>

<hr>

<h3>PAIN POINT 2: Quy trình tự động hóa nghiệp vụ thường bị "code cứng", khó tùy biến theo chính sách thay đổi và dễ đứt gãy khi hệ thống gặp sự cố.</h3>
<p><strong>• Vấn đề thực tế:</strong> Trong các hệ sinh thái doanh nghiệp truyền thống, logic nghiệp vụ thường bị cài cắm trực tiếp vào mã nguồn backend. Mỗi khi doanh nghiệp thay đổi chính sách (ví dụ: thay đổi hạn mức bồi thường từ 100.000đ lên 200.000đ, hoặc bổ sung một bước gửi email thông báo nội bộ), lập trình viên phải sửa code và deploy lại từ đầu. Ngược lại, nếu sử dụng các công cụ automation kịch bản thông thường thì thiếu cơ chế duy trì trạng thái bền bỉ (stateful); khi máy chủ khởi động lại hoặc mạng gián đoạn, quy trình đang chạy dở sẽ bị hủy bỏ hoàn toàn.</p>
<p><strong>• Giải pháp trong OpenDX CompanyOS:</strong></p>
<ol>
  <li><strong>Visual Business Workflow Studio (iPaaS trực quan):</strong> Cung cấp giao diện đồ họa Canvas tương tác hoàn chỉnh cho phép người vận hành nghiệp vụ tự tay kéo - thả, cấu hình và nối dây các khối chức năng mà không cần can thiệp vào mã nguồn.</li>
  <li><strong>Thư viện khối đa dạng:</strong> Phân định rõ 5 nhóm khối màu trực quan gồm: Sự kiện kích hoạt (Trigger), Khối Nhân sự AI (Agent Worker), Khối Phân luồng điều kiện (Decision Router), Cổng phê duyệt (Approval Gate) và Khối Hành động (Action).</li>
  <li><strong>Phân luồng chính sách thông minh (Conditional Branching):</strong> Hỗ trợ rẽ nhánh logic tự động dựa trên giá trị dữ liệu chạy qua luồng. Ví dụ trong quy trình xử lý khiếu nại (WF-CSKH-RECOVERY):
    <ul>
      <li>Nếu giá trị bồi thường &le; 200.000đ: Hệ thống tự động đi theo nhánh xanh (tự động 100%), sinh mã voucher và gửi thư xin lỗi khách hàng ngay lập tức.</li>
      <li>Nếu giá trị bồi thường &gt; 200.000đ: Hệ thống tự động chuyển hướng sang nhánh vàng (Cổng kiểm soát), tạm dừng tiến trình và chờ quyết định từ cấp quản lý.</li>
    </ul>
  </li>
  <li><strong>Vận hành bền bỉ trên Temporal Durable Execution:</strong> Tiến trình quy trình được lưu vết trạng thái từng bước vào cơ sở dữ liệu. Ngay cả khi máy chủ sập nguồn, mạng ngắt kết nối hoặc thời gian chờ duyệt kéo dài nhiều ngày, quy trình vẫn tự động khôi phục chính xác tại điểm dừng mà không bị mất dữ liệu hay chạy lặp lại các bước đã hoàn tất.</li>
</ol>

<div class="img-container">
  <img src="{img3}" alt="Workflow Studio" />
  <p class="caption">[Hình 3] Bàn làm việc Visual Workflow Studio - Quy trình cứu khách khiếu nại (WF-CSKH-RECOVERY) với phân luồng rẽ nhánh điều kiện</p>
</div>

<hr>

<h3>PAIN POINT 3: Doanh nghiệp e ngại rủi ro khi AI tự ý ra quyết định gây thiệt hại tài chính hoặc sai lệch phát ngôn.</h3>
<p><strong>• Vấn đề thực tế:</strong> Ảo giác (Hallucination) và việc thiếu cơ chế rào chắn là rào cản lớn nhất ngăn doanh nghiệp áp dụng AI vào vận hành thực tế. Nếu trao quyền tự động hoàn toàn cho AI, doanh nghiệp có nguy cơ đối mặt với việc AI tự ý cấp phát ngân sách sai, cấp mã giảm giá vượt hạn mức cho phép, hoặc đăng tải các thông điệp truyền thông chưa được kiểm chứng lên mạng xã hội.</p>
<p><strong>• Giải pháp trong OpenDX CompanyOS:</strong></p>
<ol>
  <li><strong>Mô hình Cổng Phê Duyệt Rủi Ro (Human-in-the-Loop):</strong> Hệ thống thiết lập ranh giới an toàn nghiêm ngặt. AI chỉ đóng vai trò phân tích dữ liệu, tổng hợp tình huống và xây dựng đề xuất phương án tối ưu. Đối với các hành động vượt ngưỡng rủi ro, hệ thống bắt buộc phải dừng lại tại Cổng phê duyệt (Approval Gate) để người có thẩm quyền ký xác nhận.</li>
  <li><strong>Approval Inbox tập trung:</strong> Cung cấp giao diện trực quan cho người duyệt kiểm tra đầy đủ ngữ cảnh: Nguyên nhân phát sinh, mức độ thiệt hại của khách hàng, lý do AI đề xuất giải pháp, và nội dung dự thảo phản hồi. Người duyệt có toàn quyền chấp thuận, từ chối hoặc chỉnh sửa phương án trực tiếp.</li>
  <li><strong>Thông báo tự động theo chức vụ qua Email thực tế:</strong> Tích hợp giao thức SMTP/Gmail để gửi thông báo tức thời đến đích danh hòm thư của từng vị trí phụ trách (Trưởng phòng Marketing, Trưởng phòng CSKH, Giám đốc Điều hành) kèm đường dẫn xử lý nhanh.</li>
  <li><strong>Nhật ký kiểm toán bất biến (Audit Trail):</strong> Mọi thao tác phê duyệt, từ chối, danh tính người xử lý, thời gian thực hiện và lý do đều được ghi nhận vào nhật ký kiểm toán phục vụ hậu kiểm.</li>
</ol>

<div class="img-container">
  <img src="{img4}" alt="Approval Inbox" />
  <p class="caption">[Hình 4] Hòm thư Phê Duyệt Kiểm Soát Rủi Ro (Approval Inbox) - Thẩm định các đề xuất bồi thường và nội dung chiến dịch</p>
</div>

<hr>

<h3>PAIN POINT 4: Dữ liệu vận hành bị phân mảnh và chi phí tiêu thụ tài nguyên AI là một "hộp đen" khó đo lường.</h3>
<p><strong>• Vấn đề thực tế:</strong><br>
1. Dữ liệu giữa các khâu bán hàng, tồn kho, thanh toán và hỗ trợ sau bán hàng thường nằm ở các hệ thống riêng lẻ, khiến người quản trị không nắm được bức tranh tổng thể về hoạt động kinh doanh và dịch vụ khách hàng.<br>
2. Việc sử dụng các mô hình ngôn ngữ lớn (LLM API) thường phát sinh chi phí khó kiểm soát. Doanh nghiệp không có công cụ theo dõi lượng token tiêu thụ theo thời gian thực và không biết được chi phí đó quy đổi ra tiền thực tế là bao nhiêu để cân đối hiệu quả chi phí (ROI).</p>
<p><strong>• Giải pháp trong OpenDX CompanyOS:</strong></p>
<ol>
  <li><strong>Backend Authoritative Truth (Chân lý dữ liệu từ Backend):</strong> Tuân thủ Clean Architecture nghiêm ngặt. Mọi dữ liệu về giá bán, chiết khấu, tồn kho khả dụng và trạng thái thanh toán đều được tính toán và kiểm chứng ở tầng nghiệp vụ lõi (Domain/Application layer). Phía giao diện (Storefront/Console) chỉ hiển thị dữ liệu phản ánh từ backend, loại bỏ hoàn toàn nguy cơ gian lận từ phía client.</li>
  <li><strong>Hồ sơ khách hàng hợp nhất (Customer 360 CRM):</strong> Liên kết đồng bộ danh tính khách hàng với toàn bộ lịch sử đơn hàng, phiếu hỗ trợ kỹ thuật, ghi chú chăm sóc và giá trị đóng góp vòng đời (LTV).</li>
  <li><strong>Giám sát chi phí AI minh bạch (AI Cost &amp; Token Observability):</strong>
    <ul>
      <li>Hệ thống tự động ghi nhận số lượng input token, output token, mã định danh mô hình và chi phí vi mô (micros) của từng lần gọi AI vào bảng lưu vết <code>agentic_model_runs</code>.</li>
      <li>Trên Dashboard điều hành, hệ thống tổng hợp và quy đổi trực tiếp lượng token tiêu thụ ra tiền tệ (VNĐ và USD) theo thời gian thực (hiển thị rõ lượng tiêu thụ trong kỳ báo cáo và tổng tích lũy), giúp người quản trị nắm bắt chính xác mức tiêu hao ngân sách của hệ thống AI.</li>
    </ul>
  </li>
</ol>

<div class="img-container">
  <img src="{img5}" alt="Commerce Dashboard" />
  <p class="caption">[Hình 5] Bảng Điều Hành Doanh Nghiệp (Commerce Dashboard) - Đo lường tài chính mô phỏng và Chỉ số Token AI quy đổi ra tiền</p>
</div>

<div class="img-container">
  <img src="{img6}" alt="Company Overview" />
  <p class="caption">[Hình 6] Bảng Tổng Quan Vận Hành Công Ty (Company Overview) - Trạng thái hoạt động 4 trụ cột và lộ trình kiến trúc</p>
</div>

<div class="img-container">
  <img src="{img7}" alt="Customer CRM" />
  <p class="caption">[Hình 7] Phân hệ Quản Trị Khách Hàng CRM 360 - Quản lý danh sách khách hàng và lịch sử tương tác</p>
</div>

<hr>

<h2>3. CHẤT LƯỢNG KỸ THUẬT &amp; TÍNH SẴN SÀNG NGUỒN MỞ</h2>
<ol>
  <li><strong>Kiến trúc phân tầng chuẩn mực (Clean Architecture):</strong> Tách biệt hoàn toàn giữa tầng Domain, Application, Infrastructure và Presentation. Logic nghiệp vụ độc lập với framework, cơ sở dữ liệu và giao diện người dùng, giúp hệ thống dễ dàng bảo trì, mở rộng và kiểm thử độc lập.</li>
  <li><strong>Độ tin cậy mã nguồn và tự động hóa kiểm thử:</strong>
    <ul>
      <li>Toàn bộ mã nguồn vượt qua 100% các bài kiểm tra tự động: Lệnh kiểm thử <code>pnpm check</code> chạy qua 23 tệp kiểm thử với 119/119 unit &amp; integration tests đều đạt kết quả Pass.</li>
      <li>Lệnh <code>pnpm audit:repo</code> đạt chuẩn toàn vẹn cấu trúc mã nguồn mở.</li>
      <li>Hệ thống kiểm tra kiểu dữ liệu tĩnh TypeScript đạt mức tuyệt đối không có lỗi (0 errors).</li>
    </ul>
  </li>
  <li><strong>Tuân thủ tiêu chí OLP 2026:</strong>
    <ul>
      <li>Đầy đủ tiêu đề bản quyền SPDX Apache-2.0 trên từng tệp tin nguồn.</li>
      <li>Triển khai hoàn chỉnh qua Docker Compose, cho phép dựng toàn bộ hệ thống từ mã nguồn gốc mà không phụ thuộc vào các gói cài đặt đóng kín ngoài repo.</li>
      <li>Bảo đảm nguyên tắc bảo vệ quyền riêng tư dữ liệu (PII-free) trong các tầng báo cáo điều hành.</li>
    </ul>
  </li>
</ol>

<h2>4. KẾT LUẬN</h2>
<p><strong>OpenDX CompanyOS</strong> giải quyết bài toán cốt lõi của doanh nghiệp khi ứng dụng trí tuệ nhân tạo: <strong>Đưa AI vào khuôn khổ vận hành có tổ chức</strong>. Bằng việc kết hợp chặt chẽ giữa khả năng lập luận của AI, tính bền bỉ của quy trình thị giác và cơ chế kiểm soát rủi ro của con người, sản phẩm cung cấp một kiến trúc hoàn chỉnh, thực tế và sẵn sàng cho việc mở rộng trong tương lai.</p>

</body>
</html>
"""
    doc_path = os.path.abspath("docs/thuyet-minh-san-pham-opendx-companyos.html")
    with open(doc_path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"HTML created at: {doc_path} ({os.path.getsize(doc_path) / 1024:.1f} KB)")

    # Copy to Desktop and Downloads for instant access
    desktop_path = "/home/duy/Desktop/Thuyet-Minh-OpenDX-CompanyOS.html"
    downloads_path = "/home/duy/Downloads/Thuyet-Minh-OpenDX-CompanyOS.html"
    shutil.copyfile(doc_path, desktop_path)
    shutil.copyfile(doc_path, downloads_path)
    print(f"Copied to Desktop: {desktop_path}")
    print(f"Copied to Downloads: {downloads_path}")

if __name__ == "__main__":
    generate_html()
