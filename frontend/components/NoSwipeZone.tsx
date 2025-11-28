import React from "react";

/**
 * NoSwipeZone - Prevents SwipeableViews from capturing touch events
 * Use this to wrap horizontally scrollable content inside SwipeableViews
 */
export const NoSwipeZone: React.FC<React.PropsWithChildren> = ({ children }) => {
  const stop = (e: React.TouchEvent) => {
    // Prevent the event from bubbling up to SwipeableViews
    e.stopPropagation();
  };

  return (
    <div
      className="no-swipe-zone"
      onTouchStart={stop}
      onTouchMove={stop}
    >
      {children}
    </div>
  );
};
