import { type BrowserRenderCompletion } from "@theoryfoundry/contracts";
export interface BrowserRenderRequest {
  jobId: string;
  token: string;
  purpose: "candidate";
  candidateId: string;
  source: string;
  sourceHash: string;
  format: "stl";
  deadline: string;
}

export interface PendingJob {
  sessionId: string;
  token: string;
  sourceHash: string;
  resolve: (completion: BrowserRenderCompletion) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export type RequestListener = {
  sessionId: string;
  callback: (request: BrowserRenderRequest) => void;
};
