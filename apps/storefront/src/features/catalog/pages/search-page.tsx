// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Navigate, useSearchParams } from "react-router-dom";
export function SearchPage() { const [parameters] = useSearchParams(); return <Navigate replace to={`/?${parameters}`} />; }
