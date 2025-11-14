import { callWindowHandler } from "@/lib/legacyHandlers.js";

export default function StudentViewLayout() {
  return (
    <main className="student-shell stack">
      {/* Join Form */}
      <div
        id="joinForm"
        className="page-shell flex items-center justify-center px-4 py-12"
      >
        <div className="surface surface--padded surface--static w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 mx-auto rounded-full border border-slate-200 bg-white/80 shadow-sm mb-4">
              <i
                data-lucide="graduation-cap"
                className="w-10 h-10 text-slate-700"
              />
            </div>
            <h1 className="text-3xl font-semibold text-slate-900 mb-2">
              AI(ttention)
            </h1>
            <p className="text-slate-600">
              Join your group session to start learning
            </p>
          </div>
          <div className="stack" style={{ gap: "1.5rem" }}>
            <form
              id="joinSessionForm"
              className="stack"
              style={{ gap: "1.25rem" }}
            >
              <div>
                <label
                  className="block text-sm font-medium text-slate-700 mb-2"
                  htmlFor="sessionCode"
                >
                  Session Code
                </label>
                <input
                  type="text"
                  id="sessionCode"
                  placeholder="Enter 6-digit code"
                  maxLength={6}
                  className="input-field text-center text-lg font-mono tracking-[0.6em]"
                />
              </div>
              <div>
                <label
                  className="block text-sm font-medium text-slate-700 mb-2"
                  htmlFor="groupNumber"
                >
                  Group Number
                </label>
                <input
                  type="number"
                  id="groupNumber"
                  placeholder="Your group number"
                  min={1}
                  max={99}
                  className="input-field text-center text-lg"
                />
              </div>
              <button
                type="submit"
                className="btn btn-primary glow w-full justify-center text-base"
              >
                Join Session
              </button>
            </form>
            <div
              id="error"
              className="hidden p-4 bg-red-50 border border-red-200 rounded-lg"
            >
              <div className="flex">
                <svg
                  className="w-5 h-5 text-red-400 mt-0.5 mr-3"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
                <span id="errorText" className="text-red-800 text-sm" />
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Main Content */}
      {/* Main Content */}
      <div
        id="content"
        className="hidden page-shell page-shell--fluid student-content stack"
      >
        {/* Header */}
        <div className="surface surface--padded surface--static flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center border border-slate-200 shadow-sm">
              <i
                data-lucide="graduation-cap"
                className="w-5 h-5 text-slate-700"
              />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-3">
                AI(ttention)
                <span id="connectionStatus" className="flex items-center gap-2">
                  <span
                    id="connectionDot"
                    className="w-2 h-2 rounded-full bg-green-400 animate-ping-slow"
                  />
                  <span
                    id="connectionText"
                    className="text-xs font-medium text-slate-700"
                  >
                    Connected
                  </span>
                </span>
              </h2>
              <p className="text-sm text-slate-600">
                Session{" "}
                <span id="activeSession" className="font-mono">
                  -
                </span>{" "}
                • Group <span id="activeGroup">-</span> • Elapsed{" "}
                <span id="timeElapsed">0:00</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div
              id="status"
              className="flex items-center gap-2 bg-sky-100 text-sky-700 px-4 py-2 rounded-full"
            >
              <span className="w-2 h-2 rounded-full bg-sky-400" />
              <span id="statusText" className="text-sm font-medium">
                Waiting...
              </span>
            </div>
          </div>
        </div>
        {/* Main Content Area */}
        <div className="student-panels">
          {/* Live Transcription Panel */}
          <div className="surface surface--static flex flex-col h-full">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                    <svg
                      className="w-5 h-5 text-blue-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                      />
                    </svg>
                  </div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    Live Transcription
                  </h2>
                </div>
                <button
                  id="toggleTranscripts"
                  onClick={() => callWindowHandler("toggleTranscriptHistory")}
                  className="flex items-center text-gray-600 hover:text-gray-900 text-sm transition-colors duration-200"
                >
                  <svg
                    id="toggleIcon"
                    className="w-4 h-4 transition-transform duration-200"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                  <span className="ml-2" id="toggleText">
                    Show History
                  </span>
                </button>
              </div>
            </div>
            <div
              id="transcriptionArea"
              className="flex-1 p-6 overflow-y-auto min-h-96"
            >
              {/* Most recent transcript will be shown by default */}
              <div id="latestTranscript" className="mb-4">
                <div className="text-center py-12 text-gray-500">
                  <svg
                    className="w-16 h-16 mx-auto mb-4 text-gray-300"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                    />
                  </svg>
                  <p className="text-lg font-medium mb-2">
                    No transcription yet
                  </p>
                  <p className="text-sm">
                    Audio will be transcribed here when recording starts
                  </p>
                </div>
              </div>
              {/* Transcript history (initially hidden) */}
              <div id="transcriptHistory" className="hidden space-y-4">
                <div className="border-t pt-4">
                  <h3 className="text-sm font-medium text-gray-700 mb-3">
                    Previous Transcripts
                  </h3>
                  <div id="olderTranscripts" className="space-y-3">
                    {/* Older transcripts will be added here */}
                  </div>
                </div>
              </div>
            </div>
          </div>
          {/* Discussion Summary Panel */}
          <div
            id="summaryPanel"
            className="surface surface--static flex flex-col h-full"
          >
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-sky-100 rounded-lg flex items-center justify-center">
                    <svg
                      className="w-5 h-5 text-purple-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                  </div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    Discussion Summary
                  </h2>
                </div>
                <div
                  id="summaryTimestamp"
                  className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded hidden"
                >
                  Updated now
                </div>
              </div>
            </div>
            <div id="summaryArea" className="flex-1 p-6 min-h-96">
              <div className="text-center py-12 text-gray-500">
                <svg
                  className="w-16 h-16 mx-auto mb-4 text-gray-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
                  />
                </svg>
                <p className="text-lg font-medium mb-2">No summary available</p>
                <p className="text-sm">
                  Discussion summary will appear here as you talk
                </p>
              </div>
            </div>
          </div>
          {/* Discussion Checklist Panel */}
          <div
            id="checklistPanel"
            className="surface surface--static flex flex-col h-full hidden"
          >
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                    <i
                      data-lucide="check-square"
                      className="w-5 h-5 text-green-600"
                    />
                  </div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    Discussion Checklist
                  </h2>
                </div>
                <div
                  id="checklistTimestamp"
                  className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded hidden"
                >
                  Released by teacher
                </div>
              </div>
            </div>
            <div
              id="checklistArea"
              className="flex-1 p-6 overflow-y-auto min-h-96"
            >
              <div className="h-full flex flex-col justify-center items-center text-center text-gray-500 py-12">
                <i
                  data-lucide="clock"
                  className="w-14 h-14 mb-4 text-gray-300"
                />
                <p className="text-lg font-medium mb-2">
                  Waiting for your teacher to release the checklist
                </p>
                <p className="text-sm max-w-sm">
                  Stay tuned — once it’s shared, you’ll see each discussion
                  criterion and your progress here.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Checklist Panel */}
      <div
        id="checklistPanel"
        className="surface surface--static flex flex-col hidden"
      >
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
              <i
                data-lucide="check-square"
                className="w-5 h-5 text-green-600"
              />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Group Checklist
              </h2>
              <p className="text-sm text-gray-600">
                Criteria released by your teacher
                <span
                  id="checklistTimestamp"
                  className="text-xs text-gray-400 ml-2 hidden"
                >
                  (Updated just now)
                </span>
              </p>
            </div>
          </div>
          <button
            id="backToSummary"
            onClick={() => callWindowHandler("setStudentUIMode", "summary")}
            className="btn btn-muted text-sm"
          >
            Back to summary
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          <div id="checklistArea" className="p-6 space-y-4">
            {/* Checklist items will be inserted here */}
          </div>
        </div>
      </div>
    </main>
  );
}
