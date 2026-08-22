// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export function ExperienceLoadingStatus({
  progress,
}: {
  readonly progress: number;
}) {
  const value = Math.floor(Math.min(100, Math.max(0, progress)));
  return (
    <div
      className="homepage-experience-loading"
      role="progressbar"
      aria-label="Đang tải không gian 3D"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
    >
      <span>Đang chuẩn bị showroom</span>
      <strong>{value}%</strong>
    </div>
  );
}
