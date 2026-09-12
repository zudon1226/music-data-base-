import { requireCurrentCreatorUploadAgreement } from "@/lib/legal-acceptance-service";

export async function requireCreatorUploadLegalAgreement(userId: string) {
    return requireCurrentCreatorUploadAgreement(userId);
}
