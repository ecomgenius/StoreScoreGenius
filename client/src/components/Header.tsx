import { Link } from "wouter";

export default function Header() {
  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Link href="/">
                <h1 className="text-2xl font-bold text-primary cursor-pointer">StoreScore</h1>
              </Link>
            </div>
          </div>
          <nav className="hidden md:block">
            <div className="ml-10 flex items-baseline space-x-8">
              <a href="#" className="text-gray-900 hover:text-primary px-3 py-2 text-sm font-medium">Features</a>
              <a href="#" className="text-gray-500 hover:text-primary px-3 py-2 text-sm font-medium">Pricing</a>
              <a href="#" className="text-gray-500 hover:text-primary px-3 py-2 text-sm font-medium">About</a>
            </div>
          </nav>
          <div className="flex items-center space-x-4">
            <button className="text-gray-500 hover:text-primary px-3 py-2 text-sm font-medium">Sign In</button>
            <button className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
              Get Started
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
