"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, UserMinus, UserPlus, Users } from "lucide-react";
import { authedFetch, hasAuthToken } from "../../lib/api";

type UserCore = {
  id: string;
  full_name: string | null;
  email: string;
};

type FriendEntry = {
  user_id: string;
  full_name: string | null;
  email: string;
  mutual_sessions: number;
  streak_days: number;
};

type SearchResult = {
  user_id: string;
  full_name: string | null;
  email: string;
};

type UserProfile = {
  user_id: string;
  full_name: string | null;
  year_of_study: string | null;
  faculty: string | null;
  campus: string | null;
  major: string | null;
  minor: string | null;
  current_courses: string[];
  qualifications: string | null;
  tutoring_experience: string | null;
  available_for_tutoring: boolean;
  strengths: string | null;
  weak_topics: string | null;
  credibility_score: number;
  ratings_count: number;
  bio: string | null;
  interests: string | null;
  has_embedding: boolean;
};

const YEAR_OPTIONS = [
  "",
  "1st Year",
  "2nd Year",
  "3rd Year",
  "4th Year",
  "5th Year+",
  "Graduate",
  "Postgraduate",
];

function linesToList(value: string): string[] {
  return value
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function listToLines(values: string[]): string {
  return values.join("\n");
}

export default function ProfilePage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [yearOfStudy, setYearOfStudy] = useState("");
  const [faculty, setFaculty] = useState("");
  const [campus, setCampus] = useState("");
  const [major, setMajor] = useState("");
  const [minor, setMinor] = useState("");
  const [currentCourses, setCurrentCourses] = useState("");
  const [qualifications, setQualifications] = useState("");
  const [tutoringExperience, setTutoringExperience] = useState("");
  const [availableForTutoring, setAvailableForTutoring] = useState(true);
  const [strengths, setStrengths] = useState("");
  const [weakTopics, setWeakTopics] = useState("");
  const [bio, setBio] = useState("");
  const [interests, setInterests] = useState("");
  const [credibilityScore, setCredibilityScore] = useState(0);
  const [ratingsCount, setRatingsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [activeTab, setActiveTab] = useState<"profile" | "friends">("profile");

  // Friends state
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [friendSearch, setFriendSearch] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [friendStatusMsg, setFriendStatusMsg] = useState("");
  const friendSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Live debounced search when friendSearch changes
  useEffect(() => {
    if (friendSearchDebounceRef.current) clearTimeout(friendSearchDebounceRef.current);
    const q = friendSearch.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    friendSearchDebounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await authedFetch<SearchResult[]>(`/users/search?q=${encodeURIComponent(q)}&limit=20`);
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 150);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [friendSearch]);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      const authenticated = await hasAuthToken();
      if (cancelled) {
        return;
      }
      if (!authenticated) {
        router.push("/login");
        return;
      }

      setLoading(true);
      setFriendsLoading(true);
      try {
        const [user, profile, friendsRes] = await Promise.all([
          authedFetch<UserCore>("/users/me"),
          authedFetch<UserProfile>("/users/me/profile"),
          authedFetch<FriendEntry[]>("/users/me/friends").catch(() => [] as FriendEntry[]),
        ]);
        if (cancelled) {
          return;
        }
        setFullName(profile.full_name ?? user.full_name ?? "");
        setEmail(user.email);
        setYearOfStudy(profile.year_of_study ?? "");
        setFaculty(profile.faculty ?? "");
        setCampus(profile.campus ?? "");
        setMajor(profile.major ?? "");
        setMinor(profile.minor ?? "");
        setCurrentCourses(listToLines(profile.current_courses ?? []));
        setQualifications(profile.qualifications ?? "");
        setTutoringExperience(profile.tutoring_experience ?? "");
        setAvailableForTutoring(profile.available_for_tutoring ?? true);
        setStrengths(profile.strengths ?? "");
        setWeakTopics(profile.weak_topics ?? "");
        setCredibilityScore(profile.credibility_score ?? 0);
        setRatingsCount(profile.ratings_count ?? 0);
        setBio(profile.bio ?? "");
        setInterests(profile.interests ?? "");
        setFriends(friendsRes);
      } catch (error: unknown) {
        if (!cancelled) {
          setStatusMessage(error instanceof Error ? error.message : "Failed to load profile.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setFriendsLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSearchUsers() {
    const q = friendSearch.trim();
    if (!q) return;
    try {
      setSearching(true);
      setFriendStatusMsg("");
      const results = await authedFetch<SearchResult[]>(`/users/search?q=${encodeURIComponent(q)}&limit=20`);
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function handleAddFriend(userId: string) {
    try {
      setFriendStatusMsg("");
      await authedFetch("/users/me/friends", {
        method: "POST",
        body: JSON.stringify({ friend_user_id: userId }),
      });
      setFriendStatusMsg("Friend added!");
      setSearchResults([]);
      setFriendSearch("");
      const updated = await authedFetch<FriendEntry[]>("/users/me/friends");
      setFriends(updated);
    } catch (err: unknown) {
      setFriendStatusMsg(err instanceof Error ? err.message : "Could not add friend.");
    }
  }

  async function handleRemoveFriend(userId: string) {
    try {
      setFriendStatusMsg("");
      await authedFetch(`/users/me/friends/${userId}`, { method: "DELETE" });
      setFriends((prev) => prev.filter((f) => f.user_id !== userId));
    } catch (err: unknown) {
      setFriendStatusMsg(err instanceof Error ? err.message : "Could not remove friend.");
    }
  }

  async function handleSave() {
    try {
      setSaving(true);
      setStatusMessage("");
      await authedFetch<UserProfile>("/users/me/profile", {
        method: "PUT",
        body: JSON.stringify({
          full_name: fullName || null,
          year_of_study: yearOfStudy || null,
          faculty: faculty || null,
          campus: campus || null,
          major: major || null,
          minor: minor || null,
          current_courses: linesToList(currentCourses),
          qualifications: qualifications || null,
          tutoring_experience: tutoringExperience || null,
          available_for_tutoring: availableForTutoring,
          strengths: strengths || null,
          weak_topics: weakTopics || null,
          bio: bio || null,
          interests: interests || null,
          embedding: null,
        }),
      });
      setStatusMessage("Profile saved.");
    } catch (error: unknown) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page-main">
      <div className="page-content max-w-4xl">
        <div className="page-card p-6">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="page-title mb-1">Profile</h1>
              <p className="page-subtitle">Account and academic details.</p>
            </div>
          </div>

          {/* Tab switcher */}
          <div className="mb-6 inline-flex gap-1 rounded-2xl bg-[color:var(--background-alt)] p-1">
            <button
              onClick={() => setActiveTab("profile")}
              className={`flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-bold transition ${
                activeTab === "profile"
                  ? "bg-[color:var(--navy)] text-white shadow"
                  : "text-[color:var(--ink-muted)] hover:text-[color:var(--foreground)]"
              }`}
            >
              Profile
            </button>
            <button
              onClick={() => setActiveTab("friends")}
              className={`flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-bold transition ${
                activeTab === "friends"
                  ? "bg-[color:var(--navy)] text-white shadow"
                  : "text-[color:var(--ink-muted)] hover:text-[color:var(--foreground)]"
              }`}
            >
              <Users size={15} />
              Friends
              {friends.length > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[color:var(--accent)] px-1 text-[10px] font-bold text-white">
                  {friends.length}
                </span>
              )}
            </button>
          </div>

          {activeTab === "profile" && (
            <>
              {loading && <p className="mb-4 text-sm text-[color:var(--ink-muted)]">Loading profile…</p>}
              {statusMessage && <p className="mb-4 text-sm text-[color:var(--foreground)]">{statusMessage}</p>}

              <section className="mb-6 grid gap-4 md:grid-cols-2">
                <div className="page-card p-4">
                  <p className="text-sm text-[color:var(--ink-muted)]">Verified school email</p>
                  <p className="mt-2 text-lg font-semibold text-[color:var(--foreground)]">{email}</p>
                </div>
                <div className="page-card p-4">
                  <p className="text-sm text-[color:var(--ink-muted)]">Tutor credibility</p>
                  <p className="mt-2 text-lg font-semibold text-[color:var(--foreground)]">
                    {credibilityScore.toFixed(1)} / 5 from {ratingsCount} ratings
                  </p>
                </div>
              </section>

              <div className="space-y-6">
                <section className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm text-[color:var(--ink-muted)]">Name</span>
                    <input className="field-shell" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your full name" />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm text-[color:var(--ink-muted)]">Email</span>
                    <input className="field-shell bg-gray-50" value={email} disabled />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm text-[color:var(--ink-muted)]">Year of Study</span>
                    <select className="field-shell" value={yearOfStudy} onChange={(e) => setYearOfStudy(e.target.value)}>
                      {YEAR_OPTIONS.map((opt) => (
                        <option key={opt || "placeholder"} value={opt}>{opt || "Select your year"}</option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm text-[color:var(--ink-muted)]">Faculty</span>
                    <input className="field-shell" value={faculty} onChange={(e) => setFaculty(e.target.value)} placeholder="Faculty of Engineering" />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm text-[color:var(--ink-muted)]">School or Campus</span>
                    <input className="field-shell" value={campus} onChange={(e) => setCampus(e.target.value)} placeholder="Main Campus" />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm text-[color:var(--ink-muted)]">Major</span>
                    <input className="field-shell" value={major} onChange={(e) => setMajor(e.target.value)} placeholder="Computer Science" />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm text-[color:var(--ink-muted)]">Minor</span>
                    <input className="field-shell" value={minor} onChange={(e) => setMinor(e.target.value)} placeholder="Optional" />
                  </label>
                </section>

                <section className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2 md:col-span-2">
                    <span className="text-sm text-[color:var(--ink-muted)]">Current Courses</span>
                    <textarea className="field-shell min-h-28 w-full" value={currentCourses} onChange={(e) => setCurrentCourses(e.target.value)} placeholder="Enter one course per line" />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm text-[color:var(--ink-muted)]">Academic Qualifications</span>
                    <textarea className="field-shell min-h-24 w-full" value={qualifications} onChange={(e) => setQualifications(e.target.value)} placeholder="Certifications, honors, or other academic credentials" />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm text-[color:var(--ink-muted)]">Tutoring Experience</span>
                    <textarea className="field-shell min-h-24 w-full" value={tutoringExperience} onChange={(e) => setTutoringExperience(e.target.value)} placeholder="Describe your prior tutoring or mentoring experience" />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm text-[color:var(--ink-muted)]">Strengths in Courses</span>
                    <textarea className="field-shell min-h-28 w-full" value={strengths} onChange={(e) => setStrengths(e.target.value)} placeholder="What do you feel confident helping others with?" />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm text-[color:var(--ink-muted)]">Weak Topics</span>
                    <textarea className="field-shell min-h-28 w-full" value={weakTopics} onChange={(e) => setWeakTopics(e.target.value)} placeholder="Where would you like support?" />
                  </label>
                </section>

                <section className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2 md:col-span-2">
                    <span className="text-sm text-[color:var(--ink-muted)]">Short Bio</span>
                    <textarea className="field-shell min-h-28 w-full" value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Tell others what you are studying and what kind of study partner you are" />
                  </label>
                  <label className="space-y-2 md:col-span-2">
                    <span className="text-sm text-[color:var(--ink-muted)]">Academic Interests</span>
                    <textarea className="field-shell min-h-24 w-full" value={interests} onChange={(e) => setInterests(e.target.value)} placeholder="e.g. algorithms, databases, machine learning" />
                  </label>
                  <label className="flex items-center justify-between rounded-xl border border-[color:var(--border)] bg-white p-3 md:col-span-2">
                    <span className="text-sm text-[color:var(--foreground)]">Available for tutoring</span>
                    <input type="checkbox" checked={availableForTutoring} onChange={(e) => setAvailableForTutoring(e.target.checked)} />
                  </label>
                </section>

                <button onClick={handleSave} disabled={saving} className="primary-button px-4 py-2 disabled:opacity-60">
                  {saving ? "Saving…" : "Save Profile"}
                </button>
              </div>
            </>
          )}

          {activeTab === "friends" && (
            <div className="space-y-6">
              {/* Search */}
              <div className="page-card p-5">
                <h2 className="mb-3 text-base font-bold text-[color:var(--foreground)]">Find Friends</h2>
                <div className="flex gap-3">
                  <div className="flex flex-1 items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2">
                    <Search size={16} className="shrink-0 text-[color:var(--ink-muted)]" />
                    <input
                      className="flex-1 bg-transparent text-sm text-[color:var(--foreground)] placeholder:text-[color:var(--ink-subtle)] focus:outline-none"
                      placeholder="Search by name or email…"
                      value={friendSearch}
                      onChange={(e) => setFriendSearch(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSearchUsers()}
                    />
                  </div>
                  <button
                    onClick={handleSearchUsers}
                    disabled={searching || !friendSearch.trim()}
                    className="primary-button px-4 py-2 text-sm disabled:opacity-60"
                  >
                    {searching ? "Searching…" : "Search"}
                  </button>
                </div>

                {friendStatusMsg && (
                  <p className="mt-3 text-sm text-[color:var(--accent-strong)]">{friendStatusMsg}</p>
                )}

                {searchResults.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--ink-muted)]">Results</p>
                    {searchResults.map((result) => (
                      <div
                        key={result.user_id}
                        className="flex items-center gap-3 rounded-2xl border border-[color:var(--border)] bg-white p-3"
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color:var(--navy-tint)] text-sm font-bold text-[color:var(--navy)]">
                          {(result.full_name ?? result.email).slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 overflow-hidden">
                          <p className="truncate text-sm font-semibold text-[color:var(--foreground)]">
                            {result.full_name ?? result.email}
                          </p>
                          <p className="truncate text-xs text-[color:var(--ink-muted)]">{result.email}</p>
                        </div>
                        <button
                          onClick={() => handleAddFriend(result.user_id)}
                          className="flex items-center gap-1.5 rounded-full bg-[color:var(--accent-soft)] px-3 py-1.5 text-xs font-semibold text-[color:var(--accent-strong)] hover:bg-[color:var(--accent)] hover:text-white transition"
                        >
                          <UserPlus size={13} />
                          Add
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Friends list */}
              <div>
                <h2 className="mb-3 text-base font-bold text-[color:var(--foreground)]">
                  My Friends ({friends.length})
                </h2>

                {friendsLoading && <p className="text-sm text-[color:var(--ink-muted)]">Loading friends…</p>}

                {!friendsLoading && friends.length === 0 && (
                  <div className="page-card flex flex-col items-center justify-center py-12 text-center">
                    <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[color:var(--navy-tint)]">
                      <Users size={24} className="text-[color:var(--navy)]" />
                    </div>
                    <p className="text-sm font-semibold text-[color:var(--foreground)]">No friends yet</p>
                    <p className="mt-1 text-xs text-[color:var(--ink-muted)]">Search for peers above to add them</p>
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  {friends.map((friend) => (
                    <div
                      key={friend.user_id}
                      className="flex items-center gap-3 rounded-2xl border border-[color:var(--border)] bg-white p-4"
                    >
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[color:var(--navy)] text-sm font-bold text-white">
                        {(friend.full_name ?? friend.email).slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <p className="truncate text-sm font-bold text-[color:var(--foreground)]">
                          {friend.full_name ?? friend.email}
                        </p>
                        <p className="truncate text-xs text-[color:var(--ink-muted)]">{friend.email}</p>
                        <div className="mt-1 flex gap-3 text-[11px] text-[color:var(--ink-subtle)]">
                          <span>🎯 {friend.mutual_sessions} shared sessions</span>
                          <span>🔥 {friend.streak_days}d streak</span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveFriend(friend.user_id)}
                        title="Remove friend"
                        className="shrink-0 rounded-full p-2 text-[color:var(--ink-muted)] hover:bg-red-50 hover:text-red-600 transition"
                      >
                        <UserMinus size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
