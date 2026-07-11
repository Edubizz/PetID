import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dog, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { ACCEPTED_PHOTO_TYPES, MAX_PHOTO_BYTES } from "@/lib/pet-constants";
import petPlaceholder from "@/assets/pet-placeholder.jpg";

type Props = {
  value: string | null | undefined;
  onChange: (dataUrl: string | null) => void;
  size?: number;
};

/**
 * PhotoUploader — MVP implementation using base64 data URLs stored in `pets.photo_url`.
 * Prepared to swap for Supabase Storage: replace `readAsDataURL` with an upload to the
 * `pet-photos` bucket and store the resulting public/signed URL in `onChange`.
 */
export function PhotoUploader({ value, onChange, size = 128 }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  const pick = () => inputRef.current?.click();

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!ACCEPTED_PHOTO_TYPES.includes(file.type)) {
      return toast.error("Formato inválido. Use JPG, PNG ou WEBP.");
    }
    if (file.size > MAX_PHOTO_BYTES) {
      return toast.error("Imagem muito grande (máx. 3 MB).");
    }
    setLoading(true);
    const reader = new FileReader();
    reader.onload = () => {
      onChange(String(reader.result));
      setLoading(false);
    };
    reader.onerror = () => {
      toast.error("Não foi possível ler o arquivo.");
      setLoading(false);
    };
    reader.readAsDataURL(file);
  };

  const preview = value || petPlaceholder;
  const hasCustom = Boolean(value);

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div
        className="relative overflow-hidden rounded-2xl border border-border bg-secondary"
        style={{ width: size, height: size }}
      >
        {preview ? (
          <img src={preview} alt="Foto do pet" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <Dog className="h-10 w-10" />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_PHOTO_TYPES.join(",")}
          className="hidden"
          onChange={onFile}
        />
        <Button type="button" variant="outline" size="sm" onClick={pick} disabled={loading}>
          <Upload className="mr-2 h-4 w-4" />
          {hasCustom ? "Trocar foto" : "Selecionar foto"}
        </Button>
        {hasCustom && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
            <X className="mr-2 h-4 w-4" /> Remover
          </Button>
        )}
        <p className="text-xs text-muted-foreground">JPG, PNG ou WEBP — até 3 MB.</p>
      </div>
    </div>
  );
}