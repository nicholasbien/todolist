import React, { useState, useRef, useCallback } from 'react';
import { X, ImagePlus, Loader2 } from 'lucide-react';

interface UploadedImage {
  id: string;
  url: string;
  preview: string; // local object URL for display before/during upload
}

interface ImageUploaderProps {
  token: string;
  spaceId?: string;
  images: UploadedImage[];
  onImagesChange: (images: UploadedImage[]) => void;
  maxImages?: number;
  compact?: boolean; // smaller button for inline use in chat
}

export type { UploadedImage };

export default function ImageUploader({
  token,
  spaceId,
  images,
  onImagesChange,
  maxImages = 4,
  compact = false,
}: ImageUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(
    async (file: File): Promise<UploadedImage | null> => {
      // Validate client-side
      const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowed.includes(file.type)) {
        setError('Unsupported image type. Use JPEG, PNG, GIF, or WebP.');
        return null;
      }
      if (file.size > 5 * 1024 * 1024) {
        setError('Image too large. Maximum size is 5 MB.');
        return null;
      }

      const preview = URL.createObjectURL(file);
      const formData = new FormData();
      formData.append('file', file);
      if (spaceId) {
        formData.append('space_id', spaceId);
      }

      try {
        const res = await fetch('/images/upload', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({ detail: 'Upload failed' }));
          throw new Error(data.detail || 'Upload failed');
        }
        const data = await res.json();
        return { id: data.image_id, url: data.url, preview };
      } catch (err: any) {
        setError(err.message || 'Failed to upload image');
        URL.revokeObjectURL(preview);
        return null;
      }
    },
    [token, spaceId]
  );

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      const remaining = maxImages - images.length;
      if (remaining <= 0) {
        setError(`Maximum ${maxImages} images allowed.`);
        return;
      }
      const toUpload = fileArray.slice(0, remaining);

      setError('');
      setUploading(true);
      try {
        const results = await Promise.all(toUpload.map(uploadFile));
        const successful = results.filter(Boolean) as UploadedImage[];
        if (successful.length > 0) {
          onImagesChange([...images, ...successful]);
        }
      } finally {
        setUploading(false);
      }
    },
    [images, maxImages, onImagesChange, uploadFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFiles(e.target.files);
        // Reset input so the same file can be selected again
        e.target.value = '';
      }
    },
    [handleFiles]
  );

  const removeImage = useCallback(
    (index: number) => {
      const updated = [...images];
      const removed = updated.splice(index, 1);
      removed.forEach((img) => {
        if (img.preview.startsWith('blob:')) {
          URL.revokeObjectURL(img.preview);
        }
      });
      onImagesChange(updated);
    },
    [images, onImagesChange]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handlePaste = useCallback(
    (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault();
        handleFiles(imageFiles);
      }
    },
    [handleFiles]
  );

  // Expose paste handler for parent components to attach to their input elements
  React.useEffect(() => {
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  return (
    <div onDrop={handleDrop} onDragOver={handleDragOver}>
      {/* Image previews */}
      {images.length > 0 && (
        <div className="flex gap-2 mb-2 flex-wrap">
          {images.map((img, i) => (
            <div key={img.id} className="relative group">
              <img
                src={img.preview}
                alt={`Attachment ${i + 1}`}
                className="w-16 h-16 object-cover rounded-lg border border-gray-700"
              />
              <button
                onClick={() => removeImage(i)}
                className="absolute -top-1.5 -right-1.5 bg-gray-800 border border-gray-600 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Remove image"
              >
                <X className="w-3 h-3 text-gray-300" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload button */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        multiple
        onChange={handleFileInput}
        className="hidden"
      />

      {images.length < maxImages && (
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className={`flex items-center gap-1 text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-50 ${
            compact ? 'p-1.5' : 'px-2 py-1 text-sm'
          }`}
          title="Attach image (or paste from clipboard)"
          aria-label="Attach image"
        >
          {uploading ? (
            <Loader2 className={`${compact ? 'w-4 h-4' : 'w-4 h-4'} animate-spin`} />
          ) : (
            <ImagePlus className={`${compact ? 'w-4 h-4' : 'w-4 h-4'}`} />
          )}
          {!compact && <span>{uploading ? 'Uploading...' : 'Image'}</span>}
        </button>
      )}

      {/* Error message */}
      {error && (
        <p className="text-red-400 text-xs mt-1">{error}</p>
      )}
    </div>
  );
}
