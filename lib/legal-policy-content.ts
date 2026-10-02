import { LEGAL_CONTACT_EMAIL, LEGAL_OPERATOR_NAME, LEGAL_PUBLIC_SITE_LABEL } from "@/lib/legal-policies";
import type { LegalPageType } from "@/lib/legal-policies";

export type PolicySection = {
    heading?: string;
    paragraphs?: string[];
    list?: string[];
};

export function getLegalPolicyContent(type: LegalPageType): PolicySection[] {
    switch (type) {
        case "privacy":
            return privacyPolicyContent();
        case "terms":
            return termsOfServiceContent();
        case "account_deletion":
            return accountDeletionContent();
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
                `This Privacy Policy explains how ${LEGAL_OPERATOR_NAME} ("Music Data Base," "MDB," "we," "us," or "our") collects, uses, shares, and protects information when you use the Music Data Base website at ${LEGAL_PUBLIC_SITE_LABEL}, the Music Data Base mobile apps, and related services (together, the "Service").`,
                `The Service is operated by ${LEGAL_OPERATOR_NAME}. By using the Service, you acknowledge the practices described in this Privacy Policy.`,
            ],
        },
        {
            heading: "Information You Provide",
            list: [
                "Account information: your email address, password, and the account type you select (Listener, Artist, Producer, Artist + Producer, or Podcaster), along with any invite code you enter and your founding member or approval status.",
                "Profile information: your display name, profile image (avatar), and other profile details you choose to add.",
                "Content you upload: music and other audio, videos, album details, podcast shows and episodes (audio or video) and cover art, ringtone source audio, sponsor logos and campaign assets, support ticket screenshots, and the titles, descriptions, and other details you attach to them.",
                "Activity on the Service: songs and videos you like or save to your library, playlists and queues you create, playback state, podcast episode comments, and searches you enter.",
                "Support communications: support tickets, attached screenshots, and emails you send to us.",
                "Sidekick messages: messages you send to the Sidekick assistant and the recent conversation history needed to answer them.",
                "Policy acceptances: which policies you accepted, the policy version, and when you accepted.",
                "Sponsor applications: business and campaign details you submit when applying to sponsor on the Service.",
            ],
        },
        {
            heading: "Payment and Payout Information",
            paragraphs: [
                "Paid features such as subscriptions, ringtone and marketplace purchases, and sponsor packages are processed by third-party payment processors. During public beta, paid checkout may be locked even where pricing is displayed.",
            ],
            list: [
                "Stripe processes card payments. Payment card details are entered with and processed by Stripe; Music Data Base does not store full payment card numbers. We store records such as your plan, subscription status, purchase records, and Stripe customer, subscription, and payment identifiers.",
                "Stripe Connect is used for creator payout onboarding. Stripe collects and verifies identity, tax, and bank account information directly. Music Data Base stores your Connect account identifier, onboarding and payout status, and earnings and payout records, but does not store full bank account numbers.",
                "Our billing system also includes support for PayPal as an alternative payment processor. PayPal is used only if it is offered for a transaction at checkout. If you choose PayPal, the information needed to complete that payment is processed by PayPal.",
            ],
        },
        {
            heading: "Information Collected Automatically",
            list: [
                "Error reports: when something fails in the Service, we may record an error report linked to your account, including the error category, the action that failed, the error message, the related item, and limited technical details. These reports are stored by Music Data Base and used to troubleshoot and support the Service.",
                "Service logs: our hosting and infrastructure providers process technical information such as IP addresses, browser and device information, and request logs as part of delivering and securing the Service.",
                "Browser and device storage: the Service uses your browser's or app's local storage and session storage to keep you signed in and to remember preferences such as your display language, library and queue state, and playback settings. You can clear this data through your browser or device settings, but some features may not work without it.",
            ],
        },
        {
            heading: "Device Permissions and Files",
            list: [
                "The Music Data Base Android app requests only internet access.",
                "When you upload content, you choose files using your device's file picker. Only the files you select are uploaded.",
                "Share and copy-link features use your device's share sheet or clipboard only when you choose to use them.",
                "We do not collect your precise location, your contacts, or microphone or camera recordings.",
            ],
        },
        {
            heading: "How We Use Information",
            list: [
                "Provide the Service, including streaming, uploads, libraries, playlists, podcasts, and ringtone creation (including server-side audio processing of ringtone clips).",
                "Create and secure accounts, authenticate you, and enforce account types, roles, invite codes, and approval requirements.",
                "Process subscriptions, purchases, sponsor applications, and creator payouts when those features are enabled.",
                "Show in-app notifications about activity such as podcast, ringtone, and subscription updates.",
                "Respond to support requests and generate Sidekick replies.",
                "Troubleshoot errors, moderate content, prevent fraud and abuse, and protect users and the platform.",
                "Keep records of policy acceptances and comply with legal obligations.",
            ],
        },
        {
            heading: "Service Providers We Use",
            paragraphs: [
                "We share information with the following service providers only as needed for them to provide their services to us. Each provider processes information under its own terms and privacy policy.",
            ],
            list: [
                "Supabase: user authentication (including password reset emails), our Postgres database, and file storage for uploaded media and attachments.",
                "Vercel: website and application hosting and server-side processing.",
                "Stripe and Stripe Connect: payment processing, creator payout onboarding, identity verification, and payouts.",
                "PayPal: payment processing, only for payments you choose to make with PayPal where it is offered.",
                "OpenAI: when you use Sidekick, your messages and recent conversation history are sent to OpenAI to generate replies. Do not include sensitive personal information in Sidekick messages.",
                "Unsplash: some default artwork and background images are loaded from Unsplash. When your device loads these images, Unsplash receives standard request information such as your IP address and browser details.",
            ],
        },
        {
            heading: "Other Sharing",
            list: [
                "Public content: content you publish, such as your public profile, uploads, podcast shows and episodes, and podcast episode comments, can be seen by other users of the Service.",
                "Legal and safety: we may disclose information when required by law or legal process, or when needed to protect the rights, safety, or security of users, Music Data Base, or others.",
                "With your direction: we may share information when you ask us to.",
            ],
        },
        {
            heading: "No Sale of Personal Information",
            paragraphs: [
                "We do not sell your personal information. The Service does not include third-party advertising networks or third-party analytics tools. Sponsor placements on the Service are managed by Music Data Base.",
            ],
        },
        {
            heading: "Notifications and Emails",
            paragraphs: [
                "In-app notifications are stored with your account and shown inside the Service. The Service does not currently send push notifications. Account emails, such as password reset messages, are sent through our authentication provider, Supabase. We may also contact you about your account, billing, support requests, or policy updates.",
            ],
        },
        {
            heading: "Data Retention",
            paragraphs: [
                "We keep information for as long as your account is active and as needed to provide the Service. When you delete your account, we delete or anonymize your information as described on our Account Deletion page, except for information we need to keep for legal, financial, security, or dispute-resolution purposes, such as anonymized payout records. Residual copies may remain for a limited time in routine backups or logs kept by our service providers. Payment processors and other providers keep information according to their own policies.",
            ],
        },
        {
            heading: "Security",
            paragraphs: [
                "The Service is delivered over encrypted HTTPS connections. Access to data is limited by account authentication, role-based permissions, and database access rules, and privileged service credentials are kept on our servers and are not exposed in the app. No method of transmission or storage is completely secure, and we cannot guarantee absolute security.",
            ],
        },
        {
            heading: "Your Rights and Choices",
            list: [
                "Update your profile information from your Profile in the Service.",
                "Choose whether to use optional features such as Sidekick, uploads, and support attachments.",
                "Delete your account at any time from Profile in the Service, or request deletion as described on our Account Deletion page.",
                `Request access to, correction of, or deletion of your personal information by emailing ${LEGAL_CONTACT_EMAIL}. We may need to verify your identity before completing a request.`,
                "Depending on where you live, you may have additional privacy rights under applicable law. We will respond to requests as required by applicable law.",
            ],
        },
        {
            heading: "Account and Data Deletion",
            paragraphs: [
                "Signed-in users can permanently delete their account from Profile → Account settings → Delete Account. If you cannot access your account, you can request deletion by email. Details about what is deleted and what may be retained are available at /account-deletion and /legal/account-deletion.",
            ],
        },
        {
            heading: "Blocking and Hiding",
            list: [
                "Block User controls your experience with another account. It does not delete either account and does not change purchases, payouts, royalties, or ownership records.",
                "Hide Content controls what content is shown to you. It does not remove content for other users and does not delete the creator's original upload.",
                "Report sends content or behavior to Music Data Base moderation for review. Reporting is separate from blocking or hiding.",
            ],
        },
        {
            heading: "Children's Privacy",
            paragraphs: [
                `The Service is not directed to children under 13, and we do not knowingly collect personal information from children under 13. If you believe a child under 13 has provided personal information to us, contact ${LEGAL_CONTACT_EMAIL} and we will take steps to delete it.`,
            ],
        },
        {
            heading: "Where Information Is Processed",
            paragraphs: [
                "Our primary database and application hosting are located in the United States. Our service providers may process information in other countries where they operate.",
            ],
        },
        {
            heading: "Changes to This Policy",
            paragraphs: [
                "We may update this Privacy Policy from time to time. When we do, we will update the Last Updated date on this page. If changes are material, we may notify you in the Service or ask you to review and accept the updated policy where required.",
            ],
        },
        {
            heading: "Contact",
            paragraphs: [
                `${LEGAL_OPERATOR_NAME}`,
                `Privacy questions and requests: ${LEGAL_CONTACT_EMAIL}`,
            ],
        },
    ];
}

function accountDeletionContent(): PolicySection[] {
    return [
        {
            paragraphs: [
                `This page explains how to delete your Music Data Base account and associated data, what is deleted, what may be retained, and how to request deletion if you cannot access your account. Music Data Base is operated by ${LEGAL_OPERATOR_NAME}.`,
            ],
        },
        {
            heading: "Delete Your Account in Music Data Base",
            paragraphs: [
                "If you can sign in, you can delete your account yourself at any time:",
            ],
            list: [
                `Step 1: Sign in at ${LEGAL_PUBLIC_SITE_LABEL} or in the Music Data Base app.`,
                "Step 2: Open your Profile.",
                "Step 3: Under Account settings, find the Delete Account section and select Delete Account.",
                "Step 4: Check the box confirming you understand the action cannot be undone, type DELETE, and select Confirm Deletion.",
            ],
        },
        {
            paragraphs: [
                "Deletion starts immediately, is permanent, and cannot be undone. You will be signed out when it completes. Platform owner and administrator accounts cannot be deleted from the Profile screen; these accounts must contact us.",
            ],
        },
        {
            heading: "What Is Deleted",
            list: [
                "Your sign-in account, including your email address and login credentials.",
                "Your profile, account type and roles, founding member record, and policy acceptance records.",
                "Songs, videos, and albums you uploaded, their media files, and related likes, library saves, playlist entries, and comments attached to that content.",
                "Your podcast shows, podcast episodes, and podcast episode comments.",
                "Your artist profile, producer profile, and producer beats.",
                "Ringtones you created, except where retained as described below.",
                "Files stored under your account, including your avatar, support ticket screenshots, ringtone source audio, previews, and downloads, and saved media queues.",
                "Your support tickets.",
                "Your library saves, playback state, and in-app notifications.",
                "Subscription records, subscription payment records, and creator payment profile records stored by Music Data Base.",
                "Personal block and hide preferences stored for your account.",
            ],
        },
        {
            heading: "What May Be Retained or Anonymized",
            list: [
                "Payout records: creator payout and transaction records are kept for financial record-keeping. They are disconnected from your account and marked as anonymized.",
                "Paid ringtone purchase records: completed purchase ledger rows may be retained without your account identity attached, to preserve financial and fraud-prevention records.",
                "Ringtones with purchase history: ringtones that other users have purchased may be archived instead of fully removed, to preserve records of completed purchases.",
                "Sponsor applications: sponsor application and campaign records are kept for business records but are disconnected from your account.",
                "Error reports: technical error reports are kept for troubleshooting but are disconnected from your account.",
                "Legal and security needs: we may keep information that we are required to keep by law or that we need to resolve disputes, prevent fraud or abuse, or enforce our agreements.",
                "Backups and logs: residual copies may remain for a limited time in routine backups or logs kept by our service providers.",
                "Third-party providers: deleting your Music Data Base account does not close accounts you hold directly with Stripe, including a Stripe Connect account, or with PayPal. Payment processors and other service providers keep information according to their own policies.",
            ],
        },
        {
            heading: "Request Deletion If You Cannot Access Your Account",
            paragraphs: [
                `If you cannot sign in, email ${LEGAL_CONTACT_EMAIL} with the subject "Account Deletion Request." If possible, send the request from the email address associated with your account, and include that email address and your display name.`,
                "Sending an email does not automatically delete an account. We review each request manually, may ask for information to verify that you own the account, and will confirm with you once the request has been processed. If you can sign in, deleting your account from your Profile is the fastest option.",
            ],
        },
        {
            heading: "More Information",
            paragraphs: [
                "Our Privacy Policy explains how we collect, use, and retain information.",
                `Questions about account deletion: ${LEGAL_CONTACT_EMAIL}`,
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
