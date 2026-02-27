// components/HiitTooltip.tsx
// HIIT Details tooltip that uses fixed positioning to escape overflow clipping

import { useState, useRef, useEffect, useCallback } from 'react';
import { Info } from 'lucide-react';

interface HiitDetails {
  rounds?: number;
  work_seconds?: number;
  rest_seconds?: number;
  exercises?: string;
}

interface HiitTooltipProps {
  hiitDetails: HiitDetails;
  testId?: string;
}

export function HiitTooltip({ hiitDetails, testId }: HiitTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    if (triggerRef.current && tooltipRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      
      // Calculate position above the trigger
      let top = triggerRect.top - tooltipRect.height - 8;
      let left = triggerRect.left;
      
      // Clamp to viewport bounds
      if (top < 8) {
        // Not enough space above, position below
        top = triggerRect.bottom + 8;
      }
      if (left + tooltipRect.width > window.innerWidth - 8) {
        left = window.innerWidth - tooltipRect.width - 8;
      }
      if (left < 8) {
        left = 8;
      }
      
      setPosition({ top, left });
    }
  }, []);

  useEffect(() => {
    if (isVisible) {
      // Initial position update
      requestAnimationFrame(updatePosition);
      
      // Add scroll and resize listeners
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      
      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [isVisible, updatePosition]);

  const handleMouseEnter = () => setIsVisible(true);
  const handleMouseLeave = () => setIsVisible(false);

  return (
    <>
      <span
        ref={triggerRef}
        className="inline-flex items-center cursor-pointer"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        data-testid={testId}
        role="button"
        tabIndex={0}
        aria-label="View HIIT details"
      >
        <Info className="w-3.5 h-3.5 text-rose-400" />
      </span>
      
      {isVisible && (
        <div
          ref={tooltipRef}
          className="fixed z-[99999] bg-gray-900 border border-gray-700 rounded-lg p-3 shadow-xl min-w-[180px] text-xs pointer-events-auto"
          style={{
            top: `${position.top}px`,
            left: `${position.left}px`,
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div className="font-medium text-rose-300 mb-2">HIIT Details</div>
          <div className="space-y-1 text-gray-300">
            <div>Rounds: <span className="text-white">{hiitDetails.rounds || '-'}</span></div>
            <div>Work: <span className="text-white">{hiitDetails.work_seconds || '-'}s</span></div>
            <div>Rest: <span className="text-white">{hiitDetails.rest_seconds || '-'}s</span></div>
            {hiitDetails.exercises && (
              <div>Exercises: <span className="text-white">{hiitDetails.exercises}</span></div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
