import { useParams } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Calendar, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';
import DashboardLayout from '@/components/DashboardLayout';
import NewResultsSection from '@/components/NewResultsSection';
import { format } from 'date-fns';

export default function AnalysisDetail() {
  const params = useParams();
  const analysisId = params.id;

  const { data: analysis, isLoading, error } = useQuery({
    queryKey: [`/api/analysis/${analysisId}`],
    enabled: !!analysisId,
  });

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/4"></div>
            <div className="space-y-3">
              <div className="h-64 bg-gray-200 rounded"></div>
              <div className="h-64 bg-gray-200 rounded"></div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !analysis) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Analysis Not Found</h2>
            <p className="text-gray-600 mb-4">
              The analysis you're looking for doesn't exist or has been removed.
            </p>
            <Link href="/dashboard/analysis">
              <Button>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Analysis
              </Button>
            </Link>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <Link href="/dashboard/analysis">
              <Button variant="outline">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Analysis
              </Button>
            </Link>
            <div className="flex items-center space-x-4">
              <div className="flex items-center text-sm text-gray-500">
                <Calendar className="mr-1 h-4 w-4" />
                {format(new Date(analysis.createdAt), 'MMM dd, yyyy')}
              </div>
              {analysis.storeType === 'shopify' && (
                <Button variant="outline" size="sm" asChild>
                  <a href={analysis.storeUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Visit Store
                  </a>
                </Button>
              )}
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">
            {analysis.storeType === 'shopify' ? analysis.storeUrl : `eBay: ${analysis.ebayUsername}`}
          </h1>
        </div>

        <NewResultsSection analysisResult={analysis} />
      </div>
    </DashboardLayout>
  );
}