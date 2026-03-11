import React, { useState } from 'react';
import { ImageOff } from 'lucide-react';
import ImageLightbox from './ImageLightbox';

interface ImageThumbnailsProps {
  imageIds: string[];
  /** Thumbnail size variant */
  size?: 'small' | 'medium';
}

/**
 * Renders a row of image thumbnails with lightbox support.
 * Clicking a thumbnail opens it in a full-screen lightbox overlay.
 * Handles broken images gracefully with a fallback icon.
 */
export default function ImageThumbnails({ imageIds, size = 'medium' }: ImageThumbnailsProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [brokenIds, setBrokenIds] = useState<Set<string>>(new Set());

  if (!imageIds || imageIds.length === 0) return null;

  const sizeClasses = size === 'small'
    ? 'w-12 h-12'
    : 'max-w-[200px] max-h-[200px]';

  const containerClasses = size === 'small'
    ? 'flex gap-1.5 mt-1.5 flex-wrap'
    : 'flex gap-2 mt-2 flex-wrap';

  return (
    <>
      <div className={containerClasses}>
        {imageIds.map((imgId, idx) => (
          <button
            key={imgId}
            onClick={(e) => { e.stopPropagation(); setLightboxIndex(idx); }}
            className="relative group focus:outline-none focus:ring-2 focus:ring-accent rounded-lg"
            aria-label={`View image ${idx + 1}`}
          >
            {brokenIds.has(imgId) ? (
              <div className={`${sizeClasses} rounded-lg border border-gray-700 bg-gray-800 flex items-center justify-center`}>
                <ImageOff className="w-4 h-4 text-gray-500" />
              </div>
            ) : (
              <img
                src={`/images/${imgId}`}
                alt={`Attached image ${idx + 1}`}
                className={`${sizeClasses} rounded-lg border border-gray-700 object-cover cursor-pointer hover:opacity-90 transition-opacity`}
                loading="lazy"
                onError={() => {
                  setBrokenIds(prev => new Set(prev).add(imgId));
                }}
              />
            )}
          </button>
        ))}
      </div>

      {lightboxIndex !== null && (
        <ImageLightbox
          imageIds={imageIds.filter(id => !brokenIds.has(id))}
          currentIndex={Math.min(lightboxIndex, imageIds.filter(id => !brokenIds.has(id)).length - 1)}
          onClose={() => setLightboxIndex(null)}
          onNavigate={(index) => setLightboxIndex(index)}
        />
      )}
    </>
  );
}
