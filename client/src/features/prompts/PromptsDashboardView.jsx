import { callWindowHandler } from "@/lib/legacyHandlers.js";

export default function PromptsDashboardView() {
  return (
    <div>
      {/* Main Content */}
      <main className="page-shell stack">
        {/* Action Bar */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 mb-8 p-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            {/* Search and Filters */}
            <div className="flex flex-col sm:flex-row gap-4 flex-1">
              <div className="relative flex-1">
                <i
                  data-lucide="search"
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400"
                />
                <input
                  type="text"
                  id="searchInput"
                  placeholder="Search prompts by title, description, or content..."
                  className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <select
                id="categoryFilter"
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                defaultValue=""
              >
                <option value="">All Categories</option>
              </select>
              <select
                id="modeFilter"
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                className="flex items-center px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
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
        {/* Loading State */}
        <div id="loadingState" className="text-center py-16">
          <div className="animate-spin w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600">Loading prompts...</p>
        </div>
        {/* Prompts Grid */}
        <div
          id="promptsGrid"
          className="hidden grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8"
        >
          {/* Prompts will be inserted here */}
        </div>
        {/* Empty State */}
        <div id="emptyState" className="hidden text-center py-16">
          <div className="w-24 h-24 mx-auto bg-gradient-to-br from-blue-100 to-indigo-200 rounded-full flex items-center justify-center mb-6">
            <i data-lucide="file-text" className="w-12 h-12 text-indigo-600" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            No Prompts Found
          </h3>
          <p className="text-gray-600 max-w-md mx-auto mb-6">
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
        {/* Pagination */}
        <div
          id="pagination"
          className="hidden flex items-center justify-between"
        >
          <div className="text-sm text-gray-600">
            <span id="paginationInfo">Showing 1-20 of 50 prompts</span>
          </div>
          <div className="flex space-x-2">
            <button
              id="prevBtn"
              onClick={() => callWindowHandler("previousPage")}
              disabled
              className="btn btn-muted disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              id="nextBtn"
              onClick={() => callWindowHandler("nextPage")}
              className="btn btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      </main>
      {/* Create/Edit Prompt Modal */}
      <div
        id="promptModal"
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 hidden z-50"
      >
        <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div>
              <h3
                id="modalTitle"
                className="text-lg font-semibold text-gray-900"
              >
                Create New Prompt
              </h3>
              <p className="text-sm text-gray-600">
                Share your teaching prompts with the community
              </p>
            </div>
            <button
              onClick={() => callWindowHandler("closePromptModal")}
              className="text-gray-400 hover:text-gray-600 transition-colors"
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
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Title *
                </label>
                <input
                  type="text"
                  id="promptTitle"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter prompt title..."
                />
              </div>
              <div>
                <label
                  htmlFor="promptAuthor"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Author Name
                </label>
                <input
                  type="text"
                  id="promptAuthor"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Your name (optional)"
                />
              </div>
            </div>
            <div id="descriptionRow" className="mb-6">
              <label
                htmlFor="promptDescription"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Description
              </label>
              <textarea
                id="promptDescription"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-vertical"
                placeholder="Describe what this prompt does and when to use it..."
                defaultValue={""}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div>
                <label
                  htmlFor="promptCategory"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Category
                </label>
                <select
                  id="promptCategory"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Mode
                </label>
                <select
                  id="promptMode"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="summary">Summary</option>
                  <option value="checkbox">Checkbox</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="promptVisibility"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Visibility
                </label>
                <select
                  id="promptVisibility"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="true">Public (Shared)</option>
                  <option value="false">Private (Personal)</option>
                </select>
              </div>
            </div>
            <div id="tagsRow" className="mb-6">
              <label
                htmlFor="promptTags"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Tags
              </label>
              <input
                type="text"
                id="promptTags"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter tags separated by commas (e.g., chemistry, discussion, assessment)"
              />
              <p className="text-xs text-gray-500 mt-1">
                Separate multiple tags with commas
              </p>
            </div>
            <div className="mb-6">
              <label
                htmlFor="promptContent"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Prompt Content *
              </label>
              <textarea
                id="promptContent"
                rows={8}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-vertical font-mono text-sm"
                placeholder="Enter your AI prompt or template. For Checkbox mode: first write the Scenario/Question line, then list each criterion on a new line (optional rubric in parentheses)."
                defaultValue={""}
              />
              <p id="checkboxExample" className="text-xs text-gray-500 mt-1">
                Example for Checkbox mode:\nScenario: Interview someone about
                their interests\nName (Student’s given name)\nHobby (Activity
                they enjoy)\nFavourite colour (Colour preference)
              </p>
            </div>
            <div className="flex items-center justify-between pt-4 border-t border-gray-200">
              <div className="text-sm text-gray-500">* Required fields</div>
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
      {/* View Prompt Modal */}
      <div
        id="viewModal"
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 hidden z-50"
      >
        <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div>
              <h3
                id="viewTitle"
                className="text-lg font-semibold text-gray-900"
              >
                Prompt Details
              </h3>
              <p id="viewAuthor" className="text-sm text-gray-600">
                By Anonymous Teacher
              </p>
            </div>
            <button
              onClick={() => callWindowHandler("closeViewModal")}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <i data-lucide="x" className="w-6 h-6" />
            </button>
          </div>
          <div className="p-6 overflow-y-auto max-h-[75vh] custom-scrollbar">
            <div id="viewContent">
              {/* Prompt details will be inserted here */}
            </div>
            <div className="flex items-center justify-between pt-6 border-t border-gray-200">
              <div className="flex space-x-3">
                <button
                  id="editPromptBtn"
                  onClick={() => callWindowHandler("editPrompt")}
                  className="flex items-center px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  <i data-lucide="edit" className="w-4 h-4 mr-2" />
                  Edit
                </button>
                <button
                  id="clonePromptBtn"
                  onClick={() => callWindowHandler("clonePrompt")}
                  className="flex items-center px-4 py-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                >
                  <i data-lucide="copy" className="w-4 h-4 mr-2" />
                  Clone
                </button>
                <button
                  id="deletePromptBtn"
                  onClick={() => callWindowHandler("deletePrompt")}
                  className="flex items-center px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
