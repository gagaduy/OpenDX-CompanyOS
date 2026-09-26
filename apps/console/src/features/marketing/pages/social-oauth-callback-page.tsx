// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, Loader2, X } from "lucide-react";
import "../styles/marketing.css";

export function SocialOAuthCallbackPage() {
  const [status, setStatus] = useState<"processing" | "success" | "error" | "no_opener">("processing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const code = searchParams.get("code");
      const error = searchParams.get("error_description") || searchParams.get("error");

      if (error) {
        setStatus("error");
        setErrorMessage(error);
        if (window.opener) {
          window.opener.postMessage({ type: "META_OAUTH_ERROR", error }, window.location.origin);
        }
        return;
      }

      if (code) {
        if (window.opener) {
          window.opener.postMessage({ type: "META_OAUTH_CODE", code }, window.location.origin);
          setStatus("success");
          setTimeout(() => {
            window.close();
          }, 1200);
        } else {
          setStatus("no_opener");
        }
        return;
      }

      setStatus("error");
      setErrorMessage("Không tìm thấy authorization code từ phản hồi của Meta.");
    } catch (err: any) {
      setStatus("error");
      setErrorMessage(err?.message || "Lỗi xử lý phản hồi ủy quyền.");
    }
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#010102",
        color: "#f8fafc",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-sans, system-ui, sans-serif)",
        padding: "1.5rem",
      }}
    >
      <div
        style={{
          background: "rgba(15, 23, 42, 0.95)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: "12px",
          padding: "2rem",
          maxWidth: "460px",
          width: "100%",
          textAlign: "center",
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.6)",
        }}
      >
        {status === "processing" && (
          <div>
            <Loader2
              size={36}
              style={{ color: "#5e6ad2", margin: "0 auto 1rem", animation: "spin 1s linear infinite" }}
            />
            <h2 style={{ fontSize: "1.2rem", fontWeight: 600, marginBottom: "0.5rem" }}>
              Đang xác thực với Meta...
            </h2>
            <p style={{ color: "#94a3b8", fontSize: "0.875rem" }}>
              Vui lòng đợi giây lát trong khi chuyển tiếp mã xác thực về hệ thống.
            </p>
          </div>
        )}

        {status === "success" && (
          <div>
            <CheckCircle2 size={40} style={{ color: "#10b981", margin: "0 auto 1rem" }} />
            <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem", color: "#34d399" }}>
              Ủy quyền thành công!
            </h2>
            <p style={{ color: "#cbd5e1", fontSize: "0.875rem", lineHeight: 1.5 }}>
              Mã xác thực đã được gửi về OpenDX CompanyOS. Cửa sổ này sẽ tự động đóng ngay...
            </p>
          </div>
        )}

        {status === "error" && (
          <div>
            <AlertTriangle size={40} style={{ color: "#ef4444", margin: "0 auto 1rem" }} />
            <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem", color: "#f87171" }}>
              Ủy quyền không thành công
            </h2>
            <p style={{ color: "#cbd5e1", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
              {errorMessage || "Bạn đã hủy cấp quyền hoặc đã xảy ra lỗi từ Meta."}
            </p>
            <button
              type="button"
              onClick={() => window.close()}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.6rem 1.2rem",
                background: "#334155",
                color: "#ffffff",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: 500,
              }}
            >
              <X size={16} />
              <span>Đóng cửa sổ</span>
            </button>
          </div>
        )}

        {status === "no_opener" && (
          <div>
            <CheckCircle2 size={40} style={{ color: "#10b981", margin: "0 auto 1rem" }} />
            <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem" }}>
              Đã nhận mã xác thực
            </h2>
            <p style={{ color: "#cbd5e1", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
              Cửa sổ gốc không còn kết nối. Bạn có thể quay lại Trung tâm Điều hành OpenDX.
            </p>
            <button
              type="button"
              onClick={() => {
                window.location.href = "/agentic/command-center";
              }}
              style={{
                padding: "0.6rem 1.2rem",
                background: "#5e6ad2",
                color: "#ffffff",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: 500,
              }}
            >
              Về Trung tâm Điều hành
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
