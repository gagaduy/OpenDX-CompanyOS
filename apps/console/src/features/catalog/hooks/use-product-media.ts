// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, useState } from "react";
import type { CatalogApi } from "../api/catalog-api";
import type { ProductMedia } from "../types/catalog.types";

interface ViewMedia extends ProductMedia { readonly previewSource: string }
export function useProductMedia(api: CatalogApi, productId: string) {
  const [media, setMedia] = useState<readonly ViewMedia[]>([]); const [progress, setProgress] = useState<number>();
  const [notice, setNotice] = useState<string>();
  const previewSources = useRef(new Set<string>());
  useEffect(() => () => { previewSources.current.forEach((source) => URL.revokeObjectURL(source)); }, []);
  async function upload(input: { readonly file: File; readonly altText: string; readonly sortOrder: number; readonly isPrimary: boolean }) {
    setNotice(undefined); setProgress(0);
    try { const created = await api.uploadMedia(productId, input, setProgress); const previewSource = await api.loadMediaPreview(productId, created.id); if (previewSource.startsWith("blob:")) previewSources.current.add(previewSource); setMedia((current) => [...current.map((item) => created.isPrimary ? { ...item, isPrimary: false } : item), { ...created, previewSource }]); }
    catch { setNotice("Unable to upload this image."); }
  }
  async function update(id: string, input: { readonly altText?: string; readonly sortOrder?: number; readonly isPrimary?: boolean }) {
    setNotice(undefined);
    try { const value = await api.updateMedia(productId, id, input); setMedia((current) => current.map((item) => item.id === id ? { ...item, ...value } : input.isPrimary ? { ...item, isPrimary: false } : item)); }
    catch { setNotice("Unable to update this image."); }
  }
  async function remove(id: string) { setNotice(undefined); try { await api.deleteMedia(productId, id); setMedia((current) => { const removed = current.find((item) => item.id === id); if (removed?.previewSource.startsWith("blob:")) { URL.revokeObjectURL(removed.previewSource); previewSources.current.delete(removed.previewSource); } return current.filter((item) => item.id !== id); }); } catch { setNotice("Unable to delete this image."); } }
  return { media, progress, notice, upload, update, remove };
}
