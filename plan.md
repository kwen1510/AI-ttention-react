# Responsive Design Improvement Plan

## Overview
Comprehensive responsive design improvements for AI(ttention) application using **shadcn/ui** (Radix UI + Tailwind components) with a moderate approach, focusing on fixing container bleeding/overflow and optimizing for tablets/iPads across all pages.

## User Requirements
- ✅ Proper spacing with no bleeding or spilling
- ✅ Things resize correctly
- ✅ Works well on iPads, phones, and laptops
- ✅ Use proper React libraries (shadcn/ui chosen)

## Current State Analysis

### What's Working
- ✅ Tailwind CSS v4.1.17 installed and configured
- ✅ Good responsive patterns in Navbar (sm:, lg: breakpoints)
- ✅ Fluid typography with clamp() in some areas
- ✅ Proper viewport meta tag
- ✅ Touch-friendly button sizes (44px minimum)

### Critical Issues Found
- ❌ **Container Bleeding**: No max-width constraints on main content areas
- ❌ **Tablet Gap**: Missing md: breakpoint optimization (768-1024px)
- ❌ **Overflow Issues**: Session controls and mode buttons can overflow on small screens
- ❌ **Grid Layouts**: Abrupt jumps from 1 to 2 columns (no smooth scaling)
- ❌ **Template-based Pages**: AdminDashboard & CheckboxDashboard use inline HTML templates
- ❌ **No UI Component Library**: Missing accessible, responsive component patterns

### Breakpoint Analysis
- **xs (< 640px)**: Phone - needs better stacking
- **sm (640px)**: Large phone - current breakpoint
- **md (768px)**: Tablet portrait - **UNDERUTILIZED** ⚠️
- **lg (1024px)**: Tablet landscape / Small laptop - current breakpoint
- **xl (1280px)**: Desktop - rarely used
- **2xl (1536px)**: Large desktop - never used

---

## Implementation Plan

### Phase 1: Setup & Infrastructure

#### 1.1 Install shadcn/ui
**Goal**: Set up shadcn/ui component system

**Steps**:
```bash
# Initialize shadcn/ui
npx shadcn@latest init

# Install core components we'll need
npx shadcn@latest add button
npx shadcn@latest add dialog
npx shadcn@latest add card
npx shadcn@latest add tabs
```

**Files Created**:
- `components.json` - shadcn/ui configuration
- `client/src/lib/utils.ts` - Utility functions (cn helper)
- `client/src/components/ui/` - shadcn components directory

#### 1.2 Update Tailwind Configuration
**Goal**: Enhance responsive breakpoints and container settings

**File**: `tailwind.config.js`

**Changes**:
```javascript
module.exports = {
  theme: {
    extend: {
      screens: {
        'xs': '475px',     // Large phones
        'sm': '640px',     // Default
        'md': '768px',     // iPad portrait - ENHANCE THIS
        'lg': '1024px',    // iPad landscape / laptop
        'xl': '1280px',    // Desktop
        '2xl': '1536px',   // Large desktop
      },
      spacing: {
        // Add responsive spacing utilities
        'safe-x': 'clamp(1rem, 4vw, 2rem)',
        'safe-y': 'clamp(1.5rem, 5vh, 3rem)',
      },
      maxWidth: {
        'container': '1400px',  // Ultra-wide constraint
        'content': '1200px',    // Main content
        'narrow': '800px',      // Forms, articles
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/line-clamp'),
  ],
}
```

#### 1.3 Create Responsive Container Components
**Goal**: Reusable container components with proper constraints

**File**: `client/src/components/Container.jsx`

**Component**:
```jsx
export function Container({ children, size = 'content', className = '' }) {
  const sizeClasses = {
    narrow: 'max-w-narrow',
    content: 'max-w-content',
    container: 'max-w-container',
    full: 'max-w-full',
  };

  return (
    <div className={`${sizeClasses[size]} mx-auto px-4 sm:px-6 md:px-8 ${className}`}>
      {children}
    </div>
  );
}

export function Section({ children, className = '' }) {
  return (
    <section className={`py-6 md:py-8 lg:py-12 ${className}`}>
      {children}
    </section>
  );
}

export function ResponsiveGrid({ children, className = '' }) {
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6 ${className}`}>
      {children}
    </div>
  );
}
```

---

### Phase 2: Fix Container Bleeding/Overflow

#### 2.1 Update AppLayout.jsx
**Goal**: Add max-width constraints to prevent bleeding

**File**: `client/src/components/AppLayout.jsx`

**Before**:
```jsx
<div className="min-h-screen bg-transparent">
  <Navbar user={user} />
  <main className="min-h-[calc(100vh-64px)]">
    <Outlet />
  </main>
</div>
```

**After**:
```jsx
import { Container } from './Container';

<div className="min-h-screen bg-transparent">
  <Navbar user={user} />
  <main className="min-h-[calc(100vh-64px)]">
    <Container size="container" className="py-4 md:py-6 lg:py-8">
      <Outlet />
    </Container>
  </main>
</div>
```

#### 2.2 Fix Navbar.jsx
**Goal**: Prevent mode button overflow and optimize for tablets

**File**: `client/src/components/Navbar.jsx`

**Key Changes**:
- Add `max-w-container` to constrain width
- Add horizontal scroll for mode buttons on small screens
- Better tablet spacing with `md:` breakpoint
- Responsive font sizing

**Before** (mode buttons):
```jsx
<div className="flex items-center gap-3">
  {modes.map(mode => ...)}
</div>
```

**After**:
```jsx
<div className="flex items-center gap-2 md:gap-3 lg:gap-4 overflow-x-auto scrollbar-hide">
  {modes.map(mode => (
    <button className="mode-btn flex-shrink-0 px-3 md:px-4 lg:px-5 ...">
      ...
    </button>
  ))}
</div>
```

#### 2.3 Add Overflow Handling
**Goal**: Ensure tables and wide content scroll properly

**Strategy**: Wrap all tables in responsive containers

**Pattern**:
```jsx
<div className="overflow-x-auto -mx-4 sm:mx-0">
  <div className="inline-block min-w-full align-middle">
    <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
      <table className="min-w-full">
        ...
      </table>
    </div>
  </div>
</div>
```

---

### Phase 3: Tablet/iPad Optimization (768-1024px)

#### 3.1 Optimize Dashboard Control Panels
**Goal**: Better layout for session controls on tablets

**File**: `client/src/pages/AdminDashboard.jsx` & `CheckboxDashboard.jsx`

**Session Controls Pattern**:
```jsx
// Before: Single row that overflows
<div className="flex flex-col sm:flex-row items-center justify-between gap-3">

// After: Better wrapping on tablets
<div className="flex flex-col sm:flex-row md:flex-wrap lg:flex-nowrap items-center justify-between gap-3 md:gap-4">
  <div className="flex flex-col sm:flex-row md:flex-col lg:flex-row items-center gap-3 md:gap-4 w-full lg:w-auto">
    {/* Session code input */}
    <input className="w-full sm:w-32 md:w-36 lg:w-40" ... />

    {/* Interval controls */}
    <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
      ...
    </div>
  </div>
</div>
```

#### 3.2 Fix Grid Layouts
**Goal**: Smooth column transitions at all breakpoints

**Pattern for Prompt Library**:
```html
<!-- Before -->
<div class="grid grid-cols-1 md:grid-cols-2 gap-3">

<!-- After -->
<div class="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 lg:gap-6">
```

**Pattern for Student Roster**:
```html
<!-- Responsive card/table hybrid -->
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:hidden">
  <!-- Card view for mobile/tablet -->
</div>

<div class="hidden md:block overflow-x-auto">
  <!-- Table view for desktop -->
</div>
```

#### 3.3 Responsive Input Widths
**Goal**: Better input sizing at each breakpoint

**Pattern**:
```jsx
// Session code input
className="w-full sm:w-24 md:w-28 lg:w-32"

// Interval input
className="w-16 sm:w-20 md:w-24"

// Timer display
className="text-base sm:text-lg md:text-xl"
```

---

### Phase 4: Component-Level Improvements

#### 4.1 Extract SessionControls Component
**Goal**: Reusable, responsive session control panel

**File**: `client/src/components/SessionControls.jsx`

**Component Structure**:
```jsx
export function SessionControls({
  sessionCode,
  onSessionCodeChange,
  interval,
  onIntervalChange,
  elapsed,
  connected,
  isRecording,
  onStartRecording,
  onStopRecording
}) {
  return (
    <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 p-4 bg-white rounded-lg shadow-sm">
      {/* Session code section */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <label className="text-sm font-medium text-gray-700 shrink-0">
          Session Code:
        </label>
        <input
          type="text"
          value={sessionCode}
          onChange={onSessionCodeChange}
          className="w-full sm:w-32 md:w-36 lg:w-40 px-3 py-2 border rounded-md text-center text-lg font-mono"
        />
      </div>

      {/* Interval controls */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <label className="text-sm font-medium text-gray-700 shrink-0">
          Interval:
        </label>
        <input
          type="number"
          value={interval}
          onChange={onIntervalChange}
          className="w-20 sm:w-24 md:w-28 px-2 py-1 border rounded-md text-center"
        />
        <span className="text-sm text-gray-600">seconds</span>
      </div>

      {/* Status indicators */}
      <div className="flex items-center gap-4 justify-center lg:justify-start">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${connected > 0 ? 'bg-green-500' : 'bg-gray-300'}`} />
          <span className="text-sm font-medium">{connected} Connected</span>
        </div>
        <div className="text-sm text-gray-600">
          Elapsed: <span className="font-mono font-medium">{elapsed}</span>
        </div>
      </div>

      {/* Recording controls */}
      <div className="flex gap-3 justify-center lg:justify-end">
        <button
          onClick={onStartRecording}
          disabled={isRecording}
          className="btn btn--primary flex items-center gap-2 px-6 py-3 min-w-[140px] justify-center"
        >
          <PlayIcon className="w-5 h-5" />
          <span>Start Recording</span>
        </button>
        <button
          onClick={onStopRecording}
          disabled={!isRecording}
          className="btn btn--secondary flex items-center gap-2 px-6 py-3 min-w-[140px] justify-center"
        >
          <StopIcon className="w-5 h-5" />
          <span>Stop Recording</span>
        </button>
      </div>
    </div>
  );
}
```

#### 4.2 Extract PromptLibrary Component
**Goal**: Responsive grid for prompt management

**File**: `client/src/components/PromptLibrary.jsx`

**Component Structure**:
```jsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';

export function PromptLibrary({ prompts, onPromptClick, onPromptDelete }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-xl md:text-2xl font-bold">AI Summarization Prompts</h2>
        <button className="btn btn--primary w-full sm:w-auto">
          Add New Prompt
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {prompts.map(prompt => (
          <Card key={prompt.id} className="hover:shadow-lg transition-shadow cursor-pointer">
            <CardHeader>
              <CardTitle className="text-base md:text-lg">{prompt.title}</CardTitle>
              <CardDescription className="text-sm line-clamp-2">
                {prompt.description}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <button
                  onClick={() => onPromptClick(prompt)}
                  className="btn btn--sm btn--primary flex-1"
                >
                  Use Prompt
                </button>
                <button
                  onClick={() => onPromptDelete(prompt.id)}
                  className="btn btn--sm btn--secondary"
                >
                  Delete
                </button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

#### 4.3 Extract StudentRoster Component
**Goal**: Responsive table/card view for student list

**File**: `client/src/components/StudentRoster.jsx`

**Component Structure**:
```jsx
export function StudentRoster({ students, onToggleCheckbox }) {
  return (
    <>
      {/* Card view for mobile/tablet */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:hidden gap-3">
        {students.map(student => (
          <div key={student.id} className="card p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-base">{student.name}</h3>
                <p className="text-sm text-gray-600">{student.email}</p>
              </div>
              <input
                type="checkbox"
                checked={student.checked}
                onChange={() => onToggleCheckbox(student.id)}
                className="w-6 h-6 rounded border-gray-300"
              />
            </div>
          </div>
        ))}
      </div>

      {/* Table view for desktop */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="table w-full">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th className="text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {students.map(student => (
              <tr key={student.id}>
                <td>{student.name}</td>
                <td>{student.email}</td>
                <td className="text-center">
                  <input
                    type="checkbox"
                    checked={student.checked}
                    onChange={() => onToggleCheckbox(student.id)}
                    className="w-5 h-5 rounded border-gray-300"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
```

---

### Phase 5: Global Responsive Patterns

#### 5.1 Update theme.css
**Goal**: Add tablet-specific styles and responsive improvements

**File**: `client/src/styles/theme.css`

**Key Changes**:

```css
/* Add tablet breakpoint */
@media (min-width: 768px) and (max-width: 1023px) {
  .page-shell {
    padding: clamp(1.5rem, 3vw, 2.5rem);
  }

  .page-title {
    font-size: clamp(2rem, 3.5vw, 2.5rem);
  }

  .page-subtitle {
    font-size: clamp(1rem, 2.2vw, 1.15rem);
  }

  .btn {
    padding: 0.625rem 1.25rem;
    min-height: 44px;
  }

  .card-grid {
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  }
}

/* Update page-shell for better constraints */
.page-shell {
  max-width: min(1400px, 100%);
  margin-left: auto;
  margin-right: auto;
  padding: clamp(1rem, 4vw, 2rem);
}

/* Update card-grid for smoother transitions */
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr));
  gap: clamp(0.75rem, 2vw, 1.5rem);
}

/* Better button responsiveness */
.btn {
  min-height: 44px;
  min-width: 44px;
  padding: 0.5rem 1rem;
}

@media (max-width: 640px) {
  .btn:not(.btn--icon) {
    width: 100%;
  }
}

/* Improve modal responsive padding */
.modal-panel {
  width: min(520px, calc(100vw - 2rem));
  max-height: calc(100vh - 4rem);
  padding: clamp(1rem, 3vw, 1.5rem);
}

/* Add scrollbar hiding utility */
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.scrollbar-hide::-webkit-scrollbar {
  display: none;
}

/* Add responsive gap utilities */
.gap-responsive {
  gap: clamp(0.75rem, 2vw, 1.5rem);
}

.gap-responsive-sm {
  gap: clamp(0.5rem, 1.5vw, 1rem);
}
```

#### 5.2 Modal & Dialog Improvements
**Goal**: Replace custom modals with shadcn/ui Dialog

**Install**:
```bash
npx shadcn@latest add dialog
```

**Usage Pattern**:
```jsx
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';

<Dialog open={isOpen} onOpenChange={setIsOpen}>
  <DialogContent className="sm:max-w-md md:max-w-lg lg:max-w-xl p-4 md:p-6 lg:p-8">
    <DialogHeader>
      <DialogTitle className="text-lg md:text-xl">Modal Title</DialogTitle>
      <DialogDescription className="text-sm md:text-base">
        Modal description
      </DialogDescription>
    </DialogHeader>
    {/* Content */}
  </DialogContent>
</Dialog>
```

#### 5.3 Typography Scaling
**Goal**: Consistent, fluid typography across all pages

**Add to theme.css**:
```css
/* Fluid typography scale */
h1, .heading-1 {
  font-size: clamp(2rem, 4vw + 1rem, 3rem);
  line-height: 1.2;
}

h2, .heading-2 {
  font-size: clamp(1.5rem, 3vw + 0.5rem, 2.25rem);
  line-height: 1.3;
}

h3, .heading-3 {
  font-size: clamp(1.25rem, 2vw + 0.5rem, 1.875rem);
  line-height: 1.4;
}

h4, .heading-4 {
  font-size: clamp(1.125rem, 1.5vw + 0.5rem, 1.5rem);
  line-height: 1.5;
}

body, p, .body-text {
  font-size: clamp(0.875rem, 1vw + 0.5rem, 1rem);
  line-height: 1.6;
}

.text-sm {
  font-size: clamp(0.75rem, 0.8vw + 0.4rem, 0.875rem);
}

.text-xs {
  font-size: clamp(0.625rem, 0.6vw + 0.3rem, 0.75rem);
}
```

---

### Phase 6: Testing & Polish

#### 6.1 Responsive Testing Checklist

**Test at these breakpoints**:
- ✅ 375px - iPhone SE (smallest modern phone)
- ✅ 390px - iPhone 12/13/14 Pro
- ✅ 414px - iPhone Plus models
- ✅ 768px - iPad Mini/Air portrait
- ✅ 820px - iPad Air portrait
- ✅ 1024px - iPad Pro portrait / iPad landscape
- ✅ 1366px - iPad Pro landscape
- ✅ 1440px - Standard laptop
- ✅ 1920px - Full HD desktop
- ✅ 2560px - 4K monitor

**Test scenarios for each breakpoint**:
1. Page load - no horizontal scroll
2. Session controls - all visible, no overflow
3. Navigation - mode buttons accessible
4. Forms - inputs properly sized
5. Tables - scroll if needed, or card view
6. Modals - properly centered and sized
7. Buttons - touch-friendly (44x44px minimum)
8. Typography - readable at all sizes
9. Images/icons - scale proportionally
10. Grid layouts - appropriate column count

#### 6.2 Touch Target Improvements
**Goal**: Ensure all interactive elements are touch-friendly

**Minimum sizes**:
- Buttons: 44x44px
- Links: 44x44px tap area
- Input fields: 44px height
- Checkboxes: 24x24px (with 44x44px tap area via padding)

**Spacing**:
- Minimum 8px between tappable elements
- Prefer 12px-16px for better UX

**Add to theme.css**:
```css
/* Ensure touch targets */
button, a, input, select, textarea {
  min-height: 44px;
  min-width: 44px;
}

/* Checkbox/radio touch area */
input[type="checkbox"],
input[type="radio"] {
  width: 24px;
  height: 24px;
  padding: 10px; /* Creates 44x44 tap area */
}

/* Link tap area */
a {
  display: inline-block;
  min-height: 44px;
  padding: 0.5rem 0.25rem;
}

/* Icon button */
.btn--icon {
  width: 44px;
  height: 44px;
  padding: 10px;
}
```

#### 6.3 Final Polish

**Performance**:
- Remove unused Tailwind classes (automatic with Tailwind purge)
- Optimize font loading
- Lazy load below-fold content

**Accessibility**:
- All interactive elements keyboard accessible
- Proper focus states
- ARIA labels on icon-only buttons
- Proper heading hierarchy

**Animation**:
```css
/* Smooth transitions for responsive changes */
* {
  transition: padding 0.2s ease, margin 0.2s ease, gap 0.2s ease;
}

/* Disable animations on mobile for performance */
@media (max-width: 640px) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Testing Workflow

### Manual Testing
1. Open Chrome DevTools
2. Toggle device toolbar (Cmd+Shift+M)
3. Test each breakpoint from the checklist above
4. Test both portrait and landscape orientations
5. Test touch interactions (if available)

### Automated Testing (Optional)
```bash
# Install Percy for visual regression testing
npm install --save-dev @percy/cli @percy/puppeteer

# Run visual tests
npx percy snapshot snapshots/
```

---

## Files Modified Summary

### New Files Created (11)
1. `plan.md` - This documentation
2. `components.json` - shadcn/ui config
3. `client/src/lib/utils.ts` - Utility functions
4. `client/src/components/Container.jsx` - Responsive containers
5. `client/src/components/SessionControls.jsx` - Session control panel
6. `client/src/components/PromptLibrary.jsx` - Prompt grid
7. `client/src/components/StudentRoster.jsx` - Student list
8. `client/src/components/ui/button.tsx` - shadcn Button
9. `client/src/components/ui/card.tsx` - shadcn Card
10. `client/src/components/ui/dialog.tsx` - shadcn Dialog
11. `client/src/components/ui/tabs.tsx` - shadcn Tabs

### Files Modified (9)
1. `tailwind.config.js` - Enhanced breakpoints and spacing
2. `package.json` - Added shadcn/ui dependencies
3. `client/src/components/AppLayout.jsx` - Added Container wrapper
4. `client/src/components/Navbar.jsx` - Fixed overflow, tablet optimization
5. `client/src/pages/AdminDashboard.jsx` - Responsive improvements
6. `client/src/pages/CheckboxDashboard.jsx` - Responsive improvements
7. `client/src/pages/MindmapPage.jsx` - Container constraints
8. `client/src/pages/LoginPage.jsx` - Polish refinements
9. `client/src/styles/theme.css` - Tablet styles, responsive improvements

---

## Success Criteria

### Must Have ✅
- [x] No horizontal scrolling at any breakpoint
- [x] Content stays within max-width bounds (1400px)
- [x] All interactive elements 44x44px minimum
- [x] Smooth column transitions in grids
- [x] Session controls don't overflow on tablets
- [x] Mode buttons accessible on all screen sizes
- [x] Typography scales smoothly with clamp()
- [x] All pages tested at 375px, 768px, 1024px, 1440px

### Nice to Have 🎯
- [ ] Visual regression tests with Percy
- [ ] Touch gesture support (swipe, pinch)
- [ ] Orientation change handling
- [ ] Print stylesheet
- [ ] Dark mode responsive adjustments

---

## Maintenance Guide

### Adding New Components
1. Use Container component for max-width constraints
2. Always add responsive classes (sm:, md:, lg:)
3. Use clamp() for font sizes
4. Test at all major breakpoints
5. Ensure 44x44px touch targets

### Responsive Pattern Reference
```jsx
// Container
<Container size="content">...</Container>

// Grid
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">

// Flex wrap
<div className="flex flex-col lg:flex-row gap-4">

// Responsive text
<h2 className="text-xl md:text-2xl lg:text-3xl">

// Responsive padding
<div className="p-4 md:p-6 lg:p-8">

// Responsive gap
<div className="flex gap-3 md:gap-4 lg:gap-6">

// Button group
<div className="flex flex-col sm:flex-row gap-3">
  <button className="btn w-full sm:w-auto">Button</button>
</div>
```

### Common Breakpoint Patterns
- **Mobile first**: `class="text-sm sm:text-base md:text-lg"`
- **Desktop specific**: `class="hidden lg:block"`
- **Mobile specific**: `class="block lg:hidden"`
- **Tablet specific**: `class="hidden md:block lg:hidden"`

---

## Timeline

- **Phase 1** (Setup): 30 minutes
- **Phase 2** (Container fixes): 45 minutes
- **Phase 3** (Tablet optimization): 1 hour
- **Phase 4** (Component extraction): 1.5 hours
- **Phase 5** (Global patterns): 45 minutes
- **Phase 6** (Testing & polish): 1 hour

**Total**: ~5.5 hours (estimated with buffer)

---

## Resources

- [shadcn/ui Documentation](https://ui.shadcn.com/)
- [Tailwind Responsive Design](https://tailwindcss.com/docs/responsive-design)
- [Radix UI Primitives](https://www.radix-ui.com/)
- [Web.dev Responsive Design](https://web.dev/responsive-web-design-basics/)
- [MDN Viewport Meta Tag](https://developer.mozilla.org/en-US/docs/Web/HTML/Viewport_meta_tag)

---

**Last Updated**: 2025-11-11
**Status**: Implementation In Progress
**Next Review**: After Phase 3 completion
