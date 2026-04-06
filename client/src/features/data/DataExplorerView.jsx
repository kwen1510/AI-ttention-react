import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Database,
  Download,
  FileText,
  MessageSquare,
  RefreshCw,
  Users,
  X,
} from "lucide-react";

const MODE_META = {
  summary: {
    label: "Summary",
    icon: MessageSquare,
    badge:
      "bg-gradient-to-br from-blue-400/20 to-indigo-500/20 text-blue-700 border border-blue-300/30",
  },
  checkbox: {
    label: "Checkbox",
    icon: CheckSquare,
    badge:
      "bg-gradient-to-br from-emerald-400/20 to-teal-500/20 text-emerald-700 border border-emerald-300/30",
  },
};

function formatDate(value) {
  if (!value) return "Unknown date";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function formatDuration(durationMs) {
  if (!durationMs || durationMs <= 0) return "—";
  const totalMinutes = Math.floor(durationMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours) {
    return `${hours}h ${minutes}m`;
  }
  if (totalMinutes === 0) {
    return "<1m";
  }
  return `${totalMinutes}m`;
}

function truncate(text, limit = 140) {
  if (!text) return "";
  const trimmed = text.trim();
  if (trimmed.length <= limit) return trimmed;
  return `${trimmed.slice(0, limit)}…`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function getModeMeta(mode) {
  return (
    MODE_META[mode] ?? {
      label: "Unknown",
      icon: Database,
      badge:
        "bg-gradient-to-br from-slate-400/20 to-gray-500/20 text-slate-700 border border-slate-300/30",
    }
  );
}

function ModeBadge({ mode }) {
  const meta = getModeMeta(mode);
  const Icon = meta.icon;

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold backdrop-blur-sm ${meta.badge}`}
    >
      <Icon className="w-3.5 h-3.5 mr-1" />
      {meta.label}
    </span>
  );
}

function StatusBadge({ active }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
        active
          ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
          : "bg-slate-100 text-slate-700 border border-slate-200"
      }`}
    >
      {active ? "Live" : "Complete"}
    </span>
  );
}

function ReleaseBadge({ released }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
        released
          ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
          : "bg-slate-100 text-slate-700 border border-slate-200"
      }`}
    >
      {released ? "Released" : "Not Released"}
    </span>
  );
}

function CheckboxPreview({ data }) {
  if (!data) return null;

  return (
    <div className="mt-4 rounded-lg border border-emerald-200/50 bg-gradient-to-br from-emerald-50/60 to-teal-50/60 p-4 text-sm text-emerald-900">
      <p className="font-semibold text-emerald-700">Checklist Progress</p>
      <p className="mt-1">
        Completion: {data.completionRate ?? 0}% ({data.completedCriteria ?? 0}/
        {data.totalCriteria ?? 0})
      </p>
      {data.scenario ? (
        <p className="mt-1 text-emerald-800/80">Scenario: {truncate(data.scenario, 120)}</p>
      ) : null}
    </div>
  );
}

function SessionCard({ session, onSelect }) {
  const meta = getModeMeta(session.mode);
  const Icon = meta.icon;

  return (
    <div className="glass-panel overflow-hidden transition-all duration-300 hover:shadow-2xl group">
      <div className="p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-300/30 bg-gradient-to-br from-cyan-400/20 to-blue-500/20 backdrop-blur-sm transition-transform group-hover:scale-110">
              <Icon className="h-5 w-5 text-cyan-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold gradient-text">Session {session.code}</h3>
              <div className="mt-1 flex items-center space-x-2 text-xs text-slate-600">
                <ModeBadge mode={session.mode} />
                <span>{formatDate(session.created_at)}</span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <StatusBadge active={session.active} />
            <div className="mt-1 text-xs text-slate-500">{formatDuration(session.duration)}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm text-slate-700">
          <div className="flex items-center space-x-2">
            <Users className="h-4 w-4 text-cyan-500" />
            <span className="font-medium">{session.totalStudents || 0} groups</span>
          </div>
          <div className="flex items-center space-x-2">
            <Database className="h-4 w-4 text-blue-500" />
            <span className="font-medium">{session.totalTranscripts || 0} segments</span>
          </div>
          <div className="col-span-2 flex items-center space-x-2">
            <Clock3 className="h-4 w-4 text-violet-500" />
            <span className="text-xs">
              Last update {formatDate(session.updated_at || session.end_time)}
            </span>
          </div>
        </div>

        {session.mode === "checkbox" ? <CheckboxPreview data={session.modeSpecificData} /> : null}

        <button
          type="button"
          className="btn btn-primary mt-6 w-full justify-center text-sm"
          onClick={() => onSelect(session)}
        >
          Open history
        </button>
      </div>
    </div>
  );
}

function MetricCard({ label, value }) {
  return (
    <div className="rounded-xl border border-white/40 bg-white/50 p-4 backdrop-blur-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-base font-bold text-slate-900">{value}</p>
    </div>
  );
}

function CriterionStatus({ status }) {
  const tone =
    status === "green"
      ? "bg-emerald-100 text-emerald-700"
      : status === "yellow"
        ? "bg-amber-100 text-amber-700"
        : status === "red"
          ? "bg-rose-100 text-rose-700"
          : "bg-slate-100 text-slate-600";

  return (
    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${tone}`}>
      {status || "grey"}
    </span>
  );
}

function GroupHistoryPanel({ sessionMode, group }) {
  if (!group) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white/30 p-8 text-center text-sm text-slate-500">
        Select a group to inspect its history.
      </div>
    );
  }

  const stats = group.transcriptStats || {};

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard label="Segments" value={stats.total_segments ?? group.segments?.length ?? 0} />
        <MetricCard label="Words" value={stats.total_words ?? 0} />
        <MetricCard
          label="Audio Duration"
          value={stats.total_duration ? `${Math.round(stats.total_duration)}s` : "—"}
        />
      </div>

      <section className="glass-panel p-5">
        <div className="mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4 text-slate-500" />
          <h4 className="text-base font-semibold gradient-text">Full Transcript</h4>
        </div>
        <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white/60 p-4 text-sm leading-6 text-slate-800 whitespace-pre-wrap">
          {group.fullTranscript || "No transcript recorded yet."}
        </div>
      </section>

      {sessionMode === "summary" ? (
        <section className="glass-panel p-5">
          <div className="mb-3 flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-emerald-600" />
            <h4 className="text-base font-semibold gradient-text">Latest Summary</h4>
          </div>
          <div className="rounded-lg border border-emerald-200/60 bg-gradient-to-br from-emerald-50/70 to-teal-50/70 p-4 text-sm leading-6 text-slate-800 whitespace-pre-wrap">
            {group.latestSummary || "No summary stored for this group yet."}
          </div>
        </section>
      ) : null}

      {group.modeSpecificData?.criteria?.length ? (
        <section className="glass-panel p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h4 className="text-base font-semibold gradient-text">Checklist State</h4>
              {group.modeSpecificData?.scenario ? (
                <p className="mt-1 text-sm text-slate-600">
                  {group.modeSpecificData.scenario}
                </p>
              ) : null}
            </div>
            <ReleaseBadge released={Boolean(group.modeSpecificData.isReleased)} />
          </div>
          <div className="space-y-3">
            {group.modeSpecificData.criteria.map((criterion) => (
              <div
                key={criterion.id}
                className="rounded-lg border border-slate-200 bg-white/60 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{criterion.description}</p>
                    {criterion.rubric ? (
                      <p className="mt-1 text-sm text-slate-600 whitespace-pre-wrap">
                        {criterion.rubric}
                      </p>
                    ) : null}
                    {criterion.quote ? (
                      <p className="mt-2 rounded-md bg-slate-50 p-3 text-xs text-slate-700 whitespace-pre-wrap">
                        {criterion.quote}
                      </p>
                    ) : null}
                  </div>
                  <CriterionStatus status={criterion.status} />
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {group.summaryTimeline?.length ? (
        <section className="glass-panel p-5">
          <div className="mb-3 flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-blue-500" />
            <h4 className="text-base font-semibold gradient-text">Summary Timeline</h4>
          </div>
          <div className="space-y-4">
            {group.summaryTimeline.map((entry, index) => (
              <div
                key={`${entry.segment_cursor}-${entry.created_at || index}`}
                className="rounded-lg border border-blue-200/50 bg-gradient-to-br from-blue-50/70 to-indigo-50/70 p-4"
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">
                    Summary point {index + 1}
                  </p>
                  <p className="text-xs text-slate-500">{formatDate(entry.created_at)}</p>
                </div>
                <p className="text-xs font-medium uppercase tracking-wide text-blue-700">
                  Up to segment {entry.segment_cursor}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-800 whitespace-pre-wrap">
                  {entry.summary_text}
                </p>
                {entry.latest_segment?.text ? (
                  <div className="mt-3 rounded-md border border-white/50 bg-white/70 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Latest Segment At That Point
                    </p>
                    <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">
                      {entry.latest_segment.text}
                    </p>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : sessionMode === "summary" ? (
        <section className="glass-panel p-5 text-sm text-slate-600">
          Summary snapshots have not been stored for this session yet. Older sessions will show the
          latest summary without a timeline.
        </section>
      ) : null}

      <section className="glass-panel p-5">
        <div className="mb-3 flex items-center gap-2">
          <Database className="h-4 w-4 text-slate-500" />
          <h4 className="text-base font-semibold gradient-text">Transcript Segments</h4>
        </div>
        {group.segments?.length ? (
          <div className="max-h-96 space-y-3 overflow-y-auto">
            {group.segments.map((segment, index) => (
              <div
                key={segment.id || `${group.groupNumber}-${index}`}
                className="rounded-lg border border-slate-200 bg-white/60 p-4"
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                  <span>Segment {segment.segment_number ?? index + 1}</span>
                  <span>{formatDate(segment.created_at)}</span>
                </div>
                <p className="text-sm leading-6 text-slate-800 whitespace-pre-wrap">
                  {segment.text}
                </p>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                  <span>{segment.word_count || 0} words</span>
                  <span>
                    {segment.duration_seconds
                      ? `${Math.round(segment.duration_seconds)}s`
                      : "Duration unavailable"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-600">No transcript segments stored for this group.</p>
        )}
      </section>
    </div>
  );
}

function SessionModal({ selectedSession, onClose }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeGroupNumber, setActiveGroupNumber] = useState(null);
  const [downloading, setDownloading] = useState("");

  const sessionCode = selectedSession?.code;
  const session = detail?.session || selectedSession;
  const groups = detail?.groups || [];
  const activeGroup =
    groups.find((group) => Number(group.groupNumber) === Number(activeGroupNumber)) || groups[0] || null;

  useEffect(() => {
    if (!sessionCode) return undefined;

    const controller = new AbortController();

    async function loadDetail() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/history/sessions/${encodeURIComponent(sessionCode)}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Failed to load session history (HTTP ${response.status})`);
        }
        const payload = await response.json();
        setDetail(payload);
        const firstGroup = payload.groups?.[0];
        setActiveGroupNumber(firstGroup?.groupNumber ?? null);
      } catch (err) {
        if (err.name !== "AbortError") {
          setError(err.message || "Failed to load session history");
          setDetail(null);
        }
      } finally {
        setLoading(false);
      }
    }

    loadDetail();
    return () => controller.abort();
  }, [sessionCode]);

  const handleDownload = useCallback(
    async (type) => {
      if (!sessionCode) return;
      setDownloading(type);
      try {
        const response = await fetch(
          `/api/history/sessions/${encodeURIComponent(sessionCode)}/export/${type}`,
        );
        if (!response.ok) {
          throw new Error(`Download failed (HTTP ${response.status})`);
        }
        const blob = await response.blob();
        downloadBlob(blob, `session-${sessionCode}-${type}.json`);
      } catch (err) {
        setError(err.message || "Failed to download history");
      } finally {
        setDownloading("");
      }
    },
    [sessionCode],
  );

  if (!selectedSession) return null;

  return (
    <div
      className="qr-modal-backdrop z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="qr-modal-content flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-white/20 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm text-slate-500">{formatDate(session?.created_at)}</p>
              <h3 className="text-2xl font-semibold gradient-text">Session {session?.code}</h3>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn btn-muted"
                disabled={downloading === "combined"}
                onClick={() => handleDownload("combined")}
              >
                <Download className="mr-2 h-4 w-4" />
                {downloading === "combined" ? "Preparing…" : "Download Combined JSON"}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={downloading === "segments"}
                onClick={() => handleDownload("segments")}
              >
                <Download className="mr-2 h-4 w-4" />
                {downloading === "segments" ? "Preparing…" : "Download Segments JSON"}
              </button>
              <button
                type="button"
                className="rounded-full p-2 transition-colors hover:bg-white/40"
                onClick={onClose}
              >
                <X className="h-5 w-5 text-slate-600" />
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-y-auto p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <MetricCard label="Mode" value={getModeMeta(session?.mode).label} />
            <MetricCard label="Groups" value={session?.totalStudents || 0} />
            <MetricCard label="Segments" value={session?.totalTranscripts || 0} />
            <MetricCard label="Duration" value={formatDuration(session?.duration)} />
          </div>

          {session?.modeSpecificData ? (
            <div className="mt-4">
              <CheckboxPreview data={session.modeSpecificData} />
            </div>
          ) : null}

          {error ? (
            <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="py-16 text-center">
              <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-cyan-500 border-t-transparent" />
              <p className="text-sm text-slate-600">Loading session history…</p>
            </div>
          ) : (
            <div className="mt-6">
              <div className="mb-4 flex flex-wrap gap-2">
                {groups.map((group) => (
                  <button
                    key={group._id || group.groupNumber}
                    type="button"
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                      Number(activeGroupNumber) === Number(group.groupNumber)
                        ? "bg-slate-900 text-white"
                        : "bg-white/70 text-slate-700 hover:bg-white"
                    }`}
                    onClick={() => setActiveGroupNumber(group.groupNumber)}
                  >
                    Group {group.groupNumber}
                  </button>
                ))}
              </div>

              <GroupHistoryPanel sessionMode={session?.mode} group={activeGroup} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DataExplorerView() {
  const [modeFilter, setModeFilter] = useState("");
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [sessions, setSessions] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, hasMore: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedSession, setSelectedSession] = useState(null);

  const fetchSessions = useCallback(
    async (signal) => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          offset: String(offset),
          limit: String(limit),
        });
        if (modeFilter) {
          params.set("mode", modeFilter);
        }

        const response = await fetch(`/api/history/sessions?${params.toString()}`, { signal });
        if (!response.ok) {
          throw new Error(`Failed to load history (HTTP ${response.status})`);
        }

        const data = await response.json();
        setSessions(data.sessions ?? []);
        setPagination(data.pagination ?? { total: 0, hasMore: false });
      } catch (err) {
        if (err.name !== "AbortError") {
          setError(err.message || "Failed to load history");
          setSessions([]);
          setPagination({ total: 0, hasMore: false });
        }
      } finally {
        setLoading(false);
      }
    },
    [limit, modeFilter, offset],
  );

  const handleRetry = useCallback(() => {
    const controller = new AbortController();
    fetchSessions(controller.signal);
  }, [fetchSessions]);

  useEffect(() => {
    const controller = new AbortController();
    fetchSessions(controller.signal);
    return () => controller.abort();
  }, [fetchSessions]);

  const paginationInfo = useMemo(() => {
    if (!pagination.total || !sessions.length) return "No sessions found";
    const start = offset + 1;
    const end = Math.min(offset + sessions.length, pagination.total);
    return `Showing ${start}-${end} of ${pagination.total} sessions`;
  }, [offset, pagination.total, sessions.length]);

  const canGoPrev = offset > 0;
  const canGoNext = pagination.total > 0 && offset + sessions.length < pagination.total;

  return (
    <main className="page-shell stack">
      <div className="glass-panel mx-4 my-4 sm:mx-6 md:mx-8">
        <div className="flex flex-wrap items-end justify-between gap-4 p-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Teacher History
            </p>
            <h1 className="mt-1 text-2xl font-semibold gradient-text">Session History</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Review completed or live sessions, inspect transcripts and summary snapshots, and
              export combined or segment-level JSON for follow-up analysis.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">
                Filter by Mode
              </label>
              <select
                value={modeFilter}
                onChange={(event) => {
                  setModeFilter(event.target.value);
                  setOffset(0);
                }}
                className="premium-input px-3 py-2"
              >
                <option value="">All Modes</option>
                <option value="summary">Summary</option>
                <option value="checkbox">Checkbox</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">
                Results per page
              </label>
              <select
                value={limit}
                onChange={(event) => {
                  setLimit(Number(event.target.value));
                  setOffset(0);
                }}
                className="premium-input px-3 py-2"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>

            <button
              type="button"
              className="btn btn-primary glow"
              onClick={handleRetry}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh History
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-16 text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-cyan-500 border-t-transparent" />
          <p className="font-medium text-slate-600">Loading session history...</p>
        </div>
      ) : null}

      {error && !loading ? (
        <div className="py-16 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border-2 border-red-300/30 bg-gradient-to-br from-red-400/20 to-rose-500/20">
            <AlertCircle className="h-8 w-8 text-red-500" />
          </div>
          <p className="mb-2 text-lg font-semibold text-red-600">Failed to load history</p>
          <p className="mb-4 text-sm text-slate-600">{error}</p>
          <button type="button" className="btn btn-primary glow" onClick={handleRetry}>
            Try Again
          </button>
        </div>
      ) : null}

      {!loading && !error && sessions.length === 0 ? (
        <div className="py-16 text-center">
          <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full border-2 border-white/40 bg-gradient-to-br from-slate-400/20 to-gray-500/20">
            <Database className="h-12 w-12 text-slate-400" />
          </div>
          <h3 className="mb-2 text-lg font-semibold gradient-text">No Sessions Found</h3>
          <p className="text-slate-600">No teacher-owned sessions match your current filters.</p>
        </div>
      ) : null}

      {!loading && !error && sessions.length > 0 ? (
        <>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {sessions.map((session) => (
              <SessionCard
                key={session._id ?? session.code}
                session={session}
                onSelect={setSelectedSession}
              />
            ))}
          </div>

          <div className="mx-4 mt-8 flex flex-col items-center justify-between gap-4 sm:mx-6 sm:flex-row md:mx-8">
            <div className="premium-chip text-sm font-medium">{paginationInfo}</div>
            <div className="flex space-x-2">
              <button
                type="button"
                onClick={() => setOffset(Math.max(0, offset - limit))}
                disabled={!canGoPrev}
                className="btn btn-muted flex items-center disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Previous
              </button>
              <button
                type="button"
                onClick={() => setOffset(offset + limit)}
                disabled={!canGoNext}
                className="btn btn-primary flex items-center disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
                <ChevronRight className="ml-1 h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      ) : null}

      {selectedSession ? (
        <SessionModal selectedSession={selectedSession} onClose={() => setSelectedSession(null)} />
      ) : null}
    </main>
  );
}
