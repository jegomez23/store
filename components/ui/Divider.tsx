import type { HTMLAttributes } from "react";

export function Divider({
  className = "",
  ...props
}: HTMLAttributes<HTMLHRElement>) {
  return <hr className={`border-t border-line ${className}`} {...props} />;
}
