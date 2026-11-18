export type Role = 'branch' | 'documentation_analysis' | 'payment_scheduling';
export type EventType = 'resolve_documentation' | 'supplier_onboarding' | 'ad_hoc';
export type PendencyType = 'missing_invoice' | 'unsigned_contract' | 'registration_update' | 'payment';
/** Flow ids and states are free: they come from the flow definitions (see /fluxos). */
export type PendencyFlow = string;
export type PendencyStatus = string;
export type PendencyAction =
  | 'ATTACH_DOCUMENT'
  | 'RESOLVE_WITH_COMMENT'
  | 'REQUEST_EXCEPTION'
  | 'APPROVE'
  | 'REJECT';
export type ReleaseStatus = 'not_scheduled' | 'in_analysis' | 'scheduled';
export type ReleaseAction = 'START_ANALYSIS' | 'RETURN' | 'SCHEDULE';

export interface Profile {
  id: string;
  name: string;
  roles: Role[];
}

export interface User {
  id: string;
  name: string;
  profile: Profile;
}

export interface EventTypeInfo {
  id: EventType;
  name: string;
  pendencyTypes: PendencyType[];
}

export interface PendencyTypeInfo {
  id: PendencyType;
  name: string;
  flowId: PendencyFlow;
  /** null = sempre a última versão publicada. */
  pinnedVersion: number | null;
  /** Versão em que novas pendências desse tipo começam agora. */
  effectiveVersion: number;
}

export interface HistoryEntry {
  at: string;
  actorId: string;
  action: string;
  from: string | null;
  to: string;
  detail?: string;
}

export interface Pendency {
  id: string;
  eventId: string;
  type: PendencyType;
  flow: PendencyFlow;
  /** Versão do fluxo em que foi aberta. Não muda até o fim. */
  flowVersion: number;
  title: string;
  paymentDueAt?: string;
  status: PendencyStatus;
  statusLabel: string;
  resolved: boolean;
  documents: string[];
  resolutionComment?: string;
  exceptionJustification?: string;
  rejectionReason?: string;
  history: HistoryEntry[];
  version: number;
}

export interface AppEvent {
  id: string;
  type: EventType;
  name: string;
  /** Data de pagamento do pedido: todas as pendências de pagamento do evento seguem ela. */
  paymentDueAt?: string;
  releaseStatus: ReleaseStatus;
  pendencies: { status: 'ok' | 'pending'; total: number; resolved: number };
  completed: boolean;
  history: HistoryEntry[];
  version: number;
}

export interface AppNotification {
  at: string;
  pendencyId: string;
  role: Role;
  message: string;
}

export interface ApiError {
  statusCode: number;
  error: string;
  message: string;
  field?: string;
  allowed?: string[];
  reason?: { code: string; state: string; event: string; failed?: string[] };
  issues?: FlowIssue[];
}

// --- Fluxos ---

export interface TransitionSpec {
  /** Any of these actions takes it. */
  actions: PendencyAction[];
  to: string;
  roles: Role[];
  guards?: string[];
  notify?: Role[];
}

export interface FlowStateSpec {
  label: string;
  final?: boolean;
  position?: { x: number; y: number };
  /** Priority order: the first transition listing the action whose rules pass wins. */
  transitions?: TransitionSpec[];
}

export interface FlowDefinition {
  initial: string;
  states: Record<string, FlowStateSpec>;
}

export interface FlowVersion {
  version: number;
  definition: FlowDefinition;
  publishedAt: string;
  publishedBy: string;
}

export interface Flow {
  id: string;
  name: string;
  draft: FlowDefinition | null;
  versions: FlowVersion[];
  revision: number;
}

export interface FlowSummary {
  id: string;
  name: string;
  latestVersion: number;
  hasDraft: boolean;
  versions: { version: number; publishedAt: string; publishedBy: string }[];
}

export interface FlowIssue {
  message: string;
  state?: string;
  action?: string;
}

export interface FlowCatalog {
  actions: { id: PendencyAction; label: string; payload?: string }[];
  guards: { id: string; label: string; description: string; requiresFacts: string[] }[];
  roles: { id: Role; label: string }[];
  effects: { id: string; label: string }[];
}

export const ROLE_LABEL: Record<Role, string> = {
  branch: 'Filial',
  documentation_analysis: 'Análise de documentação',
  payment_scheduling: 'Programação de pagamento',
};

export const ROLES = Object.keys(ROLE_LABEL) as Role[];

export const RELEASE_STATUS_LABEL: Record<ReleaseStatus, string> = {
  not_scheduled: 'Não programado',
  in_analysis: 'Em análise',
  scheduled: 'Programado',
};

export const PENDENCY_ACTION_LABEL: Record<PendencyAction, string> = {
  ATTACH_DOCUMENT: 'Anexar documento',
  RESOLVE_WITH_COMMENT: 'Resolver com comentário',
  REQUEST_EXCEPTION: 'Solicitar exceção',
  APPROVE: 'Aprovar',
  REJECT: 'Rejeitar',
};

export const RELEASE_ACTION_LABEL: Record<ReleaseAction, string> = {
  START_ANALYSIS: 'Iniciar análise',
  RETURN: 'Devolver',
  SCHEDULE: 'Programar',
};
