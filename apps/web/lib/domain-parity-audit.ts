import { existsSync } from "node:fs";
import path from "node:path";

export type DomainSystem = "ycrm" | "erp" | "enms";
export type AuditRole = "pm" | "rd" | "qa" | "tpm";

export type ArtifactCheck = {
  path: string;
  exists: boolean;
};

export type RoleAuditResult = {
  role: AuditRole;
  agentSkillPath: string;
  goal: string;
  passed: boolean;
  checks: ArtifactCheck[];
};

export type DomainParityResult = {
  system: DomainSystem;
  passed: boolean;
  passedChecks: number;
  totalChecks: number;
  roles: RoleAuditResult[];
};

export type DomainParityAuditReport = {
  generatedAt: number;
  passed: boolean;
  commonAgentSkills: ArtifactCheck[];
  systems: DomainParityResult[];
};

const COMMON_AGENT_SKILLS = [
  "skills/pm-agent/SKILL.md",
  "skills/rd-agent/SKILL.md",
  "skills/qa-agent/SKILL.md",
  "skills/tpm-agent/SKILL.md",
];

const SYSTEM_ROLE_MANIFEST: Record<
  DomainSystem,
  Record<AuditRole, { goal: string; artifacts: string[] }>
> = {
  ycrm: {
    pm: {
      goal: "驗證產品入口、review 入口與 durable knowledge 骨架",
      artifacts: [
        "skills/ycrm/SKILL.md",
        "schema/integration-profiles/ycrm.md",
        "apps/web/app/review/ycrm/page.tsx",
        "apps/web/app/debug/ycrm-context-builder/page.tsx",
        "wiki/entities/customers/YCRM_CUSTOMER_SUMMARY_TEMPLATE.md",
      ],
    },
    rd: {
      goal: "驗證 planner/context/learning/writeback/promotion 主流程",
      artifacts: [
        "apps/web/lib/ycrm-context-builder.ts",
        "apps/web/lib/ycrm-context-pack.ts",
        "apps/web/lib/ycrm-learning-draft.ts",
        "apps/web/lib/ycrm-learning-auto-trigger.ts",
        "apps/web/lib/ycrm-learning-writeback.ts",
        "apps/web/lib/ycrm-learning-promotion.ts",
        "apps/web/app/api/debug/ycrm-context-builder/route.ts",
        "apps/web/app/api/debug/ycrm-learning-draft/route.ts",
      ],
    },
    qa: {
      goal: "驗證最少測試覆蓋與 review workspace 支援",
      artifacts: [
        "apps/web/lib/ycrm-context-builder.test.ts",
        "apps/web/lib/ycrm-context-pack.test.ts",
        "apps/web/lib/ycrm-learning-draft.test.ts",
        "apps/web/lib/ycrm-learning-auto-trigger.test.ts",
        "apps/web/app/components/learning-review-workspace.test.tsx",
      ],
    },
    tpm: {
      goal: "驗證 session persistence、chat surface 與治理入口",
      artifacts: [
        "apps/web/app/api/chat/route.ts",
        "apps/web/app/api/web-sessions/shared.ts",
        "apps/web/app/components/chat-panel.tsx",
        "apps/web/app/components/planner-preflight-header.tsx",
        "apps/web/app/components/workspace/chat-sessions-sidebar.tsx",
      ],
    },
  },
  erp: {
    pm: {
      goal: "驗證產品入口、review 入口與 durable knowledge 骨架",
      artifacts: [
        "skills/erp/SKILL.md",
        "schema/integration-profiles/erp.md",
        "apps/web/app/review/erp/page.tsx",
        "apps/web/app/debug/erp-context-builder/page.tsx",
        "wiki/entities/orders/ERP_SALES_ORDER_SUMMARY_TEMPLATE.md",
      ],
    },
    rd: {
      goal: "驗證 planner/context/learning/writeback/promotion 主流程",
      artifacts: [
        "apps/web/lib/erp-context-builder.ts",
        "apps/web/lib/erp-context-pack.ts",
        "apps/web/lib/erp-learning-draft.ts",
        "apps/web/lib/erp-learning-auto-trigger.ts",
        "apps/web/lib/erp-learning-writeback.ts",
        "apps/web/lib/erp-learning-promotion.ts",
        "apps/web/app/api/debug/erp-context-builder/route.ts",
        "apps/web/app/api/debug/erp-learning-draft/route.ts",
      ],
    },
    qa: {
      goal: "驗證最少測試覆蓋與 review workspace 支援",
      artifacts: [
        "apps/web/lib/erp-context-builder.test.ts",
        "apps/web/lib/erp-context-pack.test.ts",
        "apps/web/lib/erp-learning-draft.test.ts",
        "apps/web/lib/erp-learning-auto-trigger.test.ts",
        "apps/web/app/components/learning-review-workspace.test.tsx",
      ],
    },
    tpm: {
      goal: "驗證 session persistence、chat surface 與治理入口",
      artifacts: [
        "apps/web/app/api/chat/route.ts",
        "apps/web/app/api/web-sessions/shared.ts",
        "apps/web/app/components/chat-panel.tsx",
        "apps/web/app/components/planner-preflight-header.tsx",
        "apps/web/app/components/workspace/chat-sessions-sidebar.tsx",
      ],
    },
  },
  enms: {
    pm: {
      goal: "驗證產品入口、review 入口、analytics workbench 與 durable knowledge 骨架",
      artifacts: [
        "skills/enms/SKILL.md",
        "schema/integration-profiles/enms.md",
        "apps/web/app/review/enms/page.tsx",
        "apps/web/app/debug/enms-context-builder/page.tsx",
        "apps/web/app/debug/enms-analytics/page.tsx",
        "wiki/entities/energy/ENMS_DEMAND_FORECAST_TEMPLATE.md",
      ],
    },
    rd: {
      goal: "驗證 planner/context/analytics/learning/writeback/promotion 主流程",
      artifacts: [
        "apps/web/lib/enms-context-builder.ts",
        "apps/web/lib/enms-context-pack.ts",
        "apps/web/lib/enms-demand-forecast-engine.ts",
        "apps/web/lib/enms-anomaly-detection-engine.ts",
        "apps/web/lib/enms-alert-governance-engine.ts",
        "apps/web/lib/enms-learning-draft.ts",
        "apps/web/lib/enms-learning-auto-trigger.ts",
        "apps/web/lib/enms-learning-writeback.ts",
        "apps/web/lib/enms-learning-promotion.ts",
        "apps/web/app/api/debug/enms-context-builder/route.ts",
        "apps/web/app/api/debug/enms-analytics/route.ts",
        "apps/web/app/api/debug/enms-learning-draft/route.ts",
      ],
    },
    qa: {
      goal: "驗證 analytics / learning 的最少測試覆蓋與 review workspace 支援",
      artifacts: [
        "apps/web/lib/enms-context-builder.test.ts",
        "apps/web/lib/enms-context-pack.test.ts",
        "apps/web/lib/enms-demand-forecast-engine.test.ts",
        "apps/web/lib/enms-anomaly-detection-engine.test.ts",
        "apps/web/lib/enms-alert-governance-engine.test.ts",
        "apps/web/lib/enms-learning-draft.test.ts",
        "apps/web/lib/enms-learning-auto-trigger.test.ts",
        "apps/web/app/components/learning-review-workspace.test.tsx",
      ],
    },
    tpm: {
      goal: "驗證 session persistence、chat surface 與治理入口",
      artifacts: [
        "apps/web/app/api/chat/route.ts",
        "apps/web/app/api/web-sessions/shared.ts",
        "apps/web/app/components/chat-panel.tsx",
        "apps/web/app/components/planner-preflight-header.tsx",
        "apps/web/app/components/workspace/chat-sessions-sidebar.tsx",
      ],
    },
  },
};

function resolveRepoRoot(): string {
  const candidates = [
    process.cwd(),
    path.resolve(process.cwd(), ".."),
    path.resolve(process.cwd(), "../.."),
    path.resolve(process.cwd(), "../../.."),
  ];
  const sentinels = [
    "apps/web/app/api/chat/route.ts",
    "skills/ycrm/SKILL.md",
    "wiki/index.md",
  ];

  for (const candidate of candidates) {
    if (sentinels.every((relativePath) => existsSync(path.join(candidate, relativePath)))) {
      return candidate;
    }
  }

  return candidates[0];
}

function buildArtifactCheck(repoRoot: string, relativePath: string): ArtifactCheck {
  return {
    path: relativePath,
    exists: existsSync(path.join(repoRoot, relativePath)),
  };
}

export function collectDomainParityAudit(): DomainParityAuditReport {
  const repoRoot = resolveRepoRoot();
  const commonAgentSkills = COMMON_AGENT_SKILLS.map((relativePath) =>
    buildArtifactCheck(repoRoot, relativePath),
  );

  const systems = (Object.entries(SYSTEM_ROLE_MANIFEST) as Array<
    [DomainSystem, Record<AuditRole, { goal: string; artifacts: string[] }>]
  >).map(([system, roleManifest]) => {
    const roles = (Object.entries(roleManifest) as Array<
      [AuditRole, { goal: string; artifacts: string[] }]
    >).map(([role, config]) => {
      const checks = config.artifacts.map((relativePath) =>
        buildArtifactCheck(repoRoot, relativePath),
      );
      return {
        role,
        agentSkillPath: `skills/${role}-agent/SKILL.md`,
        goal: config.goal,
        passed: checks.every((check) => check.exists),
        checks,
      };
    });

    const totalChecks = roles.reduce((sum, role) => sum + role.checks.length, 0);
    const passedChecks = roles.reduce(
      (sum, role) => sum + role.checks.filter((check) => check.exists).length,
      0,
    );

    return {
      system,
      passed: roles.every((role) => role.passed),
      passedChecks,
      totalChecks,
      roles,
    };
  });

  return {
    generatedAt: Date.now(),
    passed:
      commonAgentSkills.every((check) => check.exists)
      && systems.every((system) => system.passed),
    commonAgentSkills,
    systems,
  };
}
