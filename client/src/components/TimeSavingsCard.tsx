import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, TrendingUp, Zap } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

interface TimeSavingsData {
  timePerProduct: string;
  totalTimeSaved: string;
  breakdown: {
    research: string;
    creation: string;
    review: string;
    implementation: string;
  };
  efficiency: string;
}

interface TimeSavingsCardProps {
  optimizationType: string;
  productCount: number;
  productData?: any;
  className?: string;
}

export function TimeSavingsCard({ 
  optimizationType, 
  productCount, 
  productData,
  className = ""
}: TimeSavingsCardProps) {
  const [timeSavings, setTimeSavings] = useState<TimeSavingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const calculateTimeSavings = async () => {
      try {
        setLoading(true);
        setError(null);

        const data = await apiRequest('POST', '/api/calculate-time-savings', {
          optimizationType,
          productData,
          bulkCount: productCount
        });

        setTimeSavings(data);
      } catch (err) {
        console.error('Error calculating time savings:', err);
        setError('Unable to calculate time savings');
      } finally {
        setLoading(false);
      }
    };

    if (productCount > 0) {
      calculateTimeSavings();
    } else {
      setLoading(false);
    }
  }, [optimizationType, productCount, productData]);

  if (loading) {
    return (
      <Card className={`border-blue-200 bg-blue-50/50 ${className}`}>
        <CardHeader className="pb-3">
          <div className="flex items-center space-x-2">
            <Clock className="h-4 w-4 text-blue-600 animate-pulse" />
            <CardTitle className="text-sm text-blue-700">Calculating Time Savings...</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse">
            <div className="h-4 bg-blue-200 rounded mb-2"></div>
            <div className="h-3 bg-blue-100 rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !timeSavings) {
    return (
      <Card className={`border-gray-200 bg-gray-50/50 ${className}`}>
        <CardHeader className="pb-3">
          <div className="flex items-center space-x-2">
            <Clock className="h-4 w-4 text-gray-500" />
            <CardTitle className="text-sm text-gray-600">Time Savings</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-gray-500">
            {error || 'Time savings calculation unavailable'}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`border-green-200 bg-green-50/50 ${className}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Zap className="h-4 w-4 text-green-600" />
            <CardTitle className="text-sm text-green-700">AI Time Savings</CardTitle>
          </div>
          <Badge variant="secondary" className="bg-green-100 text-green-700 border-green-200">
            <TrendingUp className="h-3 w-3 mr-1" />
            {timeSavings.efficiency}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-gray-600">Per Product:</span>
            <div className="font-semibold text-green-700">{timeSavings.timePerProduct}</div>
          </div>
          <div>
            <span className="text-gray-600">Total Saved:</span>
            <div className="font-semibold text-green-700">{timeSavings.totalTimeSaved}</div>
          </div>
        </div>
        
        <div className="space-y-1">
          <div className="text-xs text-gray-600 font-medium">Breakdown:</div>
          <div className="grid grid-cols-2 gap-1 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-500">Research:</span>
              <span className="text-green-600">{timeSavings.breakdown.research}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Creation:</span>
              <span className="text-green-600">{timeSavings.breakdown.creation}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Review:</span>
              <span className="text-green-600">{timeSavings.breakdown.review}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Implementation:</span>
              <span className="text-green-600">{timeSavings.breakdown.implementation}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}