// Module Registry — 정적, 단순, 안전.
// 외부 코드 동적 로딩 없음. 모듈은 src/modules/index.ts에서 명시적으로 register() 호출.

// "active" — 분석 파이프라인까지 모두 연결됨 (false_ad)
// "ready"  — 최소 룰/스카웃/리포트 연결, 사용은 가능하지만 LLM 등 일부는 미연결 (counterfeit_goods)
// "planned"— 등록만 되어 있고 분석은 미연결
// "disabled"— 비활성
export type ModuleStatus = "active" | "ready" | "planned" | "disabled";

export interface ModuleCapabilities {
  publicUrlAnalysis: boolean;
  ruleBasedDetection: boolean;
  aiAnalysis: boolean;
  evidencePackage: boolean;
  reportDraft: boolean;
}

export interface ModuleUiGuide {
  detect?: string;
  report?: string;
  evidence?: string;
  reward?: string;
  caution?: string;
}

export interface ModuleUiInfo {
  agency?: string;
  target?: string;
  difficulty?: string;
  rewardLikelihood?: string;
  guide?: ModuleUiGuide;
}

export interface ModuleDefinition {
  id: string;
  slug: string;
  name: string;
  category: string;
  status: ModuleStatus;
  capabilities: ModuleCapabilities;
  configPath?: string;
  agencyConfigPath?: string;
  reportTemplatePath?: string;
  supportedInputTypes: string[];
  safetyNotes: string[];
  ui: ModuleUiInfo;
}

class ModuleRegistry {
  private modules = new Map<string, ModuleDefinition>();
  private defaultId: string | undefined;

  register(definition: ModuleDefinition, options: { isDefault?: boolean } = {}): void {
    if (this.modules.has(definition.id)) {
      throw new Error(`Module already registered: ${definition.id}`);
    }
    this.modules.set(definition.id, definition);
    if (options.isDefault) this.defaultId = definition.id;
  }

  list(): ModuleDefinition[] {
    return [...this.modules.values()];
  }

  get(id: string): ModuleDefinition | undefined {
    return this.modules.get(id);
  }

  has(id: string): boolean {
    return this.modules.has(id);
  }

  getActive(): ModuleDefinition[] {
    return this.list().filter((m) => m.status === "active");
  }

  getDefault(): ModuleDefinition {
    if (this.defaultId) {
      const def = this.modules.get(this.defaultId);
      if (def) return def;
    }
    const active = this.getActive();
    if (active.length === 0) {
      throw new Error("No active module registered");
    }
    return active[0];
  }
}

export const moduleRegistry = new ModuleRegistry();
