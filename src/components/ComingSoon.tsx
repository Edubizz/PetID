import type { LucideIcon } from "lucide-react";

export function ComingSoon({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      <p className="mt-1 text-muted-foreground">{description}</p>
      <div className="mt-8 flex flex-col items-center rounded-2xl border border-dashed border-border bg-card p-12 text-center">
        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-6 w-6" />
        </div>
        <p className="font-semibold">Em breve</p>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Esta seção está em desenvolvimento e será liberada em uma próxima atualização.
        </p>
      </div>
    </div>
  );
}