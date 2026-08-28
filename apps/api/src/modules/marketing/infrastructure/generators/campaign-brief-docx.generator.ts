// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { CampaignBrief } from "../../domain/entities/marketing-campaign";
import { buildZip } from "./zip-builder";

export function generateCampaignBriefDocx(brief: CampaignBrief): {
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

  const prohibitedClaimsText = brief.prohibitedClaims.length > 0 ? brief.prohibitedClaims.join(", ") : "None";

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="48"/></w:rPr><w:t>Marketing Campaign Brief: ${escapeXml(brief.campaignName)}</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Campaign ID: </w:t></w:r><w:r><w:t>${escapeXml(brief.campaignId)}</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Objective: </w:t></w:r><w:r><w:t>${escapeXml(brief.objective)}</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Subject: </w:t></w:r><w:r><w:t>${escapeXml(brief.subjectKind)} (${escapeXml(brief.subjectReference)})</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Target Audience: </w:t></w:r><w:r><w:t>${escapeXml(brief.audience ?? "General")}</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Language: </w:t></w:r><w:r><w:t>${escapeXml(brief.language)}</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Tone of Voice: </w:t></w:r><w:r><w:t>${escapeXml(brief.tone ?? "Professional")}</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Mandatory Message: </w:t></w:r><w:r><w:t>${escapeXml(brief.mandatoryMessage)}</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Prohibited Claims: </w:t></w:r><w:r><w:t>${escapeXml(prohibitedClaimsText)}</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Call to Action: </w:t></w:r><w:r><w:t>${escapeXml(brief.callToAction)}</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Facebook Page Configuration: </w:t></w:r><w:r><w:t>${escapeXml(brief.facebookPageConfigurationId)}</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Scheduled For: </w:t></w:r><w:r><w:t>${escapeXml(brief.scheduledFor)}</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Deadline: </w:t></w:r><w:r><w:t>${escapeXml(brief.deadline)}</w:t></w:r></w:p>
  </w:body>
</w:document>`;

  const buffer = buildZip([
    { path: "[Content_Types].xml", content: contentTypesXml },
    { path: "_rels/.rels", content: relsXml },
    { path: "word/document.xml", content: documentXml },
  ]);

  return {
    buffer,
    filename: `campaign_brief_${brief.campaignId}.docx`,
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
