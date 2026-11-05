export interface ResponseChoice { value: string; label: string }

export interface ResponseField {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'email' | 'date' | 'select';
  required?: boolean;
  maxLength?: number;
  pattern?: string;
  options?: ResponseChoice[];
}

export type ResponseDefinition =
  | { kind: 'simple'; choices: ResponseChoice[] }
  | { kind: 'complex'; fields: ResponseField[] };

export interface ResponseRequestInput {
  /** Existing platform task, created by the owning workflow's task setup. */
  taskId: string;
  recipient: { email: string; name: string };
  subject: string;
  heading: string;
  instructions: string;
  expiresAt: string;
  definition: ResponseDefinition;
}

export interface ResponseRequest extends ResponseRequestInput {
  namespace: string;
  workflowId: string;
  runId: string;
}

export interface ResponseView {
  requestId: string;
  heading: string;
  instructions: string;
  definition: ResponseDefinition;
  completed: boolean;
  expiresAt: string;
}

export type ResponseResult = { requestId: string; status: 'pending' | 'expired' } | {
  requestId: string; status: 'completed'; responseId: string; choice?: string;
};

export const responseCompletedSignal = 'responseTaskCompleted';
