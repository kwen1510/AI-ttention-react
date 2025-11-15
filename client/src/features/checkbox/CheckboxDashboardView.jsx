import { callWindowHandler } from "@/lib/legacyHandlers.js";

export default function CheckboxDashboardView() {
  return (
    <div>
      {/* Premium Control Bar */}
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
                  Loading...
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
        {/* Premium Criteria Setup Section (Collapsible) */}
        <div className="glass-panel mb-8 overflow-hidden">
          <button
            id="criteriaToggle"
            onClick={() => callWindowHandler("toggleCriteriaEditor")}
            className="w-full px-6 py-4 text-left hover:bg-white/40 transition-all duration-300"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br from-emerald-400/20 to-teal-500/20 backdrop-blur-sm border border-emerald-300/30">
                  <svg
                    className="w-5 h-5 text-emerald-600"
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
                  <h3 className="text-lg font-semibold gradient-text">
                    Discussion Criteria Setup
                  </h3>
                  <p className="text-sm text-slate-600">
                    Set up your discussion question and criteria checklist
                  </p>
                </div>
              </div>
              <svg
                id="criteriaChevron"
                className="w-5 h-5 text-slate-400 transition-transform duration-300"
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
          <div id="criteriaEditor" className="hidden border-t border-white/20">
            <div className="p-6">
              <div className="space-y-6">
                {/* Scenario/Question Section */}
                <div>
                  <label
                    htmlFor="scenarioInput"
                    className="block text-sm font-semibold text-slate-700 mb-2"
                  >
                    Discussion Question/Scenario
                  </label>
                  <textarea
                    id="scenarioInput"
                    rows={4}
                    className="premium-input w-full px-4 py-3 rounded-lg resize-vertical"
                    placeholder="Enter the discussion question or scenario context..."
                    defaultValue={""}
                  />
                </div>
                {/* Criteria Input */}
                <div>
                  <label
                    htmlFor="criteriaInput"
                    className="block text-sm font-semibold text-slate-700 mb-2"
                  >
                    Criteria Checklist (one per line)
                  </label>
                  {/* Format Instructions */}
                  <div className="mb-3 p-4 bg-gradient-to-br from-blue-50/60 to-indigo-50/60 backdrop-blur-sm border border-blue-200/50 rounded-lg">
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
                    className="premium-input w-full p-3 rounded-lg resize-none"
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
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Evaluation Strictness
                  </label>
                  <div className="glass-panel p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs text-slate-500 font-medium">Lenient</span>
                      <span
                        id="strictnessLabel"
                        className="text-sm font-semibold gradient-text"
                      >
                        Moderate
                      </span>
                      <span className="text-xs text-slate-500 font-medium">Strict</span>
                    </div>
                    <input
                      type="range"
                      id="strictnessSlider"
                      min={1}
                      max={3}
                      defaultValue={2}
                      className="w-full h-2 bg-slate-200/50 rounded-lg appearance-none cursor-pointer slider"
                      onInput={(event) =>
                        callWindowHandler(
                          "updateStrictnessLabel",
                          event?.target?.value,
                        )
                      }
                    />
                    <div
                      className="mt-3 text-xs text-slate-600"
                      id="strictnessDescription"
                    >
                      <strong className="text-slate-700">Moderate:</strong> Balanced evaluation requiring
                      both concept and key details
                    </div>
                  </div>
                  <style
                    dangerouslySetInnerHTML={{
                      __html:
                        "\n                                .slider::-webkit-slider-thumb {\n                                    appearance: none;\n                                    width: 20px;\n                                    height: 20px;\n                                    background: linear-gradient(135deg, #06b6d4, #3b82f6);\n                                    cursor: pointer;\n                                    border-radius: 50%;\n                                    box-shadow: 0 2px 8px rgba(59, 130, 246, 0.4);\n                                }\n                                .slider::-moz-range-thumb {\n                                    width: 20px;\n                                    height: 20px;\n                                    background: linear-gradient(135deg, #06b6d4, #3b82f6);\n                                    cursor: pointer;\n                                    border-radius: 50%;\n                                    border: none;\n                                    box-shadow: 0 2px 8px rgba(59, 130, 246, 0.4);\n                                }\n                            ",
                    }}
                  />
                </div>
                {/* Prompt Library Section */}
                <div className="border-t border-white/20 pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-semibold gradient-text">
                      Checkbox Prompt Library
                    </h4>
                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          callWindowHandler("refreshCheckboxPrompts")
                        }
                        className="text-xs text-slate-500 hover:text-slate-700 flex items-center transition-colors font-medium"
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
                        className="absolute left-3 top-1/2 transform -translate-y-1/2 w-3 h-3 text-slate-400"
                      />
                      <input
                        id="checkboxPromptSearch"
                        type="text"
                        placeholder="Search checkbox prompts..."
                        className="premium-input w-full pl-8 pr-3 py-2 text-sm"
                        onKeyUp={() =>
                          callWindowHandler("filterCheckboxPrompts")
                        }
                      />
                    </div>
                    <select
                      id="checkboxPromptCategoryFilter"
                      className="premium-input px-3 py-2 text-sm"
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
                    <div className="flex items-center justify-center py-8 text-slate-500 text-sm col-span-full">
                      <i
                        data-lucide="loader"
                        className="w-4 h-4 mr-2 animate-spin"
                      />
                      Loading checkbox prompts...
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center space-x-4">
                    <button
                      onClick={() => callWindowHandler("clearCriteria")}
                      className="text-slate-600 hover:text-slate-800 text-sm font-medium transition-colors flex items-center gap-2"
                    >
                      <i data-lucide="trash-2" className="w-4 h-4" />
                      Clear All
                    </button>
                  </div>
                  <div className="flex space-x-3">
                    <button
                      onClick={() => callWindowHandler("saveCriteria")}
                      className="btn btn-accent glow px-6 py-2.5 text-sm font-semibold"
                    >
                      <i data-lucide="save" className="w-4 h-4 mr-2" />
                      Save &amp; Apply
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
        {/* Premium Empty State */}
        <div id="emptyState" className="text-center py-16">
          <div className="w-24 h-24 mx-auto rounded-full flex items-center justify-center mb-6 bg-gradient-to-br from-cyan-400/20 to-blue-500/20 backdrop-blur-sm border-2 border-white/40 shadow-lg">
            <i
              data-lucide="graduation-cap"
              className="w-10 h-10 text-cyan-600"
            />
          </div>
          <h3 className="text-xl font-semibold gradient-text mb-2">
            Waiting for Students
          </h3>
          <p className="text-slate-600 max-w-md mx-auto">
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
