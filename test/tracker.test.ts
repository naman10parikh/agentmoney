import { describe, it, expect } from "vitest";
import { CostTracker } from "../src/tracker.js";

describe("CostTracker", () => {
  it("starts a session and tracks it", () => {
    const tracker = new CostTracker();
    const session = tracker.startSession("test-1");
    expect(session.id).toBe("test-1");
    expect(session.calls).toHaveLength(0);
    expect(session.totalCost).toBe(0);
    expect(tracker.getCurrentSession()).toBe(session);
  });

  it("records API calls and aggregates costs", () => {
    const tracker = new CostTracker();
    tracker.startSession();

    tracker.recordCall({
      model: "claude-sonnet-4-6",
      inputTokens: 1000,
      outputTokens: 500,
    });

    const session = tracker.getCurrentSession()!;
    expect(session.calls).toHaveLength(1);
    expect(session.totalCost).toBeGreaterThan(0);
    expect(session.totalInputTokens).toBe(1000);
    expect(session.totalOutputTokens).toBe(500);
  });

  it("auto-starts session on first recordCall", () => {
    const tracker = new CostTracker();
    expect(tracker.getCurrentSession()).toBeNull();

    tracker.recordCall({
      model: "claude-sonnet-4-6",
      inputTokens: 100,
      outputTokens: 50,
    });

    expect(tracker.getCurrentSession()).not.toBeNull();
    expect(tracker.getTotalCalls()).toBe(1);
  });

  it("aggregates costs by model", () => {
    const tracker = new CostTracker();
    tracker.startSession();

    tracker.recordCall({
      model: "claude-sonnet-4-6",
      inputTokens: 1000,
      outputTokens: 500,
    });
    tracker.recordCall({
      model: "claude-opus-4-6",
      inputTokens: 1000,
      outputTokens: 500,
    });
    tracker.recordCall({
      model: "claude-sonnet-4-6",
      inputTokens: 2000,
      outputTokens: 1000,
    });

    const byModel = tracker.getCostByModel();
    expect(byModel["claude-sonnet-4-6"].calls).toBe(2);
    expect(byModel["claude-opus-4-6"].calls).toBe(1);
  });

  it("aggregates costs by provider", () => {
    const tracker = new CostTracker();
    tracker.startSession();

    tracker.recordCall({
      model: "claude-sonnet-4-6",
      inputTokens: 1000,
      outputTokens: 500,
    });
    tracker.recordCall({
      model: "gpt-4o",
      inputTokens: 1000,
      outputTokens: 500,
    });

    const byProvider = tracker.getCostByProvider();
    expect(byProvider["anthropic"].calls).toBe(1);
    expect(byProvider["openai"].calls).toBe(1);
  });

  it("tracks total cost across sessions", () => {
    const tracker = new CostTracker();

    tracker.startSession("s1");
    tracker.recordCall({
      model: "claude-sonnet-4-6",
      inputTokens: 1_000_000,
      outputTokens: 500_000,
    });

    tracker.startSession("s2");
    tracker.recordCall({
      model: "claude-sonnet-4-6",
      inputTokens: 1_000_000,
      outputTokens: 500_000,
    });

    const sessions = tracker.getAllSessions();
    expect(sessions).toHaveLength(2);
    expect(tracker.getTotalCost()).toBeCloseTo(
      sessions[0].totalCost + sessions[1].totalCost,
    );
  });

  it("serializes to JSON via toJSON", () => {
    const tracker = new CostTracker();
    tracker.startSession("json-test");
    tracker.recordCall({
      model: "claude-sonnet-4-6",
      inputTokens: 100,
      outputTokens: 50,
    });

    const json = tracker.toJSON();
    expect(json.sessions).toHaveLength(1);
    expect(json.sessions[0].id).toBe("json-test");
    expect(json.currentSession).not.toBeNull();
  });

  it("triggers alert when session cost exceeds threshold", () => {
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (msg: string) => warnings.push(msg);

    const tracker = new CostTracker([
      { type: "session", threshold: 0.001, action: "warn" },
    ]);
    tracker.startSession();

    tracker.recordCall({
      model: "claude-opus-4-6",
      inputTokens: 10_000,
      outputTokens: 5_000,
    });

    console.warn = originalWarn;
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain("WARNING");
  });
});
