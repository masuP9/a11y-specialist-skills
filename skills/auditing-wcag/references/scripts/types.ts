/**
 * Common type definitions for WCAG audit scripts
 */

// =============================================================================
// Auto-play Detection Types
// =============================================================================

export interface ScreenshotRecord {
  time: string;
  path: string;
}

export interface ComparisonResult {
  compare: string;
  diffPixels: number;
  totalPixels: number;
  diffPercent: string;
  hasChange: boolean;
}

export interface ImageDiffResult {
  diffPixels: number;
  totalPixels: number;
  diffPercent: number;
}

export interface PauseControlInfo {
  found: boolean;
  controls: PauseControl[];
  carouselIndicators: CarouselIndicator[];
  hasAccessibleName: boolean;
}

export interface PauseControl {
  element: string;
  name: string;
  matchedBy: 'accessible-name' | 'class-name-near-carousel' | 'svg-icon-pattern';
  selector: string;
}

export interface CarouselIndicator {
  element: string;
  name: string;
}

export interface PauseVerificationResult {
  attempted: boolean;
  controlClicked: string | null;
  beforeClickDiffPercent: string | null;
  afterClickDiffPercent: string | null;
  pauseWorked: boolean | null;
  error: string | null;
}

export interface AutoPlayDetectionResult {
  url: string;
  screenshotRecords: ScreenshotRecord[];
  comparisons: ComparisonResult[];
  hasAutoPlayContent: boolean;
  stopsWithin5Seconds: boolean;
  pauseControls: PauseControlInfo;
  pauseVerification: PauseVerificationResult;
  recommendation: string;
}

// =============================================================================
// Focus Indicator Types
// =============================================================================

export interface FocusRecord {
  id: number;
  tag: string;
  role: string | null;
  name: string;
  hasFocusStyle: boolean;
  diff: Record<string, string>;
}

export interface FocusCheckResult {
  totalElements: number;
  elementsWithFocusStyle: number;
  elementsWithoutFocusStyle: FocusRecord[];
  screenshotPath: string;
}
