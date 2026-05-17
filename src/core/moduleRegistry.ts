// Module Registry — 정적, 단순, 안전.
// 외부 코드 동적 로딩 없음. 모듈은 src/modules/index.ts에서 명시적으로 register() 호출.

export type ModuleStatus = "active" | "planned" | "disabled";

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
