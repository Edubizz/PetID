import logo from "@/assets/petid-logo.png";
import { cn } from "@/lib/utils";

export function Logo({
  className,
  showText = true,
  size = 32,
}: {
  className?: string;
  showText?: boolean;
  size?: number;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <img
        src={logo}
        alt="PetID"
        width={size}
        height={size}
        className="rounded-lg"
      />
      {showText && (
        <span className="text-xl font-bold tracking-tight text-foreground">
          Pet<span className="text-accent">ID</span>
        </span>
      )}
    </div>
  );
}