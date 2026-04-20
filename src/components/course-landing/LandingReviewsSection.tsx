import { useLandingTheme } from "./LandingThemeProvider";
import { ReviewsCards } from "./variants/ReviewsCards";
import { ReviewsMasonry } from "./variants/ReviewsMasonry";
import { ReviewsCarouselMini } from "./variants/ReviewsCarouselMini";

export interface ReviewItem {
  name: string;
  text: string;
  rating: number;
}

interface Props {
  title: string;
  reviews: ReviewItem[];
  isEditing?: boolean;
  onTitleChange?: (v: string) => void;
  onReviewChange?: (index: number, field: keyof ReviewItem, value: string | number) => void;
  onAddReview?: () => void;
  onRemoveReview?: (index: number) => void;
}

/** Диспетчер Reviews. Выбирает variant по `theme.reviews_layout`. */
export function LandingReviewsSection(props: Props) {
  const { theme } = useLandingTheme();
  switch (theme.reviews_layout) {
    case "masonry":
      return <ReviewsMasonry {...props} />;
    case "carousel-mini":
      return <ReviewsCarouselMini {...props} />;
    case "cards":
    default:
      return <ReviewsCards {...props} />;
  }
}
