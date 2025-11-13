export interface BIMItem {
  code: string; // E.g., WD-01, MT-02
  area: string; // E.g., Kitchen, Living Room
  location: string; // E.g., Wall, Floor, Ceiling, Skirting
  finish: string; // E.g., "Prime Grade European Oak Flooring (Product Code: OAK-FLR-01)"
  supplierAndContact: string; // E.g., "Junckers UK (sales@junckers.co.uk, 01376 534700)"
  pricePerSqm?: {
    low: number;
    mid: number;
    high: number;
  };
  type: string; // E.g., Oak, Marble, Tile, Paint
}

export interface MaterialAnalysisResult {
  materials: BIMItem[];
  imageDescription: string;
}

