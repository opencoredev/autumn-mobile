export type BillingStatus = "active" | "past_due" | "canceled";

export type SubscriptionSummary = {
  readonly id: string;
  readonly productName: string;
  readonly status: BillingStatus;
  readonly amountCents: number;
  readonly currency: string;
};

export type HealthResponse = {
  readonly status: "ok";
};

export type ApiClient = {
  health(): Promise<HealthResponse>;
};

export function createApiClient(baseUrl: string): ApiClient {
  return {
    async health(): Promise<HealthResponse> {
      const response = await fetch(`${baseUrl}/health`);
      if (!response.ok) {
        throw new Error(`Health request failed with status ${response.status}`);
      }
      const payload: unknown = await response.json();
      if (
        typeof payload !== "object" ||
        payload === null ||
        !("status" in payload) ||
        payload.status !== "ok"
      ) {
        throw new Error("Health response was invalid");
      }
      return { status: "ok" };
    },
  };
}
