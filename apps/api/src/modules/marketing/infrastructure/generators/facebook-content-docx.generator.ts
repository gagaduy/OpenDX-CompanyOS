// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { CampaignBrief, ContentVersion } from "../../domain/entities/marketing-campaign";
import { buildZip } from "./zip-builder";

export function generateFacebookContentDocx(brief: CampaignBrief, contents: readonly ContentVersion[]): {
  buffer: Buffer;
  filename: string;
  mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
} {
  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  let versionSections = "";
  for (const c of contents) {
    const text = (c as any).primaryText ?? c.body ?? "";
    const headline = (c as any).headline ?? "N/A";
    const hashtags = c.hashtags.join(" ");

    versionSections += `
    <w:p>
      <w:pPr><w:pStyle w:val="Heading2"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t>Content Version ${c.versionNumber}</w:t></w:r>
    </w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Headline: </w:t></w:r><w:r><w:t>${escapeXml(headline)}</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Primary Body Text: </w:t></w:r></w:p>
    <w:p><w:r><w:t>${escapeXml(text)}</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Call to Action: </w:t></w:r><w:r><w:t>${escapeXml(c.callToAction)}</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Hashtags: </w:t></w:r><w:r><w:t>${escapeXml(hashtags)}</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Character Count: </w:t></w:r><w:r><w:t>${text.length} chars</w:t></w:r></w:p>
    <w:p><w:r><w:t>--------------------------------------------------</w:t></w:r></w:p>`;
  }

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="48"/></w:rPr><w:t>Facebook Post Copy Iterations: ${escapeXml(brief.campaignName)}</w:t></w:r>
    </w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Campaign ID: </w:t></w:r><w:r><w:t>${escapeXml(brief.campaignId)}</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Target Channel: </w:t></w:r><w:r><w:t>Facebook Page Feed Image Post</w:t></w:r></w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    ${versionSections}
  </w:body>
</w:document>`;

  const buffer = buildZip([
    { path: "[Content_Types].xml", content: contentTypesXml },
    { path: "_rels/.rels", content: relsXml },
    { path: "word/document.xml", content: documentXml },
  ]);

  return {
    buffer,
    filename: `facebook_content_${brief.campaignId}.docx`,
    mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
