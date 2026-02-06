import type { LucideProps } from "lucide-react";
import Image from "next/image";
import { forwardRef } from "react";

export const OpenClawIcon = forwardRef<SVGSVGElement, LucideProps>(
  (_props, _ref) => (
    <Image
      src="/icons/claw.png"
      alt="OpenClaw"
      width={16}
      height={16}
      className="size-4 shrink-0"
    />
  ),
);
OpenClawIcon.displayName = "OpenClawIcon";
