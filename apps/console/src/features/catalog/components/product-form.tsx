// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState, type FormEvent } from "react";
import type { Category, Product, ProductInput } from "../types/catalog.types";

interface AttributeRow { readonly id: number; name: string; value: string }
export function ProductForm({ product, categories, onSave }: { readonly product?: Product; readonly categories: readonly Category[]; readonly onSave: (input: ProductInput) => Promise<void> }) {
  const [name, setName] = useState(""); const [categoryId, setCategoryId] = useState(""); const [brand, setBrand] = useState(""); const [description, setDescription] = useState(""); const [slug, setSlug] = useState("");
  const [rows, setRows] = useState<AttributeRow[]>([{ id: 1, name: "", value: "" }]); const [validation, setValidation] = useState<string>();
  useEffect(() => { if (!product) return; setName(product.name); setCategoryId(product.categoryId); setBrand(product.brand ?? ""); setDescription(product.description); setSlug(product.slug); const entries = Object.entries(product.attributes); setRows(entries.length === 0 ? [{ id: 1, name: "", value: "" }] : entries.map(([key, value], index) => ({ id: index + 1, name: key, value: String(value) }))); }, [product]);
  const slugPreview = slug || slugify(name);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) { setValidation("Name is required."); return; }
    if (!categoryId) { setValidation("Category is required."); return; }
    if (!description.trim()) { setValidation("Description is required."); return; }
    const attributes = Object.fromEntries(rows.filter((row) => row.name.trim()).map((row) => [row.name.trim(), row.value.trim()]));
    setValidation(undefined);
    await onSave({ categoryId, name: name.trim(), ...(slugPreview ? { slug: slugPreview } : {}), ...(brand.trim() ? { brand: brand.trim() } : {}), description: description.trim(), attributes });
  }
  return <form className="editorForm" onSubmit={(event) => void submit(event)}>
    <div className="formGrid"><label>Category<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">Select category</option>{categories.filter((item) => item.status === "active").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Name<input value={name} onChange={(event) => setName(event.target.value)} /></label><label>Slug preview<input value={slugPreview} onChange={(event) => setSlug(slugify(event.target.value))} /></label><label>Brand<input value={brand} onChange={(event) => setBrand(event.target.value)} /></label></div>
    <label>Description<textarea rows={5} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
    <fieldset><legend>Attributes</legend>{rows.map((row, index) => <div className="attributeRow" key={row.id}><label>Attribute name {index + 1}<input aria-label={`Attribute name ${index + 1}`} value={row.name} onChange={(event) => setRows(rows.map((item) => item.id === row.id ? { ...item, name: event.target.value } : item))} /></label><label>Attribute value {index + 1}<input aria-label={`Attribute value ${index + 1}`} value={row.value} onChange={(event) => setRows(rows.map((item) => item.id === row.id ? { ...item, value: event.target.value } : item))} /></label></div>)}<button className="secondaryButton" type="button" onClick={() => setRows([...rows, { id: Math.max(...rows.map((row) => row.id)) + 1, name: "", value: "" }])}>Add attribute</button></fieldset>
    {validation && <p className="formError" role="alert">{validation}</p>}<div className="formActions"><button className="primaryButton" type="submit">Save product</button></div>
  </form>;
}
function slugify(value: string) { return value.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
