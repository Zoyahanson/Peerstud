"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Sidebar from "../../components/sidebar";

export default function Dashboard() {
  const router = useRouter();

  const [stats, setStats] = useState({
    groups: 0,
    resources: 0,
    sessions: 0,
  });

  useEffect(() => {
    const token = localStorage.getItem("token");

    if (!token) {
      router.push("/login");
      return;
    }

    fetch("http://localhost:5000/api/dashboard", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => res.json())
      .then((data) => setStats(data))
      .catch((err) => console.error(err));
  }, [router]);

  return (
    <div className="flex bg-gray-100 min-h-screen">
      <Sidebar />

      <main className="flex-1 p-10">
        <motion.h1
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-3xl font-bold mb-8"
        >
          Welcome Back 👋
        </motion.h1>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="grid grid-cols-3 gap-6"
        >
          <div className="bg-white p-6 rounded-2xl shadow">
            <h3 className="text-lg font-semibold mb-2">Active Groups</h3>
            <p className="text-3xl font-bold text-blue-600">
              {stats.groups}
            </p>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow">
            <h3 className="text-lg font-semibold mb-2">
              Resources Shared
            </h3>
            <p className="text-3xl font-bold text-green-600">
              {stats.resources}
            </p>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow">
            <h3 className="text-lg font-semibold mb-2">
              Upcoming Sessions
            </h3>
            <p className="text-3xl font-bold text-purple-600">
              {stats.sessions}
            </p>
          </div>
        </motion.div>
      </main>
    </div>
  );
}

