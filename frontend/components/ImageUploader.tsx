import React, { useState, useRef, useCallback, useEffect } from 'react';
import { ImagePlus, X, Loader2, AlertCircle } from 'lucide-react';

export interface UploadedImage {
  id: string;
  previewUrl: string;
  filename: string;
  uploading?: boolean;
  error?: string;
}

interface ImageUploaderProps {
  token: string;
  spaceId?: string;
  images: UploadedImage[];
  onImagesChange: (images: UploadedImage[]) => void;
  maxImages?: number;
  disabled?: boolean;
  compact?: boolean;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export default function ImageUploader({
  token,
  spaceId,
  images,
  onImagesChange,
  maxImages = 5,
  disabled = false,
  compact = false,
}: ImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Upload a single file and return the UploadedImage
  const uploadFile = useCallback(
    async (file: File): Promise<UploadedImage> => {
      const previewUrl = URL.createObjectURL(file);
      const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`;

      // Return a placeholder while uploading
      const placeholder: UploadedImage = {
        id: tempId,
        previewUrl,
        filename: file.name,
        uploading: true,
      };

      try {
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch('/images/upload', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || `Upload failed (${res.status})`);
        }

        const data = await res.json();
        return {
          id: data.id || data._id,
          previewUrl,
          filename: file.name,
          uploading: false,
        };
      } catch (err: any) {
        return {
          id: tempId,
          previewUrl,
          filename: file.name,
          uploading: false,
          error: err.message || 'Upload failed',
        };
      }
    },
    [token],
  );

  // Process and upload files
  const processFiles = useCallback(
    async (files: File[]) => {
      if (disabled) return;

      const remaining = maxImages - images.length;
      if (remaining <= 0) return;

      const validFiles = files
        .filter((f) => {
          if (!ACCEPTED_TYPES.includes(f.type)) {
            console.warn(`Skipping ${f.name}: unsupported type ${f.type}`);
            return false;
          }
          if (f.size > MAX_FILE_SIZE) {
            console.warn(`Skipping ${f.name}: exceeds 5MB limit`);
            return false;
          }
          return true;
        })
        .slice(0, remaining);

      if (validFiles.length === 0) return;

      // Create placeholders for all files
      const placeholders: UploadedImage[] = validFiles.map((f) => ({
        id: `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        previewUrl: URL.createObjectURL(f),
        filename: f.name,
        uploading: true,
      }));

      // Add placeholders to state immediately
      const withPlaceholders = [...images, ...placeholders];
      onImagesChange(withPlaceholders);

      // Upload all files concurrently
      const results = await Promise.all(validFiles.map((f) => uploadFile(f)));

      // Replace placeholders with actual results
      const placeholderIds = new Set(placeholders.map((p) => p.id));
      const existing = withPlaceholders.filter((img) => !placeholderIds.has(img.id));
      onImagesChange([...existing, ...results]);
    },
    [disabled, images, maxImages, onImagesChange, uploadFile],
  );

  // Handle file input change
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      processFiles(files);
      // Reset input so the same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [processFiles],
  );

  // Remove an image
  const handleRemove = useCallback(
    (imageId: string) => {
      const img = images.find((i) => i.id === imageId);
      if (img?.previewUrl) {
        URL.revokeObjectURL(img.previewUrl);
      }
      onImagesChange(images.filter((i) => i.id !== imageId));

      // Fire-and-forget delete on server for successfully uploaded images
      if (!imageId.startsWith('temp_')) {
        fetch(`/images/${imageId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {});
      }
    },
    [images, onImagesChange, token],
  );

  // Drag-and-drop handlers
  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled) setIsDragOver(true);
    },
    [disabled],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      processFiles(files);
    },
    [processFiles],
  );

  // Clipboard paste handler
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (disabled) return;
      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        processFiles(imageFiles);
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [disabled, processFiles]);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      images.forEach((img) => {
        if (img.previewUrl) {
          URL.revokeObjectURL(img.previewUrl);
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canAddMore = images.length < maxImages && !disabled;

  // In compact mode, only show if there are images or as a small button
  if (compact && images.length === 0) {
    return (
      <>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors z-10"
          title="Attach image"
          aria-label="Attach image"
        >
          <ImagePlus size={18} />
        </button>
      </>
    );
  }

  return (
    <div
      ref={dropZoneRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative ${
        isDragOver
          ? 'ring-2 ring-accent ring-offset-2 ring-offset-gray-900 rounded-lg'
          : ''
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Image previews */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {images.map((img) => (
            <div
              key={img.id}
              className="relative group w-16 h-16 rounded-lg overflow-hidden border border-gray-700 bg-gray-800 flex-shrink-0"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.previewUrl}
                alt={img.filename}
                className="w-full h-full object-cover"
              />

              {/* Uploading overlay */}
              {img.uploading && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <Loader2 size={20} className="text-white animate-spin" />
                </div>
              )}

              {/* Error overlay */}
              {img.error && (
                <div className="absolute inset-0 bg-red-900/60 flex items-center justify-center" title={img.error}>
                  <AlertCircle size={20} className="text-red-300" />
                </div>
              )}

              {/* Remove button */}
              {!img.uploading && (
                <button
                  type="button"
                  onClick={() => handleRemove(img.id)}
                  className="absolute top-0.5 right-0.5 bg-black/70 rounded-full p-0.5 text-gray-300 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remove image"
                  aria-label={`Remove ${img.filename}`}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))}

          {/* Add more button (inline with previews) */}
          {canAddMore && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-16 h-16 rounded-lg border border-dashed border-gray-600 bg-gray-800/50 flex items-center justify-center text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors flex-shrink-0"
              title="Add image"
              aria-label="Add image"
            >
              <ImagePlus size={20} />
            </button>
          )}
        </div>
      )}

      {/* Drag overlay */}
      {isDragOver && (
        <div className="absolute inset-0 bg-accent/10 border-2 border-dashed border-accent rounded-lg flex items-center justify-center z-20 pointer-events-none">
          <span className="text-accent font-medium text-sm">Drop images here</span>
        </div>
      )}
    </div>
  );
}
