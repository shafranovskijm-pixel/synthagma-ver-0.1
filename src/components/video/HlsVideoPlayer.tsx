import { CourseVideoPlayer } from './CourseVideoPlayer';
import { isMpegTsOrHlsUrl } from '@/utils/courseBuilderHelpers';

interface HlsVideoPlayerProps {
  src: string;
  className?: string;
  controls?: boolean;
  preload?: 'none' | 'metadata' | 'auto';
  controlsList?: string;
  onError?: () => void;
}

// Compatibility entry point: every direct/HLS preview uses the same controls
// as the learner and Kinescope players. Download remains hidden.
export function HlsVideoPlayer({ controlsList: _controlsList, ...props }: HlsVideoPlayerProps) {
  return <CourseVideoPlayer key={props.src} {...props} />;
}

export { isMpegTsOrHlsUrl as isMpegTsUrl };
