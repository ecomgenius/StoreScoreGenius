import { storeAnalyses, type StoreAnalysis, type InsertStoreAnalysis } from "@shared/schema";

export interface IStorage {
  getStoreAnalysis(id: number): Promise<StoreAnalysis | undefined>;
  createStoreAnalysis(analysis: Omit<InsertStoreAnalysis, 'id'>): Promise<StoreAnalysis>;
  getRecentAnalyses(limit?: number): Promise<StoreAnalysis[]>;
}

export class MemStorage implements IStorage {
  private analyses: Map<number, StoreAnalysis>;
  private currentId: number;

  constructor() {
    this.analyses = new Map();
    this.currentId = 1;
  }

  async getStoreAnalysis(id: number): Promise<StoreAnalysis | undefined> {
    return this.analyses.get(id);
  }

  async createStoreAnalysis(analysisData: any): Promise<StoreAnalysis> {
    const id = this.currentId++;
    const analysis: StoreAnalysis = {
      id,
      ...analysisData,
      createdAt: new Date(),
    };
    this.analyses.set(id, analysis);
    return analysis;
  }

  async getRecentAnalyses(limit: number = 10): Promise<StoreAnalysis[]> {
    return Array.from(this.analyses.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }
}

export const storage = new MemStorage();
