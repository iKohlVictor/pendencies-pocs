export const ROLE = {
  branch: 'branch',
  documentationAnalysis: 'documentation_analysis',
  paymentScheduling: 'payment_scheduling',
} as const;

export type Role = (typeof ROLE)[keyof typeof ROLE];
