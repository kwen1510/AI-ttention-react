import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("ui-badge", {
  variants: {
    tone: {
      neutral: "ui-badge--neutral",
      primary: "ui-badge--primary",
      accent: "ui-badge--accent",
      success: "ui-badge--success",
      warning: "ui-badge--warning",
      danger: "ui-badge--danger",
    },
    size: {
      sm: "ui-badge--sm",
      md: "ui-badge--md",
    },
  },
  defaultVariants: {
    tone: "neutral",
    size: "md",
  },
});

function Badge({ className, tone, size, icon: Icon, children, ...props }) {
  return (
    <span className={cn(badgeVariants({ tone, size }), className)} {...props}>
      {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
      {children}
    </span>
  );
}

function StatusBadge({ className, tone = "neutral", children, pulse = false, ...props }) {
  return (
    <Badge className={className} tone={tone} {...props}>
      <span className={cn("ui-status-dot", pulse && "animate-pulse")} />
      {children}
    </Badge>
  );
}

export { Badge, StatusBadge, badgeVariants };
