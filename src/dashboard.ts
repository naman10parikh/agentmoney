// Single-file HTML dashboard served by the proxy at GET /dashboard
import type { CostTracker } from "./tracker.js";

export function renderDashboard(tracker: CostTracker): string {
  const sessions = tracker.getAllSessions();
  const byModel = tracker.getCostByModel();
  const totalCost = tracker.getTotalCost();
  const totalCalls = tracker.getTotalCalls();

  // Build time-series: cost per hour bucketed from all calls
  const hourlyBuckets: Record<string, Record<string, number>> = {};
  for (const session of sessions) {
    for (const call of session.calls) {
      const hour = call.timestamp.slice(0, 13); // "2026-03-17T14"
      if (!hourlyBuckets[hour]) hourlyBuckets[hour] = {};
      const model =
        call.model.length > 20 ? call.model.slice(0, 20) : call.model;
      hourlyBuckets[hour][model] =
        (hourlyBuckets[hour][model] ?? 0) + call.totalCost;
    }
  }

  // Build daily buckets per session (agent)
  const dailyByAgent: Record<string, Record<string, number>> = {};
  for (const session of sessions) {
    for (const call of session.calls) {
      const day = call.timestamp.slice(0, 10);
      if (!dailyByAgent[day]) dailyByAgent[day] = {};
      dailyByAgent[day][session.id] =
        (dailyByAgent[day][session.id] ?? 0) + call.totalCost;
    }
  }

  const hourLabels = Object.keys(hourlyBuckets).sort();
  const modelNames = [
    ...new Set(Object.values(hourlyBuckets).flatMap(Object.keys)),
  ];
  const dayLabels = Object.keys(dailyByAgent).sort();
  const agentNames = [
    ...new Set(Object.values(dailyByAgent).flatMap(Object.keys)),
  ];

  const modelColors = [
    "#6366f1",
    "#f59e0b",
    "#10b981",
    "#ef4444",
    "#8b5cf6",
    "#ec4899",
    "#14b8a6",
    "#f97316",
    "#06b6d4",
    "#84cc16",
  ];

  // Build datasets for hourly chart (cost by model over time)
  const hourlyDatasets = modelNames.map((model, i) => ({
    label: model,
    data: hourLabels.map((h) => hourlyBuckets[h]?.[model] ?? 0),
    backgroundColor: modelColors[i % modelColors.length],
    borderColor: modelColors[i % modelColors.length],
    borderWidth: 1,
  }));

  // Build datasets for daily-by-agent chart
  const agentDatasets = agentNames.map((agent, i) => ({
    label: `Session ${agent}`,
    data: dayLabels.map((d) => dailyByAgent[d]?.[agent] ?? 0),
    backgroundColor: modelColors[i % modelColors.length],
  }));

  // Model breakdown for doughnut
  const modelEntries = Object.entries(byModel).sort(
    (a, b) => b[1].cost - a[1].cost,
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>agentmoney — dashboard</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0f1117;
      color: #e4e4e7;
      padding: 24px;
    }
    h1 { font-size: 24px; font-weight: 600; margin-bottom: 8px; color: #a5b4fc; }
    .subtitle { color: #71717a; font-size: 14px; margin-bottom: 32px; }
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }
    .card {
      background: #1c1c24;
      border-radius: 12px;
      padding: 20px;
      border: 1px solid #27272a;
    }
    .card-label { font-size: 12px; color: #71717a; text-transform: uppercase; letter-spacing: 0.5px; }
    .card-value { font-size: 28px; font-weight: 700; margin-top: 4px; }
    .card-value.green { color: #4ade80; }
    .card-value.yellow { color: #fbbf24; }
    .card-value.red { color: #f87171; }
    .charts {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      margin-bottom: 32px;
    }
    .chart-box {
      background: #1c1c24;
      border-radius: 12px;
      padding: 20px;
      border: 1px solid #27272a;
    }
    .chart-box.full { grid-column: 1 / -1; }
    .chart-title { font-size: 14px; font-weight: 600; margin-bottom: 16px; color: #a1a1aa; }
    canvas { max-height: 300px; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    th { text-align: left; padding: 8px 12px; color: #71717a; border-bottom: 1px solid #27272a; font-weight: 500; }
    td { padding: 8px 12px; border-bottom: 1px solid #1c1c24; }
    .mono { font-family: 'SF Mono', 'Fira Code', monospace; }
    .refresh { color: #71717a; font-size: 12px; text-align: center; margin-top: 24px; }
    @media (max-width: 768px) {
      .charts { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <h1>agentmoney</h1>
  <p class="subtitle">Real-time AI agent cost tracking &middot; auto-refreshes every 10s</p>

  <div class="cards">
    <div class="card">
      <div class="card-label">Total Cost</div>
      <div class="card-value ${totalCost > 5 ? "red" : totalCost > 1 ? "yellow" : "green"}" id="total-cost">$${totalCost.toFixed(4)}</div>
    </div>
    <div class="card">
      <div class="card-label">API Calls</div>
      <div class="card-value">${totalCalls}</div>
    </div>
    <div class="card">
      <div class="card-label">Cost / Minute</div>
      <div class="card-value">$${tracker.getRunningCostPerMinute().toFixed(4)}</div>
    </div>
    <div class="card">
      <div class="card-label">Active Sessions</div>
      <div class="card-value">${sessions.length}</div>
    </div>
  </div>

  <div class="charts">
    <div class="chart-box full">
      <div class="chart-title">Cost per Agent per Day</div>
      <canvas id="agentChart"></canvas>
    </div>
    <div class="chart-box">
      <div class="chart-title">Cost by Model (Hourly)</div>
      <canvas id="hourlyChart"></canvas>
    </div>
    <div class="chart-box">
      <div class="chart-title">Cost Breakdown by Model</div>
      <canvas id="modelChart"></canvas>
    </div>
  </div>

  <div class="chart-box" style="margin-bottom: 32px;">
    <div class="chart-title">Recent API Calls</div>
    <table>
      <thead>
        <tr>
          <th>Time</th>
          <th>Model</th>
          <th>Input</th>
          <th>Output</th>
          <th>Cache</th>
          <th>Cost</th>
          <th>Session</th>
        </tr>
      </thead>
      <tbody>
        ${sessions
          .flatMap((s) => s.calls.map((c) => ({ ...c, sid: s.id })))
          .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
          .slice(0, 25)
          .map(
            (c) => `<tr>
          <td class="mono">${c.timestamp.slice(11, 19)}</td>
          <td>${c.model.length > 25 ? c.model.slice(0, 22) + "..." : c.model}</td>
          <td class="mono">${c.inputTokens.toLocaleString()}</td>
          <td class="mono">${c.outputTokens.toLocaleString()}</td>
          <td class="mono">${(c.cacheReadTokens + c.cacheWriteTokens).toLocaleString()}</td>
          <td class="mono">$${c.totalCost.toFixed(6)}</td>
          <td class="mono">${c.sid}</td>
        </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  </div>

  <p class="refresh">Auto-refreshes every 10 seconds</p>

  <script>
    const chartDefaults = {
      color: '#a1a1aa',
      borderColor: '#27272a',
    };
    Chart.defaults.color = chartDefaults.color;
    Chart.defaults.borderColor = chartDefaults.borderColor;

    // Cost per Agent per Day (bar chart)
    new Chart(document.getElementById('agentChart'), {
      type: 'bar',
      data: {
        labels: ${JSON.stringify(dayLabels.length > 0 ? dayLabels : [new Date().toISOString().slice(0, 10)])},
        datasets: ${JSON.stringify(agentDatasets.length > 0 ? agentDatasets : [{ label: "No data yet", data: [0], backgroundColor: "#6366f1" }])}
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'top' },
          tooltip: {
            callbacks: {
              label: (ctx) => ctx.dataset.label + ': $' + ctx.raw.toFixed(4)
            }
          }
        },
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: {
            stacked: true,
            ticks: { callback: (v) => '$' + v.toFixed(2) },
            grid: { color: '#1c1c24' }
          }
        }
      }
    });

    // Hourly cost by model (line chart)
    new Chart(document.getElementById('hourlyChart'), {
      type: 'line',
      data: {
        labels: ${JSON.stringify(hourLabels.map((h) => h.slice(11) + ":00"))},
        datasets: ${JSON.stringify(hourlyDatasets)}
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'top' } },
        scales: {
          y: {
            ticks: { callback: (v) => '$' + v.toFixed(4) },
            grid: { color: '#1c1c24' }
          },
          x: { grid: { display: false } }
        }
      }
    });

    // Doughnut: cost by model
    new Chart(document.getElementById('modelChart'), {
      type: 'doughnut',
      data: {
        labels: ${JSON.stringify(modelEntries.map(([m]) => m))},
        datasets: [{
          data: ${JSON.stringify(modelEntries.map(([, s]) => parseFloat(s.cost.toFixed(6))))},
          backgroundColor: ${JSON.stringify(modelEntries.map((_, i) => modelColors[i % modelColors.length]))},
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'right' },
          tooltip: {
            callbacks: {
              label: (ctx) => ctx.label + ': $' + ctx.raw.toFixed(4)
            }
          }
        }
      }
    });

    // Auto-refresh
    setTimeout(() => location.reload(), 10000);
  </script>
</body>
</html>`;
}
