import { randomUUID } from "node:crypto";
import { calculateCost, detectProvider } from "./pricing.js";
import type { ApiCall, Session, TrackerState, CostAlert } from "./types.js";

export class CostTracker {
  private state: TrackerState;

  constructor(alerts: CostAlert[] = []) {
    this.state = {
      sessions: [],
      currentSession: null,
      alerts,
      startedAt: new Date().toISOString(),
    };
  }

  startSession(id?: string): Session {
    const session: Session = {
      id: id ?? randomUUID().slice(0, 8),
      startedAt: new Date().toISOString(),
      calls: [],
      totalCost: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheTokens: 0,
    };
    this.state.currentSession = session;
    this.state.sessions.push(session);
    return session;
  }

  recordCall(params: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    durationMs?: number;
    endpoint?: string;
  }): ApiCall {
    if (!this.state.currentSession) {
      this.startSession();
    }
    const session = this.state.currentSession!;

    const costs = calculateCost(
      params.model,
      params.inputTokens,
      params.outputTokens,
      params.cacheReadTokens ?? 0,
      params.cacheWriteTokens ?? 0,
    );

    const call: ApiCall = {
      id: randomUUID().slice(0, 8),
      timestamp: new Date().toISOString(),
      provider: detectProvider(params.model),
      model: params.model,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      cacheReadTokens: params.cacheReadTokens ?? 0,
      cacheWriteTokens: params.cacheWriteTokens ?? 0,
      ...costs,
      durationMs: params.durationMs ?? 0,
      endpoint: params.endpoint ?? "/v1/messages",
      sessionId: session.id,
    };

    session.calls.push(call);
    session.totalCost += call.totalCost;
    session.totalInputTokens += call.inputTokens;
    session.totalOutputTokens += call.outputTokens;
    session.totalCacheTokens += call.cacheReadTokens + call.cacheWriteTokens;

    // Check alerts
    this.checkAlerts(session);

    return call;
  }

  private checkAlerts(session: Session): void {
    for (const alert of this.state.alerts) {
      if (alert.type === "session" && session.totalCost >= alert.threshold) {
        const action = alert.action === "pause" ? "PAUSING" : "WARNING";
        console.warn(
          `[agentmoney] ${action}: Session cost $${session.totalCost.toFixed(4)} exceeded $${alert.threshold} threshold`,
        );
      }
    }
  }

  getCurrentSession(): Session | null {
    return this.state.currentSession;
  }

  getAllSessions(): Session[] {
    return this.state.sessions;
  }

  getTotalCost(): number {
    return this.state.sessions.reduce((sum, s) => sum + s.totalCost, 0);
  }

  getTotalCalls(): number {
    return this.state.sessions.reduce((sum, s) => sum + s.calls.length, 0);
  }

  getCostByModel(): Record<
    string,
    { calls: number; cost: number; tokens: number }
  > {
    const result: Record<
      string,
      { calls: number; cost: number; tokens: number }
    > = {};
    for (const session of this.state.sessions) {
      for (const call of session.calls) {
        if (!result[call.model]) {
          result[call.model] = { calls: 0, cost: 0, tokens: 0 };
        }
        result[call.model].calls += 1;
        result[call.model].cost += call.totalCost;
        result[call.model].tokens += call.inputTokens + call.outputTokens;
      }
    }
    return result;
  }

  getCostByProvider(): Record<string, { calls: number; cost: number }> {
    const result: Record<string, { calls: number; cost: number }> = {};
    for (const session of this.state.sessions) {
      for (const call of session.calls) {
        if (!result[call.provider]) {
          result[call.provider] = { calls: 0, cost: 0 };
        }
        result[call.provider].calls += 1;
        result[call.provider].cost += call.totalCost;
      }
    }
    return result;
  }

  getRunningCostPerMinute(): number {
    const session = this.state.currentSession;
    if (!session || session.calls.length === 0) return 0;

    const startTime = new Date(session.startedAt).getTime();
    const elapsed = (Date.now() - startTime) / 60_000; // minutes
    if (elapsed < 0.1) return 0;

    return session.totalCost / elapsed;
  }

  toJSON(): TrackerState {
    return structuredClone(this.state);
  }
}
