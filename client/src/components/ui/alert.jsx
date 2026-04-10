import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

function Alert({ className, tone = "primary", title, icon: Icon = AlertCircle, children, ...props }) {
  return (
    <div className={cn("ui-alert", className)} data-tone={tone} {...props}>
      {Icon ? <Icon className="ui-alert__icon h-4 w-4" /> : null}
      <div className="ui-alert__body">
        {title ? <span className="ui-alert__title">{title}</span> : null}
        {children ? <div className="text-sm">{children}</div> : null}
      </div>
    </div>
  );
}

export { Alert };
