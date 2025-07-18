import Stripe from "stripe";
import { storage } from "../storage";
import { db } from "../db";
import { userSubscriptions, subscriptionPlans, users } from "@shared/schema";
import { eq, and } from "drizzle-orm";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is required for subscription functionality');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export class SubscriptionService {

  /**
   * Create or get Stripe product and price
   */
  private async ensureStripeProductAndPrice(): Promise<{ productId: string; priceId: string }> {
    try {
      // First check if we already have the product in our database
      const [existingPlan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.name, 'Pro Plan'));
      
      if (existingPlan && existingPlan.stripePriceId && existingPlan.stripeProductId) {
        // Verify the price exists in Stripe
        try {
          await stripe.prices.retrieve(existingPlan.stripePriceId);
          return {
            productId: existingPlan.stripeProductId,
            priceId: existingPlan.stripePriceId
          };
        } catch (error) {
          console.log('Existing price not found in Stripe, creating new one...');
        }
      }

      // Create product in Stripe
      const product = await stripe.products.create({
        name: 'StoreScore Pro Plan',
        description: 'Full access to all StoreScore features with unlimited analysis and optimization tools',
        type: 'service',
      });

      // Create price in Stripe
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: 4900, // $49.00 in cents
        currency: 'usd',
        recurring: {
          interval: 'month',
        },
      });

      // Create the plan in our database without timestamp issues
      const planData = {
        name: 'Pro Plan',
        description: 'Full access to all StoreScore features with unlimited analysis and optimization tools',
        stripeProductId: product.id,
        stripePriceId: price.id,
        price: 4900,
        currency: 'usd',
        interval: 'month' as const,
        aiCreditsIncluded: 0,
        maxStores: 1,
        features: [
          "Unlimited store analysis",
          "AI-powered optimization", 
          "Shopify integration",
          "Bulk optimization tools",
          "Priority support"
        ],
        isActive: true,
        trialDays: 7,
      };

      if (existingPlan) {
        await db.update(subscriptionPlans)
          .set({
            ...planData
          })
          .where(eq(subscriptionPlans.id, existingPlan.id));
      } else {
        await db.insert(subscriptionPlans).values(planData);
      }

      return {
        productId: product.id,
        priceId: price.id
      };
    } catch (error) {
      console.error('Error creating Stripe product/price:', error);
      throw new Error('Failed to setup subscription plan');
    }
  }
  
  /**
   * Start a 7-day free trial with automatic billing after trial ends
   */
  async startTrial(userId: number, paymentMethodId: string): Promise<{
    subscription: any;
    trialEnd: Date;
  }> {
    try {
      // Get user
      const user = await storage.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Check if user already has a subscription
      const existingSub = await this.getUserSubscription(userId);
      if (existingSub) {
        throw new Error('User already has an active subscription');
      }

      // Ensure Stripe product and price exist
      const { priceId } = await this.ensureStripeProductAndPrice();
      
      // Get the updated plan from database
      const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.name, 'Pro Plan'));
      if (!plan) {
        throw new Error('Subscription plan not found');
      }

    // Create or get Stripe customer
    let stripeCustomer;
    if (user.stripeCustomerId) {
      stripeCustomer = await stripe.customers.retrieve(user.stripeCustomerId);
    } else {
      stripeCustomer = await stripe.customers.create({
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
        payment_method: paymentMethodId,
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });

      // Update user with Stripe customer ID
      await storage.updateUser(userId, { stripeCustomerId: stripeCustomer.id });
    }

    // Attach payment method to customer if not already attached
    try {
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: stripeCustomer.id,
      });
    } catch (error: any) {
      if (!error.message.includes('already been attached')) {
        throw error;
      }
    }

    // Create subscription with trial
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 7); // 7 days trial

    const subscription = await stripe.subscriptions.create({
      customer: stripeCustomer.id,
      items: [{ price: priceId }],
      default_payment_method: paymentMethodId,
      trial_end: Math.floor(trialEnd.getTime() / 1000),
      expand: ['latest_invoice.payment_intent'],
    });

    // Log subscription data for debugging
    console.log('Subscription data:', {
      current_period_start: subscription.current_period_start,
      current_period_end: subscription.current_period_end,
      trial_start: subscription.trial_start,
      trial_end: subscription.trial_end,
      status: subscription.status
    });

    // Validate dates before creating Date objects
    const currentPeriodStart = subscription.current_period_start ? new Date(subscription.current_period_start * 1000) : new Date();
    const currentPeriodEnd = subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : new Date();
    const trialStartDate = subscription.trial_start ? new Date(subscription.trial_start * 1000) : null;
    const trialEndDate = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;

    // Validate dates are not invalid
    if (isNaN(currentPeriodStart.getTime()) || isNaN(currentPeriodEnd.getTime())) {
      throw new Error('Invalid subscription period dates from Stripe');
    }

    if (trialStartDate && isNaN(trialStartDate.getTime())) {
      console.warn('Invalid trial start date, setting to null');
      trialStartDate = null;
    }

    if (trialEndDate && isNaN(trialEndDate.getTime())) {
      console.warn('Invalid trial end date, setting to null');
      trialEndDate = null;
    }

    // Store subscription in database
    await db.insert(userSubscriptions).values({
      userId,
      planId: plan.id,
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: stripeCustomer.id,
      status: subscription.status as any,
      currentPeriodStart,
      currentPeriodEnd,
      trialStart: trialStartDate,
      trialEnd: trialEndDate,
    });

    // Update user status
    await storage.updateUser(userId, {
      subscriptionStatus: 'trialing',
      trialEndsAt: trialEnd,
    });

      return {
        subscription,
        trialEnd,
      };
    } catch (error) {
      console.error('Error starting trial:', error);
      throw error;
    }
  }

  /**
   * Check if user has access to the platform
   */
  async checkUserAccess(userId: number): Promise<{
    hasAccess: boolean;
    subscriptionStatus: string;
    trialEndsAt?: Date;
    reason?: string;
  }> {
    const user = await storage.getUserById(userId);
    if (!user) {
      return { hasAccess: false, subscriptionStatus: 'none', reason: 'User not found' };
    }

    // Admin always has access
    if (user.isAdmin) {
      return { hasAccess: true, subscriptionStatus: 'active' };
    }

    const subscription = await this.getUserSubscription(userId);
    const now = new Date();

    // Check if user is in trial period
    if (user.subscriptionStatus === 'trialing' && user.trialEndsAt && user.trialEndsAt > now) {
      return {
        hasAccess: true,
        subscriptionStatus: 'trialing',
        trialEndsAt: user.trialEndsAt,
      };
    }

    // Check if user has active subscription
    if (subscription && (subscription.status === 'active' || subscription.status === 'trialing')) {
      return {
        hasAccess: true,
        subscriptionStatus: subscription.status,
      };
    }

    // No access - user needs to subscribe
    return {
      hasAccess: false,
      subscriptionStatus: user.subscriptionStatus || 'none',
      reason: 'Subscription required',
    };
  }

  /**
   * Cancel subscription at period end
   */
  async cancelSubscription(userId: number): Promise<void> {
    const subscription = await this.getUserSubscription(userId);
    if (!subscription) {
      throw new Error('No active subscription found');
    }

    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    await db.update(userSubscriptions)
      .set({ cancelAtPeriodEnd: true })
      .where(eq(userSubscriptions.id, subscription.id));
  }

  /**
   * Reactivate subscription
   */
  async reactivateSubscription(userId: number): Promise<void> {
    const subscription = await this.getUserSubscription(userId);
    if (!subscription) {
      throw new Error('No subscription found');
    }

    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: false,
    });

    await db.update(userSubscriptions)
      .set({ cancelAtPeriodEnd: false })
      .where(eq(userSubscriptions.id, subscription.id));
  }

  /**
   * Get user's subscription
   */
  async getUserSubscription(userId: number) {
    const [subscription] = await db
      .select()
      .from(userSubscriptions)
      .where(eq(userSubscriptions.userId, userId))
      .orderBy(userSubscriptions.createdAt);

    return subscription || null;
  }

  /**
   * Handle Stripe webhook events
   */
  async handleWebhookEvent(event: Stripe.Event): Promise<void> {
    console.log(`Processing Stripe webhook: ${event.type}`);

    switch (event.type) {
      case 'invoice.payment_succeeded':
        await this.handlePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;
      case 'invoice.payment_failed':
        await this.handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.trial_will_end':
        await this.handleTrialWillEnd(event.data.object as Stripe.Subscription);
        break;
    }
  }

  private async handlePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
    if (!invoice.subscription) return;

    // Find user subscription
    const [userSub] = await db
      .select()
      .from(userSubscriptions)
      .where(eq(userSubscriptions.stripeSubscriptionId, invoice.subscription as string));

    if (userSub) {
      // Update user status to active
      await storage.updateUser(userSub.userId, { subscriptionStatus: 'active' });

      // Add monthly credits
      const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, userSub.planId));
      if (plan) {
        await storage.addCredits(
          userSub.userId,
          plan.aiCreditsIncluded,
          `Monthly credits - ${plan.name}`,
          invoice.payment_intent as string
        );
      }
    }
  }

  private async handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    if (!invoice.subscription) return;

    const [userSub] = await db
      .select()
      .from(userSubscriptions)
      .where(eq(userSubscriptions.stripeSubscriptionId, invoice.subscription as string));

    if (userSub) {
      await storage.updateUser(userSub.userId, { subscriptionStatus: 'past_due' });
    }
  }

  private async handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
    const [userSub] = await db
      .select()
      .from(userSubscriptions)
      .where(eq(userSubscriptions.stripeSubscriptionId, subscription.id));

    if (userSub) {
      await db.update(userSubscriptions)
        .set({
          status: subscription.status as any,
          currentPeriodStart: new Date(subscription.current_period_start * 1000),
          currentPeriodEnd: new Date(subscription.current_period_end * 1000),
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
        })
        .where(eq(userSubscriptions.id, userSub.id));

      await storage.updateUser(userSub.userId, { subscriptionStatus: subscription.status as any });
    }
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    const [userSub] = await db
      .select()
      .from(userSubscriptions)
      .where(eq(userSubscriptions.stripeSubscriptionId, subscription.id));

    if (userSub) {
      await db.update(userSubscriptions)
        .set({ status: 'canceled', canceledAt: new Date() })
        .where(eq(userSubscriptions.id, userSub.id));

      await storage.updateUser(userSub.userId, { subscriptionStatus: 'canceled' });
    }
  }

  private async handleTrialWillEnd(subscription: Stripe.Subscription): Promise<void> {
    // Could send notification email here
    console.log(`Trial ending soon for subscription: ${subscription.id}`);
  }

  /**
   * Get available subscription plans
   */
  async getPlans() {
    return await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.isActive, true));
  }
}

export const subscriptionService = new SubscriptionService();