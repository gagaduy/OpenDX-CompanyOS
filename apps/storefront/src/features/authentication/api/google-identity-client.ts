// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

interface GoogleCredentialResponse { readonly credential?: string }
interface GoogleAccounts { initialize(input: { client_id: string; callback: (response: GoogleCredentialResponse) => void; auto_select: boolean; cancel_on_tap_outside: boolean }): void; renderButton(parent: HTMLElement, options: Record<string, unknown>): void }
declare global { interface Window { google?: { accounts: { id: GoogleAccounts } } } }

let loadPromise: Promise<GoogleAccounts> | undefined;
export function loadGoogleIdentity(): Promise<GoogleAccounts> {
  if (window.google?.accounts.id !== undefined) return Promise.resolve(window.google.accounts.id);
  loadPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script"); script.src = "https://accounts.google.com/gsi/client"; script.async = true; script.defer = true;
    script.onload = () => window.google?.accounts.id === undefined ? reject(new Error("Google Identity unavailable")) : resolve(window.google.accounts.id);
    script.onerror = () => reject(new Error("Google Identity failed to load")); document.head.append(script);
  });
  return loadPromise;
}
