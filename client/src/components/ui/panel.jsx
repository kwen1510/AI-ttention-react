import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const panelVariants = cva("ui-panel", {
  variants: {
    tone: {
      default: "",
      subtle: "ui-panel--subtle",
      outline: "ui-panel--outline",
    },
    padding: {
      none: "",
      sm: "ui-panel--pad-sm",
      md: "ui-panel--pad-md",
      lg: "ui-panel--pad-lg",
    },
  },
  defaultVariants: {
    tone: "default",
    padding: "md",
  },
});

function Panel({ className, tone, padding, ...props }) {
  return <div className={cn(panelVariants({ tone, padding }), className)} {...props} />;
}

function PanelHeader({ className, icon: Icon, title, description, actions, children }) {
  return (
    <div className={cn("ui-panel-header", className)}>
      <div className="ui-panel-heading">
        {Icon ? (
          <div className="ui-panel-heading__icon">
            <Icon className="h-5 w-5" />
          </div>
        ) : null}
        <div>
          {title ? <h3 className="ui-panel-title">{title}</h3> : null}
          {description ? <p className="ui-panel-description">{description}</p> : null}
          {children}
        </div>
      </div>
      {actions ? <div className="cluster">{actions}</div> : null}
    </div>
  );
}

function SectionHeader({ className, eyebrow, title, description, actions }) {
  return (
    <div className={cn("ui-section-header", className)}>
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        {title ? <h1 className="page-title">{title}</h1> : null}
        {description ? <p className="page-subtitle">{description}</p> : null}
      </div>
      {actions ? <div className="cluster">{actions}</div> : null}
    </div>
  );
}

export { Panel, PanelHeader, SectionHeader, panelVariants };
