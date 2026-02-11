import { randomUUID } from "node:crypto";
import {
  METRICS_BASE_URL,
  METRICS_BEARER_TOKEN,
  METRICS_ENDPOINT,
} from "../../../consts";
import { type APIRequestContext, expect, test } from "../fixtures";

const fetchMetrics = async (request: APIRequestContext) =>
  request.get(`${METRICS_BASE_URL}${METRICS_ENDPOINT}`, {
    headers: {
      Authorization: `Bearer ${METRICS_BEARER_TOKEN}`,
    },
  });

test.describe("LLMProxy-ExecutionMetrics", () => {
  let agentId: string;

  test.afterEach(async ({ request, deleteAgent }) => {
    if (agentId) {
      await deleteAgent(request, agentId);
      agentId = "";
    }
  });

  test("emits agent_executions_total metric for new execution id", async ({
    request,
    createAgent,
    makeApiRequest,
  }) => {
    // 1. Create a test profile
    const createResponse = await createAgent(request, "Execution Metrics Test");
    const agent = await createResponse.json();
    agentId = agent.id;

    // 2. Send an LLM proxy request with a unique execution ID
    const executionId = randomUUID();
    const response = await makeApiRequest({
      request,
      method: "post",
      urlSuffix: `/v1/openai/${agentId}/chat/completions`,
      headers: {
        Authorization: "Bearer openai-execution-metrics",
        "Content-Type": "application/json",
        "X-Archestra-Execution-Id": executionId,
      },
      data: {
        model: "gpt-4",
        messages: [{ role: "user", content: "Hello" }],
      },
    });
    expect(response.ok()).toBeTruthy();

    // 3. Poll the metrics endpoint until agent_executions_total appears with our profile
    await expect
      .poll(
        async () => {
          const metricsResponse = await fetchMetrics(request);
          expect(metricsResponse.ok()).toBeTruthy();
          return await metricsResponse.text();
        },
        { timeout: 10000, intervals: [500, 1000, 2000] },
      )
      .toContain(`agent_executions_total{`);
  });

  test("deduplicates same execution id across multiple requests", async ({
    request,
    createAgent,
    makeApiRequest,
  }) => {
    // 1. Create a test profile
    const createResponse = await createAgent(request, "Execution Dedup Test");
    const agent = await createResponse.json();
    agentId = agent.id;

    // 2. Send two requests with the same execution ID
    const executionId = randomUUID();
    const sendRequest = () =>
      makeApiRequest({
        request,
        method: "post",
        urlSuffix: `/v1/openai/${agentId}/chat/completions`,
        headers: {
          Authorization: "Bearer openai-execution-metrics",
          "Content-Type": "application/json",
          "X-Archestra-Execution-Id": executionId,
        },
        data: {
          model: "gpt-4",
          messages: [{ role: "user", content: "Hello" }],
        },
      });

    const response1 = await sendRequest();
    expect(response1.ok()).toBeTruthy();

    const response2 = await sendRequest();
    expect(response2.ok()).toBeTruthy();

    // 3. Wait for metrics to settle, then check the counter value
    // The metric line for our profile should show counter value 1, not 2
    await expect
      .poll(
        async () => {
          const metricsResponse = await fetchMetrics(request);
          expect(metricsResponse.ok()).toBeTruthy();
          const metricsText = await metricsResponse.text();

          // Find the agent_executions_total line for our profile
          const lines = metricsText.split("\n");
          return lines.find(
            (line) =>
              line.startsWith("agent_executions_total") &&
              line.includes(`profile_id="${agentId}"`),
          );
        },
        { timeout: 10000, intervals: [500, 1000, 2000] },
      )
      .toMatch(/\b1$/);
  });

  test("counts different execution ids separately", async ({
    request,
    createAgent,
    makeApiRequest,
  }) => {
    // 1. Create a test profile
    const createResponse = await createAgent(
      request,
      "Execution Separate Count Test",
    );
    const agent = await createResponse.json();
    agentId = agent.id;

    // 2. Send two requests with different execution IDs
    const sendRequest = (execId: string) =>
      makeApiRequest({
        request,
        method: "post",
        urlSuffix: `/v1/openai/${agentId}/chat/completions`,
        headers: {
          Authorization: "Bearer openai-execution-metrics",
          "Content-Type": "application/json",
          "X-Archestra-Execution-Id": execId,
        },
        data: {
          model: "gpt-4",
          messages: [{ role: "user", content: "Hello" }],
        },
      });

    const response1 = await sendRequest(randomUUID());
    expect(response1.ok()).toBeTruthy();

    const response2 = await sendRequest(randomUUID());
    expect(response2.ok()).toBeTruthy();

    // 3. Verify counter is 2 for this profile
    await expect
      .poll(
        async () => {
          const metricsResponse = await fetchMetrics(request);
          expect(metricsResponse.ok()).toBeTruthy();
          const metricsText = await metricsResponse.text();

          const lines = metricsText.split("\n");
          return lines.find(
            (line) =>
              line.startsWith("agent_executions_total") &&
              line.includes(`profile_id="${agentId}"`),
          );
        },
        { timeout: 10000, intervals: [500, 1000, 2000] },
      )
      .toMatch(/\b2$/);
  });
});
