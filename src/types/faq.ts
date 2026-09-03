export interface FaqLink {
  title: string;
  url: string;
}

export interface FaqItem {
  id: string;
  category: string;
  question: string;
  answer: string;
  keywords: string[];
  links: FaqLink[];
}

export interface FaqSearchResult {
  item: FaqItem;
  score: number;
}
