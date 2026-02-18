import { useEffect, useState } from "react";
import "./App.css";

type HealthResponse = {
  ok: boolean;
  service: string;
};

function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const checkApi = async () => {
      try {
        const response = await fetch("http://localhost:3000/api/health");
        if (!response.ok) {
          throw new Error(`API request failed with status ${response.status}`);
        }

        const data: HealthResponse = await response.json();
        setHealth(data);
      } catch (requestError) {
        const message =
          requestError instanceof Error
            ? requestError.message
            : "Unable to reach API";
        setError(message);
      }
    };

    checkApi();
  }, []);

  return (
    <main>
      <h1>PlanLi Schedule MVP</h1>
      <p>Minimal implementation check: frontend + backend connectivity.</p>

      {health ? (
        <p>
          ✅ API status: <strong>{health.service}</strong> is healthy.
        </p>
      ) : error ? (
        <p>❌ API status: {error}</p>
      ) : (
        <p>⏳ Checking API health...</p>
      )}

      <section>
        <h2>Next MVP steps</h2>
        <ul>
          <li>Add Firebase authentication flow.</li>
          <li>Implement chat endpoint for constraint extraction.</li>
          <li>Integrate persistence and scheduling solver service.</li>
        </ul>
      </section>
    </main>
  );
}

export default App;
