
import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

export default function App() {
  const [status, setStatus] = useState("Connecting...");

  useEffect(() => {
    async function test() {
      const { data, error } = await supabase
        .from("connection_test")
        .select("message")
        .limit(1);

      if (error) {
        setStatus(`Connection error: ${error.message}`);
        return;
      }

      setStatus(data?.[0]?.message ?? "No data found");
    }

    void test();
  }, []);

  return <h1>{status}</h1>;
}
