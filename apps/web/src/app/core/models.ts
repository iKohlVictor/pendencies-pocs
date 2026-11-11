export type Role = 'branch' | 'documentation_analysis' | 'payment_scheduling';
export type EventType = 'resolve_documentation' | 'supplier_onboarding' | 'ad_hoc';
export type PendencyType = 'missing_invoice' | 'unsigned_contract' | 'registration_update';
export type PendencyFlow = 'standard' | 'direct';
export type PendencyStatus =
  | 'pending_branch'
  | 'in_payment_scheduling_review'
  | 'in_documentation_review'
  | 'completed';
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
  flow: PendencyFlow;
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
  title: string;
  status: PendencyStatus;
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
}

export const ROLE_LABEL: Record<Role, string> = {
  branch: 'Filial',
  documentation_analysis: 'Análise de documentação',
  payment_scheduling: 'Programação de pagamento',
};

export const ROLES = Object.keys(ROLE_LABEL) as Role[];

export const PENDENCY_STATUS_LABEL: Record<PendencyStatus, string> = {
  pending_branch: 'Pendente com a filial',
  in_payment_scheduling_review: 'Revisão: programação',
  in_documentation_review: 'Revisão: documentação',
  completed: 'Concluída',
};

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
