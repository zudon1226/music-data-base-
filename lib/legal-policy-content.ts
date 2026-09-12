import { LEGAL_CONTACT_EMAIL } from "@/lib/legal-policies";
import type { LegalPolicyType } from "@/lib/legal-policies";

export type PolicySection = {
    heading?: string;
    paragraphs?: string[];
    list?: string[];
};

export function getLegalPolicyContent(type: LegalPolicyType): PolicySection[] {
    switch (type) {
        case "privacy":
            return privacyPolicyContent();
        case "terms":
            return termsOfServiceContent();
        case "creator_upload":
            return creatorUploadAgreementContent();
        case "dmca":
            return dmcaPolicyContent();
        case "subscription_billing":
            return subscriptionBillingPolicyContent();
        case "refund":
            return refundPolicyContent();
        case "creator_payout":
            return creatorPayoutAgreementContent();
        case "sponsor_advertising":
            return sponsorAdvertisingTermsContent();
        default:
            return [];
    }
}

function privacyPolicyContent(): PolicySection[] {
    return [
        {
            paragraphs: [
                "This Privacy Policy describes how Music Data Base collects, uses, and protects information when you use our website, applications, and related services (the \"Service\").",
            ],
        },
        {
            heading: "Information We Collect",
            list: [
                "Account information such as email address, display name, and account type.",
                "Profile and creator information you choose to provide.",
                "Content you upload, publish, purchase, save, or interact with on the Service.",
                "Billing and subscription status handled through Stripe (payment card details are processed by Stripe, not stored directly by Music Data Base).",
                "Technical and usage information such as device/browser data, logs, and security events needed to operate and protect the Service.",
            ],
        },
        {
            heading: "How We Use Information",
            list: [
                "Provide, secure, and improve the Service.",
                "Authenticate users, enforce account permissions, and prevent abuse.",
                "Process subscriptions, marketplace purchases, sponsor applications, and creator payout eligibility.",
                "Communicate about account, billing, support, and policy updates.",
                "Comply with legal obligations and respond to valid rights requests.",
            ],
        },
        {
            heading: "Sharing",
            paragraphs: [
                "We use service providers such as Supabase and Stripe to operate the Service. We do not sell personal information. We may disclose information when required by law, to protect users and the platform, or with your direction.",
            ],
        },
        {
            heading: "Retention and Security",
            paragraphs: [
                "We retain information as needed to operate the Service, maintain records, resolve disputes, and comply with law. We use reasonable administrative, technical, and organizational safeguards, but no system is completely secure.",
            ],
        },
        {
            heading: "Your Choices",
            list: [
                "You may update certain profile information in your account.",
                "You may request account-related assistance by contacting us.",
                "Cookie and browser controls may affect certain features.",
            ],
        },
        {
            heading: "Contact",
            paragraphs: [
                `Privacy questions: ${LEGAL_CONTACT_EMAIL}`,
            ],
        },
    ];
}

function termsOfServiceContent(): PolicySection[] {
    return [
        {
            paragraphs: [
                "These Terms of Service (\"Terms\") govern access to and use of Music Data Base. By creating an account or using the Service, you agree to these Terms and our Privacy Policy.",
            ],
        },
        {
            heading: "Eligibility and Accounts",
            list: [
                "You must provide accurate account information and keep credentials secure.",
                "You are responsible for activity under your account.",
                "Music Data Base may suspend or terminate accounts that violate these Terms or applicable law.",
            ],
        },
        {
            heading: "Service Use",
            list: [
                "Do not upload, distribute, or promote unlawful, infringing, deceptive, or harmful content.",
                "Do not attempt to bypass security, access controls, billing rules, or rate limits.",
                "Creator features require applicable account permissions and acceptance of the Creator / Upload Agreement.",
            ],
        },
        {
            heading: "Content and Licenses",
            paragraphs: [
                "Creators retain ownership of content they upload subject to the licenses granted in the Creator / Upload Agreement. Music Data Base may host, stream, display, process, and distribute content as needed to operate the Service.",
            ],
        },
        {
            heading: "Billing and Purchases",
            paragraphs: [
                "Paid subscriptions, marketplace purchases, and sponsor placements are governed by the Subscription / Billing Policy, Refund Policy, and Sponsor / Advertising Terms where applicable. During public beta, paid checkout may be locked even when pricing is displayed.",
            ],
        },
        {
            heading: "Disclaimers and Limitation of Liability",
            paragraphs: [
                "The Service is provided on an \"as is\" and \"as available\" basis to the fullest extent permitted by law. Music Data Base does not guarantee uninterrupted availability, specific business results, or error-free operation.",
            ],
        },
        {
            heading: "Changes",
            paragraphs: [
                "We may update these Terms. Material changes will be reflected by updating the policy version and Last Updated date. Continued use after an update may require renewed acceptance where implemented.",
            ],
        },
        {
            heading: "Contact",
            paragraphs: [
                `Terms questions: ${LEGAL_CONTACT_EMAIL}`,
            ],
        },
    ];
}

function creatorUploadAgreementContent(): PolicySection[] {
    return [
        {
            paragraphs: [
                "This Creator / Upload Agreement applies to Artist and Producer accounts that upload or publish content on Music Data Base.",
            ],
        },
        {
            heading: "Your Representations",
            list: [
                "You own or control the rights required to upload, publish, and make available the content you submit.",
                "You have obtained required permissions from collaborators, performers, producers, labels, publishers, and other rightsholders.",
                "Your content does not infringe copyright, trademark, privacy, publicity, or other third-party rights.",
            ],
        },
        {
            heading: "License to Music Data Base",
            paragraphs: [
                "You grant Music Data Base a non-exclusive, worldwide license to host, store, stream, display, distribute, promote, and technically process your content solely to operate, secure, and improve the Service. You retain ownership of your content except for this granted license.",
            ],
        },
        {
            heading: "Ringtone and Usage Settings",
            paragraphs: [
                "Ringtone availability, marketplace settings, and usage permissions control how content may appear on the Service. These settings do not transfer underlying ownership and do not override third-party rights you do not control.",
            ],
        },
        {
            heading: "Enforcement",
            list: [
                "Disputed, unauthorized, or allegedly infringing material may be restricted, hidden, or removed.",
                "Repeat infringement or serious violations may result in account suspension or termination.",
                "You are responsible for claims arising from content you upload unless caused by Music Data Base's intentional misconduct.",
            ],
        },
        {
            heading: "Acceptance",
            paragraphs: [
                "You must accept the current version of this agreement before uploading creator content. If this agreement is updated, re-acceptance may be required before future uploads.",
            ],
        },
    ];
}

function dmcaPolicyContent(): PolicySection[] {
    return [
        {
            paragraphs: [
                "Music Data Base respects intellectual property rights and responds to valid copyright notices consistent with the Digital Millennium Copyright Act (DMCA) where applicable.",
            ],
        },
        {
            heading: "Copyright Notice Requirements",
            paragraphs: [
                `Send copyright notices to ${LEGAL_CONTACT_EMAIL}. A valid notice should include:`,
            ],
            list: [
                "Identification of the copyrighted work claimed to have been infringed.",
                "Identification of the material claimed to be infringing and information reasonably sufficient to locate it on the Service.",
                "Your contact information, including name, email address, and telephone number if available.",
                "A statement that you have a good-faith belief that use of the material is not authorized by the copyright owner, its agent, or the law.",
                "A statement, under penalty of perjury, that the information in the notice is accurate and that you are authorized to act on behalf of the copyright owner.",
                "Your physical or electronic signature.",
            ],
        },
        {
            heading: "Counter-Notification",
            paragraphs: [
                "If you believe content was removed in error, you may submit a counter-notification to the same contact address including identification of the removed material, a good-faith statement under penalty of perjury, consent to jurisdiction where required, and your signature.",
            ],
        },
        {
            heading: "Repeat Infringers",
            paragraphs: [
                "Music Data Base may restrict or terminate accounts of repeat infringers in appropriate circumstances.",
            ],
        },
        {
            heading: "Restoration and Removal",
            paragraphs: [
                "Material may remain removed during review. Where appropriate and permitted by law, content may be restored after a valid counter-notification process or when a dispute is resolved.",
            ],
        },
    ];
}

function subscriptionBillingPolicyContent(): PolicySection[] {
    return [
        {
            paragraphs: [
                "This Subscription / Billing Policy describes paid subscription plans, billing rules, and payment processing on Music Data Base. Prices and plan availability may change with notice through policy updates.",
            ],
        },
        {
            heading: "Current Plans and Pricing",
            list: [
                "Listener: $6.99/month (monthly billing only).",
                "Artist: $9.99/month or $99.99/year.",
                "Producer: $14.99/month or $149.99/year.",
            ],
        },
        {
            heading: "Recurring Billing and Auto-Renewal",
            list: [
                "Subscriptions renew automatically at the end of each billing period unless canceled before renewal.",
                "Monthly plans renew monthly; annual plans renew annually.",
                "By subscribing, you authorize recurring charges through Stripe for the selected plan.",
            ],
        },
        {
            heading: "Renewal and Expiration Reminders",
            paragraphs: [
                "Music Data Base may send renewal or expiration reminders up to 10 days before a subscription renews or expires, where contact information is available and reminders are enabled.",
            ],
        },
        {
            heading: "Cancellation",
            paragraphs: [
                "You may cancel before the next renewal date to avoid future charges. Cancellation stops future billing but does not automatically refund prior charges except as stated in the Refund Policy.",
            ],
        },
        {
            heading: "Payment Failure and Past Due",
            list: [
                "If a payment fails, subscription access may move to past due or inactive status until payment is resolved.",
                "Past-due creator subscriptions may affect creator withdrawal eligibility until the account returns to good standing.",
            ],
        },
        {
            heading: "Payment Processing and Public Beta",
            paragraphs: [
                "Payments are processed by Stripe. During public beta, paid subscription checkout may remain locked even when plan pricing is displayed. Checkout unlock is controlled by platform configuration and does not change listed plan prices.",
            ],
        },
    ];
}

function refundPolicyContent(): PolicySection[] {
    return [
        {
            paragraphs: [
                "This Refund Policy explains how refunds are handled for paid features on Music Data Base.",
            ],
        },
        {
            heading: "Subscriptions",
            paragraphs: [
                "Subscription charges generally are not refundable for partial billing periods already started, except where required by law or explicitly approved by Music Data Base support review.",
            ],
        },
        {
            heading: "Marketplace Purchases",
            paragraphs: [
                "Digital marketplace purchases may be non-refundable once access is granted, unless a charge was duplicated, unauthorized, or affected by a verified platform error.",
            ],
        },
        {
            heading: "Sponsor Payments",
            paragraphs: [
                "Sponsor package payments are reviewed according to the Sponsor / Advertising Terms. Refunds or cancellations may be issued when a campaign is rejected, not activated, expires without delivery, or is refunded through the approved payment process.",
            ],
        },
        {
            heading: "Chargebacks and Reversals",
            paragraphs: [
                "Disputed, refunded, or reversed transactions may result in removal of associated access, earnings adjustments, or payout holds while review is completed.",
            ],
        },
        {
            heading: "How to Request Help",
            paragraphs: [
                `Contact ${LEGAL_CONTACT_EMAIL} with account email, transaction date, and details. Refund decisions depend on transaction type, delivery status, and applicable law.`,
            ],
        },
    ];
}

function creatorPayoutAgreementContent(): PolicySection[] {
    return [
        {
            paragraphs: [
                "This Creator Payout Agreement applies to eligible Artist and Producer accounts that receive creator earnings from approved platform revenue share features such as marketplace sales and ringtone purchases.",
            ],
        },
        {
            heading: "Eligibility",
            list: [
                "Eligible Artist and Producer accounts with approved creator permissions.",
                "Completed Stripe Connect onboarding for the applicable creator audience.",
                "Account in good standing, including subscription status where required for withdrawals.",
            ],
        },
        {
            heading: "Stripe Connect and Banking",
            paragraphs: [
                "Stripe handles identity verification, bank account details, and payout rail compliance. Music Data Base stores Connect account identifiers and payout status but does not directly store full bank account numbers.",
            ],
        },
        {
            heading: "Earnings Ledger and Withdrawals",
            list: [
                "Creator earnings are tracked in the platform earnings ledger from qualifying transactions.",
                "Withdrawal requests are subject to eligibility review, available balance, and platform rules.",
                "Past-due creator subscriptions may block withdrawal until the subscription returns to good standing.",
                "Disputed, refunded, suspicious, or reversed earnings may be held, adjusted, or reversed.",
            ],
        },
        {
            heading: "Review, Timing, and Taxes",
            list: [
                "Payout timing depends on review, Stripe processing, and banking networks.",
                "Music Data Base may perform admin or manual review before releasing funds.",
                "Creators are responsible for applicable taxes, reporting, and compliance in their jurisdiction.",
                "There is no guarantee of immediate payout, and automated payouts may not be active for all accounts or at all times.",
            ],
        },
        {
            heading: "Sponsor Revenue Exclusion",
            paragraphs: [
                "Sponsor and advertising payments processed through Music Data Base are platform revenue only. Sponsor payments do not create Artist/Producer earnings, Connect transfers, or creator payouts.",
            ],
        },
    ];
}

function sponsorAdvertisingTermsContent(): PolicySection[] {
    return [
        {
            paragraphs: [
                "These Sponsor / Advertising Terms govern sponsor applications, campaign review, placement, and payment for advertising on Music Data Base.",
            ],
        },
        {
            heading: "Application and Review",
            list: [
                "Sponsors submit business and campaign details for review.",
                "Packages, pricing, and duration are shown at application time and may vary by active sponsor package.",
                "Music Data Base may approve, reject, schedule, or remove campaigns at its discretion.",
            ],
        },
        {
            heading: "Creative and Placement Requirements",
            list: [
                "Submitted assets must be accurate, lawful, and suitable for the selected placement.",
                "Prohibited advertising includes unlawful content, deceptive claims, malware, hate, harassment, adult content where not permitted, and infringement of third-party rights.",
                "Campaign start and end dates follow approved scheduling and package duration.",
            ],
        },
        {
            heading: "Payment, Refunds, and Cancellation",
            list: [
                "Sponsor payments are processed through Music Data Base checkout when enabled.",
                "Failed, expired, canceled, or refunded payments do not activate public campaigns.",
                "Refund handling follows the Refund Policy and approved payment events.",
            ],
        },
        {
            heading: "Platform Revenue Rule",
            paragraphs: [
                "Sponsor payments made through Music Data Base are 100% platform revenue. They do not create Artist/Producer earnings, creator payouts, or Stripe Connect transfers to creator accounts.",
            ],
        },
        {
            heading: "Off-Platform Arrangements",
            paragraphs: [
                "Private sponsor-to-artist or sponsor-to-producer deals arranged outside Music Data Base are independent and off-platform. Music Data Base is not responsible for off-platform arrangements unless expressly agreed in writing.",
            ],
        },
        {
            heading: "Contact",
            paragraphs: [
                `Sponsor questions: ${LEGAL_CONTACT_EMAIL}`,
            ],
        },
    ];
}
