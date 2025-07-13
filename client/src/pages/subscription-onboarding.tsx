import { useState } from 'react';
import { useLocation } from 'wouter';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Check, CreditCard, Shield, Users, Zap } from "lucide-react";

if (!import.meta.env.VITE_STRIPE_PUBLIC_KEY) {
  throw new Error('Missing required Stripe key: VITE_STRIPE_PUBLIC_KEY');
}

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      color: '#424770',
      fontFamily: '"Helvetica Neue", Helvetica, sans-serif',
      fontSmoothing: 'antialiased',
      fontSize: '16px',
      '::placeholder': {
        color: '#aab7c4'
      }
    },
    invalid: {
      color: '#9e2146',
      iconColor: '#fa755a'
    }
  }
};

function TrialSignupForm() {
  const stripe = useStripe();
  const elements = useElements();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
  });

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);

    if (!stripe || !elements) {
      toast({
        title: "Payment Error",
        description: "Payment system not loaded. Please refresh and try again.",
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    const cardElement = elements.getElement(CardElement);
    
    if (!cardElement) {
      toast({
        title: "Payment Error", 
        description: "Please enter your payment information.",
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    try {
      // Create payment method
      const { error: createError, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardElement,
        billing_details: {
          name: `${formData.firstName} ${formData.lastName}`,
        },
      });

      if (createError) {
        throw new Error(createError.message);
      }

      // Start trial with the payment method
      const response = await apiRequest('POST', '/api/subscription/trial', {
        paymentMethodId: paymentMethod.id,
        firstName: formData.firstName,
        lastName: formData.lastName,
      });

      toast({
        title: "Trial Started!",
        description: "Your 7-day free trial has begun. Welcome to StoreScore!",
      });

      // Redirect to dashboard
      setLocation('/dashboard');
      
    } catch (error: any) {
      console.error('Trial signup error:', error);
      toast({
        title: "Trial Signup Failed",
        description: error.message || "Failed to start trial. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="firstName">First Name</Label>
          <Input
            id="firstName"
            value={formData.firstName}
            onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
            required
          />
        </div>
        <div>
          <Label htmlFor="lastName">Last Name</Label>
          <Input
            id="lastName"
            value={formData.lastName}
            onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
            required
          />
        </div>
      </div>

      <div>
        <Label htmlFor="card">Payment Information</Label>
        <div className="mt-2 p-3 border rounded-md">
          <CardElement options={CARD_ELEMENT_OPTIONS} />
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Your card won't be charged during the 7-day free trial
        </p>
      </div>

      <Alert>
        <Shield className="h-4 w-4" />
        <AlertDescription>
          <strong>7-Day Free Trial</strong> - Start your trial now. You'll be billed $49/month after the trial period unless you cancel.
        </AlertDescription>
      </Alert>

      <Button type="submit" disabled={isLoading || !stripe} className="w-full">
        {isLoading ? "Starting Trial..." : "Start 7-Day Free Trial"}
      </Button>
    </form>
  );
}

export default function SubscriptionOnboarding() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full grid md:grid-cols-2 gap-8 items-center">
        
        {/* Left side - Benefits */}
        <div className="space-y-6">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
              Start Your Free Trial
            </h1>
            <p className="text-lg text-gray-600 dark:text-gray-300">
              Get 7 days of unlimited AI-powered store optimization
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <div className="bg-green-100 dark:bg-green-900 p-2 rounded-full">
                <Zap className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">1000 AI Credits Monthly</h3>
                <p className="text-gray-600 dark:text-gray-300">Enough for comprehensive store optimization</p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="bg-blue-100 dark:bg-blue-900 p-2 rounded-full">
                <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">Up to 10 Stores</h3>
                <p className="text-gray-600 dark:text-gray-300">Manage multiple stores from one dashboard</p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="bg-purple-100 dark:bg-purple-900 p-2 rounded-full">
                <Check className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">Full Feature Access</h3>
                <p className="text-gray-600 dark:text-gray-300">Product optimization, SEO, design recommendations & more</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-lg font-semibold text-gray-900 dark:text-white">Professional Plan</span>
              <div className="text-right">
                <div className="text-2xl font-bold text-gray-900 dark:text-white">$49<span className="text-base font-normal">/mo</span></div>
                <div className="text-sm text-green-600 dark:text-green-400">7 days free</div>
              </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Cancel anytime during your trial period
            </p>
          </div>
        </div>

        {/* Right side - Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <CreditCard className="h-5 w-5" />
              <span>Payment Information</span>
            </CardTitle>
            <CardDescription>
              Your card will be securely stored but not charged during the trial period
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Elements stripe={stripePromise}>
              <TrialSignupForm />
            </Elements>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}