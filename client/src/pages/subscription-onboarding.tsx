
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadStripe, StripeElementsOptions } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, CreditCard, Clock, Shield } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/useAuth';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '');

interface SubscriptionPlan {
  id: number;
  name: string;
  description: string;
  price: number;
  currency: string;
  interval: string;
  aiCreditsIncluded: number;
  maxStores: number;
  features: string[];
  trialDays: number;
}

function SubscriptionForm({ selectedPlan }: { selectedPlan: SubscriptionPlan }) {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [isProcessing, setIsProcessing] = useState(false);

  const createSubscriptionMutation = useMutation({
    mutationFn: async ({ planId, paymentMethodId }: { planId: number; paymentMethodId: string }) => {
      const response = await apiRequest('/api/subscription', {
        method: 'POST',
        body: JSON.stringify({ planId, paymentMethodId }),
      });
      if (!response.ok) throw new Error('Failed to create subscription');
      return response.json();
    },
    onSuccess: (data) => {
      if (data.status === 'trialing' || data.status === 'active') {
        toast({
          title: "Subscription Created!",
          description: `Welcome to ${selectedPlan.name}! Your ${selectedPlan.trialDays}-day trial has started.`,
        });
        navigate('/dashboard');
      }
    },
    onError: (error) => {
      toast({
        title: "Subscription Failed",
        description: "There was an error creating your subscription. Please try again.",
        variant: "destructive",
      });
    }
  });

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsProcessing(true);

    if (!stripe || !elements) {
      setIsProcessing(false);
      return;
    }

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
      setIsProcessing(false);
      return;
    }

    try {
      // Create payment method
      const { error, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardElement,
      });

      if (error) {
        toast({
          title: "Payment Error",
          description: error.message,
          variant: "destructive",
        });
        setIsProcessing(false);
        return;
      }

      // Create subscription
      await createSubscriptionMutation.mutateAsync({
        planId: selectedPlan.id,
        paymentMethodId: paymentMethod.id,
      });

    } catch (error) {
      console.error('Subscription error:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="p-4 border rounded-lg bg-gray-50">
        <h3 className="font-semibold mb-2">Payment Information</h3>
        <CardElement
          options={{
            style: {
              base: {
                fontSize: '16px',
                color: '#424770',
                '::placeholder': {
                  color: '#aab7c4',
                },
              },
            },
          }}
        />
      </div>

      <div className="flex items-center space-x-2 text-sm text-gray-600">
        <Shield className="h-4 w-4" />
        <span>Your payment information is secure and encrypted</span>
      </div>

      <Button 
        type="submit" 
        disabled={!stripe || isProcessing}
        className="w-full"
        size="lg"
      >
        {isProcessing ? (
          "Processing..."
        ) : (
          `Start ${selectedPlan.trialDays}-Day Free Trial`
        )}
      </Button>

      <p className="text-xs text-gray-500 text-center">
        No charge for {selectedPlan.trialDays} days. Cancel anytime during trial period.
        After trial, you'll be charged ${(selectedPlan.price / 100).toFixed(2)} per {selectedPlan.interval}.
      </p>
    </form>
  );
}

export default function SubscriptionOnboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);

  const { data: plans = [] } = useQuery<SubscriptionPlan[]>({
    queryKey: ['/api/subscription/plans'],
  });

  const selectedPlan = plans.find(plan => plan.id === selectedPlanId);

  useEffect(() => {
    if (!user) {
      navigate('/');
    }
  }, [user, navigate]);

  if (!user) return null;

  const elementsOptions: StripeElementsOptions = {
    appearance: {
      theme: 'stripe',
    },
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Choose Your Plan
          </h1>
          <p className="text-gray-600">
            Start with a {plans[0]?.trialDays || 7}-day free trial. No commitment required.
          </p>
        </div>

        {!selectedPlan ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {plans.map((plan) => (
              <Card 
                key={plan.id} 
                className={`relative cursor-pointer transition-all hover:shadow-lg ${
                  plan.name.toLowerCase().includes('pro') ? 'border-blue-500 border-2' : ''
                }`}
                onClick={() => setSelectedPlanId(plan.id)}
              >
                {plan.name.toLowerCase().includes('pro') && (
                  <Badge className="absolute -top-2 left-1/2 transform -translate-x-1/2 bg-blue-500">
                    Most Popular
                  </Badge>
                )}
                
                <CardHeader className="text-center">
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <CardDescription>{plan.description}</CardDescription>
                  <div className="mt-4">
                    <span className="text-3xl font-bold">
                      ${(plan.price / 100).toFixed(0)}
                    </span>
                    <span className="text-gray-600">/{plan.interval}</span>
                  </div>
                </CardHeader>

                <CardContent>
                  <ul className="space-y-3">
                    <li className="flex items-center space-x-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span>{plan.aiCreditsIncluded} AI credits per month</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span>Up to {plan.maxStores} stores</span>
                    </li>
                    {plan.features.map((feature, index) => (
                      <li key={index} className="flex items-center space-x-2">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <span>{feature}</span>
                      </li>
                    ))}
                    <li className="flex items-center space-x-2">
                      <Clock className="h-4 w-4 text-blue-500" />
                      <span>{plan.trialDays}-day free trial</span>
                    </li>
                  </ul>

                  <Button className="w-full mt-6" size="lg">
                    Select Plan
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="max-w-2xl mx-auto">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Complete Your Subscription</CardTitle>
                    <CardDescription>
                      You've selected the {selectedPlan.name} plan
                    </CardDescription>
                  </div>
                  <Button 
                    variant="outline" 
                    onClick={() => setSelectedPlanId(null)}
                  >
                    Change Plan
                  </Button>
                </div>
              </CardHeader>

              <CardContent>
                <div className="mb-6 p-4 bg-blue-50 rounded-lg">
                  <div className="flex items-center space-x-2 mb-2">
                    <CreditCard className="h-5 w-5 text-blue-600" />
                    <span className="font-semibold">{selectedPlan.name}</span>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">
                    ${(selectedPlan.price / 100).toFixed(2)} per {selectedPlan.interval}
                  </p>
                  <p className="text-sm text-blue-600 font-medium">
                    {selectedPlan.trialDays}-day free trial included
                  </p>
                </div>

                <Elements stripe={stripePromise} options={elementsOptions}>
                  <SubscriptionForm selectedPlan={selectedPlan} />
                </Elements>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
