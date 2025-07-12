import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, Zap, Star, CheckCircle } from "lucide-react";

interface CreditPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CreditPurchaseModal({ isOpen, onClose }: CreditPurchaseModalProps) {
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  const packages = [
    {
      id: 'starter',
      name: 'Starter Pack',
      credits: 50,
      price: 9,
      pricePerCredit: 0.18,
      popular: false,
      features: ['50 AI analysis credits', 'Store performance tracking', 'Basic recommendations']
    },
    {
      id: 'growth',
      name: 'Growth Pack',
      credits: 150,
      price: 19,
      pricePerCredit: 0.13,
      popular: true,
      features: ['150 AI analysis credits', 'Advanced analytics', 'Priority recommendations', 'Competitor insights']
    },
    {
      id: 'professional',
      name: 'Professional Pack',
      credits: 500,
      price: 39,
      pricePerCredit: 0.08,
      popular: false,
      features: ['500 AI analysis credits', 'Enterprise analytics', 'Custom reports', 'API access', 'Priority support']
    }
  ];

  const handlePurchase = async (packageId: string) => {
    setIsProcessing(true);
    setSelectedPackage(packageId);
    
    try {
      // In a real implementation, this would integrate with Stripe
      // For now, we'll just show a message
      toast({
        title: "Payment Integration Coming Soon",
        description: "Stripe payment integration will be available once configured with API keys.",
      });
    } catch (error) {
      toast({
        title: "Payment Error",
        description: "Failed to process payment. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
      setSelectedPackage(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Zap className="h-5 w-5" />
            <span>Purchase AI Credits</span>
          </DialogTitle>
        </DialogHeader>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {packages.map((pkg) => (
            <Card 
              key={pkg.id} 
              className={`relative cursor-pointer transition-all hover:shadow-lg ${
                pkg.popular ? 'ring-2 ring-blue-500' : ''
              }`}
            >
              {pkg.popular && (
                <Badge className="absolute -top-2 left-1/2 transform -translate-x-1/2 bg-blue-500">
                  <Star className="h-3 w-3 mr-1" />
                  Most Popular
                </Badge>
              )}
              
              <CardHeader className="text-center">
                <CardTitle className="text-lg">{pkg.name}</CardTitle>
                <CardDescription>
                  <div className="text-3xl font-bold text-blue-600">${pkg.price}</div>
                  <div className="text-sm text-muted-foreground">
                    ${pkg.pricePerCredit.toFixed(2)} per credit
                  </div>
                </CardDescription>
              </CardHeader>
              
              <CardContent className="space-y-4">
                <div className="text-center">
                  <div className="text-2xl font-bold">{pkg.credits}</div>
                  <div className="text-sm text-muted-foreground">AI Credits</div>
                </div>
                
                <ul className="space-y-2">
                  {pkg.features.map((feature, index) => (
                    <li key={index} className="flex items-center text-sm">
                      <CheckCircle className="h-4 w-4 text-green-500 mr-2 flex-shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
                
                <Button 
                  className="w-full" 
                  onClick={() => handlePurchase(pkg.id)}
                  disabled={isProcessing && selectedPackage === pkg.id}
                  variant={pkg.popular ? "default" : "outline"}
                >
                  {isProcessing && selectedPackage === pkg.id ? (
                    "Processing..."
                  ) : (
                    <>
                      <CreditCard className="h-4 w-4 mr-2" />
                      Purchase Credits
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
        
        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-medium mb-2">Why AI Credits?</h4>
          <p className="text-sm text-muted-foreground">
            Each store analysis uses advanced AI to provide comprehensive insights across 6 key categories. 
            Credits ensure fair usage and help us maintain the quality of our AI-powered analysis engine.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}