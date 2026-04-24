"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "../../../components/sidebar";
import { API_BASE_URL, authedFetch, getToken } from "../../../lib/api";

type CourseSummary = {
  id: string;
  title: string;
};

type SessionSummary = {
  id: string;
  course_id: string;
  topic_focus: string;
  start_time: string;
};

type ResourceItem = {
  id: string;
  course_id: string;
  session_id: string | null;
  title: string;
  url: string;
  storage_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  resource_type: string;
  created_at: string;
};

export default function ResourcesPage() {
  const router = useRouter();
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }

    Promise.all([
      authedFetch<ResourceItem[]>("/resources"),
      authedFetch<CourseSummary[]>("/courses"),
      authedFetch<SessionSummary[]>("/sessions"),
    ])
      .then(([resourceResponse, courseResponse, sessionResponse]) => {
        setResources(resourceResponse);
        setCourses(courseResponse);
        setSessions(sessionResponse);
        setSelectedCourseId(courseResponse[0]?.id ?? "");
        setError("");
      })
      .catch((fetchError: unknown) => {
        setError(fetchError instanceof Error ? fetchError.message : "Failed to load resources.");
      })
      .finally(() => setLoading(false));
  }, [router]);

  const filteredSessions = sessions.filter((session) => session.course_id === selectedCourseId);

  async function handleUpload() {
    if (!selectedCourseId || !title || !file) {
      setStatusMessage("Select a course, enter a title, and choose a file.");
      return;
    }

    try {
      setUploading(true);
      setStatusMessage("");
      const formData = new FormData();
      formData.set("course_id", selectedCourseId);
      formData.set("title", title);
      formData.set("resource_type", file.type.startsWith("image/") ? "image" : "file");
      if (selectedSessionId) {
        formData.set("session_id", selectedSessionId);
      }
      formData.set("file", file);

      const uploaded = await authedFetch<ResourceItem>("/resources/upload", {
        method: "POST",
        body: formData,
      });
      setResources((current) => [uploaded, ...current]);
      setTitle("");
      setFile(null);
      setSelectedSessionId("");
      setStatusMessage("Resource uploaded.");
    } catch (uploadError: unknown) {
      setStatusMessage(uploadError instanceof Error ? uploadError.message : "Failed to upload resource.");
    } finally {
      setUploading(false);
    }
  }

  function resolveResourceUrl(url: string): string {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return url;
    }
    return `${API_BASE_URL}${url}`;
  }

  return (
    <div className="page-shell">
      <Sidebar />

      <main className="page-main">
        <div className="page-content">
        <div className="page-header">
          <h1 className="page-title">Resources</h1>
          <p className="page-subtitle">Upload and review files.</p>
        </div>
        {loading && <p className="text-sm text-gray-600 mb-4">Loading resources...</p>}
        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
        {statusMessage && <p className="text-sm text-gray-700 mb-4">{statusMessage}</p>}

        <section className="page-card mb-8 p-6">
          <h2 className="text-xl font-semibold text-gray-900">Upload to Resource Hub</h2>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm text-gray-600">Course</span>
              <select
                className="field-shell"
                value={selectedCourseId}
                onChange={(event) => {
                  setSelectedCourseId(event.target.value);
                  setSelectedSessionId("");
                }}
              >
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm text-gray-600">Session</span>
              <select
                className="field-shell"
                value={selectedSessionId}
                onChange={(event) => setSelectedSessionId(event.target.value)}
              >
                <option value="">General course folder</option>
                {filteredSessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.topic_focus} - {new Date(session.start_time).toLocaleString()}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm text-gray-600">Title</span>
              <input
                className="field-shell"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Calculus Midterm Practice Set"
              />
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm text-gray-600">File</span>
              <input
                type="file"
                accept=".pdf,image/*"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                className="field-shell"
              />
            </label>

            <button
              onClick={handleUpload}
              disabled={uploading}
              className="primary-button w-full px-4 py-3 disabled:opacity-60 md:col-span-2"
            >
              {uploading ? "Uploading..." : "Upload Resource"}
            </button>
          </div>
        </section>

        <section className="page-card overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-sm font-semibold text-gray-700">Title</th>
                <th className="px-4 py-3 text-sm font-semibold text-gray-700">Type</th>
                <th className="px-4 py-3 text-sm font-semibold text-gray-700">File</th>
                <th className="px-4 py-3 text-sm font-semibold text-gray-700">Updated</th>
              </tr>
            </thead>
            <tbody>
              {resources.map((resource) => (
                <tr key={resource.id} className="border-t border-gray-100">
                  <td className="px-4 py-3 text-sm text-gray-800">
                    <a href={resolveResourceUrl(resource.url)} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                      {resource.title}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{resource.resource_type}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{resource.file_name ?? "Link"}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {new Date(resource.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {!loading && resources.length === 0 && (
                <tr>
                  <td className="px-4 py-4 text-sm text-gray-500" colSpan={4}>
                    No resources found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
        </div>
      </main>
    </div>
  );
}
