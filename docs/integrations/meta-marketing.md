<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Meta Marketing Integration (Facebook Page & Instagram Business)

OpenDX CompanyOS provides fail-closed, multi-modal publishing to **Facebook Fanpage** and **Instagram Business** driven by autonomous Digital Employees (Marketing Department) under CEO and human approval governance.

---

## 1. Prerequisites on Meta for Developers

To enable automated publishing and 1-Click OAuth token renewal:

1. Log into [Meta for Developers](https://developers.facebook.com/) with the Facebook account that owns or manages your Fanpage and Instagram Business account.
2. Under **My Apps** (Ứng dụng của tôi), create an App or select your existing App (Recommended App Type: **Business**).
3. Connect your **Facebook Fanpage** to your **Instagram Business account** via the Facebook Page Settings (under *Linked Accounts* / *Tài khoản đã liên kết*).

---

## 2. Meta App Configuration

### A. Add Facebook Login & OAuth Redirect URI
1. In your App dashboard, add the **Facebook Login** product (if not already added).
2. Go to **Facebook Login** &rarr; **Settings** (Cài đặt) &rarr; **Client OAuth Settings** (Cài đặt OAuth ứng dụng).
3. Under **Valid OAuth Redirect URIs** (URI chuyển hướng OAuth hợp lệ), add:
   ```text
   http://localhost:3000/auth/oauth-callback
   ```
   *(For production deployment, replace `localhost:3000` with your public console domain, e.g. `https://console.yourcompany.com/auth/oauth-callback`).*
4. Click **Save Changes** (Lưu thay đổi).

### B. Obtain App ID and App Secret
1. In the left navigation menu, go to **App settings** (Cài đặt ứng dụng) &rarr; **Basic** (Thông tin cơ bản).
2. Note your **App ID** (ID ứng dụng) (e.g. `2380343385829475`).
3. Click **Show** (Hiển thị) next to **App Secret** (Khóa bí mật của ứng dụng), enter your Facebook password, and copy the 32-character secret.

---

## 3. Connecting to OpenDX CompanyOS

You can connect Meta to OpenDX CompanyOS through either of two methods:

### Method 1: 1-Click OAuth Reconnect in Console (Recommended — Zero-Copy Permanent Token)

1. Open the Staff Console at `http://localhost:3000/agentic/tasks`.
2. Click on the **Social Token** badge in the header or open the **Giám sát & Tự động Quản lý Social Tokens** modal.
3. Click **⚙️ Cấu hình Meta App**:
   - Enter your **Meta App ID**.
   - Enter your **Meta App Secret**.
   - Click **Lưu cấu hình** (Save Configuration).
4. Click the purple **1-Click Kết nối lại** button:
   - A Facebook login popup will open asking for permissions (`pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`).
   - Confirm permissions.
   - The popup automatically redirects and passes the authorization code back to OpenDX.
   - OpenDX server exchanges the code with Meta Graph API, extracts a **permanent Page Access Token**, and automatically links it to both your Facebook Fanpage and connected Instagram Business account.

### Method 2: Environment Variables (`.env`)

Add the credentials directly to your `.env` file:

```env
# Meta App Credentials (for OAuth code exchange)
META_APP_ID=2380343385829475
META_APP_SECRET=your_32_character_app_secret

# Facebook Fanpage
FACEBOOK_PAGE_ID=1321445584378490
FACEBOOK_PAGE_ACCESS_TOKEN=EAA...your_token...

# Instagram Business Account
INSTAGRAM_PUBLICATION_MODE=live
INSTAGRAM_BUSINESS_ACCOUNT_ID=17841427131793503
INSTAGRAM_ACCESS_TOKEN=EAA...your_token...
INSTAGRAM_PUBLIC_MEDIA_BASE_URL=https://<your-public-media-cdn-or-tunnel>/v1/public/marketing/media
```

After modifying `.env`, restart the API service:
```bash
docker compose -f infra/docker/docker-compose.yml restart api
```

---

## 4. How Instagram Publishing Works

- **Image Preparation**: Instagram requires images to be publicly accessible over HTTPS for Meta's servers to fetch and ingest. OpenDX serves signed public image URLs via `INSTAGRAM_PUBLIC_MEDIA_BASE_URL` (or Cloudflare Tunnel / public reverse proxy in local environments).
- **Token Synchronization**: In Meta's architecture, a Facebook Page Access Token for a connected Page has permission to publish to its linked Instagram Business account. OpenDX automatically synchronizes tokens between Facebook and Instagram, and includes a transparent fallback in `MetaGraphInstagramPublisherAdapter` to ensure zero-downtime publishing.
- **Fail-Closed Verification**: Posts are created as Meta Media Containers first, polled until `FINISHED`, and published. Publication is verified with SHA-256 digests and permanent live post links.
