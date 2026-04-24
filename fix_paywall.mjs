import fs from 'fs';
const filePath = 'client/src/components/LetterPaywall.tsx';
let content = fs.readFileSync(filePath, 'utf8');

const mutationCode = `  const payToUnlock = trpc.billing.createLetterUnlockCheckout.useMutation({
    onSuccess: ({ url }) => {
      setIsRedirecting(true);
      window.location.href = url;
    },
    onError: err => {
      toast.error("Could not create checkout session", {
        description: err.message,
      });
    },
  });`;

if (!content.includes('const payToUnlock =')) {
    content = content.replace(
        'const subscriptionSubmitMutation =',
        mutationCode + '\\n\\n  const subscriptionSubmitMutation ='
    );
    fs.writeFileSync(filePath, content);
    console.log('Fixed payToUnlock mutation');
} else {
    console.log('payToUnlock already exists');
}
