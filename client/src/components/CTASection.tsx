import { RotateCcw, Bot, BarChart3 } from "lucide-react";

export default function CTASection() {
  return (
    <section className="bg-gradient-to-r from-primary to-blue-700 text-white py-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-3xl md:text-4xl font-bold mb-6">Ready to Transform Your Store?</h2>
        <p className="text-xl mb-8 text-blue-100 max-w-2xl mx-auto">
          Unlock the full potential of your store with our Pro version. Get real-time improvements, detailed reports, and automated optimizations.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
          <div className="text-center">
            <div className="w-16 h-16 bg-white bg-opacity-20 rounded-full flex items-center justify-center mx-auto mb-4">
              <RotateCcw className="text-white text-xl" />
            </div>
            <h3 className="font-semibold mb-2">Real-time Monitoring</h3>
            <p className="text-blue-100 text-sm">Continuous analysis and alerts</p>
          </div>
          <div className="text-center">
            <div className="w-16 h-16 bg-white bg-opacity-20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Bot className="text-white text-xl" />
            </div>
            <h3 className="font-semibold mb-2">Auto-Improvements</h3>
            <p className="text-blue-100 text-sm">AI implements changes automatically</p>
          </div>
          <div className="text-center">
            <div className="w-16 h-16 bg-white bg-opacity-20 rounded-full flex items-center justify-center mx-auto mb-4">
              <BarChart3 className="text-white text-xl" />
            </div>
            <h3 className="font-semibold mb-2">Detailed Reports</h3>
            <p className="text-blue-100 text-sm">Comprehensive analytics and insights</p>
          </div>
        </div>

        <div className="bg-white bg-opacity-10 backdrop-blur-sm rounded-2xl p-8 mb-8">
          <div className="flex flex-col md:flex-row items-center justify-between">
            <div className="text-left mb-6 md:mb-0">
              <h3 className="text-2xl font-bold mb-2">Start Your 14-Day Free Trial</h3>
              <p className="text-blue-100">No credit card required. Cancel anytime.</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <button className="px-8 py-4 bg-white text-primary rounded-lg font-semibold hover:bg-gray-100 transition-colors">
                Start Free Trial
              </button>
              <button className="px-8 py-4 border-2 border-white text-white rounded-lg font-semibold hover:bg-white hover:text-primary transition-colors">
                View Pricing
              </button>
            </div>
          </div>
        </div>

        <p className="text-sm text-blue-200">
          Join 10,000+ store owners who've improved their sales with StoreScore
        </p>
      </div>
    </section>
  );
}
