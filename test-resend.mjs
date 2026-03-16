import { Resend } from "resend";
const apiKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.RESEND_FROM_EMAIL || "noreply@talk-to-my-lawyer.com";
if (!apiKey) { console.error("RESEND_API_KEY not set"); process.exit(1); }
console.log("Testing Resend API...");
console.log("API Key:", apiKey.substring(0, 8) + "...");
console.log("From:", fromEmail);
const resend = new Resend(apiKey);
// Test 1: List domains
try {
  const domains = await resend.domains.list();
  if (domains.error) {
    console.error("Domain list error:", domains.error.message);
  } else {
    console.log("Domains:", JSON.stringify(domains.data?.data?.map(d => ({ name: d.name, status: d.status }))));
  }
} catch (e) {
  console.error("Domain list exception:", e.message);
}
// Test 2: Try sending a test email to a test address
try {
  const result = await resend.emails.send({
    from: fromEmail,
    to: "delivered@resend.dev", // Resend's test sink address
    subject: "TTML Email Verification Test",
    html: "<p>This is a test email from Talk to My Lawyer to verify the email system is working.</p>",
  });
  if (result.error) {
    console.error("Send error:", JSON.stringify(result.error));
  } else {
    console.log("Send success! Email ID:", result.data?.id);
  }
} catch (e) {
  console.error("Send exception:", e.message);
}
