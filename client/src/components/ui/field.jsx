import * as React from "react";
import { cn } from "@/lib/utils";

function Field({ label, htmlFor, hint, error, className, children }) {
  return (
    <div className={cn("ui-field", className)}>
      {label ? (
        <label className="ui-field__label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : null}
      {children}
      {error ? <p className="ui-field__error">{error}</p> : null}
      {!error && hint ? <p className="ui-field__hint">{hint}</p> : null}
    </div>
  );
}

const Input = React.forwardRef(({ className, ...props }, ref) => (
  <input ref={ref} className={cn("ui-input", className)} {...props} />
));

Input.displayName = "Input";

const Textarea = React.forwardRef(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn("ui-textarea", className)} {...props} />
));

Textarea.displayName = "Textarea";

const Select = React.forwardRef(({ className, ...props }, ref) => (
  <select ref={ref} className={cn("ui-select", className)} {...props} />
));

Select.displayName = "Select";

export { Field, Input, Textarea, Select };
