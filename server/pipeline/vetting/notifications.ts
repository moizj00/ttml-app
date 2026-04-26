import { 
  getAllUsers, 
  createNotification 
} from "../../db";
import { sendAdminAlertEmail } from "../../email";
import { logger } from "../../logger";


export async function notifyAdminsOfDegradedDraft(
  letterId: number,
  qualityWarnings: string[]
) {
  try {
    const appBaseUrl =
      process.env.APP_BASE_URL ?? "https://www.talk-to-my-lawyer.com";
    const admins = await getAllUsers("admin");
    
    await Promise.allSettled(
      admins.map(async admin => {
        if (admin.email) {
          sendAdminAlertEmail({
            to: admin.email,

            name: admin.name ?? "Admin",
            subject: `Quality-flagged draft produced for letter #${letterId}`,
            preheader: `Vetting raised quality warnings — attorney scrutiny required`,
            bodyHtml: `<p>Letter #${letterId} completed the pipeline with quality warnings attached.</p><p>Warnings:</p><ul>${qualityWarnings.map(w => `<li>${w}</li>`).join("")}</ul><p>The draft is in <strong>generated_locked</strong> status and requires heightened attorney scrutiny upon review.</p>`,
            ctaText: "View Letter",
            ctaUrl: `${appBaseUrl}/admin/letters/${letterId}`,
          }).catch(e =>
            logger.error(
              { e: e },
              `[Pipeline] Failed admin alert email for degraded draft #${letterId}:`
            )
          );
        }
        createNotification({
          userId: admin.id,
          type: "quality_alert",
          category: "letters",
          title: `Quality-flagged draft: letter #${letterId}`,
          body: `Vetting quality warnings attached (${qualityWarnings.length}). Extra attorney scrutiny needed.`,
          link: `/admin/letters/${letterId}`,
        }).catch(e =>
          logger.error(
            { e: e },
            `[Pipeline] Failed notification for degraded draft #${letterId}:`
          )
        );
      })
    );
  } catch (alertErr) {
    logger.error(
      { err: alertErr },
      `[Pipeline] Failed to notify admins of quality-degraded draft #${letterId}:`
    );
  }
}
