import { 
  storeAnalyses, 
  users,
  userStores,
  creditTransactions,
  userSessions,
  productOptimizations,
  type StoreAnalysis, 
  type InsertStoreAnalysis,
  type User,
  type InsertUser,
  type UserStore,
  type InsertUserStore,
  type CreditTransaction,
  type UserSession,
  type ProductOptimization
} from "@shared/schema";
import { eq, desc, and, gt } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { db } from "./db";

// Use the centralized database connection

export interface IStorage {
  // Store analysis methods
  getStoreAnalysis(id: number): Promise<StoreAnalysis | undefined>;
  createStoreAnalysis(analysis: Omit<InsertStoreAnalysis, 'id'>): Promise<StoreAnalysis>;
  getRecentAnalyses(limit?: number): Promise<StoreAnalysis[]>;
  getUserAnalyses(userId: number, limit?: number): Promise<StoreAnalysis[]>;
  
  // User management methods
  createUser(userData: Omit<InsertUser, 'id' | 'createdAt' | 'updatedAt'>): Promise<User>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserById(id: number): Promise<User | undefined>;
  updateUser(id: number, updates: Partial<User>): Promise<User | undefined>;
  validateUserCredentials(email: string, password: string): Promise<User | null>;
  
  // User stores methods
  createUserStore(storeData: Omit<InsertUserStore, 'id' | 'createdAt' | 'updatedAt'>): Promise<UserStore>;
  getUserStores(userId: number): Promise<UserStore[]>;
  getUserStore(id: number): Promise<UserStore | undefined>;
  updateUserStore(id: number, updates: Partial<UserStore>): Promise<UserStore | undefined>;
  deleteUserStore(id: number): Promise<boolean>;
  
  // Credit management methods
  getUserCredits(userId: number): Promise<number>;
  deductCredits(userId: number, amount: number, description: string, analysisId?: number): Promise<boolean>;
  addCredits(userId: number, amount: number, description: string, stripePaymentId?: string): Promise<boolean>;
  getCreditTransactions(userId: number, limit?: number): Promise<CreditTransaction[]>;
  
  // Session management methods
  createSession(userId: number): Promise<UserSession>;
  getSession(sessionId: string): Promise<UserSession | undefined>;
  deleteSession(sessionId: string): Promise<boolean>;
  cleanExpiredSessions(): Promise<void>;
  
  // Product optimization tracking methods
  recordProductOptimization(data: {
    userId: number;
    userStoreId: number;
    shopifyProductId: string;
    optimizationType: 'title' | 'description' | 'pricing' | 'keywords';
    originalValue: string;
    optimizedValue: string;
    creditsUsed: number;
  }): Promise<ProductOptimization>;
  getProductOptimizations(userStoreId: number, optimizationType?: string): Promise<ProductOptimization[]>;
  isProductOptimized(userStoreId: number, shopifyProductId: string, optimizationType: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {

  // Store analysis methods
  async getStoreAnalysis(id: number): Promise<StoreAnalysis | undefined> {
    console.log('Debug - DatabaseStorage.getStoreAnalysis called with id:', id);
    const result = await db.select().from(storeAnalyses).where(eq(storeAnalyses.id, id));
    console.log('Debug - Query result:', result.length, 'rows found');
    return result[0];
  }

  async createStoreAnalysis(analysisData: Omit<InsertStoreAnalysis, 'id'>): Promise<StoreAnalysis> {
    const result = await db.insert(storeAnalyses).values(analysisData).returning();
    return result[0];
  }

  async getRecentAnalyses(limit: number = 10): Promise<StoreAnalysis[]> {
    return await db.select().from(storeAnalyses)
      .orderBy(desc(storeAnalyses.createdAt))
      .limit(limit);
  }

  async getUserAnalyses(userId: number, limit: number = 20): Promise<StoreAnalysis[]> {
    return await db.select().from(storeAnalyses)
      .where(eq(storeAnalyses.userId, userId))
      .orderBy(desc(storeAnalyses.createdAt))
      .limit(limit);
  }

  // User management methods
  async createUser(userData: Omit<InsertUser, 'id' | 'createdAt' | 'updatedAt'>): Promise<User> {
    const hashedPassword = await bcrypt.hash(userData.passwordHash, 12);
    const userToInsert = {
      ...userData,
      passwordHash: hashedPassword,
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days from now
    };
    
    const result = await db.insert(users).values(userToInsert).returning();
    return result[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.email, email));
    return result[0];
  }

  async getUserById(id: number): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id));
    return result[0];
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User | undefined> {
    const result = await db.update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return result[0];
  }

  async validateUserCredentials(email: string, password: string): Promise<User | null> {
    const user = await this.getUserByEmail(email);
    if (!user) return null;
    
    const isValid = await bcrypt.compare(password, user.passwordHash);
    return isValid ? user : null;
  }

  // User stores methods
  async createUserStore(storeData: Omit<InsertUserStore, 'id' | 'createdAt' | 'updatedAt'>): Promise<UserStore> {
    const result = await db.insert(userStores).values(storeData).returning();
    return result[0];
  }

  async getUserStores(userId: number): Promise<UserStore[]> {
    return await db.select().from(userStores)
      .where(eq(userStores.userId, userId))
      .orderBy(desc(userStores.createdAt));
  }

  async getUserStore(id: number): Promise<UserStore | undefined> {
    const result = await db.select().from(userStores).where(eq(userStores.id, id));
    return result[0];
  }

  async updateUserStore(id: number, updates: Partial<UserStore>): Promise<UserStore | undefined> {
    const result = await db.update(userStores)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(userStores.id, id))
      .returning();
    return result[0];
  }

  async deleteUserStore(id: number): Promise<boolean> {
    const result = await db.delete(userStores).where(eq(userStores.id, id));
    return result.rowCount > 0;
  }

  // Credit management methods
  async getUserCredits(userId: number): Promise<number> {
    const user = await this.getUserById(userId);
    return user?.aiCredits || 0;
  }

  async deductCredits(userId: number, amount: number, description: string, analysisId?: number): Promise<boolean> {
    const user = await this.getUserById(userId);
    if (!user || user.aiCredits < amount) return false;

    // Update user credits
    await this.updateUser(userId, { aiCredits: user.aiCredits - amount });

    // Record transaction
    await db.insert(creditTransactions).values({
      userId,
      type: 'usage',
      amount: -amount,
      description,
      relatedAnalysisId: analysisId,
    });

    return true;
  }

  async addCredits(userId: number, amount: number, description: string, stripePaymentId?: string): Promise<boolean> {
    const user = await this.getUserById(userId);
    if (!user) return false;

    // Update user credits
    await this.updateUser(userId, { aiCredits: user.aiCredits + amount });

    // Record transaction
    await db.insert(creditTransactions).values({
      userId,
      type: 'purchase',
      amount,
      description,
      stripePaymentId,
    });

    return true;
  }

  async getCreditTransactions(userId: number, limit: number = 50): Promise<CreditTransaction[]> {
    return await db.select().from(creditTransactions)
      .where(eq(creditTransactions.userId, userId))
      .orderBy(desc(creditTransactions.createdAt))
      .limit(limit);
  }

  // Session management methods
  async createSession(userId: number): Promise<UserSession> {
    const sessionId = randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const session = {
      id: sessionId,
      userId,
      expiresAt,
    };

    const result = await db.insert(userSessions).values(session).returning();
    return result[0];
  }

  async getSession(sessionId: string): Promise<UserSession | undefined> {
    const result = await db.select().from(userSessions)
      .where(and(
        eq(userSessions.id, sessionId),
        gt(userSessions.expiresAt, new Date())
      ));
    return result[0];
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const result = await db.delete(userSessions).where(eq(userSessions.id, sessionId));
    return result.rowCount > 0;
  }

  async cleanExpiredSessions(): Promise<void> {
    await db.delete(userSessions)
      .where(gt(new Date(), userSessions.expiresAt));
  }

  // Product optimization tracking methods
  async recordProductOptimization(data: {
    userId: number;
    userStoreId: number;
    shopifyProductId: string;
    optimizationType: 'title' | 'description' | 'pricing' | 'keywords';
    originalValue: string;
    optimizedValue: string;
    creditsUsed: number;
  }): Promise<ProductOptimization> {
    const result = await db.insert(productOptimizations).values(data).returning();
    return result[0];
  }

  async getProductOptimizations(userStoreId: number, optimizationType?: string): Promise<ProductOptimization[]> {
    let query = db.select().from(productOptimizations).where(eq(productOptimizations.userStoreId, userStoreId));
    
    if (optimizationType) {
      query = query.where(eq(productOptimizations.optimizationType, optimizationType as any));
    }
    
    return await query.orderBy(desc(productOptimizations.appliedAt));
  }

  async isProductOptimized(userStoreId: number, shopifyProductId: string, optimizationType: string): Promise<boolean> {
    const result = await db.select()
      .from(productOptimizations)
      .where(
        and(
          eq(productOptimizations.userStoreId, userStoreId),
          eq(productOptimizations.shopifyProductId, shopifyProductId),
          eq(productOptimizations.optimizationType, optimizationType as any)
        )
      )
      .limit(1);
    
    return result.length > 0;
  }
}

export class MemStorage implements IStorage {
  private analyses: Map<number, StoreAnalysis>;
  private users: Map<number, User>;
  private userStores: Map<number, UserStore>;
  private sessions: Map<string, UserSession>;
  private creditTransactions: Map<number, CreditTransaction>;
  private currentId: number;
  private currentUserId: number;
  private currentStoreId: number;
  private currentTransactionId: number;

  constructor() {
    this.analyses = new Map();
    this.users = new Map();
    this.userStores = new Map();
    this.sessions = new Map();
    this.creditTransactions = new Map();
    this.currentId = 1;
    this.currentUserId = 1;
    this.currentStoreId = 1;
    this.currentTransactionId = 1;
  }

  // Store analysis methods
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

  async getUserAnalyses(userId: number, limit: number = 20): Promise<StoreAnalysis[]> {
    const userAnalyses = Array.from(this.analyses.values())
      .filter(analysis => analysis.userId === userId);
    return userAnalyses
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  // User management methods
  async createUser(userData: Omit<InsertUser, 'id' | 'createdAt' | 'updatedAt'>): Promise<User> {
    const hashedPassword = await bcrypt.hash(userData.passwordHash, 12);
    const user: User = {
      ...userData,
      id: this.currentUserId++,
      passwordHash: hashedPassword,
      isAdmin: false,
      aiCredits: 25,
      stripeCustomerId: null,
      subscriptionStatus: 'trial',
      subscriptionId: null,
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.users.set(user.id, user);
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.email === email);
  }

  async getUserById(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;

    const updatedUser = { ...user, ...updates, updatedAt: new Date() };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async validateUserCredentials(email: string, password: string): Promise<User | null> {
    const user = await this.getUserByEmail(email);
    if (!user) return null;
    
    const isValid = await bcrypt.compare(password, user.passwordHash);
    return isValid ? user : null;
  }

  // User stores methods
  async createUserStore(storeData: Omit<InsertUserStore, 'id' | 'createdAt' | 'updatedAt'>): Promise<UserStore> {
    const store: UserStore = {
      ...storeData,
      id: this.currentStoreId++,
      shopifyAccessToken: null,
      isConnected: false,
      lastAnalyzedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.userStores.set(store.id, store);
    return store;
  }

  async getUserStores(userId: number): Promise<UserStore[]> {
    return Array.from(this.userStores.values())
      .filter(store => store.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getUserStore(id: number): Promise<UserStore | undefined> {
    return this.userStores.get(id);
  }

  async updateUserStore(id: number, updates: Partial<UserStore>): Promise<UserStore | undefined> {
    const store = this.userStores.get(id);
    if (!store) return undefined;

    const updatedStore = { ...store, ...updates, updatedAt: new Date() };
    this.userStores.set(id, updatedStore);
    return updatedStore;
  }

  async deleteUserStore(id: number): Promise<boolean> {
    return this.userStores.delete(id);
  }

  // Credit management methods
  async getUserCredits(userId: number): Promise<number> {
    const user = await this.getUserById(userId);
    return user?.aiCredits || 0;
  }

  async deductCredits(userId: number, amount: number, description: string, analysisId?: number): Promise<boolean> {
    const user = await this.getUserById(userId);
    if (!user || user.aiCredits < amount) return false;

    await this.updateUser(userId, { aiCredits: user.aiCredits - amount });

    const transaction: CreditTransaction = {
      id: this.currentTransactionId++,
      userId,
      type: 'usage',
      amount: -amount,
      description,
      stripePaymentId: null,
      relatedAnalysisId: analysisId || null,
      createdAt: new Date(),
    };

    this.creditTransactions.set(transaction.id, transaction);
    return true;
  }

  async addCredits(userId: number, amount: number, description: string, stripePaymentId?: string): Promise<boolean> {
    const user = await this.getUserById(userId);
    if (!user) return false;

    await this.updateUser(userId, { aiCredits: user.aiCredits + amount });

    const transaction: CreditTransaction = {
      id: this.currentTransactionId++,
      userId,
      type: 'purchase',
      amount,
      description,
      stripePaymentId: stripePaymentId || null,
      relatedAnalysisId: null,
      createdAt: new Date(),
    };

    this.creditTransactions.set(transaction.id, transaction);
    return true;
  }

  async getCreditTransactions(userId: number, limit: number = 50): Promise<CreditTransaction[]> {
    return Array.from(this.creditTransactions.values())
      .filter(transaction => transaction.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  // Session management methods
  async createSession(userId: number): Promise<UserSession> {
    const sessionId = randomUUID();
    const session: UserSession = {
      id: sessionId,
      userId,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      createdAt: new Date(),
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  async getSession(sessionId: string): Promise<UserSession | undefined> {
    const session = this.sessions.get(sessionId);
    if (!session || session.expiresAt < new Date()) {
      this.sessions.delete(sessionId);
      return undefined;
    }
    return session;
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    return this.sessions.delete(sessionId);
  }

  async cleanExpiredSessions(): Promise<void> {
    const now = new Date();
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.expiresAt < now) {
        this.sessions.delete(sessionId);
      }
    }
  }

  // Product optimization tracking methods (stub implementation for memory storage)
  async recordProductOptimization(data: {
    userId: number;
    userStoreId: number;
    shopifyProductId: string;
    optimizationType: 'title' | 'description' | 'pricing' | 'keywords';
    originalValue: string;
    optimizedValue: string;
    creditsUsed: number;
  }): Promise<ProductOptimization> {
    // Stub implementation for memory storage
    return {
      id: Math.floor(Math.random() * 10000),
      ...data,
      appliedAt: new Date(),
    };
  }

  async getProductOptimizations(userStoreId: number, optimizationType?: string): Promise<ProductOptimization[]> {
    // Stub implementation for memory storage
    return [];
  }

  async isProductOptimized(userStoreId: number, shopifyProductId: string, optimizationType: string): Promise<boolean> {
    // Stub implementation for memory storage - always return false so optimizations can be applied
    return false;
  }
}

// Use database storage if available, otherwise fallback to memory storage
console.log('Debug - Storage initialization - db available:', !!db);

let storage: IStorage;
try {
  // Try to initialize database storage
  if (db) {
    storage = new DatabaseStorage();
    console.log('Debug - Using DatabaseStorage');
  } else {
    storage = new MemStorage();
    console.log('Debug - Using MemStorage (fallback)');
  }
} catch (error) {
  console.error('Debug - Database storage failed, falling back to memory storage:', error);
  storage = new MemStorage();
  console.log('Debug - Using MemStorage (error fallback)');
}

export { storage };