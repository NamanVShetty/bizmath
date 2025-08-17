// src/lib/paywall.ts
export type Access = { active: boolean; reason?: string };

// For development: always grant access.
// Later we'll connect this to Razorpay subscription status.
export async function checkAccess(_organisationId: string): Promise<Access> {
  return { active: true, reason: "dev-mode (paywall disabled)" };
}
