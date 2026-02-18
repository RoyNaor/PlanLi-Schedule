const neonHttpUrl = process.env.NEON_HTTP_URL;
const neonApiKey = process.env.NEON_API_KEY;

if (!neonHttpUrl || !neonApiKey) {
  console.warn(
    "[database] NEON_HTTP_URL/NEON_API_KEY are not set. Database checks will fail until configured.",
  );
}

type NeonSqlResponse = {
  rows?: Array<{ server_time?: string }>;
};

export async function checkDatabaseConnection() {
  if (!neonHttpUrl || !neonApiKey) {
    throw new Error("Missing NEON_HTTP_URL or NEON_API_KEY environment variables.");
  }

  const response = await fetch(neonHttpUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${neonApiKey}`,
    },
    body: JSON.stringify({ query: "SELECT NOW() AS server_time" }),
  });

  if (!response.ok) {
    throw new Error(`Neon request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as NeonSqlResponse;

  return {
    ok: true,
    serverTime: payload.rows?.[0]?.server_time ?? null,
  };
}
