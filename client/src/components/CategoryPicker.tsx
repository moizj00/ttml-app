import { useState } from "react";
import {
  ArrowRight,
  Shield,
  Briefcase,
  Home,
  Users,
  ShoppingCart,
  HeartPulse,
  Banknote,
  Search,
  MessageSquare,
} from "lucide-react";

type Category = {
  id: string;
  title: string;
  icon: React.ReactNode;
  description: string;
};

const CATEGORIES: Category[] = [
  {
    id: "demand",
    title: "Someone owes me money",
    icon: <Banknote className="w-5 h-5" />,
    description: "Demand for Payment",
  },
  {
    id: "breach",
    title: "A contract was broken",
    icon: <Briefcase className="w-5 h-5" />,
    description: "Breach of Contract",
  },
  {
    id: "cease",
    title: "I need someone to stop doing something",
    icon: <Shield className="w-5 h-5" />,
    description: "Cease and Desist",
  },
  {
    id: "landlord",
    title: "I have a property dispute",
    icon: <Home className="w-5 h-5" />,
    description: "Landlord/Tenant Issues",
  },
  {
    id: "employment",
    title: "I have an issue at work",
    icon: <Users className="w-5 h-5" />,
    description: "Employment Issues",
  },
  {
    id: "consumer",
    title: "I was scammed or sold a bad product",
    icon: <ShoppingCart className="w-5 h-5" />,
    description: "Consumer Protection",
  },
  {
    id: "injury",
    title: "I was injured",
    icon: <HeartPulse className="w-5 h-5" />,
    description: "Personal Injury",
  },
];

interface CategoryPickerProps {
  onCategorySelect: (categoryId: string) => void;
}

export default function CategoryPicker({ onCategorySelect }: CategoryPickerProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredCategories = CATEGORIES.filter(
    (c) =>
      c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="w-full" data-testid="category-picker">
      <div className="max-w-md mx-auto lg:mx-0 relative mb-6">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-slate-400" />
        </div>
        <input
          type="text"
          className="block w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent shadow-sm transition-shadow text-sm"
          placeholder="Filter by situation, e.g. money, contract..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          data-testid="category-search-input"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {filteredCategories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => onCategorySelect(cat.id)}
            className="group bg-white border border-slate-200 p-5 rounded-xl shadow-sm hover:shadow-md hover:border-blue-300 transition-all text-left flex flex-col h-full relative overflow-hidden"
            data-testid={`category-card-${cat.id}`}
          >
            <div className="absolute top-0 right-0 p-3 opacity-0 group-hover:opacity-100 transform translate-x-2 group-hover:translate-x-0 transition-all duration-300 text-blue-600">
              <ArrowRight className="w-4 h-4" />
            </div>
            <div className="w-10 h-10 bg-slate-50 text-slate-700 rounded-lg flex items-center justify-center mb-3 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
              {cat.icon}
            </div>
            <h3 className="text-sm font-semibold text-slate-900 mb-1 leading-tight group-hover:text-blue-700 transition-colors">
              {cat.title}
            </h3>
            <p className="text-xs text-slate-500 mt-auto font-medium">
              {cat.description}
            </p>
          </button>
        ))}

        <button
          onClick={() => onCategorySelect("other")}
          className="bg-slate-50 border border-dashed border-slate-300 p-5 rounded-xl text-left flex flex-col h-full hover:bg-slate-100 hover:border-slate-400 transition-colors group"
          data-testid="category-card-other"
        >
          <div className="w-10 h-10 bg-white text-slate-400 border border-slate-200 rounded-lg flex items-center justify-center mb-3 group-hover:text-slate-600 transition-colors">
            <MessageSquare className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-semibold text-slate-700 mb-1 leading-tight">
            Something else
          </h3>
          <p className="text-xs text-slate-500 mt-auto font-medium">
            Custom legal correspondence
          </p>
        </button>

        {filteredCategories.length === 0 && (
          <div
            className="col-span-full py-8 text-center text-slate-500 text-sm"
            data-testid="category-no-results"
          >
            No matching situations found. Try a different search term or select "Something else".
          </div>
        )}
      </div>
    </div>
  );
}
