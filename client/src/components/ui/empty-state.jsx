import { cn } from "@/lib/utils";

function EmptyState({ className, icon: Icon, title, description, action }) {
  return (
    <div className={cn("ui-empty-state", className)}>
      {Icon ? (
        <div className="ui-empty-state__icon">
          <Icon className="h-7 w-7" />
        </div>
      ) : null}
      {title ? <h3 className="ui-empty-state__title">{title}</h3> : null}
      {description ? <p className="ui-empty-state__description">{description}</p> : null}
      {action}
    </div>
  );
}

export { EmptyState };
