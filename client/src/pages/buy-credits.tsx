import { useState } from 'react';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, CreditCard, Zap, Star, Crown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import DashboardLayout from '@/components/DashboardLayout';

// Initialize Stripe
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY!);

const CREDIT_PACKAGES = [
  {
    id: 'starter',
    name: 'Starter Pack',
    credits: 50,
    price: 9.00,
    originalPrice: 12.50,
    popular: false,
    icon: CreditCard,
    description: 'Perfect for trying out AI optimization',
    features: [
      '50 AI optimization credits',
      'Product title optimization',
      'Basic recommendations',
      'Store analysis reports'
    ]
  },
  {
    id: 'growth',
    name: 'Growth Pack',
    credits: 150,
    price: 19.00,
    originalPrice: 37.50,
    popular: true,
    icon: Zap,
    description: 'Best value for growing stores',
    features: [
      '150 AI optimization credits',
      'All optimization types',
      'Bulk product updates',
      'Priority recommendations',
      'Advanced analytics'
    ]
  },
  {
    id: 'professional',
    name: 'Professional Pack',
    credits: 500,
    price: 39.00,
    originalPrice: 125.00,
    popular: false,
    icon: Crown,
    description: 'For serious e-commerce businesses',
    features: [
      '500 AI optimization credits',
      'Unlimited store connections',
      'Advanced AI recommendations',
      'Custom optimization strategies',
      'White-label reports',
      'Priority support'
    ]
  }
];

interface CheckoutFormProps {
  selectedPackage: typeof CREDIT_PACKAGES[0];
  onSuccess: () => void;
}

function CheckoutForm({ selectedPackage, onSuccess }: CheckoutFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);

  const createPaymentIntent = useMutation({
    mutationFn: async (packageType: string) => {
      const response = await apiRequest('POST', '/api/payments/credits', { package: packageType });
      return response.json();
    }
  });

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);

    try {
      // Create payment intent
      const { clientSecret } = await createPaymentIntent.mutateAsync(selectedPackage.id);

      const cardElement = elements.getElement(CardElement);
      if (!cardElement) {
        throw new Error('Card element not found');
      }

      // Confirm payment
      const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: cardElement,
        }
      });

      if (error) {
        toast({
          title: "Payment Failed",
          description: error.message,
          variant: "destructive",
        });
      } else if (paymentIntent?.status === 'succeeded') {
        toast({
          title: "Payment Successful!",
          description: `${selectedPackage.credits} credits have been added to your account.`,
        });
        onSuccess();
      }
    } catch (error: any) {
      toast({
        title: "Payment Failed",
        description: error.message || "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="p-4 border rounded-lg">
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
      
      <Button 
        type="submit" 
        disabled={!stripe || isProcessing}
        className="w-full"
        size="lg"
      >
        {isProcessing ? (
          "Processing..."
        ) : (
          `Pay $${selectedPackage.price.toFixed(2)} for ${selectedPackage.credits} Credits`
        )}
      </Button>
    </form>
  );
}

export default function BuyCredits() {
  const [selectedPackage, setSelectedPackage] = useState<typeof CREDIT_PACKAGES[0] | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get current user credits
  const { data: creditsData } = useQuery({
    queryKey: ['/api/credits'],
  });

  const handleSuccess = () => {
    // Refresh credits data
    queryClient.invalidateQueries({ queryKey: ['/api/credits'] });
    queryClient.invalidateQueries({ queryKey: ['/api/credits/transactions'] });
    setSelectedPackage(null);
  };

  if (selectedPackage) {
    return (
      <DashboardLayout>
        <div className="max-w-2xl mx-auto p-6">
          <div className="mb-6">
            <Button 
              variant="ghost" 
              onClick={() => setSelectedPackage(null)}
              className="mb-4"
            >
              ← Back to Packages
            </Button>
            <h1 className="text-3xl font-bold">Complete Your Purchase</h1>
            <p className="text-gray-600 mt-2">
              You're purchasing the {selectedPackage.name} for ${selectedPackage.price.toFixed(2)}
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Package Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <selectedPackage.icon className="h-5 w-5" />
                  {selectedPackage.name}
                </CardTitle>
                <CardDescription>{selectedPackage.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between text-lg font-semibold">
                    <span>{selectedPackage.credits} Credits</span>
                    <span>${selectedPackage.price.toFixed(2)}</span>
                  </div>
                  {selectedPackage.originalPrice > selectedPackage.price && (
                    <div className="text-sm text-gray-500">
                      <span className="line-through">${selectedPackage.originalPrice.toFixed(2)}</span>
                      <span className="ml-2 text-green-600 font-medium">
                        Save ${(selectedPackage.originalPrice - selectedPackage.price).toFixed(2)}
                      </span>
                    </div>
                  )}
                  <div className="pt-3 space-y-2">
                    {selectedPackage.features.map((feature, index) => (
                      <div key={index} className="flex items-center gap-2 text-sm">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        {feature}
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Payment Form */}
            <Card>
              <CardHeader>
                <CardTitle>Payment Details</CardTitle>
                <CardDescription>
                  Enter your card information to complete the purchase
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Elements stripe={stripePromise}>
                  <CheckoutForm 
                    selectedPackage={selectedPackage}
                    onSuccess={handleSuccess}
                  />
                </Elements>
              </CardContent>
            </Card>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto p-6">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4">Purchase AI Credits</h1>
          <p className="text-xl text-gray-600 mb-2">
            Power your store optimization with AI credits
          </p>
          <p className="text-gray-500">
            Current balance: <span className="font-semibold text-blue-600">
              {creditsData?.credits || 0} credits
            </span>
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {CREDIT_PACKAGES.map((pkg) => (
            <Card 
              key={pkg.id}
              className={`relative transition-all duration-200 hover:shadow-lg cursor-pointer ${
                pkg.popular ? 'ring-2 ring-blue-500 scale-105' : 'hover:scale-105'
              }`}
              onClick={() => setSelectedPackage(pkg)}
            >
              {pkg.popular && (
                <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-blue-500">
                  Most Popular
                </Badge>
              )}
              
              <CardHeader className="text-center">
                <div className="mx-auto mb-2 p-3 bg-gray-100 rounded-full w-fit">
                  <pkg.icon className="h-8 w-8 text-gray-700" />
                </div>
                <CardTitle className="text-2xl">{pkg.name}</CardTitle>
                <CardDescription>{pkg.description}</CardDescription>
              </CardHeader>
              
              <CardContent className="text-center">
                <div className="mb-4">
                  <div className="text-4xl font-bold text-blue-600">
                    {pkg.credits}
                  </div>
                  <div className="text-gray-500">AI Credits</div>
                </div>
                
                <div className="mb-4">
                  <div className="text-3xl font-bold">
                    ${pkg.price.toFixed(2)}
                  </div>
                  {pkg.originalPrice > pkg.price && (
                    <div className="text-sm text-gray-500">
                      <span className="line-through">${pkg.originalPrice.toFixed(2)}</span>
                      <span className="ml-2 text-green-600 font-medium">
                        {Math.round(((pkg.originalPrice - pkg.price) / pkg.originalPrice) * 100)}% off
                      </span>
                    </div>
                  )}
                  <div className="text-gray-500 text-sm">
                    ${(pkg.price / pkg.credits).toFixed(3)} per credit
                  </div>
                </div>
                
                <div className="space-y-2 mb-6 text-left">
                  {pkg.features.map((feature, index) => (
                    <div key={index} className="flex items-center gap-2 text-sm">
                      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                      {feature}
                    </div>
                  ))}
                </div>
                
                <Button 
                  className="w-full"
                  variant={pkg.popular ? "default" : "outline"}
                  size="lg"
                >
                  Choose {pkg.name}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-12 text-center">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl font-bold mb-4">How AI Credits Work</h2>
            <div className="grid md:grid-cols-3 gap-6 text-left">
              <div className="p-4 bg-gray-50 rounded-lg">
                <h3 className="font-semibold mb-2">1 Credit = 1 Optimization</h3>
                <p className="text-sm text-gray-600">
                  Each AI-powered optimization (title, description, pricing, etc.) uses 1 credit
                </p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <h3 className="font-semibold mb-2">Instant Results</h3>
                <p className="text-sm text-gray-600">
                  Credits are applied immediately and optimizations happen in real-time
                </p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <h3 className="font-semibold mb-2">Never Expire</h3>
                <p className="text-sm text-gray-600">
                  Your credits never expire and can be used whenever you need them
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}