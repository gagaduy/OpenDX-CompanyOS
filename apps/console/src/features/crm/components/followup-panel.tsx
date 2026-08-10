// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { FollowupView } from "../types/crm.types";

export function FollowupPanel({followups,onClaim,pending}:{readonly followups:readonly FollowupView[]; readonly onClaim:(followup:FollowupView)=>void; readonly pending?:string}){ return <section className="detailCard"><h2>Follow-ups</h2>{followups.length===0?<p>No follow-ups.</p>:followups.map(followup=><article key={followup.id} className="activityItem"><h3>{followup.description}</h3><p>Due {new Date(followup.dueAt).toLocaleString("vi-VN")} · version {followup.version}</p>{followup.status==="open"&&!followup.assigneeId?<button className="primaryButton" type="button" disabled={pending===followup.id} onClick={()=>onClaim(followup)}>{pending===followup.id?"Claiming…":"Claim follow-up"}</button>:null}</article>)}</section>; }
