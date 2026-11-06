
import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

export default function App() {
  const [status, setStatus] = useState(supabase
    ? "Connecting..."
    : "MedFlow is running locally. Supabase is not configured yet.");

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let active = true;
    async function test() {
      const { data, error } = await client!
        .from("connection_test")
        .select("message")
        .limit(1);

      if (!active) return;
      if (error) {
        setStatus(`Connection error: ${error.message}`);
        return;
      }

      setStatus(data?.[0]?.message ?? "No data found");
    }

    void test();
    return () => { active = false; };
  }, []);

  return <h1>{status}</h1>;
}
