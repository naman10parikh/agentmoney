export interface ApiCall {
  id: string;
  timestamp: string;
  provider: "anthropic" | "openai" | "google" | "unknown";
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  inputCost: number;
  outputCost: number;
  cacheCost: number;
  totalCost: number;
  durationMs: number;
  endpoint: string;
  sessionId: string;
}

export interface Session {
  id: string;
  startedAt: string;
  calls: ApiCall[];
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheTokens: number;
}

export interface CostAlert {
  type: "session" | "hourly" | "daily";
  threshold: number;
  action: "warn" | "pause";
}

export interface DailyReport {
  date: string;
  sessions: number;
  totalCalls: number;
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  byModel: Record<string, { calls: number; cost: number }>;
  byProvider: Record<string, { calls: number; cost: number }>;
  costPerHour: number[];
}

export interface TrackerState {
  sessions: Session[];
  currentSession: Session | null;
  alerts: CostAlert[];
  startedAt: string;
}
