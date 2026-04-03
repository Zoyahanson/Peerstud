"use client";

import Sidebar from "../../../components/sidebar";

const DEMO_RESOURCES = [
  { id: "res-1", title: "FastAPI Endpoint Patterns", type: "Guide", updated: "2026-04-02" },
  { id: "res-2", title: "PostgreSQL Query Tuning", type: "Cheatsheet", updated: "2026-04-01" },
  { id: "res-3", title: "Distributed Systems Notes", type: "Notes", updated: "2026-03-28" },
];

export default function ResourcesPage() {
  return (
    <div className="flex bg-gray-100 min-h-screen">
      <Sidebar />

      <main className="flex-1 p-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Resources</h1>

        <section className="bg-white rounded-2xl shadow border border-gray-100 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-sm font-semibold text-gray-700">Title</th>
                <th className="px-4 py-3 text-sm font-semibold text-gray-700">Type</th>
                <th className="px-4 py-3 text-sm font-semibold text-gray-700">Updated</th>
              </tr>
            </thead>
            <tbody>
              {DEMO_RESOURCES.map((resource) => (
                <tr key={resource.id} className="border-t border-gray-100">
                  <td className="px-4 py-3 text-sm text-gray-800">{resource.title}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{resource.type}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{resource.updated}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}
