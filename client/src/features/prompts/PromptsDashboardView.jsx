import { callWindowHandler } from "@/lib/legacyHandlers.js";

export default function PromptsDashboardView() {
  return (
    <div>
      {/* Main Content */}
      <main className="page-shell stack">
        {/* Premium Action Bar */}
        <div className="glass-panel mb-8 p-6 mx-4 sm:mx-6 md:mx-8 my-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            {/* Search and Filters */}
            <div className="flex flex-col sm:flex-row gap-4 flex-1">
              <div className="relative flex-1">
                <i
                  data-lucide="search"
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400"
                />
                <input
                  type="text"
                  id="searchInput"
                  placeholder="Search prompts by title, description, or content..."
                  className="premium-input pl-10 pr-4 py-2 w-full"
                />
              </div>
              <select
                id="categoryFilter"
                className="premium-input px-3 py-2"
                defaultValue=""
              >
                <option value="">All Categories</option>
              </select>
              <select
                id="modeFilter"
                className="premium-input px-3 py-2"
                defaultValue=""
              >
                <option value="">All Modes</option>
                <option value="summary">Summary</option>
                <option value="checkbox">Checkbox</option>
              </select>
            </div>
            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => callWindowHandler("refreshPrompts")}
                className="flex items-center px-4 py-2 text-slate-600 hover:text-slate-800 hover:bg-white/40 rounded-lg transition-colors font-medium"
              >
                <i data-lucide="refresh-cw" className="w-4 h-4 mr-2" />
                Refresh
              </button>
              <button
                onClick={() => callWindowHandler("openCreateModal")}
                className="btn btn-primary glow"
              >
                <i data-lucide="plus" className="w-4 h-4 mr-2" />
                Create Prompt
              </button>
            </div>
          </div>
        </div>
        {/* Premium Loading State */}
        <div id="loadingState" className="text-center py-16">
          <div className="animate-spin w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-slate-600 font-medium">Loading prompts...</p>
        </div>
        {/* Prompts Grid */}
        <div
          id="promptsGrid"
          className="hidden grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8 mx-4 sm:mx-6 md:mx-8"
        >
          {/* Prompts will be inserted here */}
        </div>
        {/* Premium Empty State */}
        <div id="emptyState" className="hidden text-center py-16">
          <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-indigo-400/20 to-purple-500/20 backdrop-blur-sm border-2 border-white/40 flex items-center justify-center mb-6 shadow-lg">
            <i data-lucide="file-text" className="w-12 h-12 text-indigo-600" />
          </div>
          <h3 className="text-xl font-semibold gradient-text mb-2">
            No Prompts Found
          </h3>
          <p className="text-slate-600 max-w-md mx-auto mb-6">
            No prompts match your current search criteria. Try adjusting your
            filters or create a new prompt.
          </p>
          <button
            onClick={() => callWindowHandler("openCreateModal")}
            className="btn btn-primary glow px-6 py-3"
          >
            Create Your First Prompt
          </button>
        </div>
        {/* Premium Pagination */}
        <div
          id="pagination"
          className="hidden flex flex-col sm:flex-row items-center justify-between gap-4 mx-4 sm:mx-6 md:mx-8"
        >
          <div className="premium-chip text-sm font-medium">
            <span id="paginationInfo">Showing 1-20 of 50 prompts</span>
          </div>
          <div className="flex space-x-2">
            <button
              id="prevBtn"
              onClick={() => callWindowHandler("previousPage")}
              disabled
              className="btn btn-muted disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              id="nextBtn"
              onClick={() => callWindowHandler("nextPage")}
              className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      </main>
      {/* Premium Create/Edit Prompt Modal */}
      <div
        id="promptModal"
        className="qr-modal-backdrop flex items-center justify-center p-4 hidden z-50"
      >
        <div className="qr-modal-content max-w-4xl w-full max-h-[90vh] overflow-hidden">
          <div className="flex items-center justify-between p-6 border-b border-white/20">
            <div>
              <h3
                id="modalTitle"
                className="text-lg font-semibold gradient-text"
              >
                Create New Prompt
              </h3>
              <p className="text-sm text-slate-600">
                Share your teaching prompts with the community
              </p>
            </div>
            <button
              onClick={() => callWindowHandler("closePromptModal")}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <i data-lucide="x" className="w-6 h-6" />
            </button>
          </div>
          <form
            id="promptForm"
            className="p-6 overflow-y-auto max-h-[75vh] custom-scrollbar"
          >
            <input type="hidden" id="promptId" defaultValue="" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <label
                  htmlFor="promptTitle"
                  className="block text-sm font-semibold text-slate-700 mb-2"
                >
                  Title *
                </label>
                <input
                  type="text"
                  id="promptTitle"
                  required
                  className="premium-input w-full px-3 py-2"
                  placeholder="Enter prompt title..."
                />
              </div>
              <div>
                <label
                  htmlFor="promptAuthor"
                  className="block text-sm font-semibold text-slate-700 mb-2"
                >
                  Author Name
                </label>
                <input
                  type="text"
                  id="promptAuthor"
                  className="premium-input w-full px-3 py-2"
                  placeholder="Your name (optional)"
                />
              </div>
            </div>
            <div id="descriptionRow" className="mb-6">
              <label
                htmlFor="promptDescription"
                className="block text-sm font-semibold text-slate-700 mb-2"
              >
                Description
              </label>
              <textarea
                id="promptDescription"
                rows={3}
                className="premium-input w-full px-3 py-2 resize-vertical"
                placeholder="Describe what this prompt does and when to use it..."
                defaultValue={""}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div>
                <label
                  htmlFor="promptCategory"
                  className="block text-sm font-semibold text-slate-700 mb-2"
                >
                  Category
                </label>
                <select
                  id="promptCategory"
                  className="premium-input w-full px-3 py-2"
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
                  htmlFor="promptMode"
                  className="block text-sm font-semibold text-slate-700 mb-2"
                >
                  Mode
                </label>
                <select
                  id="promptMode"
                  className="premium-input w-full px-3 py-2"
                >
                  <option value="summary">Summary</option>
                  <option value="checkbox">Checkbox</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="promptVisibility"
                  className="block text-sm font-semibold text-slate-700 mb-2"
                >
                  Visibility
                </label>
                <select
                  id="promptVisibility"
                  className="premium-input w-full px-3 py-2"
                >
                  <option value="true">Public (Shared)</option>
                  <option value="false">Private (Personal)</option>
                </select>
              </div>
            </div>
            <div id="tagsRow" className="mb-6">
              <label
                htmlFor="promptTags"
                className="block text-sm font-semibold text-slate-700 mb-2"
              >
                Tags
              </label>
              <input
                type="text"
                id="promptTags"
                className="premium-input w-full px-3 py-2"
                placeholder="Enter tags separated by commas (e.g., chemistry, discussion, assessment)"
              />
              <p className="text-xs text-slate-500 mt-1">
                Separate multiple tags with commas
              </p>
            </div>
            <div className="mb-6">
              <label
                htmlFor="promptContent"
                className="block text-sm font-semibold text-slate-700 mb-2"
              >
                Prompt Content *
              </label>
              <textarea
                id="promptContent"
                rows={8}
                required
                className="premium-input w-full px-3 py-2 resize-vertical font-mono text-sm"
                placeholder="Enter your AI prompt or template. For Checkbox mode: first write the Scenario/Question line, then list each criterion on a new line (optional rubric in parentheses)."
                defaultValue={""}
              />
              <p id="checkboxExample" className="text-xs text-slate-500 mt-1">
                Example for Checkbox mode:\nScenario: Interview someone about
                their interests\nName (Student's given name)\nHobby (Activity
                they enjoy)\nFavourite colour (Colour preference)
              </p>
            </div>
            <div className="flex items-center justify-between pt-4 border-t border-white/20">
              <div className="text-sm text-slate-500">* Required fields</div>
              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={() => callWindowHandler("closePromptModal")}
                  className="btn btn-muted"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  <span id="saveButtonText">Save Prompt</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
      {/* Premium View Prompt Modal */}
      <div
        id="viewModal"
        className="qr-modal-backdrop flex items-center justify-center p-4 hidden z-50"
      >
        <div className="qr-modal-content max-w-4xl w-full max-h-[90vh] overflow-hidden">
          <div className="flex items-center justify-between p-6 border-b border-white/20">
            <div>
              <h3
                id="viewTitle"
                className="text-lg font-semibold gradient-text"
              >
                Prompt Details
              </h3>
              <p id="viewAuthor" className="text-sm text-slate-600">
                By Anonymous Teacher
              </p>
            </div>
            <button
              onClick={() => callWindowHandler("closeViewModal")}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <i data-lucide="x" className="w-6 h-6" />
            </button>
          </div>
          <div className="p-6 overflow-y-auto max-h-[75vh] custom-scrollbar">
            <div id="viewContent">
              {/* Prompt details will be inserted here */}
            </div>
            <div className="flex items-center justify-between pt-6 border-t border-white/20">
              <div className="flex space-x-3">
                <button
                  id="editPromptBtn"
                  onClick={() => callWindowHandler("editPrompt")}
                  className="flex items-center px-4 py-2 text-blue-600 hover:bg-blue-50/60 backdrop-blur-sm rounded-lg transition-colors font-medium"
                >
                  <i data-lucide="edit" className="w-4 h-4 mr-2" />
                  Edit
                </button>
                <button
                  id="clonePromptBtn"
                  onClick={() => callWindowHandler("clonePrompt")}
                  className="flex items-center px-4 py-2 text-emerald-600 hover:bg-emerald-50/60 backdrop-blur-sm rounded-lg transition-colors font-medium"
                >
                  <i data-lucide="copy" className="w-4 h-4 mr-2" />
                  Clone
                </button>
                <button
                  id="deletePromptBtn"
                  onClick={() => callWindowHandler("deletePrompt")}
                  className="flex items-center px-4 py-2 text-red-600 hover:bg-red-50/60 backdrop-blur-sm rounded-lg transition-colors font-medium"
                >
                  <i data-lucide="trash-2" className="w-4 h-4 mr-2" />
                  Delete
                </button>
              </div>
              <button
                onClick={() => callWindowHandler("usePrompt")}
                className="btn btn-accent glow px-6 py-2"
              >
                Use This Prompt
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
