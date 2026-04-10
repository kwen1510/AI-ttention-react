import { cn } from "@/lib/utils";

function Toolbar({ className, ...props }) {
  return <div className={cn("ui-toolbar", className)} {...props} />;
}

function ToolbarGroup({ className, ...props }) {
  return <div className={cn("ui-toolbar__group", className)} {...props} />;
}

export { Toolbar, ToolbarGroup };
