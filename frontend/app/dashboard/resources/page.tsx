"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BookOpen,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Filter,
  Folder,
  Grid3X3,
  Link2,
  List,
  Plus,
  Search,
  Share2,
  Sparkles,
  Star,
  Upload,
  X,
} from "lucide-react";
import Sidebar from "../../../components/sidebar";
import { API_BASE_URL, authedFetch, hasAuthToken } from "../../../lib/api";

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

type UserCore = {
  id: string;
  full_name: string | null;
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

type ChatContact = {
  user_id: string;
  full_name: string | null;
  email: string;
  credibility_score: number;
  ratings_count: number;
};

type ChatConversation = {
  conversation_id: string;
};

type MainTab = "courses" | "saved" | "discover";
type MainView = "course" | "all";
type CollectionView = "list" | "grid";
type UploadStep = 1 | 2 | 3;
type UploadType = "files" | "links" | "both";

type SharingVisibility = "course" | "specific" | "private";

const CONTRIBUTOR_POOL = [
  "Sarah Chen",
  "Marcus Johnson",
  "Emma Watson",
  "David Liu",
  "Alana Morgan",
  "Kayla Reid",
  "Dwayne Brown",
  "PeerStud Community",
];

const DEFAULT_FOLDERS = ["Lecture Notes", "Practice Problems", "Formula Sheets", "Video Tutorials", "Past Exams"];
const SORT_OPTIONS = ["Recent", "Most Saved", "Top Rated", "Most Downloaded"];
const COURSE_CARDS_DEFAULT_VISIBLE = 8;

function hashText(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function bytesToReadable(bytes: number | null): string {
  if (!bytes || bytes < 1) {
    return "-";
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function resolveResourceUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  return `${API_BASE_URL}${url}`;
}

function inferFolder(resource: ResourceItem): string {
  const source = `${resource.title} ${resource.file_name || ""} ${resource.resource_type}`.toLowerCase();
  if (source.includes("practice") || source.includes("worksheet") || source.includes("problem")) {
    return "Practice Problems";
  }
  if (source.includes("formula") || source.includes("cheat")) {
    return "Formula Sheets";
  }
  if (source.includes("video") || source.includes("tutorial") || source.includes("mp4") || source.includes("youtube")) {
    return "Video Tutorials";
  }
  if (source.includes("exam") || source.includes("midterm") || source.includes("final")) {
    return "Past Exams";
  }
  return "Lecture Notes";
}

function buildQualityBadges(resource: ResourceItem, saves: number, rating: number, comments: number): string[] {
  const badges: string[] = [];
  const ageDays = (Date.now() - new Date(resource.created_at).getTime()) / (1000 * 60 * 60 * 24);
  if (saves >= 30) {
    badges.push("Top Resource");
  }
  if (rating >= 4.5 && comments >= 6) {
    badges.push("Highly Rated");
  }
  if (ageDays <= 7) {
    badges.push("Recently Updated");
  }
  if (comments >= 10) {
    badges.push("Active Discussion");
  }
  if (saves >= 20 && ageDays <= 7) {
    badges.push("Trending");
  }
  return badges;
}

function getMockStats(resource: ResourceItem): { saves: number; comments: number; rating: number; contributor: string; downloads: number } {
  const hash = hashText(resource.id);
  const saves = 5 + (hash % 63);
  const comments = hash % 19;
  const rating = Number((3.7 + ((hash % 14) / 10)).toFixed(1));
  const downloads = 12 + (hash % 250);
  const contributor = CONTRIBUTOR_POOL[hash % CONTRIBUTOR_POOL.length];
  return { saves, comments, rating, contributor, downloads };
}

function loadLocalIds(key: string): string[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value) => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function saveLocalIds(key: string, values: string[]): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(key, JSON.stringify(values));
}

export default function ResourcesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedCourseId = searchParams.get("course_id") ?? "all";
  const requestedResourceId = searchParams.get("resource_id") ?? "";

  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");

  const [me, setMe] = useState<UserCore | null>(null);
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);

  const [mainTab, setMainTab] = useState<MainTab>("courses");
  const [mainView, setMainView] = useState<MainView>("course");
  const [collectionView, setCollectionView] = useState<CollectionView>("list");

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState(requestedCourseId);
  const [selectedFolder, setSelectedFolder] = useState("All");
  const [selectedTypeFilter, setSelectedTypeFilter] = useState("All Types");
  const [selectedContributorFilter, setSelectedContributorFilter] = useState("All Contributors");
  const [selectedDateFilter, setSelectedDateFilter] = useState("Any Time");
  const [selectedSort, setSelectedSort] = useState("Recent");

  const [showOnlyMyUploads, setShowOnlyMyUploads] = useState(false);
  const [showOnlySaved, setShowOnlySaved] = useState(false);
  const [showOnlySessionShared, setShowOnlySessionShared] = useState(false);
  const [showOnlyHighRated, setShowOnlyHighRated] = useState(false);
  const [showAllCourseCards, setShowAllCourseCards] = useState(false);
  const [showEmptyCourseCards, setShowEmptyCourseCards] = useState(false);

  const [savedResourceIds, setSavedResourceIds] = useState<string[]>([]);
  const [myUploadedResourceIds, setMyUploadedResourceIds] = useState<string[]>([]);
  const [selectedResourceId, setSelectedResourceId] = useState(requestedResourceId);

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadStep, setUploadStep] = useState<UploadStep>(1);
  const [uploading, setUploading] = useState(false);

  const [showShareModal, setShowShareModal] = useState(false);
  const [shareResourceId, setShareResourceId] = useState("");
  const [shareSearch, setShareSearch] = useState("");
  const [sharePeerUserId, setSharePeerUserId] = useState("");
  const [shareNote, setShareNote] = useState("");
  const [shareContacts, setShareContacts] = useState<ChatContact[]>([]);
  const [loadingShareContacts, setLoadingShareContacts] = useState(false);
  const [sharingToCommunity, setSharingToCommunity] = useState(false);

  const [uploadType, setUploadType] = useState<UploadType>("files");
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadLinks, setUploadLinks] = useState<string[]>([""]);

  const [uploadCourseId, setUploadCourseId] = useState("");
  const [uploadSessionId, setUploadSessionId] = useState("");
  const [uploadCategory, setUploadCategory] = useState(DEFAULT_FOLDERS[0]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDescription, setUploadDescription] = useState("");
  const [uploadTags, setUploadTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [topicSelections, setTopicSelections] = useState<string[]>([]);

  const [sharingVisibility, setSharingVisibility] = useState<SharingVisibility>("course");
  const [allowDownload, setAllowDownload] = useState(true);
  const [allowComments, setAllowComments] = useState(true);
  const [allowExternalShare, setAllowExternalShare] = useState(true);
  const [allowEditing, setAllowEditing] = useState(false);
  const [notifyCourseFeed, setNotifyCourseFeed] = useState(false);
  const [notifyNeedHelpStudents, setNotifyNeedHelpStudents] = useState(false);
  const [autoAddToSessions, setAutoAddToSessions] = useState(false);
  const [selectedLicense, setSelectedLicense] = useState("Creative Commons BY-SA");

  useEffect(() => {
    if (requestedCourseId) {
      setSelectedCourseId(requestedCourseId);
    }
    if (requestedResourceId) {
      setSelectedResourceId(requestedResourceId);
    }
  }, [requestedCourseId, requestedResourceId]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const authenticated = await hasAuthToken();
      if (cancelled) {
        return;
      }
      if (!authenticated) {
        router.push("/login");
        return;
      }

      try {
        const [meResponse, resourcesResponse, mineCoursesResponse, sessionsResponse] = await Promise.all([
          authedFetch<UserCore>("/users/me"),
          authedFetch<ResourceItem[]>("/resources"),
          authedFetch<CourseSummary[]>("/courses?mine_only=true").catch(() => []),
          authedFetch<SessionSummary[]>("/sessions"),
        ]);

        let coursesResponse = mineCoursesResponse;
        if (coursesResponse.length === 0) {
          coursesResponse = await authedFetch<CourseSummary[]>("/courses");
        }
        coursesResponse = Array.from(new Map(coursesResponse.map((course) => [course.id, course])).values());

        if (cancelled) {
          return;
        }

        setMe(meResponse);
        setResources(resourcesResponse);
        setCourses(coursesResponse);
        setSessions(sessionsResponse);

        const persistedSaved = loadLocalIds("peerstud_saved_resources");
        const persistedUploads = loadLocalIds("peerstud_uploaded_resources");
        setSavedResourceIds(persistedSaved);
        setMyUploadedResourceIds(persistedUploads);

        if (!selectedCourseId && coursesResponse[0]?.id) {
          setSelectedCourseId(coursesResponse[0].id);
        }
        if (!uploadCourseId && coursesResponse[0]?.id) {
          setUploadCourseId(coursesResponse[0].id);
        }
        if (!selectedResourceId && resourcesResponse[0]?.id) {
          setSelectedResourceId(resourcesResponse[0].id);
        }
      } catch (error: unknown) {
        if (!cancelled) {
          setStatusMessage(error instanceof Error ? error.message : "Failed to load resources.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [router, selectedCourseId, selectedResourceId, uploadCourseId]);

  const enrichedResources = useMemo(() => {
    return resources.map((resource) => {
      const stats = getMockStats(resource);
      const folder = inferFolder(resource);
      const badges = buildQualityBadges(resource, stats.saves, stats.rating, stats.comments);
      const myUpload = myUploadedResourceIds.includes(resource.id);
      return {
        ...resource,
        folder,
        stats,
        badges,
        myUpload,
      };
    });
  }, [myUploadedResourceIds, resources]);

  const contributorOptions = useMemo(() => {
    const unique = new Set(enrichedResources.map((resource) => resource.stats.contributor));
    return ["All Contributors", ...Array.from(unique).sort((left, right) => left.localeCompare(right))];
  }, [enrichedResources]);

  const selectedCourse = courses.find((course) => course.id === selectedCourseId) ?? null;

  const courseStats = useMemo(() => {
    return courses.map((course) => {
      const courseItems = enrichedResources.filter((resource) => resource.course_id === course.id);
      const weeklyCount = courseItems.filter(
        (resource) => Date.now() - new Date(resource.created_at).getTime() < 7 * 24 * 60 * 60 * 1000,
      ).length;
      const savedCount = courseItems.filter((resource) => savedResourceIds.includes(resource.id)).length;
      const contributors = new Set(courseItems.map((resource) => resource.stats.contributor));

      return {
        id: course.id,
        title: course.title,
        total: courseItems.length,
        weeklyCount,
        savedCount,
        contributors: contributors.size,
      };
    });
  }, [courses, enrichedResources, savedResourceIds]);

  const foldersForSelectedCourse = useMemo(() => {
    if (!selectedCourseId || selectedCourseId === "all") {
      return ["All", ...DEFAULT_FOLDERS];
    }
    const inCourse = enrichedResources.filter((resource) => resource.course_id === selectedCourseId);
    const dynamic = Array.from(new Set(inCourse.map((resource) => resource.folder)));
    return ["All", ...Array.from(new Set([...DEFAULT_FOLDERS, ...dynamic]))];
  }, [enrichedResources, selectedCourseId]);

  const compactCourseStats = useMemo(() => {
    const sorted = [...courseStats].sort((left, right) => {
      if (right.total !== left.total) {
        return right.total - left.total;
      }
      return left.title.localeCompare(right.title);
    });
    return showEmptyCourseCards ? sorted : sorted.filter((course) => course.total > 0);
  }, [courseStats, showEmptyCourseCards]);

  const visibleCourseStats = useMemo(() => {
    if (showAllCourseCards) {
      return compactCourseStats;
    }
    return compactCourseStats.slice(0, COURSE_CARDS_DEFAULT_VISIBLE);
  }, [compactCourseStats, showAllCourseCards]);

  const hiddenCourseCount = Math.max(0, compactCourseStats.length - visibleCourseStats.length);

  const baseFilteredResources = useMemo(() => {
    return enrichedResources.filter((resource) => {
      if (selectedCourseId !== "all" && resource.course_id !== selectedCourseId) {
        return false;
      }

      if (selectedFolder !== "All" && resource.folder !== selectedFolder) {
        return false;
      }

      if (selectedTypeFilter !== "All Types") {
        const normalizedType = resource.resource_type.toLowerCase();
        const match = selectedTypeFilter.toLowerCase();
        if (!normalizedType.includes(match) && !resource.title.toLowerCase().includes(match)) {
          return false;
        }
      }

      if (selectedContributorFilter !== "All Contributors" && resource.stats.contributor !== selectedContributorFilter) {
        return false;
      }

      if (selectedDateFilter === "Past 7 Days") {
        const withinWeek = Date.now() - new Date(resource.created_at).getTime() <= 7 * 24 * 60 * 60 * 1000;
        if (!withinWeek) {
          return false;
        }
      }

      if (selectedDateFilter === "Past 30 Days") {
        const withinMonth = Date.now() - new Date(resource.created_at).getTime() <= 30 * 24 * 60 * 60 * 1000;
        if (!withinMonth) {
          return false;
        }
      }

      if (showOnlySaved && !savedResourceIds.includes(resource.id)) {
        return false;
      }

      if (showOnlyMyUploads && !resource.myUpload) {
        return false;
      }

      if (showOnlySessionShared && !resource.session_id) {
        return false;
      }

      if (showOnlyHighRated && resource.stats.rating < 4.5) {
        return false;
      }

      const query = searchTerm.trim().toLowerCase();
      if (query) {
        const haystack = `${resource.title} ${resource.file_name || ""} ${resource.stats.contributor} ${resource.folder}`.toLowerCase();
        if (!haystack.includes(query)) {
          return false;
        }
      }

      return true;
    });
  }, [
    enrichedResources,
    savedResourceIds,
    searchTerm,
    selectedContributorFilter,
    selectedCourseId,
    selectedDateFilter,
    selectedFolder,
    selectedTypeFilter,
    showOnlyHighRated,
    showOnlyMyUploads,
    showOnlySaved,
    showOnlySessionShared,
  ]);

  const filteredResources = useMemo(() => {
    const items = [...baseFilteredResources];

    if (mainTab === "saved") {
      return items.filter((resource) => savedResourceIds.includes(resource.id));
    }

    if (mainTab === "discover") {
      if (selectedSort === "Top Rated") {
        return items.sort((left, right) => right.stats.rating - left.stats.rating);
      }
      if (selectedSort === "Most Saved") {
        return items.sort((left, right) => right.stats.saves - left.stats.saves);
      }
      return items.sort(
        (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
      );
    }

    if (selectedSort === "Most Saved") {
      items.sort((left, right) => right.stats.saves - left.stats.saves);
    } else if (selectedSort === "Top Rated") {
      items.sort((left, right) => right.stats.rating - left.stats.rating);
    } else if (selectedSort === "Most Downloaded") {
      items.sort((left, right) => right.stats.downloads - left.stats.downloads);
    } else {
      items.sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
    }

    return items;
  }, [baseFilteredResources, mainTab, savedResourceIds, selectedSort]);

  const selectedResource = useMemo(
    () => filteredResources.find((resource) => resource.id === selectedResourceId) ?? null,
    [filteredResources, selectedResourceId],
  );

  const shareResource = useMemo(
    () => enrichedResources.find((resource) => resource.id === shareResourceId) ?? null,
    [enrichedResources, shareResourceId],
  );

  const filteredShareContacts = useMemo(() => {
    const query = shareSearch.trim().toLowerCase();
    if (!query) {
      return shareContacts;
    }
    return shareContacts.filter((contact) => {
      const haystack = `${contact.full_name || ""} ${contact.email}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [shareContacts, shareSearch]);

  const relatedResources = useMemo(() => {
    if (!selectedResource) {
      return [];
    }
    return enrichedResources
      .filter((resource) => resource.course_id === selectedResource.course_id && resource.id !== selectedResource.id)
      .slice(0, 3);
  }, [enrichedResources, selectedResource]);

  function toggleSaved(resourceId: string): void {
    setSavedResourceIds((current) => {
      const next = current.includes(resourceId) ? current.filter((id) => id !== resourceId) : [...current, resourceId];
      saveLocalIds("peerstud_saved_resources", next);
      return next;
    });
  }

  function openUploadModal(): void {
    setShowUploadModal(true);
    setUploadStep(1);
    setUploadFiles([]);
    setUploadLinks([""]);
    setUploadTitle("");
    setUploadDescription("");
    setUploadTags([]);
    setTagDraft("");
    setTopicSelections([]);
    setUploadSessionId("");
    setStatusMessage("");
  }

  async function openShareModal(resourceId: string): Promise<void> {
    setShareResourceId(resourceId);
    setShareSearch("");
    setSharePeerUserId("");
    setShareNote("");
    setShowShareModal(true);
    setLoadingShareContacts(true);
    try {
      const contacts = await authedFetch<ChatContact[]>("/chat/contacts?limit=80");
      setShareContacts(contacts);
      if (contacts[0]?.user_id) {
        setSharePeerUserId(contacts[0].user_id);
      }
    } catch (error: unknown) {
      setStatusMessage(error instanceof Error ? error.message : "Could not load community contacts.");
      setShareContacts([]);
    } finally {
      setLoadingShareContacts(false);
    }
  }

  function closeShareModal(): void {
    setShowShareModal(false);
    setShareResourceId("");
    setShareSearch("");
    setSharePeerUserId("");
    setShareNote("");
  }

  async function handleShareToCommunity(): Promise<void> {
    if (!shareResource) {
      setStatusMessage("Choose a resource to share.");
      return;
    }
    if (!sharePeerUserId) {
      setStatusMessage("Choose who to share with in community chat.");
      return;
    }

    const shareUrl = resolveResourceUrl(shareResource.url);
    const authorName = me?.full_name?.trim() || "A classmate";
    const message = `${authorName} shared a resource\n\n${shareResource.title}\n${shareUrl}${
      shareNote.trim() ? `\n\nNote: ${shareNote.trim()}` : ""
    }`;

    try {
      setSharingToCommunity(true);
      const conversation = await authedFetch<ChatConversation>("/chat/conversations", {
        method: "POST",
        body: JSON.stringify({ peer_user_id: sharePeerUserId }),
      });

      await authedFetch(`/chat/conversations/${conversation.conversation_id}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: message }),
      });

      closeShareModal();
      setStatusMessage("Resource shared to community chat.");
    } catch (error: unknown) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to share to community chat.");
    } finally {
      setSharingToCommunity(false);
    }
  }

  async function handleCopyExternalShareLink(): Promise<void> {
    if (!shareResource) {
      setStatusMessage("Choose a resource to share.");
      return;
    }
    try {
      await navigator.clipboard.writeText(resolveResourceUrl(shareResource.url));
      setStatusMessage("External resource link copied.");
    } catch {
      setStatusMessage("Could not copy link. Copy manually from the field.");
    }
  }

  function closeUploadModal(): void {
    setShowUploadModal(false);
  }

  async function handleUploadSubmit(): Promise<void> {
    if (!uploadCourseId) {
      setStatusMessage("Select a course before uploading.");
      return;
    }

    if ((uploadType === "files" || uploadType === "both") && uploadFiles.length === 0) {
      setStatusMessage("Select at least one file to upload.");
      return;
    }

    if (uploadType === "links" && uploadLinks.filter((link) => link.trim()).length > 0) {
      setStatusMessage("Link-only uploads are staged in UI; backend link resources endpoint is pending.");
      return;
    }

    try {
      setUploading(true);
      setStatusMessage("");

      const uploadedItems: ResourceItem[] = [];

      for (const file of uploadFiles) {
        const formData = new FormData();
        formData.set("course_id", uploadCourseId);
        formData.set("title", uploadTitle.trim() || file.name);
        formData.set("resource_type", file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : "file");
        if (uploadSessionId) {
          formData.set("session_id", uploadSessionId);
        }
        formData.set("file", file);

        const uploaded = await authedFetch<ResourceItem>("/resources/upload", {
          method: "POST",
          body: formData,
        });
        uploadedItems.push(uploaded);
      }

      if (uploadedItems.length > 0) {
        setResources((current) => [...uploadedItems, ...current]);
        const uploadedIds = uploadedItems.map((item) => item.id);
        setMyUploadedResourceIds((current) => {
          const next = [...new Set([...uploadedIds, ...current])];
          saveLocalIds("peerstud_uploaded_resources", next);
          return next;
        });
      }

      closeUploadModal();
      setStatusMessage(
        uploadType === "both" && uploadLinks.some((link) => link.trim())
          ? "Files uploaded. Link uploads remain staged until backend link endpoint is added."
          : "Resource uploaded successfully.",
      );
    } catch (error: unknown) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to upload resource.");
    } finally {
      setUploading(false);
    }
  }

  function addTag(): void {
    const cleaned = tagDraft.trim().toLowerCase();
    if (!cleaned) {
      return;
    }
    if (uploadTags.includes(cleaned)) {
      setTagDraft("");
      return;
    }
    setUploadTags((current) => [...current, cleaned]);
    setTagDraft("");
  }

  function toggleTopic(topic: string): void {
    setTopicSelections((current) =>
      current.includes(topic) ? current.filter((item) => item !== topic) : [...current, topic],
    );
  }

  const filteredSessions = sessions.filter((session) => session.course_id === uploadCourseId);

  const discoverTrending = useMemo(() => {
    return [...enrichedResources]
      .sort((left, right) => {
        const leftScore = left.stats.saves + left.stats.comments * 2 + left.stats.rating * 5;
        const rightScore = right.stats.saves + right.stats.comments * 2 + right.stats.rating * 5;
        return rightScore - leftScore;
      })
      .slice(0, 5);
  }, [enrichedResources]);

  const discoverRecommended = useMemo(() => {
    if (!selectedCourseId || selectedCourseId === "all") {
      return enrichedResources.slice(0, 4);
    }
    const inCourse = enrichedResources.filter((resource) => resource.course_id === selectedCourseId).slice(0, 4);
    return inCourse.length > 0 ? inCourse : enrichedResources.slice(0, 4);
  }, [enrichedResources, selectedCourseId]);

  return (
    <div className="page-shell">
      <Sidebar />

      <main className="page-main">
        <div className="page-content">
          <section className="page-card-strong rounded-[2rem] p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-black tracking-tight text-[color:var(--foreground)]">Resources Library</h1>
                <p className="mt-1 text-sm text-[color:var(--ink-muted)]">
                  Course materials, peer uploads, and discovery feed.
                </p>
              </div>

              <button onClick={openUploadModal} className="primary-button inline-flex items-center gap-2 px-5 py-2.5 text-sm">
                <Upload size={16} />
                Upload
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {([
                { key: "courses", label: "My Courses" },
                { key: "saved", label: "My Saved" },
                { key: "discover", label: "Discover" },
              ] as Array<{ key: MainTab; label: string }>).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setMainTab(tab.key)}
                  className={`rounded-full border px-4 py-2 text-xs font-semibold tracking-[0.14em] ${
                    mainTab === tab.key
                      ? "border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-[color:var(--accent-strong)]"
                      : "border-[color:var(--border)] bg-white/80 text-[color:var(--ink-muted)]"
                  }`}
                >
                  {tab.label.toUpperCase()}
                </button>
              ))}
            </div>
          </section>

          <section className="mt-5 grid gap-3 rounded-[1.6rem] border border-[color:var(--border)] bg-white/80 p-4 xl:grid-cols-5">
            <label className="space-y-1 xl:col-span-2">
              <span className="soft-label">Search resources</span>
              <div className="field-shell flex items-center gap-2 px-3">
                <Search size={15} className="text-[color:var(--ink-subtle)]" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search resources, topics, or contributors"
                  className="w-full bg-transparent text-sm outline-none"
                />
              </div>
            </label>

            <div className="space-y-1">
              <span className="soft-label">View</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setMainView("course")}
                  className={`secondary-button px-3 py-2 text-xs ${mainView === "course" ? "bg-[color:var(--accent-soft)] text-[color:var(--accent-strong)]" : ""}`}
                >
                  Courses
                </button>
                <button
                  onClick={() => setMainView("all")}
                  className={`secondary-button px-3 py-2 text-xs ${mainView === "all" ? "bg-[color:var(--accent-soft)] text-[color:var(--accent-strong)]" : ""}`}
                >
                  All
                </button>
              </div>
            </div>

            <label className="space-y-1">
              <span className="soft-label">Filter</span>
              <select className="field-shell" value={selectedTypeFilter} onChange={(event) => setSelectedTypeFilter(event.target.value)}>
                <option>All Types</option>
                <option>file</option>
                <option>video</option>
                <option>audio</option>
                <option>link</option>
              </select>
            </label>

            <label className="space-y-1">
              <span className="soft-label">Sort</span>
              <select className="field-shell" value={selectedSort} onChange={(event) => setSelectedSort(event.target.value)}>
                {SORT_OPTIONS.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>
          </section>

          <section className="mt-3 grid gap-3 rounded-[1.6rem] border border-[color:var(--border)] bg-white/70 p-3 xl:grid-cols-4">
            <label className="space-y-1">
              <span className="soft-label">Course</span>
              <select className="field-shell" value={selectedCourseId} onChange={(event) => setSelectedCourseId(event.target.value)}>
                <option value="all">All Courses</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>{course.title}</option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="soft-label">Contributors</span>
              <select className="field-shell" value={selectedContributorFilter} onChange={(event) => setSelectedContributorFilter(event.target.value)}>
                {contributorOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="soft-label">Date</span>
              <select className="field-shell" value={selectedDateFilter} onChange={(event) => setSelectedDateFilter(event.target.value)}>
                <option>Any Time</option>
                <option>Past 7 Days</option>
                <option>Past 30 Days</option>
              </select>
            </label>

            <div className="space-y-1">
              <span className="soft-label">Collection View</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCollectionView("list")}
                  className={`secondary-button inline-flex items-center gap-1 px-3 py-2 text-xs ${collectionView === "list" ? "bg-[color:var(--accent-soft)] text-[color:var(--accent-strong)]" : ""}`}
                >
                  <List size={14} />
                  List
                </button>
                <button
                  onClick={() => setCollectionView("grid")}
                  className={`secondary-button inline-flex items-center gap-1 px-3 py-2 text-xs ${collectionView === "grid" ? "bg-[color:var(--accent-soft)] text-[color:var(--accent-strong)]" : ""}`}
                >
                  <Grid3X3 size={14} />
                  Grid
                </button>
              </div>
            </div>
          </section>

          {loading && <p className="mt-4 text-sm text-[color:var(--ink-muted)]">Loading resources...</p>}
          {statusMessage && <p className="mt-4 text-sm text-[color:var(--accent-strong)]">{statusMessage}</p>}

          {mainTab === "discover" ? (
            <section className="mt-6 space-y-5">
              <article className="glass-panel rounded-[1.6rem] p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="section-kicker">Trending This Week</p>
                    <h2 className="mt-1 text-xl font-bold text-[color:var(--foreground)]">Most active resources</h2>
                  </div>
                  <Sparkles className="text-[color:var(--accent-strong)]" size={18} />
                </div>
                <div className="space-y-3">
                  {discoverTrending.map((resource, index) => (
                    <article key={resource.id} className="rounded-[1rem] border border-[color:var(--border)] bg-white/80 p-4">
                      <p className="text-sm font-semibold text-[color:var(--foreground)]">
                        {index + 1}. {resource.title}
                      </p>
                      <p className="mt-1 text-xs text-[color:var(--ink-muted)]">
                        {courses.find((course) => course.id === resource.course_id)?.title || "Course"} | {resource.stats.saves} saves | {resource.stats.comments} comments | {resource.stats.rating}★ | {resource.stats.contributor}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button onClick={() => setSelectedResourceId(resource.id)} className="secondary-button px-3 py-1.5 text-xs">Preview</button>
                        <button onClick={() => toggleSaved(resource.id)} className="secondary-button px-3 py-1.5 text-xs">{savedResourceIds.includes(resource.id) ? "Saved" : "Save"}</button>
                      </div>
                    </article>
                  ))}
                </div>
              </article>

              <article className="page-card rounded-[1.6rem] border p-5">
                <p className="section-kicker">Recommended For You</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {discoverRecommended.map((resource) => (
                    <article key={resource.id} className="rounded-[1rem] border border-[color:var(--border)] bg-white p-3">
                      <p className="text-sm font-semibold text-[color:var(--foreground)] line-clamp-2">{resource.title}</p>
                      <p className="mt-2 text-xs text-[color:var(--ink-muted)]">{resource.stats.rating}★ | {resource.stats.saves} saves</p>
                      <button onClick={() => toggleSaved(resource.id)} className="secondary-button mt-3 w-full px-3 py-1.5 text-xs">
                        {savedResourceIds.includes(resource.id) ? "Saved" : "Save"}
                      </button>
                    </article>
                  ))}
                </div>
              </article>
            </section>
          ) : (
            <section className="mt-6 grid gap-5 xl:grid-cols-[0.25fr_0.45fr_0.30fr]">
              <aside className="space-y-4">
                <article className="glass-panel rounded-[1.6rem] p-5">
                  <p className="section-kicker">My Courses</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => setShowAllCourseCards((current) => !current)}
                      className="secondary-button px-3 py-1.5 text-xs"
                    >
                      {showAllCourseCards ? "Show less" : `Show top ${COURSE_CARDS_DEFAULT_VISIBLE}`}
                    </button>
                    <button
                      onClick={() => setShowEmptyCourseCards((current) => !current)}
                      className="secondary-button px-3 py-1.5 text-xs"
                    >
                      {showEmptyCourseCards ? "Hide empty" : "Include empty"}
                    </button>
                  </div>
                  <div className="mt-4 space-y-3">
                    {visibleCourseStats.map((course) => (
                      <button
                        key={course.id}
                        onClick={() => setSelectedCourseId(course.id)}
                        className={`w-full rounded-[1rem] border px-4 py-3 text-left ${
                          selectedCourseId === course.id ? "border-[color:var(--accent)] bg-[color:var(--accent-soft)]" : "border-[color:var(--border)] bg-white/80"
                        }`}
                      >
                        <p className="font-semibold text-[color:var(--foreground)]">{course.title}</p>
                        <p className="mt-1 text-xs text-[color:var(--ink-muted)]">{course.total} resources</p>
                        <p className="text-xs text-[color:var(--ink-muted)]">{course.weeklyCount} added this week</p>
                        <p className="text-xs text-[color:var(--ink-muted)]">{course.savedCount} saved by you</p>
                      </button>
                    ))}
                    {visibleCourseStats.length === 0 && (
                      <p className="rounded-[1rem] bg-white/70 px-3 py-2 text-sm text-[color:var(--ink-muted)]">
                        No course resources yet.
                      </p>
                    )}
                    {!showAllCourseCards && hiddenCourseCount > 0 && (
                      <p className="text-xs text-[color:var(--ink-muted)]">{hiddenCourseCount} more courses hidden.</p>
                    )}
                  </div>
                </article>

                <article className="page-card rounded-[1.6rem] border p-5">
                  <p className="section-kicker">Quick Filters</p>
                  <div className="mt-3 space-y-2 text-sm text-[color:var(--ink-muted)]">
                    <label className="flex items-center justify-between gap-2">
                      My uploads
                      <input type="checkbox" checked={showOnlyMyUploads} onChange={(event) => setShowOnlyMyUploads(event.target.checked)} />
                    </label>
                    <label className="flex items-center justify-between gap-2">
                      Saved items
                      <input type="checkbox" checked={showOnlySaved} onChange={(event) => setShowOnlySaved(event.target.checked)} />
                    </label>
                    <label className="flex items-center justify-between gap-2">
                      Shared in sessions
                      <input type="checkbox" checked={showOnlySessionShared} onChange={(event) => setShowOnlySessionShared(event.target.checked)} />
                    </label>
                    <label className="flex items-center justify-between gap-2">
                      High rated (4.5+)
                      <input type="checkbox" checked={showOnlyHighRated} onChange={(event) => setShowOnlyHighRated(event.target.checked)} />
                    </label>
                  </div>
                </article>

                <article className="glass-panel rounded-[1.6rem] p-5">
                  <p className="section-kicker">Resource Stats</p>
                  <div className="mt-3 space-y-2 text-sm text-[color:var(--ink-muted)]">
                    <p className="flex items-center justify-between"><span>Total saved</span><strong className="text-[color:var(--foreground)]">{savedResourceIds.length}</strong></p>
                    <p className="flex items-center justify-between"><span>You uploaded</span><strong className="text-[color:var(--foreground)]">{myUploadedResourceIds.length}</strong></p>
                    <p className="flex items-center justify-between"><span>Downloads</span><strong className="text-[color:var(--foreground)]">{enrichedResources.reduce((sum, item) => sum + item.stats.downloads, 0)}</strong></p>
                    <p className="flex items-center justify-between"><span>Avg rating</span><strong className="text-[color:var(--foreground)]">{(enrichedResources.reduce((sum, item) => sum + item.stats.rating, 0) / Math.max(1, enrichedResources.length)).toFixed(1)}/5</strong></p>
                  </div>
                </article>
              </aside>

              <section className="space-y-4">
                <article className="glass-panel-strong rounded-[1.6rem] p-5">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="section-kicker">{mainView === "course" ? "Course Library" : "All Resources"}</p>
                      <h2 className="mt-1 text-xl font-bold text-[color:var(--foreground)]">
                        {selectedCourse?.title || "Resource Collection"}
                      </h2>
                      <p className="text-sm text-[color:var(--ink-muted)]">
                        {filteredResources.length} resources | {new Set(filteredResources.map((resource) => resource.stats.contributor)).size} contributors
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Folder size={16} className="text-[color:var(--ink-muted)]" />
                      <select
                        value={selectedFolder}
                        onChange={(event) => setSelectedFolder(event.target.value)}
                        className="field-shell min-w-44"
                      >
                        {foldersForSelectedCourse.map((folder) => (
                          <option key={folder}>{folder}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {collectionView === "grid" ? (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {filteredResources.map((resource) => (
                        <article key={resource.id} className="rounded-[1rem] border border-[color:var(--border)] bg-white p-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.13em] text-[color:var(--ink-muted)]">
                            {resource.resource_type.toUpperCase()}
                          </p>
                          <p className="mt-1 line-clamp-2 text-sm font-semibold text-[color:var(--foreground)]">{resource.title}</p>
                          <p className="mt-1 text-xs text-[color:var(--ink-muted)]">{resource.stats.contributor} | {new Date(resource.created_at).toLocaleDateString()}</p>
                          <p className="mt-1 text-xs text-[color:var(--ink-muted)]">⭐ {resource.stats.rating} • 💬 {resource.stats.comments}</p>
                          <div className="mt-3 flex gap-2">
                            <button onClick={() => setSelectedResourceId(resource.id)} className="secondary-button flex-1 px-3 py-1.5 text-xs">View</button>
                            <button onClick={() => toggleSaved(resource.id)} className="secondary-button flex-1 px-3 py-1.5 text-xs">
                              {savedResourceIds.includes(resource.id) ? "Saved" : "Save"}
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {filteredResources.map((resource) => (
                        <article key={resource.id} className="rounded-[1rem] border border-[color:var(--border)] bg-white/80 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-[color:var(--foreground)]">{resource.title}</p>
                              <p className="mt-1 text-xs text-[color:var(--ink-muted)]">
                                {resource.stats.contributor} • {new Date(resource.created_at).toLocaleString()} • {resource.folder}
                              </p>
                              <p className="mt-1 text-xs text-[color:var(--ink-muted)]">
                                ⭐ {resource.stats.saves} saves • 💬 {resource.stats.comments} comments • {resource.stats.rating}★
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button onClick={() => setSelectedResourceId(resource.id)} className="secondary-button inline-flex items-center gap-1 px-3 py-1.5 text-xs"><Eye size={13} /> Preview</button>
                              <a href={resolveResourceUrl(resource.url)} target="_blank" rel="noreferrer" className="secondary-button inline-flex items-center gap-1 px-3 py-1.5 text-xs"><Download size={13} /> Download</a>
                              <button onClick={() => toggleSaved(resource.id)} className="secondary-button inline-flex items-center gap-1 px-3 py-1.5 text-xs"><Star size={13} /> {savedResourceIds.includes(resource.id) ? "Saved" : "Save"}</button>
                              <button
                                onClick={() => {
                                  void openShareModal(resource.id);
                                }}
                                className="secondary-button inline-flex items-center gap-1 px-3 py-1.5 text-xs"
                              >
                                <Share2 size={13} /> Share
                              </button>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}

                  {!loading && filteredResources.length === 0 && (
                    <p className="rounded-[1rem] bg-white/75 px-4 py-3 text-sm text-[color:var(--ink-muted)]">No resources match your current filters.</p>
                  )}
                </article>
              </section>

              <aside className="space-y-4">
                <article className="glass-panel rounded-[1.6rem] p-5">
                  <p className="section-kicker">Resource Details</p>
                  {!selectedResource && (
                    <p className="mt-2 text-sm text-[color:var(--ink-muted)]">Select a resource to preview details and actions.</p>
                  )}

                  {selectedResource && (
                    <div className="mt-3 space-y-4">
                      <h3 className="text-lg font-semibold text-[color:var(--foreground)]">{selectedResource.title}</h3>

                      <div className="rounded-[1rem] border border-[color:var(--border)] bg-white/75 p-3 text-sm">
                        <p className="text-[color:var(--ink-muted)]">Uploaded by</p>
                        <p className="font-semibold text-[color:var(--foreground)]">{selectedResource.stats.contributor}</p>
                        <p className="mt-1 text-[color:var(--ink-muted)]">{new Date(selectedResource.created_at).toLocaleDateString()} | {bytesToReadable(selectedResource.file_size_bytes)}</p>
                        <p className="mt-1 text-[color:var(--ink-muted)]">Downloads: {selectedResource.stats.downloads}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <a href={resolveResourceUrl(selectedResource.url)} target="_blank" rel="noreferrer" className="secondary-button inline-flex items-center justify-center gap-1 px-3 py-2 text-xs"><Download size={13} /> Download</a>
                        <button onClick={() => toggleSaved(selectedResource.id)} className="secondary-button inline-flex items-center justify-center gap-1 px-3 py-2 text-xs"><Star size={13} /> {savedResourceIds.includes(selectedResource.id) ? "Saved" : "Save"}</button>
                        <button onClick={() => setStatusMessage("Printing is browser-native. Open the file and print from your viewer.")} className="secondary-button inline-flex items-center justify-center gap-1 px-3 py-2 text-xs"><FileText size={13} /> Print</button>
                        <button onClick={() => { void navigator.clipboard.writeText(resolveResourceUrl(selectedResource.url)); setStatusMessage("Link copied."); }} className="secondary-button inline-flex items-center justify-center gap-1 px-3 py-2 text-xs"><Link2 size={13} /> Copy Link</button>
                        <button onClick={() => { void openShareModal(selectedResource.id); }} className="secondary-button inline-flex items-center justify-center gap-1 px-3 py-2 text-xs"><Share2 size={13} /> Share</button>
                      </div>

                      <div className="rounded-[1rem] border border-[color:var(--border)] bg-white/75 p-3 text-sm">
                        <p className="font-semibold text-[color:var(--foreground)]">Quality Badges</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {selectedResource.badges.length > 0 ? selectedResource.badges.map((badge) => (
                            <span key={badge} className="rounded-full bg-[color:var(--accent-soft)] px-3 py-1 text-xs font-semibold text-[color:var(--accent-strong)]">{badge}</span>
                          )) : <span className="text-xs text-[color:var(--ink-muted)]">No badge yet.</span>}
                        </div>
                      </div>

                      <div className="rounded-[1rem] border border-[color:var(--border)] bg-white/75 p-3 text-sm">
                        <p className="font-semibold text-[color:var(--foreground)]">Rating</p>
                        <p className="mt-1 text-[color:var(--ink-muted)]">{selectedResource.stats.rating}/5.0 ({selectedResource.stats.comments + 5} ratings)</p>
                      </div>

                      <div className="rounded-[1rem] border border-[color:var(--border)] bg-white/75 p-3 text-sm">
                        <p className="font-semibold text-[color:var(--foreground)]">Related Resources</p>
                        <div className="mt-2 space-y-2">
                          {relatedResources.map((resource) => (
                            <button key={resource.id} onClick={() => setSelectedResourceId(resource.id)} className="w-full rounded-lg bg-white px-3 py-2 text-left text-xs text-[color:var(--foreground)]">
                              {resource.title} • {resource.stats.rating}★
                            </button>
                          ))}
                          {relatedResources.length === 0 && <p className="text-xs text-[color:var(--ink-muted)]">No related resources yet.</p>}
                        </div>
                      </div>
                    </div>
                  )}
                </article>

                <article className="page-card rounded-[1.6rem] border p-5">
                  <p className="section-kicker">Impact</p>
                  <div className="mt-3 space-y-2 text-sm text-[color:var(--ink-muted)]">
                    <p>Resources uploaded: {myUploadedResourceIds.length}</p>
                    <p>Total saves by others: {myUploadedResourceIds.reduce((sum, id) => sum + (enrichedResources.find((resource) => resource.id === id)?.stats.saves || 0), 0)}</p>
                    <p>Avg rating: {(myUploadedResourceIds.reduce((sum, id) => sum + (enrichedResources.find((resource) => resource.id === id)?.stats.rating || 0), 0) / Math.max(1, myUploadedResourceIds.length)).toFixed(1)}/5.0</p>
                    <p>Comments received: {myUploadedResourceIds.reduce((sum, id) => sum + (enrichedResources.find((resource) => resource.id === id)?.stats.comments || 0), 0)}</p>
                  </div>
                </article>
              </aside>
            </section>
          )}
        </div>
      </main>

      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(9,20,35,0.58)] p-3">
          <div className="w-full max-w-4xl rounded-[1.8rem] border border-[color:var(--border)] bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-[color:var(--foreground)]">Upload Resources</h2>
                <p className="text-xs text-[color:var(--ink-muted)]">Step {uploadStep} of 3</p>
              </div>
              <button onClick={closeUploadModal} className="rounded-full border border-[color:var(--border)] p-2">
                <X size={16} />
              </button>
            </div>

            <div className="mt-3 h-2 rounded-full bg-[color:var(--background-alt)]">
              <div className="h-2 rounded-full bg-[color:var(--accent)]" style={{ width: `${(uploadStep / 3) * 100}%` }} />
            </div>

            {uploadStep === 1 && (
              <div className="mt-5 grid gap-4">
                <div>
                  <p className="soft-label mb-2">Upload Type</p>
                  <div className="flex flex-wrap gap-2">
                    {([
                      { key: "files", label: "Files" },
                      { key: "links", label: "Links" },
                      { key: "both", label: "Both" },
                    ] as Array<{ key: UploadType; label: string }>).map((option) => (
                      <button
                        key={option.key}
                        onClick={() => setUploadType(option.key)}
                        className={`secondary-button px-4 py-2 text-xs ${uploadType === option.key ? "bg-[color:var(--accent-soft)] text-[color:var(--accent-strong)]" : ""}`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {(uploadType === "files" || uploadType === "both") && (
                  <label className="rounded-[1rem] border border-dashed border-[color:var(--border-strong)] bg-[color:var(--background-alt)] p-6 text-center">
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(event) => setUploadFiles(Array.from(event.target.files || []))}
                    />
                    <span className="inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--foreground)]">
                      <Upload size={16} />
                      Drag and drop or browse files
                    </span>
                    <p className="mt-2 text-xs text-[color:var(--ink-muted)]">Supported: PDF, DOCX, PPTX, XLSX, PNG, JPG, MP4, MP3, TXT, MD</p>
                    {uploadFiles.length > 0 && (
                      <div className="mt-3 space-y-1 text-left text-xs text-[color:var(--ink-muted)]">
                        {uploadFiles.map((file) => (
                          <p key={file.name}>{file.name} ({bytesToReadable(file.size)})</p>
                        ))}
                      </div>
                    )}
                  </label>
                )}

                {(uploadType === "links" || uploadType === "both") && (
                  <div className="rounded-[1rem] border border-[color:var(--border)] bg-white p-4">
                    <p className="soft-label">External Links</p>
                    <div className="mt-2 space-y-2">
                      {uploadLinks.map((link, index) => (
                        <input
                          key={`link-${index}`}
                          value={link}
                          onChange={(event) => {
                            setUploadLinks((current) => current.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)));
                          }}
                          className="field-shell"
                          placeholder="https://..."
                        />
                      ))}
                    </div>
                    <button onClick={() => setUploadLinks((current) => [...current, ""])} className="secondary-button mt-3 px-3 py-1.5 text-xs">
                      + Add Another Link
                    </button>
                    <p className="mt-2 text-xs text-[color:var(--ink-muted)]">Link uploads are staged in UI and will activate once backend link endpoint is added.</p>
                  </div>
                )}
              </div>
            )}

            {uploadStep === 2 && (
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="soft-label">Course</span>
                  <select value={uploadCourseId} onChange={(event) => setUploadCourseId(event.target.value)} className="field-shell">
                    {courses.map((course) => (
                      <option key={course.id} value={course.id}>{course.title}</option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="soft-label">Session (optional)</span>
                  <select value={uploadSessionId} onChange={(event) => setUploadSessionId(event.target.value)} className="field-shell">
                    <option value="">General course folder</option>
                    {filteredSessions.map((session) => (
                      <option key={session.id} value={session.id}>{session.topic_focus}</option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="soft-label">Folder / Category</span>
                  <select value={uploadCategory} onChange={(event) => setUploadCategory(event.target.value)} className="field-shell">
                    {DEFAULT_FOLDERS.map((folder) => (
                      <option key={folder}>{folder}</option>
                    ))}
                    {newCategoryName && <option>{newCategoryName}</option>}
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="soft-label">Or create new folder</span>
                  <input value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} className="field-shell" placeholder="New folder name" />
                </label>

                <label className="space-y-1 md:col-span-2">
                  <span className="soft-label">Resource Title</span>
                  <input value={uploadTitle} onChange={(event) => setUploadTitle(event.target.value)} className="field-shell" placeholder="Chain Rule - Complete Guide with Examples" />
                </label>

                <label className="space-y-1 md:col-span-2">
                  <span className="soft-label">Description</span>
                  <textarea value={uploadDescription} onChange={(event) => setUploadDescription(event.target.value)} className="field-shell min-h-24" placeholder="Short summary of what this resource covers" />
                </label>

                <div className="space-y-1 md:col-span-2">
                  <span className="soft-label">Tags</span>
                  <div className="field-shell flex items-center gap-2">
                    <input value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="Add a tag and press +" />
                    <button onClick={addTag} className="secondary-button px-3 py-1 text-xs">+</button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {uploadTags.map((tag) => (
                      <button key={tag} onClick={() => setUploadTags((current) => current.filter((item) => item !== tag))} className="rounded-full bg-[color:var(--accent-soft)] px-3 py-1 text-xs font-semibold text-[color:var(--accent-strong)]">
                        {tag} x
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1 md:col-span-2">
                  <span className="soft-label">Topics Covered</span>
                  <div className="grid gap-2 sm:grid-cols-3 text-sm text-[color:var(--ink-muted)]">
                    {[
                      "Limits",
                      "Derivatives",
                      "Integrals",
                      "Chain Rule",
                      "Product Rule",
                      "Quotient Rule",
                    ].map((topic) => (
                      <label key={topic} className="flex items-center gap-2 rounded-lg border border-[color:var(--border)] bg-white p-2">
                        <input type="checkbox" checked={topicSelections.includes(topic)} onChange={() => toggleTopic(topic)} />
                        {topic}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {uploadStep === 3 && (
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="rounded-[1rem] border border-[color:var(--border)] p-4 md:col-span-2">
                  <p className="soft-label">Who can see this resource?</p>
                  <div className="mt-2 space-y-2 text-sm">
                    <label className="flex items-start gap-2"><input type="radio" checked={sharingVisibility === "course"} onChange={() => setSharingVisibility("course")} /> Everyone in selected course</label>
                    <label className="flex items-start gap-2"><input type="radio" checked={sharingVisibility === "specific"} onChange={() => setSharingVisibility("specific")} /> Specific people or groups</label>
                    <label className="flex items-start gap-2"><input type="radio" checked={sharingVisibility === "private"} onChange={() => setSharingVisibility("private")} /> Only me (private)</label>
                  </div>
                </div>

                <label className="flex items-center justify-between rounded-[1rem] border border-[color:var(--border)] p-3 text-sm">Allow downloads <input type="checkbox" checked={allowDownload} onChange={(event) => setAllowDownload(event.target.checked)} /></label>
                <label className="flex items-center justify-between rounded-[1rem] border border-[color:var(--border)] p-3 text-sm">Allow comments <input type="checkbox" checked={allowComments} onChange={(event) => setAllowComments(event.target.checked)} /></label>
                <label className="flex items-center justify-between rounded-[1rem] border border-[color:var(--border)] p-3 text-sm">Allow sharing outside course <input type="checkbox" checked={allowExternalShare} onChange={(event) => setAllowExternalShare(event.target.checked)} /></label>
                <label className="flex items-center justify-between rounded-[1rem] border border-[color:var(--border)] p-3 text-sm">Allow editing <input type="checkbox" checked={allowEditing} onChange={(event) => setAllowEditing(event.target.checked)} /></label>

                <div className="rounded-[1rem] border border-[color:var(--border)] p-4 md:col-span-2">
                  <p className="soft-label">Notify</p>
                  <div className="mt-2 space-y-2 text-sm">
                    <label className="flex items-center justify-between">Post to course feed <input type="checkbox" checked={notifyCourseFeed} onChange={(event) => setNotifyCourseFeed(event.target.checked)} /></label>
                    <label className="flex items-center justify-between">Notify students who need this topic <input type="checkbox" checked={notifyNeedHelpStudents} onChange={(event) => setNotifyNeedHelpStudents(event.target.checked)} /></label>
                    <label className="flex items-center justify-between">Add to upcoming sessions automatically <input type="checkbox" checked={autoAddToSessions} onChange={(event) => setAutoAddToSessions(event.target.checked)} /></label>
                  </div>
                </div>

                <label className="space-y-1 md:col-span-2">
                  <span className="soft-label">License</span>
                  <select value={selectedLicense} onChange={(event) => setSelectedLicense(event.target.value)} className="field-shell">
                    <option>Creative Commons BY-SA</option>
                    <option>Creative Commons BY</option>
                    <option>All Rights Reserved</option>
                    <option>Public Domain</option>
                  </select>
                </label>
              </div>
            )}

            <div className="mt-6 flex items-center justify-between">
              <button
                onClick={() => setUploadStep((current) => (current > 1 ? ((current - 1) as UploadStep) : current))}
                disabled={uploadStep === 1 || uploading}
                className="secondary-button px-4 py-2 text-sm"
              >
                Back
              </button>

              {uploadStep < 3 ? (
                <button onClick={() => setUploadStep((current) => (current < 3 ? ((current + 1) as UploadStep) : current))} className="primary-button px-4 py-2 text-sm">
                  Next
                </button>
              ) : (
                <button onClick={() => void handleUploadSubmit()} disabled={uploading} className="primary-button inline-flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-60">
                  {uploading ? "Uploading..." : "Upload and Share"}
                  <Upload size={16} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(9,20,35,0.58)] p-3">
          <div className="w-full max-w-2xl rounded-[1.8rem] border border-[color:var(--border)] bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-[color:var(--foreground)]">Share Resource</h2>
                <p className="text-xs text-[color:var(--ink-muted)]">Send to Community chat or share external link</p>
              </div>
              <button onClick={closeShareModal} className="rounded-full border border-[color:var(--border)] p-2">
                <X size={16} />
              </button>
            </div>

            {shareResource && (
              <div className="mt-4 rounded-[1rem] border border-[color:var(--border)] bg-white/80 p-3">
                <p className="text-sm font-semibold text-[color:var(--foreground)]">{shareResource.title}</p>
                <p className="mt-1 text-xs text-[color:var(--ink-muted)]">{shareResource.file_name || shareResource.resource_type}</p>
              </div>
            )}

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <section className="rounded-[1rem] border border-[color:var(--border)] bg-white/75 p-4">
                <p className="text-sm font-semibold text-[color:var(--foreground)]">Community Chat</p>
                <p className="mt-1 text-xs text-[color:var(--ink-muted)]">Send directly to someone in your community inbox.</p>

                <input
                  value={shareSearch}
                  onChange={(event) => setShareSearch(event.target.value)}
                  className="field-shell mt-3"
                  placeholder="Search people by name or email"
                />

                <label className="mt-2 block space-y-1">
                  <span className="soft-label">Choose recipient</span>
                  <select
                    value={sharePeerUserId}
                    onChange={(event) => setSharePeerUserId(event.target.value)}
                    className="field-shell"
                  >
                    <option value="">Select person</option>
                    {filteredShareContacts.map((contact) => (
                      <option key={contact.user_id} value={contact.user_id}>
                        {(contact.full_name || contact.email)} ({contact.email})
                      </option>
                    ))}
                  </select>
                </label>

                <textarea
                  value={shareNote}
                  onChange={(event) => setShareNote(event.target.value)}
                  className="field-shell mt-2 min-h-20"
                  placeholder="Add optional note"
                />

                <button
                  onClick={() => void handleShareToCommunity()}
                  disabled={sharingToCommunity || loadingShareContacts || !sharePeerUserId}
                  className="primary-button mt-3 w-full px-4 py-2 text-sm disabled:opacity-60"
                >
                  {sharingToCommunity ? "Sending..." : "Send to Community Chat"}
                </button>
              </section>

              <section className="rounded-[1rem] border border-[color:var(--border)] bg-white/75 p-4">
                <p className="text-sm font-semibold text-[color:var(--foreground)]">External Link</p>
                <p className="mt-1 text-xs text-[color:var(--ink-muted)]">Copy a direct link to share outside the app.</p>

                <input
                  readOnly
                  value={shareResource ? resolveResourceUrl(shareResource.url) : ""}
                  className="field-shell mt-3"
                />

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button onClick={() => void handleCopyExternalShareLink()} className="secondary-button inline-flex items-center justify-center gap-1 px-3 py-2 text-xs">
                    <Link2 size={13} /> Copy Link
                  </button>
                  <a
                    href={shareResource ? resolveResourceUrl(shareResource.url) : "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="secondary-button inline-flex items-center justify-center gap-1 px-3 py-2 text-xs"
                  >
                    <ExternalLink size={13} /> Open Link
                  </a>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
