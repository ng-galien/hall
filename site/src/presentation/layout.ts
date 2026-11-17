/**
 * Widest viewport of the compact story layout: narrow columns along both edges and the step card along the bottom.
 * The media queries of presentation.css use the same value; the desktop layout needs a wider viewport for its
 * place list, step card and fiche to sit side by side.
 */
export const COMPACT_STORY_WIDTH = 1179;
export const compactStoryQuery = `(max-width: ${COMPACT_STORY_WIDTH}px)`;
