
import Stripe from 'stripe';
import { db } from '../db';
import { users, subscriptionPlans, userSubscriptions } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

if (!stripe) {
  console.warn('Stripe not configured - subscription features will be disabled');
}

export interface CreateSubscriptionResult {
  subscriptionId: string;
  clientSecret?: string;
  status: string;
}

export class SubscriptionService {
  
  // Get all active subscription plans
  async getSubscriptionPlans() {
    return await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.isActive, true));
  }

  // Get a specific plan by ID
  async getSubscriptionPlan(planId: number) {
    const plans = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, planId));
    return plans[0];
  }

  // Create or update a Stripe customer
  async createOrUpdateStripeCustomer(userId: number, paymentMethodId: string) {
    if (!stripe) throw new Error('Stripe not configured');

    const user = await db.select().from(users).where(eq(users.id, userId));
    if (!user[0]) throw new Error('User not found');

    let customerId = user[0].stripeCustomerId;

    if (!customerId) {
      // Create new customer
      const customer = await stripe.customers.create({
        email: user[0].email,
        name: `${user[0].firstName || ''} ${user[0].lastName || ''}`.trim(),
        payment_method: paymentMethodId,
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });
      customerId = customer.id;

      // Update user with customer ID
      await db.update(users)
        .set({ stripeCustomerId: customerId })
        .where(eq(users.id, userId));
    } else {
      // Attach payment method to existing customer
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId,
      });

      // Update default payment method
      await stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });
    }

    return customerId;
  }

  // Create a new subscription with trial
  async createSubscription(userId: number, planId: number, paymentMethodId: string): Promise<CreateSubscriptionResult> {
    if (!stripe) throw new Error('Stripe not configured');

    const plan = await this.getSubscriptionPlan(planId);
    if (!plan) throw new Error('Plan not found');

    // Create or update customer
    const customerId = await this.createOrUpdateStripeCustomer(userId, paymentMethodId);

    // Calculate trial end (7 days from now)
    const trialEnd = Math.floor((Date.now() + (plan.trialDays * 24 * 60 * 60 * 1000)) / 1000);

    // Create subscription
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: plan.stripePriceId }],
      trial_end: trialEnd,
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
    });

    // Store subscription in database
    await db.insert(userSubscriptions).values({
      userId,
      planId,
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: customerId,
      status: subscription.status as any,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      trialStart: subscription.trial_start ? new Date(subscription.trial_start * 1000) : null,
      trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
    });

    const result: CreateSubscriptionResult = {
      subscriptionId: subscription.id,
      status: subscription.status,
    };

    // If payment intent needs confirmation, return client secret
    if (subscription.latest_invoice && typeof subscription.latest_invoice === 'object') {
      const invoice = subscription.latest_invoice as Stripe.Invoice;
      if (invoice.payment_intent && typeof invoice.payment_intent === 'object') {
        const paymentIntent = invoice.payment_intent as Stripe.PaymentIntent;
        if (paymentIntent.client_secret) {
          result.clientSecret = paymentIntent.client_secret;
        }
      }
    }

    return result;
  }

  // Get user's current subscription
  async getUserSubscription(userId: number) {
    const subscriptions = await db.select({
      subscription: userSubscriptions,
      plan: subscriptionPlans,
    }).from(userSubscriptions)
      .leftJoin(subscriptionPlans, eq(userSubscriptions.planId, subscriptionPlans.id))
      .where(eq(userSubscriptions.userId, userId));

    return subscriptions[0] || null;
  }

  // Update subscription (change plan or cancel)
  async updateSubscription(userId: number, updates: { planId?: number; cancelAtPeriodEnd?: boolean }) {
    if (!stripe) throw new Error('Stripe not configured');

    const userSub = await this.getUserSubscription(userId);
    if (!userSub) throw new Error('No active subscription found');

    const subscription = userSub.subscription;

    if (updates.planId && updates.planId !== subscription.planId) {
      // Change plan
      const newPlan = await this.getSubscriptionPlan(updates.planId);
      if (!newPlan) throw new Error('Plan not found');

      const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
      
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        items: [{
          id: stripeSubscription.items.data[0].id,
          price: newPlan.stripePriceId,
        }],
        proration_behavior: 'create_prorations',
      });

      // Update in database
      await db.update(userSubscriptions)
        .set({ planId: updates.planId })
        .where(eq(userSubscriptions.id, subscription.id));
    }

    if (updates.cancelAtPeriodEnd !== undefined) {
      // Update cancellation status
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: updates.cancelAtPeriodEnd,
      });

      await db.update(userSubscriptions)
        .set({ 
          cancelAtPeriodEnd: updates.cancelAtPeriodEnd,
          canceledAt: updates.cancelAtPeriodEnd ? new Date() : null,
        })
        .where(eq(userSubscriptions.id, subscription.id));
    }

    return await this.getUserSubscription(userId);
  }

  // Update payment method
  async updatePaymentMethod(userId: number, paymentMethodId: string) {
    if (!stripe) throw new Error('Stripe not configured');

    const user = await db.select().from(users).where(eq(users.id, userId));
    if (!user[0] || !user[0].stripeCustomerId) {
      throw new Error('Customer not found');
    }

    // Attach new payment method
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: user[0].stripeCustomerId,
    });

    // Update default payment method
    await stripe.customers.update(user[0].stripeCustomerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    return true;
  }

  // Get payment methods for a customer
  async getPaymentMethods(userId: number) {
    if (!stripe) throw new Error('Stripe not configured');

    const user = await db.select().from(users).where(eq(users.id, userId));
    if (!user[0] || !user[0].stripeCustomerId) {
      return [];
    }

    const paymentMethods = await stripe.paymentMethods.list({
      customer: user[0].stripeCustomerId,
      type: 'card',
    });

    return paymentMethods.data;
  }

  // Check if user has access to features
  async hasFeatureAccess(userId: number, feature?: string): Promise<boolean> {
    const userSub = await this.getUserSubscription(userId);
    
    if (!userSub) return false;

    const subscription = userSub.subscription;
    const now = new Date();

    // Check if subscription is active or in trial
    const isActive = subscription.status === 'active' || subscription.status === 'trialing';
    const isNotExpired = subscription.currentPeriodEnd > now;

    return isActive && isNotExpired;
  }

  // Handle Stripe webhook events
  async handleWebhookEvent(event: Stripe.Event) {
    switch (event.type) {
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        const subscription = event.data.object as Stripe.Subscription;
        await this.syncSubscriptionStatus(subscription);
        break;
      
      case 'invoice.payment_succeeded':
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.subscription) {
          await this.handleSuccessfulPayment(invoice);
        }
        break;

      case 'invoice.payment_failed':
        const failedInvoice = event.data.object as Stripe.Invoice;
        if (failedInvoice.subscription) {
          await this.handleFailedPayment(failedInvoice);
        }
        break;
    }
  }

  private async syncSubscriptionStatus(stripeSubscription: Stripe.Subscription) {
    const userSubs = await db.select().from(userSubscriptions)
      .where(eq(userSubscriptions.stripeSubscriptionId, stripeSubscription.id));

    if (userSubs[0]) {
      await db.update(userSubscriptions)
        .set({
          status: stripeSubscription.status as any,
          currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
          currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
          canceledAt: stripeSubscription.canceled_at ? new Date(stripeSubscription.canceled_at * 1000) : null,
          cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
        })
        .where(eq(userSubscriptions.id, userSubs[0].id));
    }
  }

  private async handleSuccessfulPayment(invoice: Stripe.Invoice) {
    // Add credits to user account after successful payment
    const userSubs = await db.select().from(userSubscriptions)
      .where(eq(userSubscriptions.stripeSubscriptionId, invoice.subscription as string));

    if (userSubs[0]) {
      const plan = await this.getSubscriptionPlan(userSubs[0].planId);
      if (plan && plan.aiCreditsIncluded > 0) {
        // Add credits to user account
        await db.update(users)
          .set({ 
            aiCredits: db.raw(`ai_credits + ${plan.aiCreditsIncluded}`)
          })
          .where(eq(users.id, userSubs[0].userId));
      }
    }
  }

  private async handleFailedPayment(invoice: Stripe.Invoice) {
    // Handle failed payment logic (notifications, grace period, etc.)
    console.log('Payment failed for invoice:', invoice.id);
  }
}

export const subscriptionService = new SubscriptionService();
