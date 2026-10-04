"use client";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="dialog-overlay" />
        <D.Content
          className={`dialog ${wide ? "dialog-wide" : ""}`}
          aria-describedby={description ? "dialog-description" : undefined}
        >
          <D.Title className="dialog-title">{title}</D.Title>
          {description && (
            <D.Description id="dialog-description" className="muted">
              {description}
            </D.Description>
          )}
          <D.Close className="dialog-close" aria-label="Tutup dialog">
            <X size={20} />
          </D.Close>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
