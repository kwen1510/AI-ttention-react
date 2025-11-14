import { callWindowHandler } from "@/lib/legacyHandlers.js";

export default function CheckboxDashboardView() {
  return (
    <div>
      {/* Recording Controls */}
      <div className="bg-white shadow-sm border-b border-gray-200 px-4 sm:px-6 md:px-8 py-3">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 md:gap-4">
            {/* Left group: Session, Connected, Interval */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 md:gap-3 flex-wrap">
              {/* Session chip (click to open QR) */}
              <button
                onClick={() => callWindowHandler("openQrModal")}
                className="flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-full cursor-pointer shadow-sm border border-gray-200 min-h-touch"
              >
                <span className="text-xs sm:text-sm text-gray-700">
                  Session:
                </span>
                <span
                  id="sessionCode"
                  className="font-mono text-base sm:text-lg md:text-xl font-extrabold tracking-wider"
                >
                  Loading...
                </span>
              </button>
              {/* Connected pill */}
              <div
                id="connectionStatus"
                className="flex items-center justify-center space-x-2 bg-gray-100 px-3 py-2 rounded-full min-h-touch"
              >
                <div
                  id="connectionDot"
                  className="w-2 h-2 bg-green-400 rounded-full animate-ping-slow"
                />
                <span
                  id="connectionText"
                  className="text-xs md:text-sm font-medium text-gray-700"
                >
                  Connected
                </span>
              </div>
              {/* Interval control */}
              <div className="flex items-center justify-center gap-2 bg-gray-100 px-3 sm:px-4 py-2 rounded-lg min-h-touch">
                <label
                  htmlFor="intervalInput"
                  className="text-xs sm:text-sm font-medium text-gray-700 whitespace-nowrap"
                >
                  Interval:
                </label>
                <input
                  type="number"
                  id="intervalInput"
                  min={10}
                  max={120}
                  defaultValue={30}
                  className="w-16 sm:w-20 md:w-24 px-2 py-1 text-sm border border-slate-300 rounded bg-white text-black placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
                <span className="text-xs sm:text-sm text-black/80">sec</span>
              </div>
            </div>
            {/* Right group: Elapsed, Start, Stop */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 md:gap-3">
              <p className="text-gray-600 text-xs sm:text-sm text-center sm:text-left py-2 sm:py-0">
                Elapsed:{" "}
                <span id="timeElapsed" className="font-mono font-semibold">
                  0:00
                </span>
              </p>
              <button
                id="startBtn"
                className="bg-green-500 hover:bg-green-600 text-white px-4 sm:px-5 md:px-6 py-2 sm:py-2.5 md:py-3 rounded-lg font-semibold transition-all duration-200 transform hover:scale-105 shadow flex items-center justify-center text-xs sm:text-sm md:text-base min-h-touch border border-green-600"
              >
                <i
                  data-lucide="play"
                  className="w-4 h-4 md:w-5 md:h-5 mr-1 sm:mr-2"
                />
                <span className="hidden md:inline">Start Recording</span>
                <span className="md:hidden">Start</span>
              </button>
              <button
                id="stopBtn"
                disabled
                className="bg-gray-300 hover:bg-gray-400 text-black px-4 sm:px-5 md:px-6 py-2 sm:py-2.5 md:py-3 rounded-lg font-semibold transition-all duration-200 shadow flex items-center justify-center text-xs sm:text-sm md:text-base min-h-touch border border-slate-300 cursor-not-allowed"
              >
                <i
                  data-lucide="square"
                  className="w-4 h-4 md:w-5 md:h-5 mr-1 sm:mr-2"
                />
                <span className="hidden md:inline">Stop Recording</span>
                <span className="md:hidden">Stop</span>
              </button>
            </div>
          </div>
      </div>
      {/* QR Modal */}
      <div
        id="qrModal"
        className="fixed inset-0 bg-black/50 hidden items-center justify-center z-50 p-4"
        onClick={(event) => callWindowHandler("closeQrModal", event)}
      >
        <div
          className="bg-white rounded-xl shadow-2xl max-w-md w-full p-4 sm:p-6 md:p-8 max-h-[90vh] overflow-y-auto"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base sm:text-lg md:text-xl font-semibold text-gray-900">
              Join This Session
            </h3>
            <button
              onClick={() => callWindowHandler("closeQrModal")}
              className="text-gray-400 hover:text-gray-600 min-w-touch min-h-touch flex items-center justify-center"
            >
              <i data-lucide="x" className="w-5 h-5" />
            </button>
          </div>
          <p className="text-xs sm:text-sm text-gray-600 mb-3">
            Scan the QR code or visit the link below:
          </p>
          <div
            id="qrCodeContainer"
            className="flex items-center justify-center p-4 border border-gray-200 rounded-lg mb-4"
          />
          <div
            className="bg-gray-50 border border-gray-200 rounded-lg p-3 font-mono text-xs sm:text-sm break-all"
            id="qrLink"
          >
            -
          </div>
        </div>
      </div>
      {/* Main Content */}
      <main className="page-shell page-shell--fluid stack">
        {/* Criteria Setup Section (Collapsible) */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 mb-8">
          <button
            id="criteriaToggle"
            onClick={() => callWindowHandler("toggleCriteriaEditor")}
            className="w-full px-6 py-4 text-left hover:bg-gray-50 transition-colors duration-200"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-green-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    Discussion Criteria Setup
                  </h3>
                  <p className="text-sm text-gray-600">
                    Set up your discussion question and criteria checklist
                  </p>
                </div>
              </div>
              <svg
                id="criteriaChevron"
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
          <div id="criteriaEditor" className="hidden border-t border-gray-200">
            <div className="p-6">
              <div className="space-y-6">
                {/* Scenario/Question Section */}
                <div>
                  <label
                    htmlFor="scenarioInput"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Discussion Question/Scenario
                  </label>
                  <textarea
                    id="scenarioInput"
                    rows={4}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-vertical"
                    placeholder="Enter the discussion question or scenario context..."
                    defaultValue={""}
                  />
                </div>
                {/* Criteria Input */}
                <div>
                  <label
                    htmlFor="criteriaInput"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Criteria Checklist (one per line)
                  </label>
                  {/* Format Instructions */}
                  <div className="mb-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <h5 className="text-sm font-semibold text-blue-800 mb-3 flex items-center">
                      <i data-lucide="info" className="w-4 h-4 mr-2" />
                      📝 Criteria Format Guide
                    </h5>
                    <div className="grid md:grid-cols-2 gap-4">
                      {/* Format Explanation */}
                      <div>
                        <p className="text-sm text-blue-700 mb-2">
                          Use this format for each criterion:
                        </p>
                        <div className="bg-white p-3 rounded border border-blue-200 font-mono text-sm">
                          <span className="text-green-600 font-semibold">
                            Description
                          </span>
                          <span className="text-gray-600">(</span>
                          <span className="text-orange-600 font-semibold">
                            Rubric
                          </span>
                          <span className="text-gray-600">)</span>
                        </div>
                        <div className="mt-2 text-xs text-blue-600 space-y-1">
                          <p>
                            <span className="text-green-600 font-semibold">
                              Description:
                            </span>{" "}
                            What students should demonstrate
                          </p>
                          <p>
                            <span className="text-orange-600 font-semibold">
                              Rubric:
                            </span>{" "}
                            Specific criteria for correct answer
                          </p>
                        </div>
                      </div>
                      {/* Examples */}
                      <div>
                        <p className="text-sm font-medium text-blue-800 mb-2">
                          ✅ Good Examples:
                        </p>
                        <div className="space-y-2 text-xs">
                          <div className="bg-white p-2 rounded border border-green-200">
                            <span className="text-green-600">
                              Students explain that back titration is used
                            </span>
                            <span className="text-gray-500">(</span>
                            <span className="text-orange-600">
                              CaCO3 is not soluble in water and cannot be
                              titrated directly
                            </span>
                            <span className="text-gray-500">)</span>
                          </div>
                          <div className="bg-white p-2 rounded border border-green-200">
                            <span className="text-green-600">
                              Students identify the need to weigh by difference
                            </span>
                            <span className="text-gray-500">(</span>
                            <span className="text-orange-600">
                              there will be some CaCO3 left, so the weighing
                              bottle must be reweighed
                            </span>
                            <span className="text-gray-500">)</span>
                          </div>
                        </div>
                        <p className="text-sm font-medium text-red-700 mb-2 mt-3">
                          ❌ Avoid:
                        </p>
                        <div className="bg-red-50 p-2 rounded border border-red-200 text-xs text-red-600">
                          Students understand back titration because it's
                          important...
                          <br />
                          <span className="text-xs text-red-500">
                            (No specific rubric in parentheses)
                          </span>
                        </div>
                      </div>
                    </div>
                    {/* AI Grading Info */}
                    <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                      <strong>🤖 AI Grading:</strong> Green = Correct &amp;
                      Complete | Red = Attempted but Wrong | Grey = Not
                      Discussed
                    </div>
                  </div>
                  <textarea
                    id="criteriaInput"
                    rows={8}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    placeholder="Students explain that back titration is used (CaCO3 is not soluble in water and cannot be titrated directly)
Students identify that CaCO3 reacts with known volume of excess HCl (the volume of HCl used must be calculated to ensure that the titre volume is between 20 to 25 cm3)
Students identify the need to weigh by difference (there will be some CaCO3 left, so the weighing bottle must be reweighed)
Students recognise the need to cover the conical flask with a filter funnel (there is acid spray from the reaction between CaCO3 and HCl, cover to minimise loss of HCl)
Students understand that HCl must be diluted before titrating against NaOH (if not the titre volume will be more than 50 cm3, no longer between 20 to 25 cm3)
Students should choose the appropriate indicator (methyl orange or thymolphthalein)
Students recognise to stop titration after 2 consistent results (consistent to 0.10 cm3)"
                    defaultValue={""}
                  />
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-xs text-gray-500">
                      Each line becomes a separate criterion • Use format:{" "}
                      <code className="bg-gray-100 px-1 rounded">
                        Description (Rubric)
                      </code>
                    </p>
                    <button
                      type="button"
                      onClick={() => callWindowHandler("toggleFormatHelp")}
                      className="text-xs text-blue-600 hover:text-blue-800 flex items-center"
                    >
                      <i data-lucide="help-circle" className="w-3 h-3 mr-1" />
                      Format Help
                    </button>
                  </div>
                </div>
                {/* Evaluation Strictness Slider */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Evaluation Strictness
                  </label>
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs text-gray-500">Lenient</span>
                      <span
                        id="strictnessLabel"
                        className="text-sm font-medium text-blue-600"
                      >
                        Moderate
                      </span>
                      <span className="text-xs text-gray-500">Strict</span>
                    </div>
                    <input
                      type="range"
                      id="strictnessSlider"
                      min={1}
                      max={3}
                      defaultValue={2}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                      onInput={(event) =>
                        callWindowHandler(
                          "updateStrictnessLabel",
                          event?.target?.value,
                        )
                      }
                    />
                    <div
                      className="mt-3 text-xs text-gray-600"
                      id="strictnessDescription"
                    >
                      <strong>Moderate:</strong> Balanced evaluation requiring
                      both concept and key details
                    </div>
                  </div>
                  <style
                    dangerouslySetInnerHTML={{
                      __html:
                        "\n                                .slider::-webkit-slider-thumb {\n                                    appearance: none;\n                                    width: 20px;\n                                    height: 20px;\n                                    background: #3B82F6;\n                                    cursor: pointer;\n                                    border-radius: 50%;\n                                }\n                                .slider::-moz-range-thumb {\n                                    width: 20px;\n                                    height: 20px;\n                                    background: #3B82F6;\n                                    cursor: pointer;\n                                    border-radius: 50%;\n                                    border: none;\n                                }\n                            ",
                    }}
                  />
                </div>
                {/* Prompt Library Section */}
                <div className="border-t border-gray-200 pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-semibold text-gray-700">
                      Checkbox Prompt Library
                    </h4>
                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          callWindowHandler("refreshCheckboxPrompts")
                        }
                        className="text-xs text-gray-500 hover:text-gray-700 flex items-center"
                      >
                        <i data-lucide="refresh-cw" className="w-3 h-3 mr-1" />
                        Refresh
                      </button>
                      <button
                        onClick={() =>
                          callWindowHandler("openCreateCheckboxPromptModal")
                        }
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
                        id="checkboxPromptSearch"
                        type="text"
                        placeholder="Search checkbox prompts..."
                        className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        onKeyUp={() =>
                          callWindowHandler("filterCheckboxPrompts")
                        }
                      />
                    </div>
                    <select
                      id="checkboxPromptCategoryFilter"
                      className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      onChange={() =>
                        callWindowHandler("filterCheckboxPrompts")
                      }
                    >
                      <option value="">All Categories</option>
                    </select>
                  </div>
                  {/* Prompt Cards Grid */}
                  <div
                    id="checkboxPromptLibraryGrid"
                    className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-64 overflow-y-auto"
                  >
                    <div className="flex items-center justify-center py-8 text-gray-500 text-sm col-span-full">
                      <i
                        data-lucide="loader"
                        className="w-4 h-4 mr-2 animate-spin"
                      />
                      Loading checkbox prompts...
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <button
                      onClick={() => callWindowHandler("clearCriteria")}
                      className="text-gray-600 hover:text-gray-800 text-sm font-medium transition-colors"
                    >
                      🗑️ Clear All
                    </button>
                  </div>
                  <div className="flex space-x-3">
                    <button
                      onClick={() => callWindowHandler("saveCriteria")}
                      className="btn btn-accent glow px-4 py-2"
                    >
                      💾 Save &amp; Apply
                    </button>
                  </div>
                </div>
                <div id="criteriaFeedback" className="hidden p-4 rounded-lg">
                  {/* Feedback messages will appear here */}
                </div>
              </div>
            </div>
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
            Student groups will appear here when they join your session. Set up
            your criteria above and start recording to begin.
          </p>
        </div>
        {/* Groups Grid */}
        <div id="groupsGrid" className="groups-grid hidden">
          {/* Group cards will be inserted here */}
        </div>
      </main>
    </div>
  );
}
