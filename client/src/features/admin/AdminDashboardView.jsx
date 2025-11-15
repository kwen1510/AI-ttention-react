import { callWindowHandler } from "@/lib/legacyHandlers.js";

export default function AdminDashboardView() {
  return (
    <div>
      {/* Error Toast Container */}
      <div id="errorToast" className="error-toast hidden">
        <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded-r-lg shadow-lg">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-red-400"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Upload Error</h3>
              <p id="errorMessage" className="mt-1 text-sm text-red-600" />
            </div>
            <div className="ml-auto pl-3">
              <button
                onClick={() => callWindowHandler("hideErrorToast")}
                className="text-red-400 hover:text-red-600"
              >
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
      {/* Row 2: Premium Control Bar */}
      <div className="control-bar mx-4 sm:mx-6 md:mx-8 my-4">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 md:gap-4 w-full">
            {/* Left group: Session, Connected, Interval */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 md:gap-3 flex-wrap">
              {/* Premium Session Code Display */}
              <button
                onClick={() => callWindowHandler("openQrModal")}
                className="session-code-display flex items-center justify-center gap-3 min-h-touch"
              >
                <span className="text-xs sm:text-sm text-slate-600 font-medium">
                  Session
                </span>
                <span
                  id="sessionCode"
                  className="session-code-text"
                >
                  -
                </span>
              </button>
              {/* Premium Connection Status Pill */}
              <div
                id="connectionStatus"
                className="status-pill status-pill--connected min-h-touch"
              >
                <div
                  id="connectionDot"
                  className="status-dot"
                />
                <span
                  id="connectionText"
                  className="text-xs md:text-sm"
                >
                  Connected
                </span>
              </div>
              {/* Premium Interval Control */}
              <div className="interval-control min-h-touch">
                <label
                  htmlFor="intervalInput"
                  className="text-xs sm:text-sm font-semibold text-slate-700 whitespace-nowrap"
                >
                  Interval
                </label>
                <input
                  type="number"
                  id="intervalInput"
                  min={10}
                  max={120}
                  defaultValue={30}
                />
                <span className="text-xs sm:text-sm text-slate-600 font-medium">sec</span>
              </div>
            </div>
            {/* Right group: Elapsed, Start, Stop */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 md:gap-3">
              <div className="premium-chip text-center sm:text-left py-2 sm:py-0">
                <span className="text-xs sm:text-sm text-slate-600">Elapsed</span>
                <span id="timeElapsed" className="text-sm sm:text-base font-mono font-bold text-slate-900 ml-2">
                  0:00
                </span>
              </div>
              <button
                id="startBtn"
                className="btn btn-start flex items-center justify-center text-sm sm:text-base min-h-touch"
              >
                <i
                  data-lucide="play"
                  className="w-4 h-4 md:w-5 md:h-5 mr-2"
                />
                <span className="hidden md:inline">Start Recording</span>
                <span className="md:hidden">Start</span>
              </button>
              <button
                id="stopBtn"
                disabled
                className="btn btn-stop flex items-center justify-center text-sm sm:text-base min-h-touch opacity-50 cursor-not-allowed"
              >
                <i
                  data-lucide="square"
                  className="w-4 h-4 md:w-5 md:h-5 mr-2"
                />
                <span className="hidden md:inline">Stop Recording</span>
                <span className="md:hidden">Stop</span>
              </button>
            </div>
          </div>
      </div>
      {/* Premium QR Modal */}
      <div
        id="qrModal"
        className="qr-modal-backdrop hidden"
        onClick={(event) => callWindowHandler("closeQrModal", event)}
      >
        <div
          className="qr-modal-content max-w-md w-full max-h-[90vh] overflow-y-auto"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl md:text-2xl font-bold gradient-text">
              Join This Session
            </h3>
            <button
              onClick={() => callWindowHandler("closeQrModal")}
              className="text-slate-400 hover:text-slate-600 transition-colors min-w-touch min-h-touch flex items-center justify-center"
            >
              <i data-lucide="x" className="w-6 h-6" />
            </button>
          </div>
          <p className="text-sm text-slate-600 mb-6">
            Scan the QR code below or visit the link to join:
          </p>
          <div className="qr-code-container mb-6">
            <div
              id="qrCodeContainer"
              className="flex items-center justify-center"
            />
          </div>
          <button
            onClick={() => callWindowHandler("copyQrLink")}
            className="glass-panel p-4 font-mono text-sm break-all text-slate-700 w-full text-left hover:bg-white/60 transition-all cursor-pointer group relative"
            id="qrLink"
          >
            <span id="qrLinkText">-</span>
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-br from-cyan-500/10 to-blue-500/10 backdrop-blur-sm rounded-lg pointer-events-none">
              <span className="text-xs font-semibold text-slate-700 bg-white/80 px-3 py-1 rounded-full shadow-sm">
                Click to copy
              </span>
            </div>
          </button>
          <p id="copyFeedback" className="text-xs text-center text-emerald-600 font-semibold mt-2 hidden">
            ✓ Copied to clipboard!
          </p>
        </div>
      </div>
      {/* Main Content */}
      <main className="page-shell page-shell--fluid stack">
        {/* Prompt Management Section (Collapsible) */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 mb-8">
          <button
            id="promptToggle"
            onClick={() => callWindowHandler("togglePromptEditor")}
            className="w-full px-6 py-4 text-left hover:bg-gray-50 transition-colors duration-200"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-sky-100 rounded-lg flex items-center justify-center">
                  <i data-lucide="file-text" className="w-5 h-5 text-sky-700" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    AI Summarization Prompts
                  </h3>
                  <p className="text-sm text-gray-600">
                    Manage and customize AI prompts for classroom discussions
                  </p>
                </div>
              </div>
              <svg
                id="promptChevron"
                className="w-5 h-5 text-gray-400 transition-transform duration-200"
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
            </div>
          </button>
          <div id="promptEditor" className="hidden border-t border-gray-200">
            <div className="p-6">
              {/* Prompt Library Section */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-semibold text-gray-700">
                    Prompt Library
                  </h4>
                  <div className="flex gap-2">
                    <button
                      onClick={() => callWindowHandler("refreshPromptLibrary")}
                      className="text-xs text-gray-500 hover:text-gray-700 flex items-center"
                    >
                      <i data-lucide="refresh-cw" className="w-3 h-3 mr-1" />
                      Refresh
                    </button>
                    <button
                      onClick={() => callWindowHandler("openCreatePromptModal")}
                      className="btn btn-primary text-xs py-1 px-3"
                    >
                      <i data-lucide="plus" className="w-3 h-3 mr-1" />
                      New
                    </button>
                  </div>
                </div>
                {/* Search and Filter */}
                <div className="flex gap-2 mb-3">
                  <div className="flex-1 relative">
                    <i
                      data-lucide="search"
                      className="absolute left-3 top-1/2 transform -translate-y-1/2 w-3 h-3 text-gray-400"
                    />
                    <input
                      id="promptSearch"
                      type="text"
                      placeholder="Search prompts..."
                      className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      onKeyUp={() => callWindowHandler("filterPrompts")}
                    />
                  </div>
                  <select
                    id="promptCategoryFilter"
                    className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    onChange={() => callWindowHandler("filterPrompts")}
                  >
                    <option value="">All Categories</option>
                  </select>
                </div>
                {/* Prompt Cards Grid */}
                <div
                  id="promptLibraryGrid"
                  className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 max-h-64 overflow-y-auto"
                >
                  <div className="flex items-center justify-center py-8 text-gray-500 text-sm col-span-full">
                    <i
                      data-lucide="loader"
                      className="w-4 h-4 mr-2 animate-spin"
                    />
                    Loading prompts...
                  </div>
                </div>
              </div>
              {/* Current Prompt Editor */}
              <div className="border-t border-gray-200 pt-6">
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label
                        htmlFor="promptText"
                        className="block text-sm font-medium text-gray-700"
                      >
                        Current Summarization Prompt
                      </label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => callWindowHandler("saveCurrentPrompt")}
                          className="btn btn-accent text-xs py-1 px-3"
                        >
                          Save as New
                        </button>
                        <button
                          onClick={() =>
                            callWindowHandler("resetToDefaultPrompt")
                          }
                          className="text-xs text-gray-500 hover:text-gray-700"
                        >
                          Reset Default
                        </button>
                      </div>
                    </div>
                    <textarea
                      id="promptText"
                      rows={4}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-vertical text-sm font-mono"
                      placeholder="Enter your custom prompt for AI summarization..."
                      defaultValue={
                        "Summarise the following classroom discussion in ≤6 clear bullet points:"
                      }
                    />
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-xs text-gray-500">
                        💡 Tip: Use clear, specific instructions for best
                        results
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => callWindowHandler("testPrompt")}
                          className="text-xs bg-gray-200 text-black px-3 py-1 rounded hover:bg-gray-300 border border-slate-300"
                        >
                          🧪 Test
                        </button>
                        <button
                          onClick={() => callWindowHandler("savePrompt")}
                          className="text-xs bg-violet-200 text-black px-3 py-1 rounded hover:bg-violet-300 border border-violet-300"
                        >
                          💾 Apply
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                <div id="promptFeedback" className="hidden mt-4 p-4 rounded-lg">
                  {/* Feedback messages will appear here */}
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* Create/Edit Prompt Modal */}
        <div
          id="createPromptModal"
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 hidden z-50"
        >
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div>
                <h3
                  id="createPromptModalTitle"
                  className="text-lg font-semibold text-gray-900"
                >
                  Create New Prompt
                </h3>
                <p className="text-sm text-gray-600">
                  Add a new summarization prompt to your library
                </p>
              </div>
              <button
                onClick={() => callWindowHandler("closeCreatePromptModal")}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <i data-lucide="x" className="w-6 h-6" />
              </button>
            </div>
            <form
              id="createPromptForm"
              className="p-6 overflow-y-auto max-h-[75vh]"
            >
              <input type="hidden" id="editPromptId" defaultValue />
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label
                    htmlFor="newPromptTitle"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Title *
                  </label>
                  <input
                    type="text"
                    id="newPromptTitle"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    placeholder="Enter prompt title..."
                  />
                </div>
                <div>
                  <label
                    htmlFor="newPromptAuthor"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Author
                  </label>
                  <input
                    type="text"
                    id="newPromptAuthor"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    placeholder="Your name (optional)"
                  />
                </div>
              </div>
              <div className="mb-4">
                <label
                  htmlFor="newPromptDescription"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Description
                </label>
                <textarea
                  id="newPromptDescription"
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-vertical text-sm"
                  placeholder="Describe what this prompt does..."
                  defaultValue={""}
                />
              </div>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                  <label
                    htmlFor="newPromptCategory"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Category
                  </label>
                  <select
                    id="newPromptCategory"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  >
                    <option value="General">General</option>
                    <option value="Science">Science</option>
                    <option value="Mathematics">Mathematics</option>
                    <option value="Language Arts">Language Arts</option>
                    <option value="Social Studies">Social Studies</option>
                    <option value="Assessment">Assessment</option>
                    <option value="Discussion">Discussion</option>
                    <option value="Analysis">Analysis</option>
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="newPromptVisibility"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Visibility
                  </label>
                  <select
                    id="newPromptVisibility"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  >
                    <option value="true">Public</option>
                    <option value="false">Private</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <input
                    type="hidden"
                    id="newPromptMode"
                    defaultValue="summary"
                  />
                  <div className="w-full px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 font-medium text-center">
                    Summary Mode
                  </div>
                </div>
              </div>
              <div className="mb-4">
                <label
                  htmlFor="newPromptTags"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Tags
                </label>
                <input
                  type="text"
                  id="newPromptTags"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  placeholder="Enter tags separated by commas"
                />
              </div>
              <div className="mb-6">
                <label
                  htmlFor="newPromptContent"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Prompt Content *
                </label>
                <textarea
                  id="newPromptContent"
                  rows={6}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-vertical font-mono text-sm"
                  placeholder="Enter your AI prompt here..."
                  defaultValue={""}
                />
              </div>
              <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                <div className="text-sm text-gray-500">* Required fields</div>
                <div className="flex space-x-3">
                  <button
                    type="button"
                    onClick={() => callWindowHandler("closeCreatePromptModal")}
                    className="btn btn-muted text-sm"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary text-sm">
                    <span id="createPromptSubmitText">Create Prompt</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
        {/* Empty State */}
        <div id="emptyState" className="text-center py-16">
          <div className="w-24 h-24 mx-auto rounded-full flex items-center justify-center mb-6 shadow-sm border border-slate-200 bg-white/90">
            <i
              data-lucide="graduation-cap"
              className="w-10 h-10 text-slate-600"
            />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Waiting for Students
          </h3>
          <p className="text-gray-600 max-w-md mx-auto">
            Students will appear here when they join your session. Share the
            session code with your students to get started.
          </p>
        </div>
        {/* Groups Grid */}
        <div
          id="groupsGrid"
          className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 hidden"
        >
          {/* Group cards will be inserted here */}
        </div>
      </main>
    </div>
  );
}
