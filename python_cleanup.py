import sys
import os

def fix_viewer():
    path = 'client/src/components/FreePreviewViewer.tsx'
    if not os.path.exists(path): return
    with open(path, 'r') as f: content = f.read()
    
    # Correct the botched imports at the top
    if content.startswith('import'):
        # Find the start of the JSDoc block
        parts = content.split('/**', 1)
        if len(parts) > 1:
            correct_imports = 'import { Card, CardContent } from "@/components/ui/card";\n' \
                              'import { Button } from "@/components/ui/button";\n' \
                              'import { PRICING } from "../../../shared/pricing";\n' \
                              'import { toast } from "sonner";\n' \
                              'import { trpc } from "@/lib/trpc";\n'
            new_content = correct_imports + '/**' + parts[1]
            with open(path, 'w') as f: f.write(new_content)
            print("Fixed FreePreviewViewer imports via Python")

def fix_paywall():
    path = 'client/src/components/LetterPaywall.tsx'
    if not os.path.exists(path): return
    with open(path, 'r') as f: content = f.read()
    
    # Check for payToUnlock definition
    if 'const payToUnlock = trpc.billing.createLetterUnlockCheckout.useMutation({' not in content:
        # Check if it was partially added or botched
        if 'const payToUnlock =' in content:
            print("payToUnlock already exists, but might be malformed.")
        else:
            mutation_code = '  const payToUnlock = trpc.billing.createLetterUnlockCheckout.useMutation({\n' \
                            '    onSuccess: ({ url }: { url: string }) => {\n' \
                            '      setIsRedirecting(true);\n' \
                            '      window.location.href = url;\n' \
                            '    },\n' \
                            '    onError: (err: any) => {\n' \
                            '      toast.error("Could not create checkout session", {\n' \
                            '        description: err.message,\n' \
                            '      });\n' \
                            '    },\n' \
                            '  });'
            
            # Find a good anchor point
            anchor = 'const subscriptionSubmitMutation ='
            if anchor in content:
                new_content = content.replace(anchor, mutation_code + '\n\n  ' + anchor)
                with open(path, 'w') as f: f.write(new_content)
                print("Attached payToUnlock to LetterPaywall via Python")
    
    # Clean up botched escapings
    with open(path, 'r') as f: content = f.read()
    content = content.replace('\\n\\n', '\n\n').replace('\\\\n\\\\n', '\n\n')
    with open(path, 'w') as f: f.write(content)

fix_viewer()
fix_paywall()
