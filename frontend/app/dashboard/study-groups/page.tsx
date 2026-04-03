"use client";

import Sidebar from "../../../components/sidebar";

const DEMO_GROUPS = [
  { id: "group-1", name: "Algorithms Sprint", members: 5, focus: "Graphs and DP" },
  { id: "group-2", name: "Database Review", members: 4, focus: "SQL and indexing" },
  { id: "group-3", name: "Web Systems", members: 6, focus: "APIs and auth" },
];

export default function StudyGroupsPage() {
  return (
    <div className="flex bg-gray-100 min-h-screen">
      <Sidebar />

      <main className="flex-1 p-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Study Groups</h1>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {DEMO_GROUPS.map((group) => (
            <article key={group.id} className="bg-white p-6 rounded-2xl shadow border border-gray-100">
              <h2 className="text-xl font-semibold text-gray-900">{group.name}</h2>
              <p className="text-sm text-gray-600 mt-2">Members: {group.members}</p>
              <p className="text-sm text-gray-600">Focus: {group.focus}</p>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
