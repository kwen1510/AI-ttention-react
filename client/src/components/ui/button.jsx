import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva("ui-button", {
  variants: {
    variant: {
      primary: "ui-button--primary",
      secondary: "ui-button--secondary",
      ghost: "ui-button--ghost",
      danger: "ui-button--danger",
    },
    size: {
      sm: "ui-button--sm",
      md: "ui-button--md",
      lg: "ui-button--lg",
      icon: "ui-button--icon",
    },
  },
  defaultVariants: {
    variant: "secondary",
    size: "md",
  },
});

const Button = React.forwardRef(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);

Button.displayName = "Button";

const IconButton = React.forwardRef(({ className, variant = "secondary", ...props }, ref) => (
  <Button ref={ref} variant={variant} size="icon" className={className} {...props} />
));

IconButton.displayName = "IconButton";

export { Button, IconButton, buttonVariants };
