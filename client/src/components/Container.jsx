import { cn } from "@/lib/utils";

/**
 * Container component with max-width constraints and responsive padding
 * Prevents content bleeding on ultra-wide screens
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - Child elements
 * @param {'narrow' | 'content' | 'container' | 'full'} props.size - Container size preset
 * @param {string} props.className - Additional CSS classes
 */
export function Container({ children, size = 'content', className = '' }) {
  const sizeClasses = {
    narrow: 'max-w-narrow',   // 800px - Forms, articles
    content: 'max-w-content', // 1200px - Main content
    container: 'max-w-container', // 1400px - Ultra-wide constraint
    full: 'max-w-full',       // 100% - No constraint
  };

  return (
    <div className={cn(
      sizeClasses[size],
      'mx-auto px-4 sm:px-6 md:px-8',
      className
    )}>
      {children}
    </div>
  );
}

/**
 * Section component with responsive vertical padding
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - Child elements
 * @param {string} props.className - Additional CSS classes
 */
export function Section({ children, className = '' }) {
  return (
    <section className={cn('py-6 md:py-8 lg:py-12', className)}>
      {children}
    </section>
  );
}

/**
 * Responsive grid with smooth column transitions
 * Automatically adjusts columns based on screen size
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - Child elements
 * @param {number} props.cols - Maximum number of columns (2, 3, or 4)
 * @param {string} props.className - Additional CSS classes
 */
export function ResponsiveGrid({ children, cols = 3, className = '' }) {
  const colClasses = {
    2: 'sm:grid-cols-2',
    3: 'sm:grid-cols-2 lg:grid-cols-3',
    4: 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  };

  return (
    <div className={cn(
      'grid grid-cols-1',
      colClasses[cols] || colClasses[3],
      'gap-4 md:gap-6',
      className
    )}>
      {children}
    </div>
  );
}

/**
 * Stack component with responsive direction
 * Switches from vertical (mobile) to horizontal (desktop)
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - Child elements
 * @param {'sm' | 'md' | 'lg'} props.breakAt - Breakpoint where it becomes horizontal
 * @param {string} props.className - Additional CSS classes
 */
export function Stack({ children, breakAt = 'lg', className = '' }) {
  const directionClasses = {
    sm: 'flex-col sm:flex-row',
    md: 'flex-col md:flex-row',
    lg: 'flex-col lg:flex-row',
  };

  return (
    <div className={cn(
      'flex',
      directionClasses[breakAt],
      'gap-4',
      className
    )}>
      {children}
    </div>
  );
}
