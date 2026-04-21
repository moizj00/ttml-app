import fs from 'fs';

const filePath = 'client/src/components/LetterPaywall.tsx';
const content = fs.readFileSync(filePath, 'utf-8');

const i1 = content.indexOf('    return (\n      <div className="space-y-5">');
const i2 = content.indexOf('  return (\n    <>\n      {hasDraft && (');

if (i1 === -1 || i2 === -1) {
  console.log("Could not find boundaries!", {i1, i2});
  process.exit(1);
}

const before = content.slice(0, i1);
const after = content.slice(i2);

const newSnippet = `    return (
      <div className="space-y-6">
        {qualityDegraded && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
              <p className="font-semibold">Review note for attorney</p>
              <p className="mt-1">
                The attorney reviewing this letter has been alerted to verify
                facts and citations carefully.
              </p>
            </div>
          </div>
        )}

        {/* Primary Subscription CTA */}
        <div className="bg-gradient-to-r from-emerald-700 to-emerald-600 rounded-2xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Shield className="w-40 h-40" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                <Tag className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-2xl font-bold leading-tight">
                Pick a plan to submit for attorney review
              </h2>
            </div>
            <p className="text-emerald-100 text-base max-w-lg mb-6">
              Subscribe to get this letter professionally reviewed, edited, signed, and delivered by a licensed attorney. Plans include unlimited drafts and priority support.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              {[
                { icon: Shield, text: "Licensed attorney review" },
                { icon: CheckCircle, text: "Edits & approval included" },
                { icon: FileText, text: "Professional PDF delivered" },
              ].map(({ icon: Icon, text }) => (
                <div
                  key={text}
                  className="flex items-center gap-2 bg-white/20 rounded-lg px-3 py-2"
                >
                  <Icon className="w-4 h-4 text-emerald-50 flex-shrink-0" />
                  <span className="text-xs text-white font-medium">{text}</span>
                </div>
              ))}
            </div>
            <Button
              asChild
              size="lg"
              className="w-full sm:w-auto bg-white text-emerald-800 hover:bg-emerald-50 font-bold shadow-lg"
            >
              <a href={\`/pricing?returnTo=/letters/\${letterId}\`}>
                View Plans
                <ArrowRight className="w-4 h-4 ml-2" />
              </a>
            </Button>
          </div>
        </div>

        <div className="pt-2">
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4 px-2">
            Prefer a one-time option?
          </h3>
          
          {isFreeReviewAvailable ? (
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:border-slate-300 transition-colors">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h4 className="text-lg font-bold text-slate-800 mb-1">First Letter Review</h4>
                  <p className="text-sm text-slate-500 mb-3 max-w-md">
                    Pay a nominal fee to verify identity and cover processing costs for one-time attorney review.
                  </p>
                  <div className="flex items-end gap-2">
                    <span className="text-2xl font-extrabold text-slate-900">
                      \${FIRST_LETTER_REVIEW_PRICE}
                    </span>
                  </div>
                </div>
                <Button
                  onClick={() => payFirstLetterMutation.mutate({ letterId })}
                  disabled={isPending}
                  className="w-full sm:w-auto mt-2 sm:mt-0 shadow-sm"
                >
                  {isPending && payFirstLetterMutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Preparing...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      Pay \${FIRST_LETTER_REVIEW_PRICE}
                    </span>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:border-slate-300 transition-colors">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div className="flex-1">
                  <h4 className="text-lg font-bold text-slate-800 mb-1">Single Letter Review</h4>
                  <p className="text-sm text-slate-500 mb-4 max-w-md">
                    One-time attorney review, signature, and PDF delivery without a subscription.
                  </p>
                  <DiscountCodeInput
                    className="mb-4 max-w-sm"
                    initialCode={urlCouponCode}
                    onCodeChange={(result) => setAppliedDiscount(result)}
                  />
                  <div className="flex items-end gap-2">
                    {discountedPrice !== null ? (
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-extrabold text-slate-900">\${discountedPrice}</span>
                        <span className="text-sm text-slate-400 line-through">\${basePrice}</span>
                        <span className="text-xs text-emerald-600 font-semibold bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded">\${appliedDiscount!.discountPercent}% off</span>
                      </div>
                    ) : (
                      <span className="text-2xl font-extrabold text-slate-900">\${basePrice}</span>
                    )}
                  </div>
                </div>
                <Button
                  onClick={() =>
                    payToUnlock.mutate({
                      letterId,
                      discountCode: appliedDiscount?.code ?? undefined,
                    })
                  }
                  disabled={isPending}
                  size="lg"
                  className="w-full md:w-auto flex-shrink-0 shadow-sm"
                >
                  {isPending && payToUnlock.isPending ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Preparing checkout...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      Pay & Submit
                      <ArrowRight className="w-4 h-4" />
                    </span>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

`;

fs.writeFileSync(filePath, before + newSnippet + after);
console.log("Replacement successful!");
