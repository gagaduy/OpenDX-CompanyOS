// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, useState } from "react";
import { loadGoogleIdentity } from "../api/google-identity-client";
export function GoogleSignInButton({
  clientId,
  onCredential,
}: {
  readonly clientId?: string;
  readonly onCredential: (credential: string) => void;
}) {
  const parent = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (clientId === undefined || parent.current === null) return;
    let active = true;
    void loadGoogleIdentity()
      .then((identity) => {
        if (!active || parent.current === null) return;
        identity.initialize({
          client_id: clientId,
          auto_select: false,
          cancel_on_tap_outside: true,
          callback: ({ credential }) => {
            if (credential !== undefined) onCredential(credential);
          },
        });
        identity.renderButton(parent.current, {
          theme: "filled_black",
          size: "large",
          shape: "rectangular",
          text: "continue_with",
          width: 320,
        });
      })
      .catch(() => active && setError("Không thể tải Google Sign-In."));
    return () => {
      active = false;
    };
  }, [clientId, onCredential]);
  if (clientId === undefined)
    return (
      <p role="alert" className="inline-alert">
        Google Sign-In chưa được cấu hình. Bạn vẫn có thể xem sản phẩm và dùng
        giỏ hàng.
      </p>
    );
  return (
    <div>
      {error && (
        <p role="alert" className="inline-alert">
          {error}
        </p>
      )}
      <div ref={parent} className="google-button" />
    </div>
  );
}
