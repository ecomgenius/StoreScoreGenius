import { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { User } from "@shared/schema";

declare global {
  namespace Express {
    interface Request {
      user?: User;
      session?: any;
    }
  }
}

export async function authenticateUser(req: Request, res: Response, next: NextFunction) {
  try {
    const sessionId = req.cookies?.sessionId || req.headers.authorization?.replace('Bearer ', '');
    
    if (!sessionId) {
      req.user = undefined;
      return next();
    }

    const session = await storage.getSession(sessionId);
    if (!session || session.expiresAt < new Date()) {
      req.user = undefined;
      return next();
    }

    const user = await storage.getUserById(session.userId);
    if (!user) {
      await storage.deleteSession(sessionId);
      req.user = undefined;
      return next();
    }

    req.user = user;
    req.session = session;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    req.user = undefined;
    next();
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

export function checkCredits(minimumCredits: number = 1) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userCredits = await storage.getUserCredits(req.user.id);
    if (userCredits < minimumCredits) {
      return res.status(402).json({ 
        error: 'Insufficient credits', 
        creditsRequired: minimumCredits,
        creditsAvailable: userCredits
      });
    }
    
    next();
  };
}

export function checkSubscription(req: Request, res: Response, next: NextFunction) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    try {
      const { subscriptionService } = await import('../services/subscriptionService');
      const hasAccess = await subscriptionService.hasFeatureAccess(req.user.id);
      
      if (!hasAccess) {
        return res.status(402).json({ 
          error: 'Active subscription required',
          message: 'Please upgrade your subscription to access this feature'
        });
      }
      
      next();
    } catch (error) {
      console.error('Subscription check error:', error);
      res.status(500).json({ error: 'Failed to verify subscription' });
    }
  };
}