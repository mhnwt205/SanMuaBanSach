export type CmsActivityDay = {
  day: string;
  listings: number | null;
  sellers: number | null;
  reports: number | null;
};

export type CmsSummary = {
  sellers?: number;
  listings?: number;
  activeListings?: number;
  users?: number;
  reports?: number;
  activity?: CmsActivityDay[];
};

export type CmsLayoutContext = {
  summary: CmsSummary;
  summaryLoading: boolean;
  refreshSummary: () => Promise<void>;
};
