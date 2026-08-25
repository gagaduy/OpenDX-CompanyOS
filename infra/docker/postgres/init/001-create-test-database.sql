-- SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
-- SPDX-License-Identifier: Apache-2.0

CREATE ROLE opendx_local LOGIN PASSWORD 'opendx_local_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;

CREATE DATABASE opendx OWNER opendx_local;
CREATE DATABASE opendx_test OWNER opendx_local;

REVOKE CONNECT ON DATABASE opendx FROM PUBLIC;
REVOKE CONNECT ON DATABASE opendx_test FROM PUBLIC;
GRANT CONNECT ON DATABASE opendx TO opendx_local;
GRANT CONNECT ON DATABASE opendx_test TO opendx_local;
