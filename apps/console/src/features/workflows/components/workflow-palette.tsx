// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import {
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  GripVertical,
  Mail,
  Bot,
  GitBranch,
  ShieldAlert,
  Sparkles,
  Layers,
} from "lucide-react";
import {
  PALETTE_CATEGORIES,
  PALETTE_NODE_TEMPLATES,
  type PaletteNodeTemplate,
} from "../palette-catalog";

interface WorkflowPaletteProps {
  readonly isOpen: boolean;
  readonly onToggle: () => void;
  readonly onAddNode: (template: PaletteNodeTemplate) => void;
}

export function WorkflowPalette({ isOpen, onToggle, onAddNode }: WorkflowPaletteProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const filteredTemplates =
    selectedCategory === "all"
      ? PALETTE_NODE_TEMPLATES
      : PALETTE_NODE_TEMPLATES.filter((t) => t.category === selectedCategory);

  const getTemplateIcon = (type: PaletteNodeTemplate["type"]) => {
    switch (type) {
      case "event":
        return <Mail size={15} className="paletteIconSvg event" aria-hidden="true" />;
      case "ai_analysis":
        return <Bot size={15} className="paletteIconSvg ai" aria-hidden="true" />;
      case "decision_router":
        return <GitBranch size={15} className="paletteIconSvg router" aria-hidden="true" />;
      case "approval_gate":
        return <ShieldAlert size={15} className="paletteIconSvg approval" aria-hidden="true" />;
      case "action":
        return <Sparkles size={15} className="paletteIconSvg action" aria-hidden="true" />;
    }
  };

  const handleDragStart = (e: React.DragEvent, template: PaletteNodeTemplate) => {
    e.dataTransfer.setData("application/reactflow-template-id", template.id);
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <aside
      className={`workflowPalette ${isOpen ? "open" : "collapsed"}`}
      aria-label="Thư viện khối nghiệp vụ"
    >
      <div className="paletteHeader">
        <div className="paletteHeaderTitle">
          <Layers size={16} className="paletteHeaderIcon" aria-hidden="true" />
          <span className="paletteHeading">Thư Viện Khối</span>
        </div>
        <button
          type="button"
          className="paletteToggleBtn"
          onClick={onToggle}
          aria-label={isOpen ? "Thu gọn thư viện" : "Mở rộng thư viện khối"}
          title={isOpen ? "Thu gọn" : "Mở rộng"}
        >
          {isOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
        </button>
      </div>

      {isOpen && (
        <div className="paletteBody">
          <p className="paletteSubtext">
            Kéo thả hoặc bấm (+) để bổ sung khối nghiệp vụ vào dây chuyền vận hành:
          </p>

          {/* Category Filter Pills */}
          <div className="paletteFilterPills" role="tablist">
            <button
              type="button"
              className={`palettePill ${selectedCategory === "all" ? "active" : ""}`}
              onClick={() => setSelectedCategory("all")}
            >
              Tất cả ({PALETTE_NODE_TEMPLATES.length})
            </button>
            {PALETTE_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={`palettePill ${selectedCategory === cat.id ? `active ${cat.id}` : ""}`}
                onClick={() => setSelectedCategory(cat.id)}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Template List */}
          <div className="paletteTemplateList">
            {filteredTemplates.map((template) => (
              <div
                key={template.id}
                className={`paletteCard ${template.category}`}
                draggable
                onDragStart={(e) => handleDragStart(e, template)}
                title="Kéo thẻ này thả vào bàn vẽ hoặc bấm nút (+)"
              >
                <div className="paletteCardGrip" aria-hidden="true">
                  <GripVertical size={14} />
                </div>
                <div className={`paletteCardIconWrapper ${template.category}`}>
                  {getTemplateIcon(template.type)}
                </div>
                <div className="paletteCardContent">
                  <div className="paletteCardBadgeRow">
                    <span className={`paletteBadge ${template.category}`}>{template.badge}</span>
                  </div>
                  <h4 className="paletteCardTitle">{template.name}</h4>
                  <p className="paletteCardDesc">{template.keyHighlight}</p>
                </div>
                <button
                  type="button"
                  className="paletteAddBtn"
                  onClick={() => onAddNode(template)}
                  aria-label={`Thêm ${template.name} vào bàn vẽ`}
                  title="Thêm vào bàn vẽ"
                >
                  <Plus size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
