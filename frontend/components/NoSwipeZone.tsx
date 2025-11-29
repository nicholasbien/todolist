import React from "react";

/**
 * NoSwipeZone - Wrapper for horizontally scrollable content inside SwipeableViews
 * Works with ignoreNativeScroll={true} on SwipeableViews + touch-action: pan-x CSS
 */
export const NoSwipeZone: React.FC<React.PropsWithChildren> = ({ children }) => {
  return (
    <div className="no-swipe-zone">
      {children}
    </div>
  );
};
