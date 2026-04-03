import { Quote, MapPin } from "lucide-react";

const testimonials = [
  {
    quote: "I had a contractor refuse to finish a job after I'd already paid $12,000. Within 48 hours of sending my demand letter, they called to negotiate. We settled for a full refund — no court, no attorney retainer.",
    name: "Sarah M.",
    location: "Austin, TX",
    useCase: "Contractor Dispute",
  },
  {
    quote: "Someone was using my brand name and logo without permission. The cease-and-desist letter was detailed, cited the right statutes, and the infringement stopped within a week. Would have cost me $2,000+ at a firm.",
    name: "Marcus T.",
    location: "Los Angeles, CA",
    useCase: "Intellectual Property",
  },
  {
    quote: "My landlord kept $3,200 of my security deposit with no explanation. The letter laid out every California code section that applied. I got a check for the full amount within 10 days.",
    name: "Priya K.",
    location: "San Francisco, CA",
    useCase: "Security Deposit",
  },
];

export default function Testimonials() {
  return (
    <section className="py-12 sm:py-16 md:py-24 px-4 sm:px-6 lg:px-12 bg-slate-50">
      <div className="max-w-7xl mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-16">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[#0c2340] mb-4" data-testid="text-testimonials-title">
            Results Our Clients Talk About
          </h2>
          <p className="text-lg text-slate-600">
            Real outcomes from real people who used our attorney-reviewed legal letters.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {testimonials.map((t, i) => (
            <div
              key={i}
              className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-200 hover:shadow-md hover:border-blue-200 transition-all duration-200 flex flex-col"
              data-testid={`card-testimonial-${i}`}
            >
              <Quote className="w-8 h-8 text-blue-200 mb-4 flex-shrink-0" />
              <blockquote className="text-slate-700 leading-relaxed mb-6 flex-1 text-[15px]">
                "{t.quote}"
              </blockquote>
              <div className="border-t border-slate-100 pt-4 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-[#0c2340] text-sm" data-testid={`text-testimonial-name-${i}`}>{t.name}</div>
                  <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                    <MapPin className="w-3 h-3" />
                    {t.location}
                  </div>
                </div>
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-blue-50 text-blue-700" data-testid={`badge-usecase-${i}`}>
                  {t.useCase}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
